"""Unreleased fixed-origin source/Storage adapters. No CLI or workflow entrypoint."""
from __future__ import annotations

import re
import uuid
from typing import Any

from stylesnap_copy import (identity, IDENTITY_FIELDS, MAX_BATCH_OBJECTS, MAX_STANDARD_OBJECT_BYTES, MAX_PRIVATE_JSON_BYTES,
                           MAX_IDENTITY_RESPONSE_BYTES, MAX_DERIVED_SCAN_ADMIN_UNITS, MAX_VARIANT_BATCH_OBJECTS)
from stylesnap_media import MediaError, Reader, SUPABASE_URL, canonical, digest, decode_json, natural
from stylesnap_private_json import encode_private_json, decode_private_json, validate_descriptor
from stylesnap_variants import variant_bindings

BUCKET = "stylesnap-media-archive"
MAX_STORAGE_REQUESTS = 310
MAX_CONTROL_REQUESTS = 600


class OriginalSource:
    """Two bounded detail reads per asset, within the Reader's shared allowance."""
    def __init__(self, reader: Reader):
        self.reader = reader
        self.lookup_calls = 0
        self.admin_requests = 0
        self.source_bytes = 0
        self.failed = False
        self.batch_ids = None

    def identities(self, asset_ids: list[str]) -> dict[str, dict[str, Any]]:
        if self.failed:
            raise MediaError("source_attempt_failed")
        if not isinstance(asset_ids, list) or not 0 < len(asset_ids) <= MAX_BATCH_OBJECTS:
            raise MediaError("identity_batch_limit")
        if any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{32}", value) for value in asset_ids):
            raise MediaError("invalid_asset_identity")
        if len(set(asset_ids)) != len(asset_ids):
            raise MediaError("identity_batch_limit")
        if self.lookup_calls >= 2:
            raise MediaError("identity_lookup_budget_reached")
        ids = tuple(sorted(asset_ids))
        if self.batch_ids is not None and self.batch_ids != ids:
            raise MediaError("identity_batch_changed")
        # Check that the complete pair fits before the first metadata request.
        # A consumed Reader allowance is never reset for another batch/retry.
        needed = (2 - self.lookup_calls) * len(asset_ids)
        if self.reader.admin_units + needed > self.reader.admin_unit_limit:
            raise MediaError("identity_lookup_budget_reached")
        self.batch_ids = ids
        self.lookup_calls += 1
        values = {}
        try:
            for asset_id in asset_ids:
                self.admin_requests += 1
                asset = self.reader.admin("resources/" + asset_id, {"image_metadata": "true", "max_results": 1},
                                          maximum=MAX_IDENTITY_RESPONSE_BYTES)
                # Derived pagination does not affect this single original's
                # identity. Variant inventories are verified independently.
                if not isinstance(asset, dict) or "error" in asset or asset.get("asset_id") != asset_id:
                    raise MediaError("identity_inventory_incomplete")
                for field in IDENTITY_FIELDS:
                    value = asset.get(field)
                    if field in ("bytes", "version"):
                        natural(value)
                    elif not isinstance(value, str) or not value or len(value) > 2048:
                        raise MediaError("invalid_asset_identity")
                values[asset_id] = identity(asset)
        except Exception:
            self.failed = True
            raise
        return values

    def original(self, url: str, expected_size: int) -> bytes:
        if self.failed:
            raise MediaError("source_attempt_failed")
        if not 0 < natural(expected_size) <= MAX_STANDARD_OBJECT_BYTES:
            raise MediaError("separate_large_object_review_required")
        if self.reader.source_requests >= MAX_BATCH_OBJECTS:
            raise MediaError("source_request_budget_reached")
        try:
            content = self.reader.original(url, expected_size)
        except Exception:
            self.failed = True
            raise
        self.source_bytes += len(content)
        return content


