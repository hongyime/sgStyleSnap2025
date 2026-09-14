"""Offline variant lineage, crash, quota, reference and real-adapter tests."""
import copy
import json
import unittest
import urllib.parse
from unittest.mock import patch

from test_stylesnap_archive import ASSET, URL, manifest_fixture, setup
from test_stylesnap_copy import Archive, Lease, Source
from stylesnap_media import MediaError, canonical, digest, map_references
import stylesnap_copy as originals
import stylesnap_variants as variants
import stylesnap_archive as adapters
import stylesnap_archive_plan as planner


def fixture():
    manifest = manifest_fixture()
    item = manifest["derived"]["variant-one"]
    item["secure_url"] = URL.replace("/v1/", "/f_webp,q_auto:good/v1/")
    manifest["database_references"]["clothes"][0]["thumbnail_url"] = URL.replace("/v1/", "/q_auto:good,f_webp/")
    manifest["reference_mapping"] = map_references(manifest)
    return manifest


class VariantSource:
    def __init__(self, manifest):
        self.bindings = variants.variant_bindings(manifest)
        self.identity_calls = 0
        self.reads = 0
        self.change_after = False
        self.change_etag_after = False
        self.mismatch = False

    def variant_identities(self, ids):
        self.identity_calls += 1
        value = copy.deepcopy({key: self.bindings[key] for key in ids})
        for item in value.values():
            if item["original"]["etag"] is None:
                item["original"]["etag"] = "fresh-observed-etag"
        if self.change_after and self.identity_calls > 1:
            value[ids[0]]["original"]["version"] += 1
        if self.change_etag_after and self.identity_calls > 1:
            value[ids[0]]["original"]["etag"] = "changed-etag"
        return value

    def original(self, url, size):
        self.reads += 1
        return (b"x" if self.mismatch and self.reads % 2 == 0 else b"v") * size


