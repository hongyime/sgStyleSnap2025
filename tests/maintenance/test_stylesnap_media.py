"""Synthetic manifest, safety-boundary and byte-parity tests; no provider calls."""
import base64
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/stylesnap_media.py"
SPEC = importlib.util.spec_from_file_location("stylesnap_media", SCRIPT)
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)
PRIVATE = "never-print-this-private-value"
URL = "https://res.cloudinary.com/unit-cloud/image/upload/v10/catalog/item.jpg"
ASSET = {"asset_id": "asset-one", "public_id": "catalog/item", "resource_type": "image",
         "type": "upload", "format": "jpg", "version": 10, "bytes": 4, "secure_url": URL,
         "context": {"private": PRIVATE}}
UUID = "00000000-0000-0000-0000-000000000001"


def env():
    claims = base64.urlsafe_b64encode(json.dumps({"ref": media.PROJECT_REF, "role": "service_role"}).encode()).decode().rstrip("=")
    return {"VITE_CLOUDINARY_CLOUD_NAME": "unit-cloud", "CLOUDINARY_API_KEY": "unit-key",
            "CLOUDINARY_API_SECRET": PRIVATE, "SUPABASE_SERVICE_ROLE_KEY": "header." + claims + ".signature"}


class Opener:
    def __init__(self, data=b"{}", error=None):
        self.data, self.error, self.requests = data, error, []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.error:
            raise self.error
        return io.BytesIO(self.data)


class Source:
    cloud = "unit-cloud"

    def __init__(self):
        self.admin_units = 0
        self.requests = []
        self.assets = [copy.deepcopy(ASSET)]
        self.derived = [{"id": "derived-one", "bytes": 2, "secure_url": URL.replace("/v10/", "/w_400/v10/")}]
        self.references = {table: [] for table in media.REFERENCE_COLUMNS}
        self.references["catalog_items"] = [{"id": UUID, "image_url": URL, "thumbnail_url": self.derived[0]["secure_url"]}]
        self.references["users"] = [{"id": UUID, "avatar_url": "https://example.com/" + PRIVATE}]

    def admin(self, path, params=None, units=1):
        self.admin_units += units
        self.requests.append((path, params))
        if path == "usage":
            return {"resources": len(self.assets), "derived_resources": len(self.derived), "storage": {"usage": 6}}
        if path == "resources/image":
            return {"resources": copy.deepcopy(self.assets)}
        if path in ("resources/video", "resources/raw", "resources/search"):
            return {"resources": []}
        if path == "transformations":
            return {"transformations": [{"name": "w_400"}]}
        if path == "transformations/w_400":
            return {"derived": copy.deepcopy(self.derived)}
        raise AssertionError("Unexpected endpoint")

    def database(self, table, after=None):
        return copy.deepcopy(self.references[table]) if after is None else []

    def original(self, url, size):
        return b"data"


class Storage:
    def __init__(self, corrupt=False):
        self.objects, self.inserts, self.corrupt = {}, 0, corrupt

    def get_if_exists(self, path):
        return self.objects.get(path)

    def insert_only(self, path, content):
        self.inserts += 1
        if path in self.objects:
            raise AssertionError("Overwrite attempted")
        self.objects[path] = b"bad!" if self.corrupt else content