class VariantSource(OriginalSource):
    """Two bounded derived inventories plus parent identity checks per batch."""
    def __init__(self, reader: Reader, manifest):
        super().__init__(reader)
        if reader.cloud != manifest.get("source_cloud"):
            raise MediaError("wrong_source_cloud")
        self.bindings = variant_bindings(manifest)
        self.variant_lookup_calls = 0
        self.variant_batch_ids = None

    def variant_identities(self, variant_ids):
        if self.failed:
            raise MediaError("source_attempt_failed")
        if (not isinstance(variant_ids, list) or not 0 < len(variant_ids) <= MAX_VARIANT_BATCH_OBJECTS
                or any(not isinstance(key, str) or key not in self.bindings for key in variant_ids)
                or len(set(variant_ids)) != len(variant_ids)):
            raise MediaError("invalid_variant_identity_batch")
        if self.variant_lookup_calls >= 2:
            raise MediaError("variant_lookup_budget_reached")
        ids = tuple(sorted(variant_ids))
        if self.variant_batch_ids is not None and self.variant_batch_ids != ids:
            raise MediaError("variant_identity_batch_changed")
        parent_ids = sorted({self.bindings[key]["original"]["asset_id"] for key in variant_ids})
        needed = (2 - self.variant_lookup_calls) * (MAX_DERIVED_SCAN_ADMIN_UNITS + len(parent_ids))
        if self.reader.admin_units + needed > self.reader.admin_unit_limit:
            raise MediaError("variant_lookup_budget_reached")
        self.variant_batch_ids = ids
        self.variant_lookup_calls += 1
        from stylesnap_media import derived_inventory
        # Includes first-page extensionless fallback attempts. The original
        # Reader allowance remains an independent ceiling and is not replenished.
        prior_limit = self.reader.admin_unit_limit
        self.reader.admin_unit_limit = min(prior_limit, self.reader.admin_units + MAX_DERIVED_SCAN_ADMIN_UNITS)
        self.reader.progress = {"transformations": 0, "derived_assets": 0, "extensionless_detail_lookups": 0}
        try:
            _, current = derived_inventory(self.reader)
        except Exception:
            self.failed = True
            raise
        finally:
            self.reader.admin_unit_limit = prior_limit
        if any(key not in current for key in variant_ids):
            self.failed = True
            raise MediaError("variant_inventory_incomplete")
        try:
            parents = self.identities(parent_ids)
            observed = variant_bindings({"assets": parents, "derived": {key: current[key] for key in variant_ids},
                                         "source_cloud": self.reader.cloud})
        except Exception:
            self.failed = True
            raise
        return observed


