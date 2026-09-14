"""Read Cloudinary /usage once; emit only allowlisted aggregate measurements."""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

MAX_RESPONSE_BYTES = 65536


class NoRedirects(urllib.request.HTTPRedirectHandler):
    """Never forward the credential header to another URL."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def counter(value):
    if type(value) is not int or value < 0:
        raise ValueError("invalid counter")
    return value


def parse_usage(payload):
    """Provider errors and unknown fields never enter the report."""
    if not isinstance(payload, dict) or "error" in payload:
        raise ValueError("invalid response")
    return {
        "storage_bytes": counter(payload["storage"]["usage"]),
        "bandwidth_bytes": counter(payload["bandwidth"]["usage"]),
        "resource_count": counter(payload["resources"]),
        "derived_resource_count": counter(payload["derived_resources"]),
    }


def collect(env, opener=None):
    report = {"provider": "cloudinary", "scope": "product_environment",
              "units": {"storage_bytes": "bytes", "bandwidth_bytes": "bytes",
                        "resource_count": "count", "derived_resource_count": "count"}}
    cloud = env.get("VITE_CLOUDINARY_CLOUD_NAME", "").strip()
    key = env.get("CLOUDINARY_API_KEY", "").strip()
    secret = env.get("CLOUDINARY_API_SECRET", "").strip()
    if not cloud or not key or not secret:
        return {**report, "status": "error", "failure_code": "missing_configuration"}
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", cloud) or any(c in key + secret for c in "\r\n"):
        return {**report, "status": "error", "failure_code": "invalid_configuration"}
    authorization = base64.b64encode((key + ":" + secret).encode()).decode()
    request = urllib.request.Request(
        "https://api.cloudinary.com/v1_1/" + cloud + "/usage", method="GET",
        headers={"Authorization": "Basic " + authorization, "Accept": "application/json"})
    try:
        opener = opener or urllib.request.build_opener(NoRedirects())
        with opener.open(request, timeout=20) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                return {**report, "status": "error", "failure_code": "response_too_large"}
            usage = parse_usage(json.loads(raw))
        return {**report, "status": "ok", "http_status": 200, "measurements": usage}
    except urllib.error.HTTPError as exc:
        return {**report, "status": "error", "failure_code": "provider_http_error", "http_status": exc.code}
    except (ValueError, KeyError, TypeError):
        return {**report, "status": "error", "failure_code": "invalid_response"}
    except Exception:  # Do not log exception text: URLs and headers can contain credentials.
        return {**report, "status": "error", "failure_code": "request_failed"}


def main():
    report = collect(os.environ)
    encoded = json.dumps(report, sort_keys=True)
    print(encoded)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write("```json\n" + encoded + "\n```\n")
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