class ManifestTests(unittest.TestCase):
    def test_full_inventory_reconciles_private_references_and_totals(self):
        source = Source()
        manifest = media.inventory(source)
        report = media.safe_summary(manifest, source.admin_units)
        self.assertEqual((report["asset_count"], report["derived_count"]), (1, 1))
        self.assertEqual(report["known_original_and_derived_bytes"], 6)
        self.assertEqual(report["reference_status_counts"]["matched"], 2)
        self.assertFalse(report["copy_eligible"])
        self.assertFalse(report["snapshot_consistency_proven"])
        self.assertIn(PRIVATE, media.canonical(manifest).decode())
        self.assertNotIn(PRIVATE, json.dumps(report))
        self.assertNotIn(URL, json.dumps(report))
        self.assertEqual(len(report["manifest_sha256"]), 64)
        self.assertIn(("resources/search", {"max_results": 500, "expression": "(status=active AND backup_bytes>0) OR status=deleted"}), source.requests)

    def test_all_delivery_types_are_included_in_count_parity(self):
        source = Source()
        for delivery in ("private", "authenticated", "fetch"):
            source.assets.append({**ASSET, "asset_id": "asset-" + delivery, "type": delivery,
                                  "secure_url": URL.replace("/upload/", "/" + delivery + "/")})
        report = media.safe_summary(media.inventory(source), 0)
        self.assertEqual(report["asset_count"], 4)
        for resource_type in media.RESOURCE_TYPES:
            calls = [(path, params) for path, params in source.requests if path == "resources/" + resource_type]
            self.assertEqual(len(calls), 1)
            self.assertNotIn("type", calls[0][1])

    def test_duplicate_asset_is_not_silently_deduplicated(self):
        source = Source()
        source.assets.append(copy.deepcopy(ASSET))
        with self.assertRaisesRegex(media.MediaError, "duplicate_or_missing_asset"):
            media.inventory(source)

    def test_invalid_counter_is_rejected(self):
        for value in [True, -1, "4", None]:
            source = Source()
            source.assets[0]["bytes"] = value
            with self.subTest(kind=type(value).__name__), self.assertRaisesRegex(media.MediaError, "invalid_provider_counter"):
                media.inventory(source)

    def test_historical_and_unresolved_references_remain_visible(self):
        source = Source()
        source.references["catalog_items"][0]["image_url"] = URL.replace("/v10/", "/v9/")
        source.references["catalog_items"][0]["thumbnail_url"] = URL.replace("item.jpg", "missing.jpg")
        summary = media.safe_summary(media.inventory(source), 0)
        self.assertEqual(summary["reference_status_counts"]["historical_version_reference"], 1)
        self.assertEqual(summary["reference_status_counts"]["unresolved_asset"], 1)

    def test_foreign_cloud_reference_is_not_assigned_to_local_asset(self):
        source = Source()
        source.references["catalog_items"][0]["image_url"] = URL.replace("unit-cloud", "another-cloud")
        summary = media.safe_summary(media.inventory(source), 0)
        self.assertEqual(summary["reference_status_counts"]["unsupported_url"], 1)

    def test_usage_count_mismatch_blocks_manifest(self):
        source = Source()
        original = source.admin
        def mismatch(path, params=None, units=1):
            value = original(path, params, units)
            if path == "usage":
                value["resources"] += 1
            return value
        source.admin = mismatch
        with self.assertRaisesRegex(media.MediaError, "provider_count_parity_failed"):
            media.inventory(source)

    def test_source_change_during_inventory_is_detected(self):
        source = Source()
        original = source.admin
        calls = 0
        def changed(path, params=None, units=1):
            nonlocal calls
            value = original(path, params, units)
            if path == "usage":
                calls += 1
                value["resources"] += calls - 1
            return value
        source.admin = changed
        with self.assertRaisesRegex(media.MediaError, "source_changed_during_inventory"):
            media.inventory(source)

    def test_repeated_cursor_and_page_budget_are_detected(self):
        source = Source()
        source.admin = lambda *args, **kwargs: {"resources": [], "next_cursor": "same"}
        with self.assertRaisesRegex(media.MediaError, "repeated_provider_cursor"):
            list(media.pages(source, "resources/image", "resources"))
        with patch.object(media, "MAX_PAGES", 1), self.assertRaisesRegex(media.MediaError, "page_budget_reached"):
            list(media.pages(source, "resources/image", "resources"))

    def test_deleted_backups_and_versions_are_preserved(self):
        source = Source()
        original = source.admin
        backup = {**ASSET, "asset_id": "deleted-asset", "status": "deleted", "backup_bytes": 4}
        def with_backup(path, params=None, units=1):
            if path == "resources/search":
                return {"resources": [backup]}
            if path == "resources/image/upload/catalog%2Fitem":
                self.assertEqual(units, 11)
                self.assertEqual(params["versions"], "true")
                self.assertEqual(params["max_results"], 100)
                return {"asset_id": "deleted-asset", "public_id": "catalog/item",
                        "versions": [{"version_id": "62c42bf1bc3bdf191449472f79253e5f", "bytes": 4,
                                      "time": "2026-09-01T01:00:00Z", "format": "jpg", "width": 2, "height": 2}],
                        "derived": [], "derived_next_cursor": "derived-only-next-page"}
            return original(path, params, units)
        source.admin = with_backup
        manifest = media.inventory(source)
        self.assertEqual(manifest["backups"]["deleted-asset"]["status"], "deleted")
        summary = media.safe_summary(manifest, 0)
        self.assertEqual(summary["retained_version_count"], 1)
        self.assertEqual(summary["retained_version_known_bytes"], 4)
        self.assertEqual(summary["backup_storage_reported_bytes"], 4)
        self.assertEqual(summary["retained_version_unknown_size_count"], 0)
        self.assertTrue(summary["known_bytes_exclude_backups"])

    def test_incomplete_backup_versions_block_manifest(self):
        source = Source()
        original = source.admin
        def incomplete(path, params=None, units=1):
            if path == "resources/search":
                return {"resources": [ASSET]}
            if path == "resources/image/upload/catalog%2Fitem":
                return {"derived": [], "derived_next_cursor": "more"}
            return original(path, params, units)
        source.admin = incomplete
        with self.assertRaisesRegex(media.MediaError, "version_inventory_incomplete"):
            media.inventory(source)

    def test_unknown_version_sizes_are_preserved_and_reported(self):
        manifest = media.inventory(Source())
        manifest["versions"] = {"asset-one": {"versions": [{"version_id": "old", "unknown_field": PRIVATE}]}}
        summary = media.safe_summary(manifest, 0)
        self.assertEqual(summary["retained_version_count"], 1)
        self.assertEqual(summary["retained_version_known_bytes"], 0)
        self.assertEqual(summary["retained_version_unknown_size_count"], 1)
        self.assertNotIn(PRIVATE, json.dumps(summary))

    def test_version_budget_failure_reports_safe_partial_progress(self):
        source = Source()
        original = source.admin
        def budget_failure(path, params=None, units=1):
            if path == "resources/search":
                return {"resources": [ASSET]}
            if path == "resources/image/upload/catalog%2Fitem":
                raise media.MediaError("admin_budget_reached")
            return original(path, params, units)
        source.admin = budget_failure
        output = io.StringIO()
        with patch.object(media, "Reader", return_value=source), contextlib.redirect_stdout(output):
            self.assertEqual(media.main(), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["stage"], "backup_version_details")
        self.assertEqual(report["progress_counts"]["original_assets"], 1)
        self.assertEqual(report["progress_counts"]["backup_assets"], 1)
        self.assertEqual(report["progress_counts"]["version_details_completed"], 0)
        self.assertNotIn(PRIVATE, output.getvalue())
        self.assertNotIn(URL, output.getvalue())

    def test_database_order_prevents_truncation_or_duplicate_reads(self):
        source = Source()
        source.references["catalog_items"].append(copy.deepcopy(source.references["catalog_items"][0]))
        with self.assertRaisesRegex(media.MediaError, "invalid_database_order"):
            media.inventory(source)


