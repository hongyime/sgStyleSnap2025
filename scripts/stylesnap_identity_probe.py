"""Manual metadata-only canary for the archive worker's exact identity query."""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from stylesnap_media import MediaError, NoRedirects

FIELDS = ("asset_id", "public_id", "resource_type", "type", "format", "version", "bytes", "etag")
MAX_RESPONSE_BYTES = 65_536
MAX_REQUESTS = 3


def identities(payload, expected_ids=None, require_etag=True):
    if not isinstance(payload, dict) or "error" in payload:
        raise MediaError("invalid_identity_response")
    rows = payload.get("resources")
    if not isinstance(rows, list) or not 0 < len(rows) <= 10:
        raise MediaError("invalid_identity_response")
    if expected_ids is not None and payload.get("next_cursor"):
        raise MediaError("incomplete_identity_response")
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise MediaError("invalid_identity_response")
        fields = FIELDS if require_etag else FIELDS[:-1]
        for field in fields:
            value = row.get(field)
            if field in ("version", "bytes"):
                valid = type(value) is int and value >= 0
            else:
                valid = isinstance(value, str) and 0 < len(value) <= 2048
            if not valid:
                raise MediaError("etag_unavailable" if field == "etag" else "invalid_identity_response")
        key = row["asset_id"]
        if len(key) > 128 or key in result:
            raise MediaError("invalid_identity_response")
        result[key] = {field: row[field] for field in fields}
    if expected_ids is not None and set(result) != set(expected_ids):
        raise MediaError("incomplete_identity_response")
    return result


def collect(env, opener=None):
    report = {"status": "error", "phase": "identity_metadata_probe", "request_count": 0,
              "response_bytes": 0, "sample_count": 0, "metadata_stable": False,
              "media_downloads": 0, "database_requests": 0, "writes": 0}
    try:
        cloud = env.get("VITE_CLOUDINARY_CLOUD_NAME", "").strip()
        key = env.get("CLOUDINARY_API_KEY", "").strip()
        secret = env.get("CLOUDINARY_API_SECRET", "").strip()
        if not cloud or not key or not secret:
            raise MediaError("missing_configuration")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", cloud) or any(c in key + secret for c in "\r\n"):
            raise MediaError("invalid_configuration")
        authorization = "Basic " + base64.b64encode((key + ":" + secret).encode()).decode()
        opener = opener or urllib.request.build_opener(NoRedirects())

        def request(path, params):
            if path not in ("resources/image", "resources/by_asset_ids") or report["request_count"] >= MAX_REQUESTS:
                raise MediaError("probe_request_boundary")
            report["request_count"] += 1
            url = "https://api.cloudinary.com/v1_1/" + cloud + "/" + path
            url += "?" + urllib.parse.urlencode(params, doseq=True)
            req = urllib.request.Request(url, method="GET", headers={"Authorization": authorization,
                                                                       "Accept": "application/json"})
            with opener.open(req, timeout=20) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                report["response_bytes"] += len(raw)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise MediaError("response_too_large")
                return json.loads(raw)

        # One page is intentionally a sample. Do not follow its pagination cursor.
        sampled = identities(request("resources/image", {"max_results": 10,
                             "fields": ",".join(FIELDS[:-1])}), require_etag=False)
        report["sample_count"] = len(sampled)
        query = {"asset_ids[]": list(sampled), "fields": ",".join(FIELDS)}
        before = identities(request("resources/by_asset_ids", query), sampled)
        if {key: {field: row[field] for field in FIELDS[:-1]} for key, row in before.items()} != sampled:
            raise MediaError("source_changed_during_probe")
        after = identities(request("resources/by_asset_ids", query), sampled)
        if before != after:
            raise MediaError("source_changed_during_probe")
        report.update(status="ok", metadata_stable=True, etag_count=len(before))
    except MediaError as exc:
        report["failure_code"] = exc.code
    except urllib.error.HTTPError as exc:
        report.update(failure_code="provider_http_error", http_status=exc.code)
    except (ValueError, TypeError, KeyError):
        report["failure_code"] = "invalid_identity_response"
    except Exception:
        report["failure_code"] = "probe_failed"
    return report


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