class VariantTests(unittest.TestCase):
    def setUp(self):
        self.manifest = fixture()
        self.archive, self.lease = Archive(), Lease()
        self.start()

    def start(self):
        self.approved = digest(canonical(self.manifest))
        result = originals.run_original_batch(self.manifest, self.approved,
            {"phase": "original_archive", "manifest_sha": self.approved, "verified": {}},
            Source(self.manifest["assets"]), self.archive, self.lease)
        self.prior = json.loads(self.archive.checkpoints[-1])
        self.prior["checkpoint_sha"] = result.checkpoint_sha
        self.source = VariantSource(self.manifest)

    def run_batch(self):
        return variants.run_variant_batch(self.manifest, self.approved, self.prior,
                                          self.source, self.archive, self.lease)

    def test_variant_stage_retains_original_records_and_complete_parent_provenance(self):
        before = canonical(self.prior)
        result = self.run_batch()
        self.assertEqual((result.verified_objects, result.verified_bytes, result.created_objects), (1, 2, 1))
        current = json.loads(self.archive.checkpoints[-1])
        self.assertEqual(current["verified"], self.prior["verified"])
        self.assertEqual(current["verified_variants"]["variant-one"]["identity"], variants.variant_bindings(self.manifest)["variant-one"])
        self.assertEqual(current["parent_checkpoint_sha"], self.prior["checkpoint_sha"])
        self.assertFalse(current["application_cutover"])
        self.assertEqual(canonical(self.prior), before)

    def test_lost_checkpoint_commit_reuses_add_only_copies_without_deleting_originals(self):
        with patch.object(self.lease, "commit_checkpoint", side_effect=MediaError("lost_response")):
            with self.assertRaisesRegex(MediaError, "lost_response"):
                self.run_batch()
        self.source = VariantSource(self.manifest)
        result = self.run_batch()
        self.assertEqual(result.created_objects, 0)
        self.assertEqual(len(self.archive.objects), 2)

    def test_changed_parent_does_not_commit_a_variant_checkpoint(self):
        self.source.change_after = True
        before = list(self.lease.committed)
        with self.assertRaisesRegex(MediaError, "variant_identity_changed_after_copy"):
            self.run_batch()
        self.assertEqual(self.lease.committed, before)
        self.assertEqual(len(self.archive.objects), 2)

    def test_stale_and_forged_checkpoint_cannot_skip_variant_work(self):
        self.prior["verified_variants"] = {"variant-one": {"sha256": "fake"}}
        with self.assertRaisesRegex(MediaError, "checkpoint_content_mismatch"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)
        self.prior["checkpoint_sha"] = "f" * 64
        with self.assertRaisesRegex(MediaError, "stale_checkpoint"):
            self.run_batch()

    def test_incomplete_original_archive_blocks_variant_download(self):
        persisted = {**self.prior, "verified": {}}
        persisted.pop("checkpoint_sha")
        raw = canonical(persisted); checksum = self.archive.checkpoint(raw)
        self.lease.commit_checkpoint(self.prior["checkpoint_sha"], checksum)
        self.prior = {**persisted, "checkpoint_sha": checksum}
        with self.assertRaisesRegex(MediaError, "original_archive_incomplete"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)

    def test_privacy_capacity_egress_and_lease_gates_precede_payload_reads(self):
        for target, field in ((self.archive, "private"), (self.lease, "capacity"),
                              (self.lease, "egress_available"), (self.lease, "current")):
            with self.subTest(field=field):
                setattr(target, field, False)
                with self.assertRaises(MediaError): self.run_batch()
                setattr(target, field, True)
        self.assertEqual(self.source.reads, 0)

    def test_corrupt_destination_does_not_advance_checkpoint(self):
        self.archive.corrupt = True
        before = list(self.lease.committed)
        with self.assertRaisesRegex(MediaError, "destination_parity_failed"): self.run_batch()
        self.assertEqual(self.lease.committed, before)

    def test_per_variant_egress_reservation_precedes_its_download(self):
        reserve = self.lease.reserve_egress
        def reject_payload(operation, size):
            if ":variant:" in operation:
                raise MediaError("payload_egress_exhausted")
            reserve(operation, size)
        with patch.object(self.lease, "reserve_egress", side_effect=reject_payload):
            with self.assertRaisesRegex(MediaError, "payload_egress_exhausted"):
                self.run_batch()
        self.assertEqual(self.source.reads, 0)

    def test_checkpoint_with_changed_original_identity_is_not_accepted(self):
        persisted = copy.deepcopy(self.prior); persisted.pop("checkpoint_sha")
        persisted["verified"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]["identity"]["etag"] = "changed"
        raw = canonical(persisted); checksum = self.archive.checkpoint(raw)
        self.lease.commit_checkpoint(self.prior["checkpoint_sha"], checksum)
        self.prior = {**persisted, "checkpoint_sha": checksum}
        with self.assertRaisesRegex(MediaError, "original_archive_incomplete"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)

    def test_count_limit_and_resume_preserve_all_variants(self):
        item = self.manifest["derived"].pop("variant-one")
        self.manifest["derived"] = {f"v-{i:03}": {**item, "id": f"v-{i:03}"} for i in range(101)}
        self.archive, self.lease = Archive(), Lease(); self.start()
        result = self.run_batch()
        self.assertEqual((result.verified_objects, self.source.reads), (88, 88))
        self.prior = json.loads(self.archive.checkpoints[-1]); self.prior["checkpoint_sha"] = result.checkpoint_sha
        self.source = VariantSource(self.manifest)
        self.assertEqual(self.run_batch().verified_objects, 13)
        self.assertEqual(len(json.loads(self.archive.checkpoints[-1])["verified_variants"]), 101)

    def test_byte_limit_splits_before_transferring_the_next_object(self):
        item = self.manifest["derived"].pop("variant-one")
        self.manifest["derived"] = {f"v-{i}": {**item, "id": f"v-{i}", "bytes": 6_000_000} for i in range(5)}
        self.archive, self.lease = Archive(), Lease(); self.start()
        result = self.run_batch()
        self.assertEqual((result.verified_objects, result.verified_bytes), (4, 24_000_000))

    def test_planner_reserves_both_actual_checkpoint_shapes(self):
        # This direct stored URL fixture can form a complete original+variant plan.
        self.manifest["database_references"]["clothes"][0]["thumbnail_url"] = self.manifest["derived"]["variant-one"]["secure_url"]
        self.manifest["reference_mapping"] = map_references(self.manifest)
        self.archive, self.lease = Archive(), Lease(); self.start(); self.run_batch()
        plan = planner.build_reservation_plan(self.manifest)
        self.assertEqual(plan["checkpoint_count_budget"], len(self.archive.checkpoints))
        self.assertGreaterEqual(plan["checkpoint_pool_bytes"], sum(len(raw) + 4096 for raw in self.archive.checkpoints))
        self.assertTrue(plan["reservation_complete"])


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.manifest = fixture(); self.approved = digest(canonical(self.manifest))
        self.urls = list(variants.delivery_candidates(self.manifest))
        self.source = VariantSource(self.manifest); self.lease = Lease()

    def run_probe(self):
        return variants.verify_delivery_batch(self.manifest, self.approved, self.urls, self.source, self.lease)

    def test_recipe_match_stays_unproven_until_both_payloads_match(self):
        candidates = variants.delivery_candidates(self.manifest)
        self.assertEqual(len(candidates), 1)
        self.assertFalse(next(iter(candidates.values()))["content_parity_proven"])
        result = self.run_probe()
        item = result["verified_deliveries"][digest(self.urls[0].encode())]
        self.assertEqual((item["sha256"], item["bytes"], item["source_url"]), (digest(b"vv"), 2, self.urls[0]))
        self.assertEqual(self.source.reads, 2)
        self.assertFalse(result["application_cutover"])

    def test_equal_size_different_content_is_rejected(self):
        self.source.mismatch = True
        with self.assertRaisesRegex(MediaError, "delivery_content_mismatch"): self.run_probe()

    def test_missing_or_ambiguous_variant_cannot_trigger_a_dynamic_transformation(self):
        for duplicate in (False, True):
            manifest = fixture(); item = manifest["derived"].pop("variant-one")
            if duplicate:
                manifest["derived"] = {"one": {**item, "id": "one"}, "two": {**item, "id": "two"}}
            self.manifest = manifest; self.approved = digest(canonical(manifest)); self.source = VariantSource(manifest)
            with self.subTest(duplicate=duplicate), self.assertRaisesRegex(MediaError, "delivery_variant_not_uniquely_materialized"):
                self.run_probe()
            self.assertEqual(self.source.reads, 0)

    def test_unknown_egress_or_parent_change_refuses_content_evidence(self):
        self.lease.egress_available = False
        with self.assertRaisesRegex(MediaError, "egress_headroom_unverified"): self.run_probe()
        self.assertEqual(self.source.reads, 0)
        self.lease.egress_available = True; self.source.change_after = True
        with self.assertRaisesRegex(MediaError, "variant_identity_changed_after_copy"): self.run_probe()

    def test_missing_raw_reference_cannot_be_hidden_in_mapping(self):
        self.manifest["reference_mapping"] = []
        with self.assertRaisesRegex(MediaError, "raw_reference_mapping_mismatch"):
            variants.delivery_candidates(self.manifest)

    def test_parent_and_variant_path_or_version_mismatch_are_rejected(self):
        for field, value in (("public_id", "another"), ("secure_url", URL.replace("/v1/", "/f_webp,q_auto:good/v2/")),
                             ("resource_type", []), ("secure_url", "https://outside.test/image.webp")):
            manifest = fixture(); manifest["derived"]["variant-one"][field] = value
            with self.subTest(field=field), self.assertRaises(MediaError): variants.variant_bindings(manifest)

    def test_reference_batch_accounts_for_two_downloads_per_url(self):
        self.urls = [self.urls[0] + str(i) for i in range(51)]
        with self.assertRaisesRegex(MediaError, "delivery_batch_limit"): self.run_probe()
        self.assertEqual(self.source.reads, 0)