class PrivateStorage:
    """Existing private bucket only; insert-only objects, bounded authenticated GETs."""
    def __init__(self, reader: Reader):
        self.reader = reader
        self.downloaded_bytes = 0
        self.uploaded_bytes = 0
        self.attempted_upload_bytes = 0
        self.failed_requests = 0
        self.requests = 0
        self.private_verified = False
        self._checkpoint_sizes: dict[str, int] = {}
        self._private_json_descriptors: dict[tuple[str, str], dict[str, Any]] = {}

    def request(self, suffix: str, method: str = "GET", body: bytes | None = None,
                maximum: int = MAX_PRIVATE_JSON_BYTES, content_type: str = "application/octet-stream") -> bytes:
        if self.requests >= MAX_STORAGE_REQUESTS:
            raise MediaError("storage_request_budget_reached")
        if not isinstance(suffix, str) or not (
                (method == "GET" and suffix == "bucket/" + BUCKET) or
                (method == "GET" and suffix.startswith("object/authenticated/" + BUCKET + "/")) or
                (method == "POST" and suffix.startswith("object/" + BUCKET + "/"))):
            raise MediaError("invalid_storage_request")
        if suffix != "bucket/" + BUCKET:
            self.validate_path(suffix.split(BUCKET + "/", 1)[1])
        if type(maximum) is not int or not 0 < maximum <= MAX_PRIVATE_JSON_BYTES:
            raise MediaError("invalid_storage_request")
        self.requests += 1
        if body is not None:
            self.attempted_upload_bytes += len(body)
        headers = {"Authorization": "Bearer " + self.reader.supabase_key,
                   "apikey": self.reader.supabase_key, "Content-Type": content_type,
                   "Cache-Control": "private, max-age=0", "x-upsert": "false"}
        try:
            response = self.reader.request(SUPABASE_URL + "/storage/v1/" + suffix, headers,
                                           maximum=maximum, method=method, data=body)
        except MediaError:
            self.failed_requests += 1
            raise  # Ambiguous writes are never retried or counted as absent.
        self.downloaded_bytes += len(response)
        if body is not None:
            self.uploaded_bytes += len(body)
        return response

    def assert_private(self) -> None:
        self.private_verified = False
        bucket = decode_json(self.request("bucket/" + BUCKET, maximum=8192))
        if not isinstance(bucket, dict) or bucket.get("id") != BUCKET or bucket.get("public") is not False:
            raise MediaError("archive_not_private")
        self.private_verified = True

    @staticmethod
    def validate_path(path: str) -> None:
        if not isinstance(path, str) or not re.fullmatch(r"(?:sha256/[0-9a-f]{2}/[0-9a-f]{64}|(?:checkpoints|manifests)/[0-9a-f]{64}\.json\.gz)", path):
            raise MediaError("invalid_archive_path")

    def get_if_exists(self, path: str, maximum: int = MAX_PRIVATE_JSON_BYTES) -> bytes | None:
        self.validate_path(path)
        if not self.private_verified:
            raise MediaError("archive_privacy_not_verified")
        try:
            return self.request("object/authenticated/" + BUCKET + "/" + path,
                                maximum=maximum)
        except MediaError as exc:
            if exc.code == "storage_object_missing":
                return None
            raise

    def insert_only(self, path: str, content: bytes) -> None:
        self.validate_path(path)
        if not self.private_verified or not 0 < len(content) <= MAX_PRIVATE_JSON_BYTES:
            raise MediaError("invalid_archive_upload")
        self.request("object/" + BUCKET + "/" + path, method="POST", body=content, maximum=8192)

    def checkpoint(self, content: bytes) -> str:
        return self.write_private_json("checkpoints", content)

    def write_private_json(self, namespace: str, content: bytes, expected_descriptor=None) -> str:
        compressed, descriptor = encode_private_json(namespace, content)
        if namespace == "manifests" and expected_descriptor is None:
            raise MediaError("manifest_descriptor_required")
        if expected_descriptor is not None and canonical(descriptor) != canonical(expected_descriptor):
            raise MediaError("private_json_descriptor_mismatch")
        checksum = descriptor["raw_sha256"]
        path = namespace + "/" + checksum + ".json.gz"
        if self.get_if_exists(path, maximum=descriptor["compressed_bytes"]) is None:
            self.insert_only(path, compressed)
        if self.read_private_json(namespace, checksum, descriptor) != content:
            raise MediaError("checkpoint_parity_failed")
        return checksum

    def read_checkpoint(self, checksum: str) -> bytes:
        return self.read_private_json("checkpoints", checksum)

    def read_private_json(self, namespace: str, checksum: str, descriptor=None) -> bytes:
        if (namespace not in ("checkpoints", "manifests") or not isinstance(checksum, str)
                or not re.fullmatch(r"[0-9a-f]{64}", checksum)):
            raise MediaError("invalid_private_json")
        self._private_json_descriptors.pop((namespace, checksum), None)
        self._checkpoint_sizes.pop(checksum, None)
        if namespace == "manifests" and descriptor is None:
            raise MediaError("manifest_descriptor_required")
        if descriptor is not None:
            validate_descriptor(namespace, descriptor)
        maximum = descriptor["compressed_bytes"] if descriptor is not None else MAX_PRIVATE_JSON_BYTES
        value = self.get_if_exists(namespace + "/" + checksum + ".json.gz", maximum=maximum)
        if value is None:
            raise MediaError("checkpoint_missing")
        decoded, observed = decode_private_json(namespace, value, checksum, descriptor)
        self._checkpoint_sizes[checksum] = len(value)
        self._private_json_descriptors[(namespace, checksum)] = observed
        return decoded

    def private_json_descriptor(self, namespace, checksum):
        if (namespace, checksum) not in self._private_json_descriptors:
            raise MediaError("private_json_parity_not_verified")
        return dict(self._private_json_descriptors[(namespace, checksum)])

    def checkpoint_stored_size(self, checksum: str) -> int:
        if checksum not in self._checkpoint_sizes:
            raise MediaError("checkpoint_parity_not_verified")
        return self._checkpoint_sizes[checksum]