class BoundaryTests(unittest.TestCase):
    def test_fixed_hosts_get_and_header_separation(self):
        opener = Opener(b"{}")
        reader = media.Reader(env(), opener)
        reader.admin("usage")
        self.assertEqual(opener.requests[0].get_method(), "GET")
        self.assertTrue(opener.requests[0].full_url.startswith("https://api.cloudinary.com/v1_1/unit-cloud/"))
        self.assertTrue(opener.requests[0].get_header("Authorization").startswith("Basic "))
        opener.data = b"[]"
        reader.database("clothes")
        self.assertTrue(opener.requests[1].full_url.startswith(media.SUPABASE_URL + "/rest/v1/clothes?"))
        self.assertEqual(opener.requests[1].get_header("Apikey"), env()["SUPABASE_SERVICE_ROLE_KEY"])
        opener.data = b"data"
        self.assertEqual(reader.original(URL, 4), b"data")
        self.assertIsNone(opener.requests[2].get_header("Authorization"))
        self.assertIsNone(opener.requests[2].get_header("Apikey"))

    def test_wrong_destination_and_admin_paths_fail_before_network(self):
        wrong = env()
        wrong["SUPABASE_SERVICE_ROLE_KEY"] = "wrong." + PRIVATE + ".signature"
        with self.assertRaisesRegex(media.MediaError, "wrong_destination_credential"):
            media.Reader(wrong, Opener())
        reader = media.Reader(env(), Opener())
        with self.assertRaisesRegex(media.MediaError, "invalid_admin_path"):
            reader.admin("../" + PRIVATE)

    def test_admin_budget_counts_expensive_version_calls(self):
        reader = media.Reader(env(), Opener())
        reader.admin_units = media.MAX_ADMIN_UNITS - 10
        with self.assertRaisesRegex(media.MediaError, "admin_budget_reached"):
            reader.admin("resources/image/upload/item", {"versions": "true"}, units=11)

    def test_redirects_and_untrusted_urls_never_receive_requests(self):
        self.assertIsNone(media.NoRedirects().redirect_request(None, None, 302, PRIVATE, {}, "https://example.com"))
        reader = media.Reader(env(), Opener())
        for url in [URL.replace("https:", "http:"), URL.replace("res.cloudinary.com", "res.cloudinary.com.evil.test"),
                    URL + "?credential=" + PRIVATE, URL.replace("catalog/", "../"), URL.replace("catalog/", "%2e%2e/")]:
            with self.subTest(kind=url.split(":", 1)[0]), self.assertRaisesRegex(media.MediaError, "unsupported_media_url"):
                reader.original(url, 4)
        self.assertEqual(reader.opener.requests, [])

    def test_object_bounds_and_size_parity(self):
        reader = media.Reader(env(), Opener(b"data"))
        for size in [0, media.MAX_OBJECT_BYTES + 1]:
            with self.subTest(size=size), self.assertRaisesRegex(media.MediaError, "object_size_limit"):
                reader.original(URL, size)
        with self.assertRaisesRegex(media.MediaError, "source_size_mismatch"):
            reader.original(URL, 5)
        with self.assertRaisesRegex(media.MediaError, "response_too_large"):
            reader.original(URL, 3)

    def test_provider_failure_never_prints_private_payload(self):
        for error in [RuntimeError(PRIVATE), urllib.error.HTTPError("https://" + PRIVATE, 401, PRIVATE, {}, io.BytesIO(PRIVATE.encode()))]:
            output = io.StringIO()
            with patch.dict(media.os.environ, env(), clear=True), \
                    patch.object(media.urllib.request, "build_opener", return_value=Opener(error=error)), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(media.main(), 1)
            self.assertNotIn(PRIVATE, output.getvalue())
            self.assertNotIn(URL, output.getvalue())
            self.assertEqual(json.loads(output.getvalue())["status"], "error")

    def test_private_file_and_safe_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "manifest.json"
            output = io.StringIO()
            with patch.dict(media.os.environ, {"STYLESNAP_PRIVATE_MANIFEST": str(target)}, clear=True), \
                    patch.object(media, "Reader", return_value=Source()), contextlib.redirect_stdout(output):
                self.assertEqual(media.main(), 0)
            self.assertIn(PRIVATE, target.read_text())
            self.assertNotIn(PRIVATE, output.getvalue())
            self.assertNotIn(URL, output.getvalue())
            if os.name == "posix":
                self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_manifest_cannot_be_written_into_repository(self):
        output = io.StringIO()
        target = SCRIPT.parent / "private-test-must-not-be-created.json"
        with patch.dict(media.os.environ, {"STYLESNAP_PRIVATE_MANIFEST": str(target)}, clear=True), \
                patch.object(media, "Reader", return_value=Source()), contextlib.redirect_stdout(output):
            self.assertEqual(media.main(), 1)
        self.assertEqual(json.loads(output.getvalue())["failure_code"], "manifest_must_be_outside_repository")
        self.assertFalse(target.exists())