class SourceAdapterTests(unittest.TestCase):
    def make_source(self, handler=None):
        self.manifest = fixture(); self.requests = []
        def response(request):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)
            self.requests.append(request)
            if handler: return handler(request, query)
            if urllib.parse.urlsplit(request.full_url).path.endswith('/resources/' + ASSET['asset_id']): return ASSET
            if "transformation" in query: return {"derived": list(self.manifest["derived"].values())}
            return {"transformations": [{"name": "f_webp,q_auto:good"}]}
        reader, opener = setup(response)
        return adapters.VariantSource(reader, self.manifest), reader

    def test_two_fresh_inventories_and_parent_checks_match_full_provenance(self):
        source, reader = self.make_source()
        expected = variants.variant_bindings(self.manifest)
        self.assertEqual(source.variant_identities(["variant-one"]), expected)
        self.assertEqual(source.variant_identities(["variant-one"]), expected)
        self.assertEqual(reader.admin_units, 6)
        with self.assertRaisesRegex(MediaError, "variant_lookup_budget_reached"):
            source.variant_identities(["variant-one"])
        self.assertEqual(reader.admin_units, 6)

    def test_provider_enumeration_exhaustion_stops_after_twelve_units(self):
        def many(request, query):
            if "transformation" in query: return {"derived": []}
            return {"transformations": [{"name": "w_" + str(i)} for i in range(20)]}
        source, reader = self.make_source(many)
        with self.assertRaisesRegex(MediaError, "admin_budget_reached"):
            source.variant_identities(["variant-one"])
        self.assertEqual((reader.admin_units, len(self.requests)), (12, 12))
        self.assertEqual(reader.admin_unit_limit, 200)

    def test_missing_variant_blocks_parent_and_payload_requests(self):
        source, reader = self.make_source(lambda request, query: {"derived": []} if "transformation" in query else {"transformations": [{"name": "f_webp"}]})
        with self.assertRaisesRegex(MediaError, "variant_inventory_incomplete"):
            source.variant_identities(["variant-one"])
        self.assertEqual(reader.admin_units, 2)
        self.assertFalse(any("resources" in r.full_url for r in self.requests))


