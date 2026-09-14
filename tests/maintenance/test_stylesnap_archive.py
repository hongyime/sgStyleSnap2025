"""Provider-realistic offline adapter and private bootstrap failure tests."""
import copy
import gzip
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from stylesnap_media import Reader, MediaError, canonical, digest, SUPABASE_URL, REFERENCE_COLUMNS, map_references
import stylesnap_archive as adapter
import stylesnap_archive_plan as planner
import stylesnap_copy as worker
from stylesnap_private_json import encode_private_json

PRIVATE = "synthetic-secret-never-print"
URL = "https://res.cloudinary.com/unit-cloud/image/upload/v1/source.jpg"
ASSET = {"asset_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "public_id":"source", "resource_type":"image", "type":"upload",
    "format":"jpg", "version":1, "bytes":4, "etag":"provider-etag", "secure_url":URL}
ENV = {"VITE_CLOUDINARY_CLOUD_NAME":"unit-cloud", "CLOUDINARY_API_KEY":"unit-key",
       "CLOUDINARY_API_SECRET":PRIVATE, "SUPABASE_SERVICE_ROLE_KEY":"sb_secret_" + PRIVATE}


class Opener:
    def __init__(self, handler):
        self.handler = handler; self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        assert timeout == 30
        value = self.handler(request)
        return io.BytesIO(value if isinstance(value, bytes) else canonical(value))


def failed(status, payload=None):
    def response(request):
        raise urllib.error.HTTPError(request.full_url, status, PRIVATE, {}, io.BytesIO(canonical(payload or {"message":PRIVATE})))
    return response


def setup(handler):
    opener = Opener(handler)
    return Reader(ENV, opener), opener


