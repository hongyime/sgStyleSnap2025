"""Pure reservation planning and gated private manifest bootstrap; no CLI."""
from __future__ import annotations

from typing import Any

from stylesnap_media import (MediaError, PROJECT_REF, COPY_BUDGET_BYTES, REFERENCE_COLUMNS, MAX_JSON_BYTES,
                            canonical, digest, natural, validate_media_url, map_references)
from stylesnap_copy import (identity, MAX_BATCH_OBJECTS, MAX_BATCH_BYTES, MAX_STANDARD_OBJECT_BYTES,
                            MAX_PRIVATE_JSON_BYTES, MAX_METADATA_EGRESS_BYTES, PER_OBJECT_CONTROL_EGRESS_BYTES,
                            MAX_IDENTITY_RESPONSE_BYTES, MAX_DERIVED_SCAN_ADMIN_UNITS, MAX_VARIANT_BATCH_OBJECTS)
from stylesnap_private_json import encode_private_json
from stylesnap_variants import variant_bindings


KNOWN_MISSING_DEFAULTS = {
    "image_url": "https://res.cloudinary.com/sgstylesnap/image/upload/f_webp,q_auto:good/v1/defaults/default-clothing-item.webp",
    "thumbnail_url": "https://res.cloudinary.com/sgstylesnap/image/upload/f_webp,q_auto:good,w_400,h_400,c_fill/v1/defaults/default-clothing-item.webp",
}


def reviewed_missing_defaults(manifest_sha: str, refs: list[dict[str, Any]],
                              evidence: dict[str, Any] | None) -> dict[str, Any] | None:
    """Recheck exact raw membership; a review applies only to its manifest hash.

    This accounts for already absent source defaults, never replacement media.
    It does not relabel the retained mappings as matched or modify raw rows.
    """
    if evidence is None:
        return None
    expected = {"manifest_sha256": manifest_sha, "unresolved_count": 2,
        "unresolved_all_exact_known_legacy_defaults": True, "each_known_default_present_once": True,
        "unresolved_references_preserved_in_raw_rows": True, "unresolved_unique_records": 1}
    if not isinstance(evidence, dict) or any(type(evidence.get(key)) is not type(value) or evidence.get(key) != value
                                          for key, value in expected.items()):
        raise MediaError("missing_default_review_mismatch")
    unresolved = [item for item in refs if item.get("status") != "matched"]
    if (len(unresolved) != 2 or {item.get("column") for item in unresolved} != set(KNOWN_MISSING_DEFAULTS)
            or len({(item.get("table"), item.get("row_id")) for item in unresolved}) != 1
            or any(item.get("table") != "clothes" or item.get("status") != "unresolved_asset"
                   or item.get("source_url") != KNOWN_MISSING_DEFAULTS.get(item.get("column")) for item in unresolved)):
        raise MediaError("missing_default_membership_mismatch")
    return expected


