"""Synthetic-only compressed provenance, failure bounds and reservation tests."""
import copy
import gzip
import json
import random
import re
import unittest
from pathlib import Path
from unittest.mock import patch

from test_stylesnap_archive import setup, failed, manifest_fixture, PRIVATE
from stylesnap_media import MediaError, canonical, digest, map_references
import stylesnap_archive as adapter
import stylesnap_archive_plan as planner
import stylesnap_private_json as codec


def reidentify(compressed, descriptor):
    return {**descriptor, "compressed_sha256":digest(compressed), "compressed_bytes":len(compressed)}


def reviewed_fixture():
    manifest = manifest_fixture()
    manifest["source_cloud"] = "sgstylesnap"
    for group in ("assets", "derived"):
        for value in manifest[group].values():
            value["secure_url"] = value["secure_url"].replace("unit-cloud", "sgstylesnap")
    manifest["database_references"]["clothes"][0].update(planner.KNOWN_MISSING_DEFAULTS)
    manifest["reference_mapping"] = map_references(manifest)
    evidence = {"manifest_sha256":digest(canonical(manifest)), "unresolved_count":2,
        "unresolved_all_exact_known_legacy_defaults":True, "each_known_default_present_once":True,
        "unresolved_references_preserved_in_raw_rows":True, "unresolved_unique_records":1}
    return manifest, evidence


