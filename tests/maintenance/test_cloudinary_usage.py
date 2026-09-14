"""Exercise the real HTTP/report boundary with synthetic provider responses."""
import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/cloudinary-usage.py"
SPEC = importlib.util.spec_from_file_location("cloudinary_usage", SCRIPT)
usage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(usage)
SENTINEL = "never-print-this-private-value"
ENV = {"VITE_CLOUDINARY_CLOUD_NAME": "unit-test-cloud", "CLOUDINARY_API_KEY": "unit-key",
       "CLOUDINARY_API_SECRET": SENTINEL}
PAYLOAD = {"storage": {"usage": 12345}, "bandwidth": {"usage": 678},
           "resources": 9, "derived_resources": 12, "unknown": SENTINEL}


class FakeOpener:
    def __init__(self, data=None, error=None):
        self.data = json.dumps(PAYLOAD).encode() if data is None else data
        self.error = error
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if self.error:
            raise self.error
        return io.BytesIO(self.data)


class UsageTests(unittest.TestCase):
    def test_get_usage_once_and_allowlist_output(self):
        opener = FakeOpener()
        report = usage.collect(ENV, opener)
        self.assertEqual(report["measurements"], {"storage_bytes": 12345, "bandwidth_bytes": 678,
                         "resource_count": 9, "derived_resource_count": 12})
        self.assertEqual(report["status"], "ok")
        self.assertEqual(len(opener.requests), 1)
        request, timeout = opener.requests[0]
        self.assertEqual(request.full_url, "https://api.cloudinary.com/v1_1/unit-test-cloud/usage")
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)
        self.assertEqual(timeout, 20)
        expected = base64.b64encode(("unit-key:" + SENTINEL).encode()).decode()
        self.assertEqual(request.get_header("Authorization"), "Basic " + expected)
        self.assertNotIn(SENTINEL, json.dumps(report))
        self.assertNotIn(expected, json.dumps(report))

    def test_missing_configuration_does_not_request(self):
        for key in ENV:
            with self.subTest(key=key):
                opener = FakeOpener()
                report = usage.collect({k: v for k, v in ENV.items() if k != key}, opener)
                self.assertEqual(report["failure_code"], "missing_configuration")
                self.assertEqual(opener.requests, [])

    def test_invalid_cloud_and_header_values_do_not_request(self):
        for key, value in [("VITE_CLOUDINARY_CLOUD_NAME", "../" + SENTINEL),
                           ("CLOUDINARY_API_KEY", "x\ny"), ("CLOUDINARY_API_SECRET", "x\ry")]:
            with self.subTest(key=key):
                opener = FakeOpener()
                report = usage.collect({**ENV, key: value}, opener)
                self.assertEqual(report["failure_code"], "invalid_configuration")
                self.assertEqual(opener.requests, [])
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_provider_error_bodies_and_messages_are_not_logged(self):
        for code in [401, 403, 429, 500, 302]:
            with self.subTest(code=code):
                error = urllib.error.HTTPError("https://" + SENTINEL, code, SENTINEL, {}, io.BytesIO(SENTINEL.encode()))
                report = usage.collect(ENV, FakeOpener(error=error))
                self.assertEqual(report["http_status"], code)
                self.assertEqual(report["failure_code"], "provider_http_error")
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_network_failure_never_prints_exception(self):
        report = usage.collect(ENV, FakeOpener(error=RuntimeError(SENTINEL)))
        self.assertEqual(report["failure_code"], "request_failed")
        self.assertNotIn(SENTINEL, json.dumps(report))

    def test_malformed_and_provider_error_payloads(self):
        for data in [SENTINEL.encode(), b"null", b"[]", json.dumps({"error": SENTINEL}).encode()]:
            with self.subTest(data_type=type(data).__name__):
                report = usage.collect(ENV, FakeOpener(data))
                self.assertEqual(report["failure_code"], "invalid_response")
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_invalid_measurements_are_rejected(self):
        for value in [True, -1, 1.5, "123", SENTINEL, None]:
            with self.subTest(value_type=type(value).__name__):
                payload = {**PAYLOAD, "storage": {"usage": value}}
                report = usage.collect(ENV, FakeOpener(json.dumps(payload).encode()))
                self.assertEqual(report["failure_code"], "invalid_response")
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_oversized_response_is_rejected(self):
        report = usage.collect(ENV, FakeOpener(b"x" * (usage.MAX_RESPONSE_BYTES + 1)))
        self.assertEqual(report["failure_code"], "response_too_large")

    def test_redirects_are_not_followed(self):
        self.assertIsNone(usage.NoRedirects().redirect_request(None, None, 302, SENTINEL, {}, "https://example.com"))

    def test_stdout_and_step_summary_contain_only_safe_report(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary.txt"
            output = io.StringIO()
            with patch.dict(usage.os.environ, {**ENV, "GITHUB_STEP_SUMMARY": str(summary)}, clear=True), \
                    patch.object(usage.urllib.request, "build_opener", return_value=FakeOpener()), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(usage.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["measurements"]["storage_bytes"], 12345)
            self.assertNotIn(SENTINEL, output.getvalue() + summary.read_text())

    def test_failure_exit_and_summary_are_secret_safe(self):
        output = io.StringIO()
        with patch.dict(usage.os.environ, ENV, clear=True), \
                patch.object(usage.urllib.request, "build_opener", return_value=FakeOpener(error=RuntimeError(SENTINEL))), \
                contextlib.redirect_stdout(output):
            self.assertEqual(usage.main(), 1)
        self.assertEqual(json.loads(output.getvalue())["failure_code"], "request_failed")
        self.assertNotIn(SENTINEL, output.getvalue())


if __name__ == "__main__":
    unittest.main()