def build_reservation_plan(manifest: dict[str, Any], *, missing_default_evidence=None) -> dict[str, Any]:
    """Count every extant original/variant plus full raw provenance and checkpoints.

    Missing/historical/unmaterialized references never acquire a guessed size.
    Only exact, hash-reviewed absent defaults can be accounted for separately.
    All other gaps keep the complete-plan gate closed. This function performs no
    downloads or dynamic transformations and does not prove snapshot consistency.
    """
    if not isinstance(manifest, dict) or manifest.get("target_project") != PROJECT_REF:
        raise MediaError("wrong_destination_project")
    raw = canonical(manifest)
    _, manifest_encoding = encode_private_json("manifests", raw)
    manifest_sha = manifest_encoding["raw_sha256"]
    bindings = variant_bindings(manifest)
    entries = []
    urls = set()
    reservations = []
    counts = {}; sizes = {}
    for category, key in (("original", "assets"), ("variant", "derived")):
        objects = manifest.get(key)
        if not isinstance(objects, dict) or len(objects) > 20_000:
            raise MediaError("invalid_plan_inventory")
        total = 0
        for item_id, value in sorted(objects.items()):
            if not isinstance(item_id, str) or not item_id or not isinstance(value, dict):
                raise MediaError("invalid_plan_inventory")
            size = natural(value.get("bytes"))
            if not 0 < size <= MAX_STANDARD_OBJECT_BYTES:
                raise MediaError("separate_large_object_review_required")
            url = value.get("secure_url")
            validate_media_url(url, manifest.get("source_cloud"))
            urls.add(url)
            total += size
            operation = manifest_sha + ":" + category + ":" + item_id
            reservations.append({"operation_sha": digest(operation.encode()), "maximum_bytes": size})
            provenance = identity(value) if category == "original" else bindings[item_id]
            entries.append((category, item_id, size, {"identity": provenance,
                "sha256": "f" * 64, "bytes": size, "path": "sha256/ff/" + "f" * 64,
                "observed_identity_sha256": "f" * 64}))
        counts[category] = len(objects); sizes[category] = total
    refs = manifest.get("reference_mapping")
    if not isinstance(refs, list) or any(not isinstance(item, dict) for item in refs):
        raise MediaError("invalid_plan_references")
    raw_references = manifest.get("database_references")
    if not isinstance(raw_references, dict) or set(raw_references) != set(REFERENCE_COLUMNS):
        raise MediaError("incomplete_raw_reference_inventory")
    for table, rows in raw_references.items():
        if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str)
                or not set(REFERENCE_COLUMNS[table]).issubset(row) for row in rows):
            raise MediaError("invalid_raw_reference_inventory")
        ids = [row["id"] for row in rows]
        if len(ids) != len(set(ids)):
            raise MediaError("duplicate_raw_reference_identity")
    if canonical(refs) != canonical(map_references(manifest)):
        raise MediaError("raw_reference_mapping_mismatch")
    unresolved = sum(item.get("status") != "matched" for item in refs)
    missing_review = reviewed_missing_defaults(manifest_sha, refs, missing_default_evidence)
    known_missing = 2 if missing_review is not None else 0
    unmaterialized = len({item.get("source_url") for item in refs
        if item.get("status") == "matched" and item.get("source_url") not in urls})
    if not isinstance(manifest.get("backups"), dict) or not isinstance(manifest.get("versions"), dict):
        raise MediaError("invalid_plan_versions")
    versions_unplanned = bool(manifest["backups"] or manifest["versions"])
    usage = manifest.get("usage")
    if not isinstance(usage, dict) or natural(usage.get("resources")) != counts["original"] or natural(usage.get("derived_resources")) != counts["variant"]:
        raise MediaError("provider_count_parity_failed")
    if not isinstance(usage.get("storage"), dict):
        raise MediaError("provider_storage_usage_missing")
    provider_storage_bytes = natural(usage["storage"].get("usage"))
    provider_byte_parity = provider_storage_bytes == sum(sizes.values())
    # Retain the complete canonical source manifest, including DB references,
    # source URLs and provider metadata, as private provenance without filtering.
    manifest_storage_bytes = manifest_encoding["compressed_bytes"]
    reservations.append({"operation_sha": digest((manifest_sha + ":manifest").encode()),
                         "maximum_bytes": manifest_storage_bytes})
    checkpoint_pool = 0; checkpoint_count = 0; verified = {}; verified_variants = {}; batch_bytes = 0; batch_count = 0
    def checkpoint_bound():
        candidate = {"schema_version": 1, "phase": "variant_archive" if verified_variants else "original_archive", "manifest_sha": manifest_sha,
            "parent_checkpoint_sha": "f" * 64, "verified": verified, "application_cutover": False}
        if verified_variants:
            candidate["verified_variants"] = verified_variants
        length = len(canonical(candidate))
        if length > MAX_PRIVATE_JSON_BYTES:
            raise MediaError("checkpoint_sharding_review_required")
        # zlib/gzip worst-case growth is below this margin for <=8 MB payloads.
        return length + 4096
    previous_category = None
    batch_parents = set()
    variant_parent_checks = 0
    variant_scan_units = 0
    def finish_batch():
        nonlocal checkpoint_pool, checkpoint_count, variant_parent_checks, variant_scan_units
        checkpoint_pool += checkpoint_bound()
        checkpoint_count += 1
        if previous_category == "variant":
            variant_parent_checks += 2 * len(batch_parents)
            variant_scan_units += 2 * MAX_DERIVED_SCAN_ADMIN_UNITS
    for category, key, size, entry in entries:
        limit = MAX_VARIANT_BATCH_OBJECTS if category == "variant" else MAX_BATCH_OBJECTS
        if batch_count and (batch_count >= limit or batch_bytes + size > MAX_BATCH_BYTES or category != previous_category):
            finish_batch()
            batch_bytes = 0; batch_count = 0
            batch_parents.clear()
        (verified if category == "original" else verified_variants)[key] = entry
        if category == "variant":
            batch_parents.add(entry["identity"]["original"]["asset_id"])
        batch_bytes += size; batch_count += 1; previous_category = category
    if batch_count:
        finish_batch()
    total = sum(item["maximum_bytes"] for item in reservations) + checkpoint_pool
    complete = not (unresolved - known_missing or unmaterialized or versions_unplanned) and provider_byte_parity and total <= COPY_BUDGET_BYTES
    return {"schema_version": 1, "manifest_sha": manifest_sha, "target_project": PROJECT_REF,
        "reservation_complete": complete, "copy_eligible": False, "snapshot_consistency_proven": False,
        "object_counts": counts, "payload_bytes": sizes, "manifest_provenance_bytes": manifest_storage_bytes,
        "manifest_encoding": manifest_encoding,
        "checkpoint_count_budget": checkpoint_count, "checkpoint_pool_bytes": checkpoint_pool,
        "total_storage_reservation_bytes": total, "reservations": reservations,
        "unresolved_reference_count": unresolved, "unmaterialized_reference_url_count": unmaterialized,
        "known_missing_default_reference_count": known_missing, "unhandled_reference_count": unresolved - known_missing,
        "all_references_matched": unresolved == 0, "missing_default_review": missing_review,
        "retained_versions_unplanned": versions_unplanned,
        "provider_storage_bytes": provider_storage_bytes, "provider_byte_parity": provider_byte_parity,
        "original_identity_admin_units": 2 * counts["original"],
        "variant_identity_admin_units_upper": variant_parent_checks + variant_scan_units,
        "source_admin_units_before_retries_upper": 2 * counts["original"] + variant_parent_checks + variant_scan_units,
        "source_metadata_response_bytes_upper": (2 * counts["original"] + variant_parent_checks) * MAX_IDENTITY_RESPONSE_BYTES
            + variant_scan_units * MAX_JSON_BYTES,
        "source_admin_headroom_verified": False,
        "transfer_reservation_upper_bytes": 2 * sum(sizes.values()) + len(entries) * PER_OBJECT_CONTROL_EGRESS_BYTES
            + checkpoint_count * MAX_METADATA_EGRESS_BYTES + 2 * manifest_storage_bytes + 65_536,
        "manifest_bootstrap_egress_reservation_bytes": 2 * manifest_storage_bytes + 65_536,
        "monthly_egress_verified": False}