class CopyTests(unittest.TestCase):
    def test_round_trip_hash_before_success_and_idempotent_resume(self):
        storage = Storage()
        budget = {"used_bytes": 0, "ceiling_bytes": 20}
        first = media.copy_verified(Source(), storage, URL, 4, budget)
        second = media.copy_verified(Source(), storage, URL, 4, budget)
        self.assertEqual(first["sha256"], media.digest(b"data"))
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(storage.inserts, 1)
        self.assertEqual(budget["used_bytes"], 4)

    def test_capacity_guard_runs_before_download_or_insert(self):
        source, storage = Source(), Storage()
        source.original = lambda *args: self.fail("Download exceeded capacity guard")
        with self.assertRaisesRegex(media.MediaError, "copy_capacity_limit"):
            media.copy_verified(source, storage, URL, 4, {"used_bytes": 18, "ceiling_bytes": 20})
        self.assertEqual(storage.inserts, 0)

    def test_corrupt_copy_fails_parity_and_never_overwrites(self):
        storage = Storage(corrupt=True)
        budget = {"used_bytes": 0, "ceiling_bytes": 20}
        with self.assertRaisesRegex(media.MediaError, "destination_parity_failed"):
            media.copy_verified(Source(), storage, URL, 4, budget)
        with self.assertRaisesRegex(media.MediaError, "destination_conflict"):
            media.copy_verified(Source(), storage, URL, 4, budget)
        self.assertEqual(storage.inserts, 1)


if __name__ == "__main__":
    unittest.main()