class MissingETagTests(unittest.TestCase):
    def setUp(self):
        self.manifest = fixture()
        del self.manifest["assets"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]["etag"]
        self.approved = digest(canonical(self.manifest))
        self.archive, self.lease = Archive(), Lease()
        self.initial = {"phase": "original_archive", "manifest_sha": self.approved, "verified": {}}
        class FreshOriginal(Source):
            change_etag = False
            wrong_version = False
            def identities(inner, ids):
                values = super(FreshOriginal, inner).identities(ids)
                for value in values.values():
                    value["etag"] = "changed-etag" if inner.change_etag and inner.identity_calls > 1 else "fresh-observed-etag"
                    if inner.wrong_version: value["version"] += 1
                return values
        self.source = FreshOriginal(self.manifest["assets"])

    def run_original(self):
        return originals.run_original_batch(self.manifest, self.approved, self.initial, self.source, self.archive, self.lease)

    def test_omitted_etag_is_preserved_and_fresh_identity_is_bound_in_both_stages(self):
        raw = canonical(self.manifest)
        first = self.run_original()
        prior = json.loads(self.archive.checkpoints[-1]); prior["checkpoint_sha"] = first.checkpoint_sha
        expected = originals.identity(self.manifest["assets"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]); expected["etag"] = "fresh-observed-etag"
        self.assertIsNone(prior["verified"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]["identity"]["etag"])
        self.assertEqual(prior["verified"]["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]["observed_identity_sha256"], digest(canonical(expected)))
        variants.run_variant_batch(self.manifest, self.approved, prior, VariantSource(self.manifest), self.archive, self.lease)
        self.assertEqual(canonical(self.manifest), raw)
        final = json.loads(self.archive.checkpoints[-1])
        self.assertEqual(final["verified"], prior["verified"])
        self.assertEqual(len(final["verified_variants"]["variant-one"]["observed_identity_sha256"]), 64)

    def test_new_etag_change_with_same_version_and_size_still_blocks_original_commit(self):
        self.source.change_etag = True
        with self.assertRaisesRegex(MediaError, "source_identity_changed_after_copy"):
            self.run_original()
        self.assertFalse(self.lease.committed)
        self.assertEqual(len(self.archive.objects), 1)

    def test_new_etag_change_also_blocks_variant_and_delivery_evidence(self):
        first = self.run_original()
        prior = json.loads(self.archive.checkpoints[-1]); prior["checkpoint_sha"] = first.checkpoint_sha
        source = VariantSource(self.manifest); source.change_etag_after = True
        with self.assertRaisesRegex(MediaError, "variant_identity_changed_after_copy"):
            variants.run_variant_batch(self.manifest, self.approved, prior, source, self.archive, self.lease)
        source = VariantSource(self.manifest); source.change_etag_after = True
        with self.assertRaisesRegex(MediaError, "variant_identity_changed_after_copy"):
            variants.verify_delivery_batch(self.manifest, self.approved, list(variants.delivery_candidates(self.manifest)), source, self.lease)

    def test_omitted_etag_does_not_permit_a_different_captured_version(self):
        self.source.wrong_version = True
        with self.assertRaisesRegex(MediaError, "source_identity_changed_before_copy"):
            self.run_original()
        self.assertEqual(self.source.reads, 0)

    def test_missing_fresh_etag_remains_blocked(self):
        with self.assertRaisesRegex(MediaError, "source_identity_changed_before_copy"):
            originals.run_original_batch(self.manifest, self.approved, self.initial,
                Source(self.manifest["assets"]), self.archive, self.lease)
        self.assertFalse(self.archive.objects)


if __name__ == "__main__": unittest.main()