def bootstrap_private_manifest(manifest, plan, approved_manifest_sha, approved_plan_sha,
                               archive, lease, *, source_parity_verified=False):
    """Reserve all planned bytes atomically before retaining private provenance.

    A coordinator must independently establish current source parity and approve
    these exact hashes. The durable lease still blocks unknown monthly egress.
    No source media is downloaded and no application reference is changed.
    """
    raw = canonical(manifest)
    if digest(raw) != approved_manifest_sha or digest(canonical(plan)) != approved_plan_sha:
        raise MediaError("unapproved_bootstrap")
    if canonical(plan) != canonical(build_reservation_plan(manifest, missing_default_evidence=plan.get("missing_default_review"))):
        raise MediaError("reservation_plan_mismatch")
    if not plan["reservation_complete"] or source_parity_verified is not True:
        raise MediaError("source_parity_or_plan_unproven")
    lease.assert_current()
    lease.reserve_plan(plan)
    lease.reserve_egress(approved_manifest_sha + ":bootstrap", plan["manifest_bootstrap_egress_reservation_bytes"])
    archive.assert_private()
    checksum = archive.write_private_json("manifests", raw, plan["manifest_encoding"])
    if checksum != approved_manifest_sha:
        raise MediaError("manifest_parity_failed")
    observed = archive.private_json_descriptor("manifests", checksum)
    if canonical(observed) != canonical(plan["manifest_encoding"]):
        raise MediaError("manifest_compressed_parity_failed")
    lease.settle_storage(approved_manifest_sha + ":manifest", "manifests/" + checksum + ".json.gz",
                         observed["compressed_bytes"])
    return {"manifest_sha": checksum, "manifest_encoding": observed, "manifest_verified": True,
            "all_references_matched": plan["all_references_matched"],
            "known_missing_default_reference_count": plan["known_missing_default_reference_count"],
            "application_cutover": False}
