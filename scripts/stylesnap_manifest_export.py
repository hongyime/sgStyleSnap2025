"""Read-only bounded inventory, encrypted in memory to a reviewed public key."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from stylesnap_media import Reader, MediaError, inventory, canonical, digest, safe_summary

RECIPIENT_SHA256 = "2f1af15a75a30476ab8fb6b6e35807f32bf0952d140490eda171546bda0a088c"
MAX_PLAINTEXT_BYTES = 32 * 1024 * 1024
MAX_ENVELOPE_BYTES = 45 * 1024 * 1024
MAX_RESPONSE_TOTAL_BYTES = 128 * 1024 * 1024
MAX_REQUESTS = 430
ROOT = Path(__file__).resolve().parent.parent


class ExportReader(Reader):
    def __init__(self, env, opener=None):
        super().__init__(env, opener)
        self.received_bytes = 0
        self.request_count = 0

    def request(self, url, headers, maximum=8 * 1024 * 1024, method="GET", data=None):
        # The export is exclusively read-only, including all Supabase requests.
        if method != "GET" or data is not None or self.request_count >= MAX_REQUESTS:
            raise MediaError("export_request_budget_or_method")
        remaining = MAX_RESPONSE_TOTAL_BYTES - self.received_bytes
        if remaining <= 0:
            raise MediaError("export_response_budget_reached")
        self.request_count += 1
        raw = super().request(url, headers, min(maximum, remaining), method, data)
        self.received_bytes += len(raw)
        return raw


def envelope_child(mode, plaintext=None):
    node = shutil.which("node")
    if not node:
        raise MediaError("node_runtime_missing")
    # Provider credentials and NODE_OPTIONS never enter the encryption process.
    child_env = {name: os.environ[name] for name in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "SystemDrive") if name in os.environ}
    try:
        result = subprocess.run([node, str(ROOT / "scripts/stylesnap-manifest-envelope.mjs"), mode],
            input=plaintext, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, env=child_env)
    except Exception:
        raise MediaError("encryption_process_failed") from None
    if result.returncode or len(result.stdout) > MAX_ENVELOPE_BYTES or len(result.stderr) > 8192:
        raise MediaError("encryption_process_failed")
    return result.stdout


def recipient_preflight():
    raw = envelope_child("validate")
    try:
        if json.loads(raw) != {"recipient_sha256": RECIPIENT_SHA256}:
            raise ValueError()
    except Exception:
        raise MediaError("recipient_validation_failed") from None


def export_manifest(reader, output, seal=None):
    path = Path(output).resolve()
    if path.is_relative_to(ROOT) or path.exists() or not path.parent.is_dir():
        raise MediaError("invalid_encrypted_output_path")
    reader.stage = "inventory"
    manifest = inventory(reader)
    plaintext = canonical(manifest)
    if len(plaintext) > MAX_PLAINTEXT_BYTES:
        raise MediaError("manifest_byte_limit")
    reader.stage = "encrypt_manifest"
    sealed = seal(plaintext) if seal else envelope_child("seal", plaintext)
    if not isinstance(sealed, bytes) or not 0 < len(sealed) <= MAX_ENVELOPE_BYTES:
        raise MediaError("invalid_encrypted_output")
    try:
        header = json.loads(sealed)
        if (header.get("format") != "stylesnap-media-manifest-export" or header.get("version") != 1
                or header.get("recipient_sha256") != RECIPIENT_SHA256 or header.get("plaintext_bytes") != len(plaintext)
                or not all(isinstance(header.get(key), str) for key in ("wrapped_key", "iv", "tag", "ciphertext"))):
            raise ValueError()
    except Exception:
        raise MediaError("invalid_encrypted_output") from None
    reader.stage = "write_ciphertext"
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(sealed)
    # Unresolved references remain in the complete encrypted manifest. They do
    # not block this metadata export, nor become evidence of copy/cutover parity.
    report = safe_summary(manifest, reader.admin_units)
    report.update({"phase": "encrypted_manifest_export", "plaintext_bytes": len(plaintext),
        "ciphertext_artifact_bytes": len(sealed), "ciphertext_artifact_sha256": digest(sealed),
        "recipient_sha256": RECIPIENT_SHA256, "copy_eligible": False})
    return report


def main():
    reader = None
    report = {"status":"error", "phase":"encrypted_manifest_export"}
    try:
        target = os.environ.get("STYLESNAP_ENCRYPTED_MANIFEST")
        if not target:
            raise MediaError("encrypted_output_path_required")
        recipient_preflight()  # Before a provider reader is created or secrets used.
        reader = ExportReader(os.environ)
        report = export_manifest(reader, target)
    except MediaError as error:
        report["failure_code"] = error.code
        if error.http_status is not None:
            report["http_status"] = error.http_status
    except Exception:
        report["failure_code"] = "encrypted_export_failed"
    if reader:
        report["stage"] = reader.stage
        report["request_count"] = reader.request_count
        report["response_bytes"] = reader.received_bytes
        report["admin_units"] = reader.admin_units
        report["progress_counts"] = getattr(reader, "progress", {})
    encoded = json.dumps(report, sort_keys=True)
    print(encoded)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write("```json\n" + encoded + "\n```\n")
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
