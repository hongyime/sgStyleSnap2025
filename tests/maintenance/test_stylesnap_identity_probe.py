import io
import json
from pathlib import Path
import sys
import unittest
import urllib.error
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import stylesnap_identity_probe as probe

PRIVATE = "synthetic-private-provider-value"
ENV = {"VITE_CLOUDINARY_CLOUD_NAME": "unit-cloud", "CLOUDINARY_API_KEY": "unit-key",
       "CLOUDINARY_API_SECRET": PRIVATE}
ROW = {"asset_id": "asset-one", "public_id": PRIVATE, "resource_type": "image",
       "type": "upload", "format": "jpg", "version": 1, "bytes": 4, "etag": PRIVATE}


class Opener:
    def __init__(self, handler):
        self.handler = handler
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        assert timeout == 20
        value = self.handler(len(self.requests), request)
        return io.BytesIO(value if isinstance(value, bytes) else json.dumps(value).encode())


class IdentityProbeTests(unittest.TestCase):
    def test_documented_asset_metadata_mode_uses_only_one_asset_and_three_reads(self):
        row = {**ROW, "asset_id": "a" * 32}
        def response(number, request):
            url = urllib.parse.urlsplit(request.full_url)
            query = urllib.parse.parse_qs(url.query)
            if number == 1:
                self.assertEqual(query["max_results"], ["1"])
                return {"resources": [row], "next_cursor": PRIVATE}
            self.assertEqual(url.path, "/v1_1/unit-cloud/resources/" + row["asset_id"])
            self.assertEqual(query, {"image_metadata": ["true"], "max_results": ["1"]})
            return {**row, "image_metadata": {"private": PRIVATE}, "derived_next_cursor": PRIVATE}
        opener = Opener(response)
        result = probe.collect({**ENV, "STYLESNAP_IDENTITY_MODE": "asset_metadata"}, opener)
        self.assertEqual((result["status"], result["sample_count"], result["request_count"], result["etag_count"]), ("ok", 1, 3, 1))
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_detail_changed_etag_wrong_id_and_missing_fields_fail_without_fallback(self):
        row = {**ROW, "asset_id": "a" * 32}
        for replacement, expected in (({**row, "etag": "changed"}, "source_changed_during_probe"),
                                      ({**row, "asset_id": "b" * 32}, "incomplete_identity_response"),
                                      ({key: value for key, value in row.items() if key != "etag"}, "etag_unavailable")):
            opener = Opener(lambda n, req: {"resources": [row]} if n == 1 else (row if n == 2 else replacement))
            result = probe.collect({**ENV, "STYLESNAP_IDENTITY_MODE": "asset_metadata"}, opener)
            self.assertEqual((result["failure_code"], result["request_count"]), (expected, 3))
            self.assertNotIn(PRIVATE, json.dumps(result))

    def test_detail_sample_overflow_unsafe_id_and_unknown_mode_stop_early(self):
        for rows in ([ROW], [{**ROW, "asset_id": "../unsafe"}], [ROW, ROW]):
            opener = Opener(lambda n, req: {"resources": rows})
            result = probe.collect({**ENV, "STYLESNAP_IDENTITY_MODE": "asset_metadata"}, opener)
            self.assertEqual((result["status"], result["request_count"]), ("error", 1))
        opener = Opener(lambda n, req: self.fail("Unknown mode made a request"))
        result = probe.collect({**ENV, "STYLESNAP_IDENTITY_MODE": "unknown"}, opener)
        self.assertEqual((result["failure_code"], result["request_count"]), ("invalid_probe_mode", 0))

    def run_probe(self, handler):
        opener = Opener(handler)
        result = probe.collect(ENV, opener)
        self.assertLessEqual(len(opener.requests), 3)
        self.assertNotIn(PRIVATE, json.dumps(result))
        self.assertEqual((result["media_downloads"], result["database_requests"], result["writes"]), (0, 0, 0))
        return result, opener

    def test_exact_query_no_database_or_media_and_only_one_sample_page(self):
        rows = [{**ROW, "asset_id": "id-" + str(i)} for i in range(10)]
        def response(number, request):
            url = urllib.parse.urlsplit(request.full_url)
            query = urllib.parse.parse_qs(url.query)
            self.assertEqual((url.scheme, url.netloc, request.method), ("https", "api.cloudinary.com", "GET"))
            if number == 1:
                self.assertEqual(url.path, "/v1_1/unit-cloud/resources/image")
                self.assertEqual(query["max_results"], ["10"])
                return {"resources": rows, "next_cursor": PRIVATE}
            self.assertEqual(url.path, "/v1_1/unit-cloud/resources/by_asset_ids")
            self.assertEqual(query, {"asset_ids[]": [row["asset_id"] for row in rows], "fields": [",".join(probe.FIELDS)]})
            return {"resources": list(reversed(rows))}
        result, opener = self.run_probe(response)
        self.assertEqual((result["status"], result["etag_count"], result["request_count"]), ("ok", 10, 3))
        self.assertTrue(result["metadata_stable"])

    def test_missing_etag_stops_without_retry(self):
        row = {key: value for key, value in ROW.items() if key != "etag"}
        result, _ = self.run_probe(lambda n, req: {"resources": [row]})
        self.assertEqual((result["failure_code"], result["request_count"]), ("etag_unavailable", 2))

    def test_changed_etag_and_same_size_identity_fail(self):
        for field, value, changed_at in (("etag", "changed", 3), ("public_id", "renamed", 2), ("version", 2, 3)):
            with self.subTest(field=field):
                result, _ = self.run_probe(lambda n, req: {"resources": [{**ROW, **({field: value} if n == changed_at else {})}]})
                self.assertEqual(result["failure_code"], "source_changed_during_probe")

    def test_rejects_missing_duplicate_boolean_and_paginated_identities(self):
        for payload in ({"resources": []}, {"resources": [ROW, ROW]}, {"resources": [{**ROW, "bytes": True}]},
                        {"resources": [ROW], "next_cursor": PRIVATE}, {"resources": [{**ROW, "asset_id": "different"}]}):
            with self.subTest(kind=str(type(payload))):
                result, _ = self.run_probe(lambda n, req: {"resources": [ROW]} if n == 1 else payload)
                self.assertEqual(result["status"], "error")
                self.assertEqual(result["request_count"], 2)

    def test_sample_limit_empty_and_malformed_json(self):
        for payload in ({"resources": []}, {"resources": [ROW] * 11}, {"resources": [None]}, b"not json", {"error": PRIVATE}):
            result, _ = self.run_probe(lambda n, req: payload)
            self.assertEqual((result["status"], result["request_count"]), ("error", 1))

    def test_response_cap_and_http_errors_never_leak_payload(self):
        result, _ = self.run_probe(lambda n, req: b"x" * (probe.MAX_RESPONSE_BYTES + 100))
        self.assertEqual(result["failure_code"], "response_too_large")
        self.assertEqual(result["response_bytes"], probe.MAX_RESPONSE_BYTES + 1)
        for status in (301, 401, 429, 500):
            def fail(n, req):
                raise urllib.error.HTTPError(req.full_url, status, PRIVATE, {}, io.BytesIO(PRIVATE.encode()))
            result, _ = self.run_probe(fail)
            self.assertEqual((result["failure_code"], result["http_status"], result["request_count"]), ("provider_http_error", status, 1))

    def test_credentials_configuration_and_redirect_handler(self):
        for env in ({}, {**ENV, "VITE_CLOUDINARY_CLOUD_NAME": "x/../../evil"}, {**ENV, "CLOUDINARY_API_SECRET": "bad\nheader"}):
            opener = Opener(lambda n, req: self.fail("Invalid configuration made a request"))
            self.assertEqual(probe.collect(env, opener)["status"], "error")
            self.assertEqual(opener.requests, [])
        self.assertIsNone(probe.NoRedirects().redirect_request(None, None, 302, "redirect", {}, "https://example.com"))


if __name__ == "__main__":
    unittest.main()
