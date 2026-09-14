"""Unreleased private archive coordinator draft; deliberately no CLI entrypoint.

The reviewed migration must supply a durable exclusive lease, private checkpoint
store and source identity reader. Nothing in this module changes application URLs
or deletes source/destination objects. A failed batch retains its staged copies.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Protocol

from stylesnap_media import MediaError, canonical, digest, natural, COPY_BUDGET_BYTES, MAX_ADMIN_UNITS

MAX_BATCH_OBJECTS = 100
MAX_IDENTITY_RESPONSE_BYTES = 65_536
MAX_DERIVED_SCAN_ADMIN_UNITS = 12
# Reserve two complete scans and one detail request per parent on each pass.
MAX_VARIANT_BATCH_OBJECTS = min(MAX_BATCH_OBJECTS, (MAX_ADMIN_UNITS - 2 * MAX_DERIVED_SCAN_ADMIN_UNITS) // 2)
MAX_BATCH_BYTES = 25_000_000
MAX_STANDARD_OBJECT_BYTES = 6_000_000
MAX_PRIVATE_JSON_BYTES = 8_000_000
MAX_METADATA_EGRESS_BYTES = 3 * MAX_PRIVATE_JSON_BYTES + 65_536
PER_OBJECT_CONTROL_EGRESS_BYTES = 65_536
IDENTITY_FIELDS = ("asset_id", "public_id", "resource_type", "type", "format", "version", "bytes", "etag")


class Source(Protocol):
    def identities(self, asset_ids: list[str]) -> dict[str, dict[str, Any]]: ...
    def original(self, url: str, expected_size: int) -> bytes: ...


class PrivateArchive(Protocol):
    def assert_private(self) -> None: ...
    def get_if_exists(self, path: str, maximum: int = MAX_PRIVATE_JSON_BYTES) -> bytes | None: ...
    def insert_only(self, path: str, content: bytes) -> None: ...
    def checkpoint(self, content: bytes) -> str: ...
    def read_checkpoint(self, checksum: str) -> bytes: ...
    def checkpoint_stored_size(self, checksum: str) -> int: ...


class ExclusiveCapacityLease(Protocol):
    """Durable implementation must reject stale owners and reserve atomically.

    Unfinished reservations remain charged after a crash until reconciled against
    actual Storage objects. Capacity includes every organization bucket and all
    pending reservations; no blind timeout releases unaccounted uploads.
    """
    def assert_current(self) -> None: ...
    def current_checkpoint_sha(self) -> str | None: ...
    def reserve(self, operation: str, maximum_bytes: int, ceiling_bytes: int) -> None: ...
    def reserve_egress(self, operation: str, maximum_bytes: int) -> None: ...
    def settle_storage(self, operation: str, object_path: str, observed_bytes: int) -> None: ...
    def commit_checkpoint(self, previous_sha: str | None, checkpoint_sha: str) -> None: ...


@dataclass(frozen=True)
class BatchResult:
    checkpoint_sha: str
    verified_objects: int
    verified_bytes: int
    created_objects: int


def identity(asset: dict[str, Any]) -> dict[str, Any]:
    return {field: asset.get(field) for field in IDENTITY_FIELDS}


def identity_matches_capture(observed: dict[str, Any], captured: dict[str, Any]) -> bool:
    """The list inventory may omit ETag; bind a fresh one without rewriting it.

    Every other captured identity field must still match. The worker compares
    the complete fresh identity before/after transfer, including the fresh ETag.
    """
    if not isinstance(observed, dict) or set(observed) != set(IDENTITY_FIELDS):
        return False
    for field in IDENTITY_FIELDS:
        value = observed[field]
        if field == "etag" and captured.get(field) is None:
            if not isinstance(value, str) or not value or len(value) > 2048:
                return False
        elif type(value) is not type(captured.get(field)) or value != captured.get(field):
            return False
    return True


def identities_match_capture(observed, captured) -> bool:
    return (isinstance(observed, dict) and set(observed) == set(captured)
            and all(identity_matches_capture(observed[key], value) for key, value in captured.items()))


def run_original_batch(manifest: dict[str, Any], approved_manifest_sha: str,
                       prior: dict[str, Any], source: Source, archive: PrivateArchive,
                       lease: ExclusiveCapacityLease) -> BatchResult:
    """Copy at most 100 originals/25 MB, then publish a private verified checkpoint.

    This stage intentionally leaves application references, variants, privacy
    policies, uploads and cutover untouched. Manifest hash and source identities
    are gates, not evidence that an independently changing source is frozen.
    """
    if digest(canonical(manifest)) != approved_manifest_sha or prior.get("manifest_sha") != approved_manifest_sha:
        raise MediaError("unapproved_manifest")
    if manifest.get("target_project") != "nztqjmknblelnzpeatyx":
        raise MediaError("wrong_destination_project")
    if prior.get("phase") != "original_archive" or not isinstance(prior.get("verified"), dict):
        raise MediaError("invalid_checkpoint")
    lease.assert_current()
    # The durable implementation must reject unknown remaining monthly egress.
    # Recovery can read the prior checkpoint, an already-written next
    # checkpoint, and that next checkpoint again for parity.
    lease.reserve_egress(approved_manifest_sha + ":metadata:" + str(prior.get("checkpoint_sha")), MAX_METADATA_EGRESS_BYTES)
    archive.assert_private()
    current_checkpoint = lease.current_checkpoint_sha()
    if current_checkpoint != prior.get("checkpoint_sha"):
        raise MediaError("stale_checkpoint")
    if current_checkpoint is None:
        if prior["verified"]:
            raise MediaError("unverified_initial_checkpoint")
    else:
        raw_checkpoint = archive.read_checkpoint(current_checkpoint)
        if digest(raw_checkpoint) != current_checkpoint:
            raise MediaError("checkpoint_parity_failed")
        try:
            persisted = json.loads(raw_checkpoint)
        except (ValueError, TypeError):
            raise MediaError("invalid_checkpoint") from None
        if canonical(persisted) != canonical({key: value for key, value in prior.items() if key != "checkpoint_sha"}):
            raise MediaError("checkpoint_content_mismatch")
    selected: dict[str, dict[str, Any]] = {}
    selected_bytes = 0
    for asset_id, asset in sorted(manifest["assets"].items()):
        if asset_id in prior["verified"]:
            continue
        size = natural(asset.get("bytes"))
        if size == 0 or size > MAX_STANDARD_OBJECT_BYTES:
            raise MediaError("separate_large_object_review_required")
        if len(selected) >= MAX_BATCH_OBJECTS or selected_bytes + size > MAX_BATCH_BYTES:
            break
        selected[asset_id] = asset
        selected_bytes += size
    if not selected:
        raise MediaError("no_pending_originals")
    expected = {key: identity(asset) for key, asset in selected.items()}
    observed_before = source.identities(list(selected))
    if not identities_match_capture(observed_before, expected):
        raise MediaError("source_identity_changed_before_copy")

    verified = dict(prior["verified"])
    created = 0
    for asset_id, asset in selected.items():
        lease.assert_current()
        lease.reserve(approved_manifest_sha + ":original:" + asset_id, asset["bytes"], COPY_BUDGET_BYTES)
        lease.reserve_egress(approved_manifest_sha + ":original:" + asset_id,
                             2 * asset["bytes"] + PER_OBJECT_CONTROL_EGRESS_BYTES)
        content = source.original(asset["secure_url"], asset["bytes"])
        if len(content) != asset["bytes"]:
            raise MediaError("source_size_mismatch")
        checksum = digest(content)
        path = "sha256/" + checksum[:2] + "/" + checksum
        observed = archive.get_if_exists(path, maximum=asset["bytes"])
        if observed is None:
            lease.assert_current()
            archive.insert_only(path, content)
            observed = archive.get_if_exists(path, maximum=asset["bytes"])
            created += 1
        if observed is None or digest(observed) != checksum or len(observed) != asset["bytes"]:
            raise MediaError("destination_parity_failed")
        lease.settle_storage(approved_manifest_sha + ":original:" + asset_id, path, len(observed))
        verified[asset_id] = {"identity": expected[asset_id], "sha256": checksum,
                              "bytes": len(content), "path": path,
                              "observed_identity_sha256": digest(canonical(observed_before[asset_id]))}

    lease.assert_current()
    if source.identities(list(selected)) != observed_before:
        raise MediaError("source_identity_changed_after_copy")
    checkpoint = {"schema_version": 1, "phase": "original_archive", "manifest_sha": approved_manifest_sha,
                  "parent_checkpoint_sha": prior.get("checkpoint_sha"), "verified": verified,
                  "application_cutover": False}
    raw = canonical(checkpoint)
    lease.reserve(digest(raw) + ":checkpoint", len(raw) + 4096, COPY_BUDGET_BYTES)
    checkpoint_sha = archive.checkpoint(raw)
    if checkpoint_sha != digest(raw):
        raise MediaError("checkpoint_parity_failed")
    lease.settle_storage(digest(raw) + ":checkpoint", "checkpoints/" + checkpoint_sha + ".json.gz",
                         archive.checkpoint_stored_size(checkpoint_sha))
    lease.assert_current()
    lease.commit_checkpoint(prior.get("checkpoint_sha"), checkpoint_sha)
    return BatchResult(checkpoint_sha, len(selected), selected_bytes, created)