class PrivateJsonTests(unittest.TestCase):
    def test_full_twelve_mb_manifest_roundtrip_preserves_unknown_fields(self):
        manifest = manifest_fixture()
        manifest["uninterpreted_metadata"] = {"unicode":"衣服", "null":None, "ordered":[2,1], "padding":""}
        manifest["uninterpreted_metadata"]["padding"] = "x" * (12_463_952 - len(canonical(manifest)))
        raw = canonical(manifest)
        self.assertEqual(len(raw),12_463_952)
        compressed, descriptor = codec.encode_private_json("manifests",raw)
        self.assertLess(len(compressed),8_000_000)
        observed, identities = codec.decode_private_json("manifests",compressed,digest(raw),descriptor)
        self.assertEqual(observed,raw); self.assertEqual(identities,descriptor)
        self.assertEqual(json.loads(observed),manifest)
        plan = planner.build_reservation_plan(manifest)
        self.assertEqual(plan["manifest_encoding"],descriptor)
        self.assertEqual(plan["manifest_provenance_bytes"],len(compressed))
        self.assertEqual(plan["manifest_bootstrap_egress_reservation_bytes"],2*len(compressed)+65_536)
        self.assertEqual(plan["transfer_reservation_upper_bytes"],12+2*65_536
            +plan["checkpoint_count_budget"]*24_065_536+2*len(compressed)+65_536)
        self.assertTrue(plan["reservation_complete"])
        self.assertFalse(plan["copy_eligible"]); self.assertFalse(plan["monthly_egress_verified"])

    def test_deterministic_level_six_with_normalized_header(self):
        raw = canonical({"synthetic":PRIVATE})
        first, descriptor = codec.encode_private_json("manifests",raw)
        second, again = codec.encode_private_json("manifests",raw)
        self.assertEqual(first,second); self.assertEqual(descriptor,again)
        self.assertEqual(first[4:8],b"\0"*4); self.assertEqual(first[9],255)
        self.assertEqual(descriptor["compression_level"],6)

    def test_descriptor_is_required_before_manifest_network_request(self):
        reader, opener = setup(lambda req:b"private")
        archive = adapter.PrivateStorage(reader); archive.private_verified=True
        for operation in (lambda: archive.read_private_json("manifests","a"*64),
                          lambda: archive.write_private_json("manifests",b"{}")):
            with self.assertRaisesRegex(MediaError,"manifest_descriptor_required"): operation()
        self.assertEqual(opener.requests,[])

    def test_descriptor_strict_types_and_namespace_limits(self):
        compressed, descriptor = codec.encode_private_json("manifests",b"{}")
        changes = ({"raw_bytes":True},{"raw_bytes":0},{"raw_bytes":32*1024*1024+1},
            {"compressed_bytes":8_000_001},{"compressed_bytes":False},{"raw_sha256":"private"},
            {"compressed_sha256":"A"*64},{"encoding":"zip"},{"compression_level":True},
            {"compression_level":9},{"extra":PRIVATE})
        for change in changes:
            with self.subTest(fields=list(change)):
                with self.assertRaises(MediaError) as result:
                    codec.decode_private_json("manifests",compressed,digest(b"{}"),{**descriptor,**change})
                self.assertNotIn(PRIVATE,str(result.exception))
        with self.assertRaises(MediaError): codec.encode_private_json("../private",b"{}")
        for raw in (b"",None,"private",b"x"*(8_000_000+1)):
            with self.assertRaises(MediaError): codec.encode_private_json("checkpoints",raw)
        with patch.object(codec,"MAX_MANIFEST_RAW_BYTES",16):
            with self.assertRaises(MediaError): codec.encode_private_json("manifests",b"x"*17)

    def test_incompressible_stored_limit_is_independent_of_raw_limit(self):
        raw = random.Random(42).randbytes(100_000)
        with patch.object(codec,"MAX_STORED_JSON_BYTES",4096):
            with self.assertRaisesRegex(MediaError,"private_json_size_limit"):
                codec.encode_private_json("manifests",raw)

    def test_compressed_identity_is_checked_before_decompression(self):
        compressed, descriptor = codec.encode_private_json("manifests",b"{}")
        for value, identity in ((compressed+b"x",descriptor),
                                (compressed,{**descriptor,"compressed_sha256":"0"*64}),
                                (compressed,{**descriptor,"raw_sha256":"0"*64})):
            with patch.object(codec.zlib,"decompressobj") as inflater:
                with self.assertRaisesRegex(MediaError,"private_json_compressed_parity_failed"):
                    codec.decode_private_json("manifests",value,digest(b"{}"),identity)
                inflater.assert_not_called()

    def test_bomb_expansion_is_capped_before_raw_hash(self):
        compressed = gzip.compress(b"x"*1_000_000,compresslevel=6,mtime=0)
        descriptor = {"encoding":"gzip","compression_level":6,"raw_bytes":32,"raw_sha256":"a"*64,
            "compressed_bytes":len(compressed),"compressed_sha256":digest(compressed)}
        with self.assertRaisesRegex(MediaError,"private_json_expanded_size_limit"):
            codec.decode_private_json("manifests",compressed,"a"*64,descriptor)
        with patch.object(codec,"MAX_CHECKPOINT_RAW_BYTES",64):
            with self.assertRaisesRegex(MediaError,"private_json_expanded_size_limit"):
                codec.decode_private_json("checkpoints",compressed,"a"*64)

    def test_decoder_uses_one_bounded_call_without_flush(self):
        raw=b"{}"; compressed, descriptor=codec.encode_private_json("manifests",raw)
        class Inflater:
            eof=True; unused_data=b""; unconsumed_tail=b""
            def decompress(self,value,maximum):
                self.maximum=maximum; self.value=value; return raw
            def flush(self,*args): raise AssertionError("Unbounded flush is forbidden")
        inflater=Inflater()
        with patch.object(codec.zlib,"decompressobj",return_value=inflater) as factory:
            codec.decode_private_json("manifests",compressed,digest(raw),descriptor)
        factory.assert_called_once_with(wbits=31)
        self.assertEqual(inflater.maximum,len(raw)+1); self.assertEqual(inflater.value,compressed)

    def test_truncated_corrupt_or_non_gzip_data_is_rejected_without_payload(self):
        raw=canonical({"private":PRIVATE}); compressed, descriptor=codec.encode_private_json("manifests",raw)
        corrupt=bytearray(compressed); corrupt[-8]^=1
        values=(compressed[:-1],compressed[:-8],bytes(corrupt),b"not-gzip-"+PRIVATE.encode())
        for value in values:
            with self.assertRaises(MediaError) as result:
                codec.decode_private_json("manifests",value,digest(raw),reidentify(value,descriptor))
            self.assertNotIn(PRIVATE,str(result.exception))

    def test_trailing_member_padding_and_junk_are_rejected_even_with_correct_raw_hash(self):
        raw=b"{}"; compressed, descriptor=codec.encode_private_json("manifests",raw)
        for extra in (gzip.compress(b"second"),b"\0",b"\0"*8,b"private"):
            value=compressed+extra
            with self.assertRaisesRegex(MediaError,"private_json_trailing_data"):
                codec.decode_private_json("manifests",value,digest(raw),reidentify(value,descriptor))

    def test_expanded_hash_and_exact_length_both_required(self):
        raw=b"{}"; compressed, descriptor=codec.encode_private_json("manifests",raw)
        for changed in ({**descriptor,"raw_sha256":"a"*64},{**descriptor,"raw_bytes":len(raw)+1}):
            with self.assertRaisesRegex(MediaError,"private_json_raw_parity_failed"):
                codec.decode_private_json("manifests",compressed,changed["raw_sha256"],changed)

    def test_checkpoint_resume_records_unknown_encoder_level(self):
        raw=b"{}"; compressed=gzip.compress(raw,compresslevel=9,mtime=0)
        observed,descriptor=codec.decode_private_json("checkpoints",compressed,digest(raw))
        self.assertEqual(observed,raw); self.assertIsNone(descriptor["compression_level"])
        self.assertEqual(descriptor["compressed_sha256"],digest(compressed))
        with self.assertRaisesRegex(MediaError,"private_json_raw_parity_failed"):
            codec.decode_private_json("checkpoints",gzip.compress(b""),digest(b""))

    def test_storage_get_caps_stored_bytes_and_forgets_stale_parity(self):
        raw=b"x"*1000; compressed,descriptor=codec.encode_private_json("manifests",raw)
        value=compressed
        reader,opener=setup(lambda req:value); archive=adapter.PrivateStorage(reader); archive.private_verified=True
        self.assertEqual(archive.read_private_json("manifests",digest(raw),descriptor),raw)
        self.assertEqual(archive.downloaded_bytes,len(compressed))
        self.assertEqual(archive.private_json_descriptor("manifests",digest(raw)),descriptor)
        value=compressed+b"x"
        with self.assertRaisesRegex(MediaError,"response_too_large"):
            archive.read_private_json("manifests",digest(raw),descriptor)
        with self.assertRaisesRegex(MediaError,"private_json_parity_not_verified"):
            archive.private_json_descriptor("manifests",digest(raw))
        self.assertEqual(archive.failed_requests,1)

    def test_bootstrap_crash_replay_charges_stored_egress_and_reuses_insert_only_object(self):
        manifest=manifest_fixture(); plan=planner.build_reservation_plan(manifest)
        raw=canonical(manifest); stored={}; events=[]; egress=[]
        def response(request):
            path=request.full_url.split("/storage/v1/",1)[1]
            if path=="bucket/"+adapter.BUCKET: return {"id":adapter.BUCKET,"public":False}
            key=path.split(adapter.BUCKET+"/",1)[1]
            if request.get_method()=="POST":
                self.assertNotIn(key,stored); stored[key]=request.data; events.append("upload"); return {"Key":key}
            if key not in stored: return failed(404,{"code":"NoSuchKey"})(request)
            return stored[key]
        class Lease:
            attempts=0
            def assert_current(self): pass
            def reserve_plan(self,value): self.plan=value
            def reserve_egress(self,op,size): egress.append(size)
            def settle_storage(self,op,path,size):
                self.attempts+=1; self.size=size
                if self.attempts==1: raise MediaError("synthetic_settlement_lost")
        lease=Lease()
        reader,_=setup(response); first=adapter.PrivateStorage(reader)
        args=(manifest,plan,digest(raw),digest(canonical(plan)))
        with self.assertRaisesRegex(MediaError,"synthetic_settlement_lost"):
            planner.bootstrap_private_manifest(*args,first,lease,source_parity_verified=True)
        reader,_=setup(response); second=adapter.PrivateStorage(reader)
        result=planner.bootstrap_private_manifest(*args,second,lease,source_parity_verified=True)
        self.assertEqual(events,["upload"])
        self.assertEqual(egress,[plan["manifest_bootstrap_egress_reservation_bytes"]]*2)
        self.assertEqual(lease.size,plan["manifest_encoding"]["compressed_bytes"])
        self.assertEqual(result["manifest_encoding"],plan["manifest_encoding"])
        self.assertLessEqual(first.downloaded_bytes+second.downloaded_bytes,sum(egress))
        self.assertFalse(result["application_cutover"])


