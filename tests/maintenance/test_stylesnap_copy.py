"""Offline fault tests for the unreleased archive coordinator draft."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import stylesnap_copy as worker
from stylesnap_media import MediaError, canonical, digest


class Source:
    def __init__(self, assets):
        self.assets = assets
        self.reads = 0
        self.identity_calls = 0
        self.change_after_copy = False

    def identities(self, ids):
        self.identity_calls += 1
        result = {key: worker.identity(self.assets[key]) for key in ids}
        if self.change_after_copy and self.identity_calls > 1:
            result[ids[0]]["version"] += 1
        return result

    def original(self, url, size):
        self.reads += 1
        return b"data"


class Archive:
    def __init__(self):
        self.objects = {}
        self.private = True
        self.corrupt = False
        self.checkpoints = []

    def assert_private(self):
        if not self.private:
            raise MediaError("archive_not_private")

    def get_if_exists(self, path, maximum=8_000_000):
        return self.objects.get(path)

    def insert_only(self, path, content):
        if path in self.objects:
            raise MediaError("overwrite_not_allowed")
        self.objects[path] = b"bad!" if self.corrupt else content

    def checkpoint(self, content):
        self.checkpoints.append(content)
        return digest(content)

    def read_checkpoint(self, checksum):
        return next(content for content in self.checkpoints if digest(content) == checksum)

    def checkpoint_stored_size(self, checksum):
        return len(self.read_checkpoint(checksum))


class Lease:
    def __init__(self):
        self.current = True
        self.capacity = True
        self.reservations = []
        self.committed = []
        self.egress_available = True
        self.egress_reservations = []
        self.settlements = []

    def assert_current(self):
        if not self.current:
            raise MediaError("lease_lost")

    def reserve(self, operation, maximum_bytes, ceiling_bytes):
        if not self.capacity:
            raise MediaError("copy_capacity_limit")
        self.reservations.append((operation, maximum_bytes, ceiling_bytes))

    def commit_checkpoint(self, previous_sha, checkpoint_sha):
        self.committed.append((previous_sha, checkpoint_sha))

    def current_checkpoint_sha(self):
        return self.committed[-1][1] if self.committed else None

    def reserve_egress(self, operation, maximum_bytes):
        if not self.egress_available:
            raise MediaError("egress_headroom_unverified_or_insufficient")
        self.egress_reservations.append((operation, maximum_bytes))

    def settle_storage(self, operation, object_path, observed_bytes):
        self.settlements.append((operation, object_path, observed_bytes))


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.assets = {"asset-one": {"asset_id": "asset-one", "public_id": "private/source",
                        "resource_type": "image", "type": "upload", "format": "jpg",
                        "version": 1, "bytes": 4, "etag": "source-etag", "secure_url": "private-original-url"}}
        self.manifest = {"assets": self.assets, "target_project": "nztqjmknblelnzpeatyx"}
        self.approved = digest(canonical(self.manifest))
        self.prior = {"phase": "original_archive", "manifest_sha": self.approved, "verified": {}}
        self.source, self.archive, self.lease = Source(self.assets), Archive(), Lease()

    def run_batch(self):
        return worker.run_original_batch(self.manifest, self.approved, self.prior, self.source, self.archive, self.lease)

    def test_checkpoint_advances_only_after_source_and_destination_parity(self):
        result = self.run_batch()
        self.assertEqual((result.verified_objects, result.verified_bytes, result.created_objects), (1, 4, 1))
        self.assertEqual(self.source.identity_calls, 2)
        self.assertEqual(self.lease.committed, [(None, result.checkpoint_sha)])
        self.assertEqual(self.prior["verified"], {})
        self.assertEqual(len(self.lease.reservations), 2)

    def test_crash_recovery_reuses_verified_add_only_object(self):
        self.source.change_after_copy = True
        with self.assertRaisesRegex(MediaError, "source_identity_changed_after_copy"):
            self.run_batch()
        self.source.change_after_copy = False
        second = self.run_batch()
        self.assertEqual(second.created_objects, 0)
        self.assertEqual(len(self.archive.objects), 1)

    def test_forged_initial_verified_entries_cannot_skip_copy(self):
        self.prior["verified"] = {"asset-one": {"sha256": "forged"}}
        with self.assertRaisesRegex(MediaError, "unverified_initial_checkpoint"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)

    def test_checkpoint_must_match_durable_pointer_and_verified_bytes(self):
        result = self.run_batch()
        with self.assertRaisesRegex(MediaError, "stale_checkpoint"):
            self.run_batch()
        import json
        self.prior = json.loads(self.archive.checkpoints[-1])
        self.prior["checkpoint_sha"] = result.checkpoint_sha
        self.prior["verified"].clear()
        with self.assertRaisesRegex(MediaError, "checkpoint_content_mismatch"):
            self.run_batch()
        self.archive.read_checkpoint = lambda checksum: b"tampered"
        with self.assertRaisesRegex(MediaError, "checkpoint_parity_failed"):
            self.run_batch()

    def test_capacity_and_private_bucket_gates_precede_source_download(self):
        for gate in ("capacity", "private", "lease"):
            self.lease.capacity = gate != "capacity"
            self.archive.private = gate != "private"
            self.lease.current = gate != "lease"
            with self.subTest(gate=gate), self.assertRaises(MediaError):
                self.run_batch()
        self.assertEqual(self.source.reads, 0)
        self.assertEqual(self.archive.objects, {})

    def test_source_change_retains_copies_and_reservations_without_checkpoint(self):
        self.source.change_after_copy = True
        with self.assertRaisesRegex(MediaError, "source_identity_changed_after_copy"):
            self.run_batch()
        self.assertEqual(len(self.archive.objects), 1)
        self.assertEqual(len(self.lease.reservations), 1)
        self.assertEqual(self.archive.checkpoints, [])
        self.assertEqual(self.lease.committed, [])

    def test_corrupt_destination_never_advances_checkpoint(self):
        self.archive.corrupt = True
        with self.assertRaisesRegex(MediaError, "destination_parity_failed"):
            self.run_batch()
        self.assertEqual(self.lease.committed, [])
        self.assertEqual(self.archive.checkpoints, [])

    def test_changed_manifest_rejected_without_source_read(self):
        self.manifest["assets"]["asset-one"]["version"] += 1
        with self.assertRaisesRegex(MediaError, "unapproved_manifest"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)

    def test_unverified_egress_blocks_payload_transfer(self):
        self.lease.egress_available = False
        with self.assertRaisesRegex(MediaError, "egress_headroom_unverified_or_insufficient"):
            self.run_batch()
        self.assertEqual(self.source.reads, 0)
        self.assertEqual(self.archive.objects, {})

    def test_batch_count_is_bounded(self):
        item = self.assets["asset-one"]
        self.assets.clear()
        for index in range(102):
            key = f"asset-{index:04}"
            self.assets[key] = {**item, "asset_id": key}
        self.approved = digest(canonical(self.manifest))
        self.prior["manifest_sha"] = self.approved
        self.assertEqual(self.run_batch().verified_objects, 100)
        self.assertEqual(self.source.reads, 100)


if __name__ == "__main__":
    unittest.main()