class AdapterTests(unittest.TestCase):
    def test_identity_pair_rejects_changed_membership_without_consuming_units(self):
        ids = [f"{index:032x}" for index in range(2)]
        def response(request):
            url = urllib.parse.urlsplit(request.full_url)
            self.assertEqual(urllib.parse.parse_qs(url.query), {"image_metadata": ["true"], "max_results": ["1"]})
            return {**ASSET, "asset_id": url.path.rsplit('/', 1)[1]}
        reader, opener = setup(response); source = adapter.OriginalSource(reader)
        self.assertEqual(set(source.identities(ids)), set(ids))
        with self.assertRaisesRegex(MediaError, "identity_batch_changed"):
            source.identities([ids[0], 'b' * 32])
        self.assertEqual((len(opener.requests), reader.admin_units), (2, 2))
        source.identities(ids)
        with self.assertRaisesRegex(MediaError,"identity_lookup_budget_reached"):
            source.identities(ids)
        self.assertEqual((len(opener.requests), reader.admin_units), (4, 4))

    def test_identity_rejects_list_payloads_malformed_counters_and_wrong_ids(self):
        responses = [[], {"resources":[]}, {"resources":[None]}, {"resources":[ASSET],"next_cursor":"private"},
            {**ASSET,"bytes":True}, {**ASSET,"asset_id":"other"}]
        for response in responses:
            with self.subTest(response_type=type(response).__name__):
                reader, opener = setup(lambda req: response)
                with self.assertRaises(MediaError): adapter.OriginalSource(reader).identities(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
                self.assertEqual(len(opener.requests),1)
        reader, opener = setup(lambda req: {})
        for ids in ([[]], ["a","a"], [], ["a"] * 101):
            with self.assertRaises(MediaError): adapter.OriginalSource(reader).identities(ids)
        self.assertEqual(opener.requests,[])

    def test_identity_provider_failure_no_retry_or_payload_leak(self):
        for status in (401,429,500):
            reader, opener = setup(failed(status))
            with self.assertRaises(MediaError) as result:
                adapter.OriginalSource(reader).identities(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
            self.assertEqual(result.exception.http_status,status)
            self.assertNotIn(PRIVATE,str(result.exception)); self.assertEqual(len(opener.requests),1)

    def test_source_delivery_credentials_and_exact_size_bounds(self):
        reader, opener = setup(lambda req: b"data")
        source = adapter.OriginalSource(reader)
        self.assertEqual(source.original(URL,4), b"data")
        self.assertIsNone(opener.requests[0].get_header("Authorization"))
        self.assertIsNone(opener.requests[0].get_header("Apikey"))
        for size in (True,0,6_000_001):
            with self.assertRaises(MediaError): source.original(URL,size)
        reader.source_requests = 100
        with self.assertRaisesRegex(MediaError,"source_request_budget_reached"): source.original(URL,4)
        self.assertEqual(len(opener.requests),1)

    def test_fixed_origins_credentials_and_response_limit(self):
        reader, opener = setup(lambda req: b"secret-too-long")
        for url in ("https://evil.test/", "http://res.cloudinary.com/unit-cloud/image/upload/v1/a.jpg",
                    "https://nztqjmknblelnzpeatyx.supabase.co.evil.test/", SUPABASE_URL + "/x#secret",
                    "https://user@api.cloudinary.com/v1_1/unit-cloud/usage"):
            with self.assertRaises(MediaError): reader.request(url,{})
        with self.assertRaises(MediaError): reader.request(URL,{"Authorization":"Bearer " + reader.supabase_key})
        self.assertEqual(opener.requests,[])
        with self.assertRaisesRegex(MediaError,"response_too_large"): reader.original(URL,4)

    def test_redirects_are_not_retried(self):
        reader, opener = setup(failed(302))
        with self.assertRaises(MediaError) as result: reader.original(URL,4)
        self.assertEqual(result.exception.http_status,302); self.assertEqual(len(opener.requests),1)

    def test_private_bucket_required_and_stale_assertion_cleared(self):
        value = {"id":adapter.BUCKET,"public":False}
        reader, opener = setup(lambda req:value); storage = adapter.PrivateStorage(reader)
        storage.assert_private(); self.assertTrue(storage.private_verified)
        for response in ({"id":adapter.BUCKET,"public":True}, {"id":adapter.BUCKET,"public":0}, [], {}):
            value = response
            with self.assertRaises(MediaError): storage.assert_private()
            self.assertFalse(storage.private_verified)

    def test_only_recognized_missing_object_forms_allow_insert(self):
        path = "sha256/aa/" + "a"*64
        for status,body in ((404,{"code":"NoSuchKey","message":PRIVATE}),
            (400,{"statusCode":"404","error":"not_found","message":"Object not found"})):
            reader, opener = setup(failed(status,body)); storage = adapter.PrivateStorage(reader); storage.private_verified = True
            self.assertIsNone(storage.get_if_exists(path)); self.assertEqual(len(opener.requests),1)
        for status, body in ((404,{"code":"NoSuchBucket"}), (404,{"code":"TenantNotFound"}),
                            (404,{"message":PRIVATE}), (401,{}), (500,{})):
            reader, opener = setup(failed(status,body)); storage = adapter.PrivateStorage(reader); storage.private_verified = True
            with self.assertRaises(MediaError) as result: storage.get_if_exists(path)
            self.assertNotIn(PRIVATE,str(result.exception)); self.assertEqual(len(opener.requests),1)

    def test_storage_path_method_count_and_payload_caps(self):
        reader, opener = setup(lambda req:b"data"); storage = adapter.PrivateStorage(reader); storage.private_verified = True
        path = "sha256/aa/" + "a"*64
        for invalid in ("../private",path+"?token=private",None, "https://evil.test/"):
            with self.assertRaises(MediaError): storage.get_if_exists(invalid)
        with self.assertRaises(MediaError): storage.request("object/"+adapter.BUCKET+"/"+path,method="DELETE")
        with self.assertRaisesRegex(MediaError,"response_too_large"): storage.get_if_exists(path,maximum=3)
        storage.requests = adapter.MAX_STORAGE_REQUESTS
        with self.assertRaisesRegex(MediaError,"storage_request_budget_reached"): storage.get_if_exists(path)
        self.assertEqual(len(opener.requests),1)

    def test_ambiguous_upload_is_insert_only_no_retry_and_attempt_counted(self):
        reader, opener = setup(failed(504)); storage = adapter.PrivateStorage(reader); storage.private_verified = True
        with self.assertRaises(MediaError): storage.insert_only("sha256/aa/"+"a"*64,b"data")
        request = opener.requests[0]
        self.assertEqual(request.get_method(),"POST"); self.assertEqual(request.get_header("X-upsert"),"false")
        self.assertEqual((storage.attempted_upload_bytes,storage.uploaded_bytes,storage.failed_requests),(4,0,1))

    def test_checkpoint_gzip_checksum_size_and_resume_readback(self):
        raw = canonical({"private":PRIVATE}); checksum = digest(raw); compressed, _ = encode_private_json("checkpoints", raw)
        reader, opener = setup(lambda req:compressed); storage = adapter.PrivateStorage(reader); storage.private_verified = True
        self.assertEqual(storage.checkpoint(raw),checksum)
        self.assertEqual(len(opener.requests),2) # Existing object plus independent verification.
        self.assertTrue(all(req.get_method()=="GET" for req in opener.requests))
        self.assertEqual(storage.checkpoint_stored_size(checksum),len(compressed))
        for value in (b"not-gzip",gzip.compress(b"changed"),gzip.compress(b"x"*100)):
            reader, opener = setup(lambda req:value); storage = adapter.PrivateStorage(reader); storage.private_verified = True
            with patch.object(adapter,"MAX_PRIVATE_JSON_BYTES",64):
                with self.assertRaises(MediaError): storage.read_checkpoint(checksum)

    def test_rpc_rejects_malformed_success_and_bounded_request(self):
        for response in ({},[],{"checkpoint_sha":PRIVATE},{"checkpoint_sha":None,"extra":PRIVATE}):
            reader, opener = setup(lambda req:response); lease = adapter.DurableLease(reader,"a"*64)
            with self.assertRaises(MediaError): lease.claim()
        for response in ({"reserved":1},{"reserved":False},{"reserved":True,"data":PRIVATE}):
            reader, opener = setup(lambda req:response); lease = adapter.DurableLease(reader,"a"*64)
            with self.assertRaises(MediaError): lease.reserve_egress("attempt",100)
        reader, opener = setup(lambda req:{}); lease = adapter.DurableLease(reader,"a"*64)
        with self.assertRaises(MediaError): lease.call("delete_all")
        with self.assertRaises(MediaError): lease.call("claim",{"owner":PRIVATE})
        lease.requests = adapter.MAX_CONTROL_REQUESTS
        with self.assertRaises(MediaError): lease.claim()
        self.assertEqual(opener.requests,[])

    def test_egress_retries_new_attempts_are_never_reused(self):
        reader, opener = setup(lambda req:{"reserved":True}); lease = adapter.DurableLease(reader,"a"*64)
        lease.reserve_egress("same-operation",100); lease.reserve_egress("same-operation",100)
        adapter.DurableLease(reader,"a"*64).reserve_egress("same-operation",100)
        payloads = [json.loads(req.data)["payload"] for req in opener.requests]
        self.assertEqual(len({item["operation_sha"] for item in payloads}),3)
        self.assertTrue(all(req.full_url==SUPABASE_URL+"/rest/v1/rpc/stylesnap_archive_control" for req in opener.requests))
        self.assertTrue(all(item["maximum_bytes"]==100 for item in payloads))

    def test_failed_egress_reservation_consumes_attempt_id_without_retry(self):
        reader, opener = setup(failed(503)); lease = adapter.DurableLease(reader,"a"*64)
        for _ in range(2):
            with self.assertRaises(MediaError): lease.reserve_egress("same",100)
        self.assertEqual(len(opener.requests),2)
        self.assertNotEqual(json.loads(opener.requests[0].data)["payload"]["operation_sha"],json.loads(opener.requests[1].data)["payload"]["operation_sha"])


def manifest_fixture():
    variant = {"id":"variant-one","bytes":2,"secure_url":URL.replace("/v1/","/w_400/v1/"),
               "resource_type":ASSET["resource_type"],"type":ASSET["type"],
               "public_id":ASSET["public_id"],"format":"webp"}
    result = {"schema_version":1,"target_project":"nztqjmknblelnzpeatyx","source_cloud":"unit-cloud",
        "assets":{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":copy.deepcopy(ASSET)},"derived":{"variant-one":variant},
        "backups":{},"versions":{},"database_references":{table:[] for table in REFERENCE_COLUMNS},
        "usage":{"resources":1,"derived_resources":1,"storage":{"usage":6}}}
    result["database_references"]["clothes"] = [{"id":"private-row","owner_id":"private-owner","privacy":"friends",
        "image_url":URL,"thumbnail_url":variant["secure_url"],"removed_at":None}]
    result["reference_mapping"] = map_references(result)
    return result


class PlanTests(unittest.TestCase):
    def test_plan_counts_all_media_full_provenance_and_checkpoint_pool(self):
        manifest = manifest_fixture(); original = canonical(manifest)
        plan = planner.build_reservation_plan(manifest)
        self.assertTrue(plan["reservation_complete"]); self.assertFalse(plan["copy_eligible"])
        self.assertEqual(plan["payload_bytes"],{"original":4,"variant":2})
        self.assertEqual(len(plan["reservations"]),3)
        self.assertEqual(plan["manifest_provenance_bytes"],len(encode_private_json("manifests", original)[0]))
        self.assertEqual(plan["total_storage_reservation_bytes"],sum(i["maximum_bytes"] for i in plan["reservations"])+plan["checkpoint_pool_bytes"])
        self.assertEqual(canonical(manifest),original)

    def test_unmaterialized_missing_and_backup_data_cannot_silently_fit(self):
        for change in ("unmaterialized","missing","backup"):
            manifest = manifest_fixture()
            if change=="unmaterialized": manifest["database_references"]["clothes"][0]["image_url"] = URL.replace("/v1/","/q_auto/v1/")
            elif change=="missing": manifest["database_references"]["clothes"][0]["image_url"] = URL.replace("source.jpg","missing.jpg")
            else: manifest["backups"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] = {"bytes":4}
            manifest["reference_mapping"] = map_references(manifest)
            plan = planner.build_reservation_plan(manifest)
            self.assertFalse(plan["reservation_complete"])

    def test_raw_reference_rows_cannot_be_hidden_by_supplied_matched_status(self):
        manifest = manifest_fixture()
        manifest["database_references"]["clothes"][0]["image_url"] = URL.replace("source.jpg","missing.jpg")
        with self.assertRaisesRegex(MediaError,"raw_reference_mapping_mismatch"):
            planner.build_reservation_plan(manifest)
        manifest = manifest_fixture(); manifest["reference_mapping"].pop()
        with self.assertRaisesRegex(MediaError,"raw_reference_mapping_mismatch"):
            planner.build_reservation_plan(manifest)
        manifest = manifest_fixture(); del manifest["database_references"]["users"]
        with self.assertRaisesRegex(MediaError,"incomplete_raw_reference_inventory"):
            planner.build_reservation_plan(manifest)
        manifest = manifest_fixture(); del manifest["database_references"]["clothes"][0]["thumbnail_url"]
        with self.assertRaisesRegex(MediaError,"invalid_raw_reference_inventory"):
            planner.build_reservation_plan(manifest)

    def test_provider_byte_mismatch_or_unknown_usage_keeps_gate_closed(self):
        for provider_bytes in (0,5,7):
            manifest = manifest_fixture(); manifest["usage"]["storage"]["usage"] = provider_bytes
            plan = planner.build_reservation_plan(manifest)
            self.assertFalse(plan["reservation_complete"]); self.assertFalse(plan["provider_byte_parity"])
        for value in (None,{},True):
            manifest = manifest_fixture(); manifest["usage"]["storage"] = value
            with self.assertRaises(MediaError): planner.build_reservation_plan(manifest)

    def test_plan_gates_counts_large_objects_and_total_capacity(self):
        manifest = manifest_fixture(); manifest["usage"]["resources"] = 0
        with self.assertRaisesRegex(MediaError,"provider_count_parity_failed"): planner.build_reservation_plan(manifest)
        manifest = manifest_fixture(); manifest["assets"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]["bytes"] = 6_000_001
        with self.assertRaises(MediaError): planner.build_reservation_plan(manifest)
        with patch.object(planner,"COPY_BUDGET_BYTES",1):
            self.assertFalse(planner.build_reservation_plan(manifest_fixture())["reservation_complete"])

    def test_bootstrap_reserves_whole_plan_before_private_write_and_preserves_bytes(self):
        manifest = manifest_fixture(); plan = planner.build_reservation_plan(manifest); events = []; raw = canonical(manifest)
        class Lease:
            def assert_current(self): events.append("lease")
            def reserve_plan(self,p): events.append("plan"); self.plan=p
            def reserve_egress(self,op,n): events.append("egress")
            def settle_storage(self,op,path,n): events.append("settled")
        class Archive:
            def assert_private(self): events.append("private")
            def write_private_json(self,namespace,value,descriptor):
                self.saved=value; self.descriptor=descriptor; events.append("write"); return digest(value)
            def private_json_descriptor(self,namespace,sha): return self.descriptor
        archive = Archive(); lease = Lease()
        result = planner.bootstrap_private_manifest(manifest,plan,digest(raw),digest(canonical(plan)),archive,lease,source_parity_verified=True)
        self.assertEqual(events,["lease","plan","egress","private","write","settled"])
        self.assertEqual(archive.saved,raw); self.assertFalse(result["application_cutover"])

    def test_bootstrap_unknown_egress_or_unproven_source_cannot_write(self):
        manifest = manifest_fixture(); plan = planner.build_reservation_plan(manifest)
        class Lease:
            def assert_current(self): pass
            def reserve_plan(self,p): pass
            def reserve_egress(self,op,n): raise MediaError("egress_headroom_unverified")
        for proven in (False,True):
            with self.assertRaises(MediaError):
                planner.bootstrap_private_manifest(manifest,plan,digest(canonical(manifest)),digest(canonical(plan)),None,Lease(),source_parity_verified=proven)
        plan["total_storage_reservation_bytes"] = 0
        with self.assertRaisesRegex(MediaError,"reservation_plan_mismatch"):
            planner.bootstrap_private_manifest(manifest,plan,digest(canonical(manifest)),digest(canonical(plan)),None,Lease(),source_parity_verified=True)

    def test_crash_after_next_checkpoint_write_reserves_all_three_recovery_reads(self):
        from test_stylesnap_copy import Source, Lease
        assets = {f"asset-{i:03}":{**ASSET,"asset_id":f"asset-{i:03}"} for i in range(101)}
        manifest = {"assets":assets,"target_project":"nztqjmknblelnzpeatyx"}
        approved = digest(canonical(manifest)); stored = {}; checkpoint_reads = []
        def response(request):
            path = urllib.parse.urlsplit(request.full_url).path
            if path.endswith("/bucket/"+adapter.BUCKET): return {"id":adapter.BUCKET,"public":False}
            key = path.split(adapter.BUCKET+"/",1)[1]
            if request.get_method()=="POST":
                self.assertNotIn(key,stored); stored[key]=request.data; return {"Key":key}
            if key.startswith("checkpoints/"): checkpoint_reads.append(key)
            if key not in stored: return failed(404,{"code":"NoSuchKey"})(request)
            return stored[key]
        reader, opener = setup(response); archive = adapter.PrivateStorage(reader); lease = Lease()
        prior = {"phase":"original_archive","manifest_sha":approved,"verified":{}}
        first = worker.run_original_batch(manifest,approved,prior,Source(assets),archive,lease)
        prior = json.loads(gzip.decompress(stored["checkpoints/"+first.checkpoint_sha+".json.gz"]))
        prior["checkpoint_sha"] = first.checkpoint_sha
        with patch.object(lease,"commit_checkpoint",side_effect=MediaError("simulated_lost_response")):
            with self.assertRaisesRegex(MediaError,"simulated_lost_response"):
                reader, _ = setup(response)
                worker.run_original_batch(manifest,approved,prior,Source(assets),adapter.PrivateStorage(reader),lease)
        checkpoint_reads.clear(); lease.egress_reservations.clear()
        reader, _ = setup(response)
        result = worker.run_original_batch(manifest,approved,prior,Source(assets),adapter.PrivateStorage(reader),lease)
        self.assertEqual(len(checkpoint_reads),3)
        self.assertEqual(checkpoint_reads[1],checkpoint_reads[2])
        self.assertEqual(result.created_objects,0)
        self.assertGreaterEqual(lease.egress_reservations[0][1],sum(8_000_000 for _ in checkpoint_reads)+65_536)


if __name__ == "__main__": unittest.main()