class DurableLease:
    """Service-only RPC, fixed project/function, bounded response and no retries.

    SQL keeps writes disabled until fresh organization/database/storage and
    monthly egress headroom is supplied. An instance represents one transfer
    attempt; new attempts get new egress reservation IDs, including retries.
    """
    def __init__(self, reader: Reader, manifest_sha: str):
        if not isinstance(manifest_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", manifest_sha):
            raise MediaError("invalid_manifest_identity")
        self.reader = reader
        self.manifest_sha = manifest_sha
        self.owner = str(uuid.uuid4())
        self._egress_sequence = 0
        self._checkpoint_sha: str | None = None
        self.requests = 0

    def call(self, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if action not in ("claim", "check", "reserve_storage", "reserve_egress", "reserve_plan", "settle_storage", "commit_checkpoint"):
            raise MediaError("invalid_control_action")
        if self.requests >= MAX_CONTROL_REQUESTS:
            raise MediaError("control_request_budget_reached")
        if payload and any(key in payload for key in ("owner", "manifest_sha")):
            raise MediaError("invalid_control_payload")
        parameters = {"owner": self.owner, "manifest_sha": self.manifest_sha, **(payload or {})}
        body = canonical({"action": action, "payload": parameters})
        if len(body) > MAX_PRIVATE_JSON_BYTES:
            raise MediaError("control_request_size_limit")
        self.requests += 1
        raw = self.reader.request(SUPABASE_URL + "/rest/v1/rpc/stylesnap_archive_control",
              {"Authorization": "Bearer " + self.reader.supabase_key, "apikey": self.reader.supabase_key,
               "Content-Type": "application/json"}, maximum=8192, method="POST", data=body)
        value = decode_json(raw)
        if not isinstance(value, dict):
            raise MediaError("invalid_control_response")
        if action in ("claim", "check", "commit_checkpoint"):
            if (set(value) != {"checkpoint_sha"} or
                    (value["checkpoint_sha"] is not None and (not isinstance(value["checkpoint_sha"], str)
                     or not re.fullmatch(r"[0-9a-f]{64}", value["checkpoint_sha"])))):
                raise MediaError("invalid_control_response")
        else:
            flag = "settled" if action == "settle_storage" else "reserved"
            if value != {flag: True} or type(value.get(flag)) is not bool:
                raise MediaError("invalid_control_response")
        return value

    def claim(self) -> None:
        value = self.call("claim")
        self._checkpoint_sha = value.get("checkpoint_sha")

    def assert_current(self) -> None:
        value = self.call("check")
        self._checkpoint_sha = value.get("checkpoint_sha")

    def current_checkpoint_sha(self) -> str | None:
        return self._checkpoint_sha

    def reserve(self, operation: str, maximum_bytes: int, ceiling_bytes: int) -> None:
        if ceiling_bytes != 800_000_000:
            raise MediaError("unexpected_storage_ceiling")
        if not isinstance(operation, str) or not operation or not 0 <= natural(maximum_bytes) <= 25_000_000:
            raise MediaError("invalid_reservation")
        self.call("reserve_storage", {"operation_sha": digest(operation.encode()), "maximum_bytes": maximum_bytes,
                  "checkpoint_allocation": operation.endswith(":checkpoint")})

    def reserve_egress(self, operation: str, maximum_bytes: int) -> None:
        if not isinstance(operation, str) or not operation or not 0 <= natural(maximum_bytes) <= 25_000_000:
            raise MediaError("invalid_reservation")
        self._egress_sequence += 1
        attempt = self.owner + ":" + str(self._egress_sequence) + ":" + operation
        self.call("reserve_egress", {"operation_sha": digest(attempt.encode()), "maximum_bytes": maximum_bytes})

    def reserve_plan(self, plan: dict[str, Any]) -> None:
        if plan.get("manifest_sha") != self.manifest_sha or plan.get("reservation_complete") is not True:
            raise MediaError("incomplete_reservation_plan")
        self.call("reserve_plan", {"plan_sha": digest(canonical(plan)),
            "reservations": plan["reservations"], "checkpoint_pool_bytes": plan["checkpoint_pool_bytes"]})

    def settle_storage(self, operation: str, object_path: str, observed_bytes: int) -> None:
        self.call("settle_storage", {"operation_sha": digest(operation.encode()),
                  "object_path": object_path, "observed_bytes": observed_bytes})

    def commit_checkpoint(self, previous_sha: str | None, checkpoint_sha: str) -> None:
        value = self.call("commit_checkpoint", {"previous_sha": previous_sha, "checkpoint_sha": checkpoint_sha})
        if value.get("checkpoint_sha") != checkpoint_sha:
            raise MediaError("checkpoint_commit_failed")
        self._checkpoint_sha = checkpoint_sha
