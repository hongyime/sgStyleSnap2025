"""Export boundary tests: no live providers, raw files or receiving private key."""
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import stylesnap_manifest_export as exporter
from stylesnap_media import MediaError, canonical, digest, SUPABASE_URL
from test_stylesnap_media import Source, media

PRIVATE = "synthetic-private-record-marker"


def fixture():
    source = Source()
    source.references["catalog_items"][0]["image_url"] = "https://res.cloudinary.com/unit-cloud/image/upload/v10/missing.jpg"
    manifest = media.inventory(source)
    manifest["extra_unfiltered_field"] = {"private": PRIVATE, "unicode":"衣服🦐", "values":[None,False,0]}
    return source, manifest


def fake_seal(raw):
    return canonical({"format":"stylesnap-media-manifest-export","version":1,
        "recipient_sha256":exporter.RECIPIENT_SHA256,"plaintext_bytes":len(raw),
        "wrapped_key":"opaque-wrapped-key","iv":"opaque-iv","tag":"opaque-tag","ciphertext":"opaque-ciphertext"})


class ExportTests(unittest.TestCase):
    def test_complete_raw_manifest_is_sealed_even_with_unresolved_references(self):
        reader, manifest = fixture(); seen = []
        with tempfile.TemporaryDirectory() as directory, patch.object(exporter,"inventory",return_value=manifest):
            target = Path(directory)/"manifest.enc.json"
            report = exporter.export_manifest(reader,target,lambda raw: seen.append(raw) or fake_seal(raw))
            self.assertEqual(seen,[canonical(manifest)])
            self.assertEqual(report["reference_status_counts"]["unresolved_asset"],1)
            self.assertFalse(report["copy_eligible"]); self.assertFalse(report["snapshot_consistency_proven"])
            self.assertEqual(report["manifest_sha256"],digest(seen[0]))
            self.assertEqual(report["ciphertext_artifact_sha256"],digest(target.read_bytes()))
            self.assertNotIn(PRIVATE,target.read_text()); self.assertNotIn(PRIVATE,json.dumps(report))
            self.assertEqual([p.name for p in Path(directory).iterdir()],["manifest.enc.json"])
            if os.name != "nt": self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o600)

    def test_output_inside_repository_or_existing_file_fails_before_inventory(self):
        reader, manifest = fixture()
        with patch.object(exporter,"inventory") as inventory:
            with self.assertRaisesRegex(MediaError,"invalid_encrypted_output_path"):
                exporter.export_manifest(reader,exporter.ROOT/"private.json",fake_seal)
            with tempfile.TemporaryDirectory() as directory:
                target=Path(directory)/"existing"; target.write_bytes(b"preserved")
                with self.assertRaises(MediaError): exporter.export_manifest(reader,target,fake_seal)
                self.assertEqual(target.read_bytes(),b"preserved")
            inventory.assert_not_called()

    def test_crypto_failure_plaintext_output_or_oversize_leaves_no_artifact(self):
        reader, manifest = fixture()
        for seal in (lambda raw: raw, lambda raw: b"not-json", lambda raw: b"x"*1025):
            with tempfile.TemporaryDirectory() as directory, patch.object(exporter,"inventory",return_value=manifest), patch.object(exporter,"MAX_ENVELOPE_BYTES",1024):
                target=Path(directory)/"manifest.enc.json"
                with self.assertRaises(MediaError): exporter.export_manifest(reader,target,seal)
                self.assertFalse(target.exists())
        with tempfile.TemporaryDirectory() as directory, patch.object(exporter,"inventory",return_value=manifest), patch.object(exporter,"MAX_PLAINTEXT_BYTES",1):
            with self.assertRaisesRegex(MediaError,"manifest_byte_limit"):
                exporter.export_manifest(reader,Path(directory)/"manifest.enc.json",fake_seal)

    def test_recipient_preflight_failure_creates_no_provider_reader(self):
        output = io.StringIO()
        with patch.dict(os.environ,{"STYLESNAP_ENCRYPTED_MANIFEST":"unused","GITHUB_STEP_SUMMARY":""}), patch.object(exporter,"recipient_preflight",side_effect=MediaError("recipient_validation_failed")), patch.object(exporter,"ExportReader") as reader, contextlib.redirect_stdout(output):
            self.assertEqual(exporter.main(),1)
        reader.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["failure_code"],"recipient_validation_failed")

    def test_failure_report_does_not_print_provider_exception_payload(self):
        reader = SimpleNamespace(stage="source",request_count=1,received_bytes=12,admin_units=1,progress={"original_assets":2})
        output = io.StringIO()
        with patch.dict(os.environ,{"STYLESNAP_ENCRYPTED_MANIFEST":"unused","GITHUB_STEP_SUMMARY":""}), patch.object(exporter,"recipient_preflight"), patch.object(exporter,"ExportReader",return_value=reader), patch.object(exporter,"export_manifest",side_effect=RuntimeError(PRIVATE)), contextlib.redirect_stdout(output):
            self.assertEqual(exporter.main(),1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["failure_code"],"encrypted_export_failed")
        self.assertEqual(report["progress_counts"],{"original_assets":2})
        self.assertNotIn(PRIVATE,output.getvalue())

    def test_encryption_child_gets_no_provider_credentials_or_node_options(self):
        with patch.dict(os.environ,{"SUPABASE_SERVICE_ROLE_KEY":PRIVATE,"CLOUDINARY_API_SECRET":PRIVATE,"NODE_OPTIONS":PRIVATE}), patch.object(exporter.shutil,"which",return_value="node"), patch.object(exporter.subprocess,"run",return_value=SimpleNamespace(returncode=0,stdout=b"ciphertext",stderr=b"")) as run:
            self.assertEqual(exporter.envelope_child("seal",b"raw"),b"ciphertext")
            env = run.call_args.kwargs["env"]
            for name in ("SUPABASE_SERVICE_ROLE_KEY","CLOUDINARY_API_SECRET","NODE_OPTIONS"):
                self.assertNotIn(name,env)
            self.assertEqual(run.call_args.kwargs["timeout"],30)
            self.assertEqual(run.call_args.kwargs["input"],b"raw")

    def test_child_errors_and_recipient_shape_are_sanitized(self):
        with patch.object(exporter.shutil,"which",return_value="node"), patch.object(exporter.subprocess,"run",return_value=SimpleNamespace(returncode=1,stdout=b"",stderr=PRIVATE.encode())):
            with self.assertRaisesRegex(MediaError,"encryption_process_failed"):
                exporter.envelope_child("validate")
        with patch.object(exporter,"envelope_child",return_value=canonical({"recipient_sha256":"wrong"})):
            with self.assertRaisesRegex(MediaError,"recipient_validation_failed"):
                exporter.recipient_preflight()

    def test_reader_enforces_readonly_total_body_and_request_limits(self):
        class Opener:
            def __init__(self): self.calls=0
            def open(self,request,timeout): self.calls+=1; return io.BytesIO(b"abc")
        env={"VITE_CLOUDINARY_CLOUD_NAME":"unit-cloud","CLOUDINARY_API_KEY":"key","CLOUDINARY_API_SECRET":PRIVATE,"SUPABASE_SERVICE_ROLE_KEY":"sb_secret_test"}
        opener=Opener(); reader=exporter.ExportReader(env,opener)
        with self.assertRaises(MediaError): reader.request(SUPABASE_URL+"/rest/v1/clothes",{},method="POST",data=b"{}")
        self.assertEqual(opener.calls,0)
        with patch.object(exporter,"MAX_RESPONSE_TOTAL_BYTES",5):
            self.assertEqual(reader.request(SUPABASE_URL+"/rest/v1/clothes",{}),b"abc")
            with self.assertRaises(MediaError): reader.request(SUPABASE_URL+"/rest/v1/clothes",{})
        reader.request_count=exporter.MAX_REQUESTS
        with self.assertRaises(MediaError): reader.request(SUPABASE_URL+"/rest/v1/clothes",{})
        self.assertEqual(opener.calls,2)


if __name__ == "__main__": unittest.main()