class MissingDefaultTests(unittest.TestCase):
    def test_exception_urls_equal_the_released_presentation_allowlist(self):
        helper=(Path(__file__).resolve().parents[2]/"src/utils/clothing-image.js").read_text(encoding="utf-8")
        public_defaults=set(re.findall(r"'([^']*https://res\.cloudinary\.com/[^']*)'",helper))
        self.assertEqual(set(planner.KNOWN_MISSING_DEFAULTS.values()),public_defaults)
        self.assertEqual(len(public_defaults),2)

    def test_only_reviewed_exact_pair_is_accounted_without_rewriting_raw_metadata(self):
        manifest,evidence=reviewed_fixture(); raw=canonical(manifest)
        without=planner.build_reservation_plan(manifest)
        self.assertFalse(without["reservation_complete"])
        plan=planner.build_reservation_plan(manifest,missing_default_evidence=evidence)
        self.assertTrue(plan["reservation_complete"]); self.assertFalse(plan["copy_eligible"])
        self.assertFalse(plan["all_references_matched"])
        self.assertEqual(plan["unresolved_reference_count"],2)
        self.assertEqual(plan["known_missing_default_reference_count"],2)
        self.assertEqual(plan["unhandled_reference_count"],0)
        self.assertEqual(canonical(manifest),raw)
        self.assertTrue(all(row["status"]=="unresolved_asset" for row in manifest["reference_mapping"]))

    def test_review_is_bound_to_exact_manifest_and_strict_evidence_types(self):
        manifest,evidence=reviewed_fixture()
        for key,value in (("manifest_sha256","a"*64),("unresolved_count",True),
                          ("unresolved_all_exact_known_legacy_defaults",1),("each_known_default_present_once",False)):
            with self.assertRaisesRegex(MediaError,"missing_default_review_mismatch"):
                planner.build_reservation_plan(manifest,missing_default_evidence={**evidence,key:value})
        manifest["uninterpreted_field"]="changed"
        with self.assertRaisesRegex(MediaError,"missing_default_review_mismatch"):
            planner.build_reservation_plan(manifest,missing_default_evidence=evidence)

    def test_lookalikes_swapped_columns_other_records_and_extra_gaps_cannot_be_exempted(self):
        for change in ("lookalike","swapped","other_record","extra"):
            manifest,evidence=reviewed_fixture(); row=manifest["database_references"]["clothes"][0]
            if change=="lookalike": row["image_url"]+="?alternate=1"
            elif change=="swapped": row["image_url"],row["thumbnail_url"]=row["thumbnail_url"],row["image_url"]
            else:
                second=copy.deepcopy(row); second["id"]="different-private-row"
                if change=="other_record": row["thumbnail_url"]=None; second["image_url"]=None
                manifest["database_references"]["clothes"].append(second)
            manifest["reference_mapping"]=map_references(manifest)
            evidence["manifest_sha256"]=digest(canonical(manifest))
            with self.assertRaisesRegex(MediaError,"missing_default_membership_mismatch"):
                planner.build_reservation_plan(manifest,missing_default_evidence=evidence)

    def test_forged_mapping_cannot_hide_changed_retained_row(self):
        manifest,evidence=reviewed_fixture()
        manifest["database_references"]["clothes"][0]["image_url"]+="?private=changed"
        evidence["manifest_sha256"]=digest(canonical(manifest))
        with self.assertRaisesRegex(MediaError,"raw_reference_mapping_mismatch"):
            planner.build_reservation_plan(manifest,missing_default_evidence=evidence)

    def test_reference_exception_never_bypasses_unknown_monthly_egress(self):
        manifest,evidence=reviewed_fixture()
        plan=planner.build_reservation_plan(manifest,missing_default_evidence=evidence)
        class Lease:
            def assert_current(self): pass
            def reserve_plan(self,value): pass
            def reserve_egress(self,*args): raise MediaError("egress_headroom_unverified")
        with self.assertRaisesRegex(MediaError,"egress_headroom_unverified"):
            planner.bootstrap_private_manifest(manifest,plan,digest(canonical(manifest)),digest(canonical(plan)),
                                               None,Lease(),source_parity_verified=True)


if __name__ == "__main__": unittest.main()
