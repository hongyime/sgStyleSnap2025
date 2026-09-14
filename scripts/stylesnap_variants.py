"""Private, bounded variant staging; no application URL changes or CLI entrypoint."""
from __future__ import annotations

import json
import re
from typing import Any

from stylesnap_media import MediaError, PROJECT_REF, canonical, digest, natural, validate_media_url
from stylesnap_copy import (BatchResult, identity, identity_matches_capture, IDENTITY_FIELDS, COPY_BUDGET_BYTES, MAX_BATCH_OBJECTS,
                           MAX_BATCH_BYTES, MAX_VARIANT_BATCH_OBJECTS, MAX_STANDARD_OBJECT_BYTES, MAX_PRIVATE_JSON_BYTES,
                           MAX_METADATA_EGRESS_BYTES, PER_OBJECT_CONTROL_EGRESS_BYTES)


def variant_bindings(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Bind every captured variant to its exact original identity, retaining provenance."""
    originals = manifest.get("assets")
    variants = manifest.get("derived")
    if not isinstance(originals, dict) or not isinstance(variants, dict):
        raise MediaError("invalid_variant_inventory")
    if len(originals) > 20_000 or len(variants) > 20_000:
        raise MediaError("variant_inventory_budget_reached")
    parents = {}
    for asset_id, asset in originals.items():
        if not isinstance(asset, dict) or asset.get("asset_id") != asset_id:
            raise MediaError("invalid_variant_parent")
        for field in IDENTITY_FIELDS:
            value = asset.get(field)
            if field == "etag" and value is None:
                continue  # Retain the omission; a fresh before/after identity is required during transfer.
            if field in ("bytes", "version"):
                natural(value)
            elif not isinstance(value, str) or not value or len(value) > 2048:
                raise MediaError("invalid_variant_parent")
        key = tuple(asset.get(k) for k in ("resource_type", "type", "public_id"))
        if any(not isinstance(k, str) or not k for k in key) or key in parents:
            raise MediaError("ambiguous_variant_parent")
        parents[key] = asset
    result = {}
    for variant_id, variant in variants.items():
        if not isinstance(variant_id, str) or not variant_id or not isinstance(variant, dict) or variant.get("id") != variant_id:
            raise MediaError("invalid_variant_identity")
        key = tuple(variant.get(k) for k in ("resource_type", "type", "public_id"))
        if any(not isinstance(k, str) or not k for k in key):
            raise MediaError("invalid_variant_identity")
        parent = parents.get(key)
        if parent is None:
            raise MediaError("variant_parent_missing")
        if not 0 < natural(variant.get("bytes")) <= MAX_STANDARD_OBJECT_BYTES:
            raise MediaError("separate_large_object_review_required")
        if not isinstance(variant.get("format"), str) or not variant["format"]:
            raise MediaError("invalid_variant_identity")
        parts = validate_media_url(variant.get("secure_url"), manifest.get("source_cloud"))
        suffixes = {variant["public_id"] + "." + extension for extension in (variant["format"], parent.get("format", ""))}
        starts = [i for i in range(2, len(parts)) if "/".join(parts[i:]) in suffixes]
        if parts[:2] != [variant["resource_type"], variant["type"]] or not starts:
            raise MediaError("variant_source_path_mismatch")
        versions = [int(p[1:]) for p in parts[2:min(starts)] if re.fullmatch(r"v[0-9]+", p)]
        if any(version != natural(parent.get("version")) for version in versions):
            raise MediaError("variant_source_version_mismatch")
        result[variant_id] = {"variant": dict(variant), "original": identity(parent)}
    return result


def _recipe(parts):
    steps = [p for p in parts if not re.fullmatch(r"v[0-9]+", p)]
    if len(steps) != 1:
        return None
    terms = tuple(sorted(steps[0].split(",")))
    known = (("f_webp", "q_auto:good"), ("c_fill", "f_webp", "h_400", "q_auto:good", "w_400"))
    return terms if terms in known else None


def delivery_candidates(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Return candidates only; neither equivalent recipe order nor identity proves bytes."""
    bindings = variant_bindings(manifest)
    by_recipe = {}
    for variant_id, binding in bindings.items():
        variant, parent = binding["variant"], binding["original"]
        parts = validate_media_url(variant["secure_url"], manifest["source_cloud"])
        suffixes = {variant["public_id"] + "." + extension for extension in (variant["format"], parent["format"])}
        start = min(i for i in range(2, len(parts)) if "/".join(parts[i:]) in suffixes)
        recipe = _recipe(parts[2:start])
        if recipe:
            by_recipe.setdefault((parent["asset_id"], recipe), []).append(variant_id)
    # Recompute mappings from retained rows; never trust a caller-supplied status.
    from stylesnap_media import map_references
    references = map_references(manifest)
    if canonical(references) != canonical(manifest.get("reference_mapping")):
        raise MediaError("raw_reference_mapping_mismatch")
    stored = {v.get("secure_url") for v in manifest["assets"].values()} | {
        v.get("secure_url") for v in manifest["derived"].values()}
    result = {}
    for ref in references:
        if ref.get("status") != "matched" or ref["source_url"] in stored:
            continue
        recipe = _recipe(ref["delivery_prefix"])
        matches = by_recipe.get((ref["asset_id"], recipe), []) if recipe else []
        result[ref["source_url"]] = {"asset_id": ref["asset_id"], "variant_ids": sorted(matches),
                                   "content_parity_proven": False}
    return result


def _record_matches(record, expected_identity, expected_size):
    if (not isinstance(record, dict) or record.get("identity") != expected_identity
            or type(record.get("bytes")) is not int or record["bytes"] != expected_size):
        return False
    checksum = record.get("sha256")
    observed = record.get("observed_identity_sha256")
    return (isinstance(checksum, str) and re.fullmatch(r"[0-9a-f]{64}", checksum) is not None
            and isinstance(observed, str) and re.fullmatch(r"[0-9a-f]{64}", observed) is not None
            and record.get("path") == "sha256/" + checksum[:2] + "/" + checksum)


def _bindings_match_capture(observed, captured):
    return (isinstance(observed, dict) and set(observed) == set(captured)
            and all(isinstance(observed[key], dict) and set(observed[key]) == {"variant", "original"}
                    and observed[key]["variant"] == value["variant"]
                    and identity_matches_capture(observed[key]["original"], value["original"])
                    for key, value in captured.items()))


def run_variant_batch(manifest, approved_manifest_sha, prior, source, archive, lease) -> BatchResult:
    """Resume after originals; retain their records and add at most 88/25 MB."""
    if digest(canonical(manifest)) != approved_manifest_sha or prior.get("manifest_sha") != approved_manifest_sha:
        raise MediaError("unapproved_manifest")
    if manifest.get("target_project") != PROJECT_REF:
        raise MediaError("wrong_destination_project")
    bindings = variant_bindings(manifest)
    if prior.get("phase") not in ("original_archive", "variant_archive") or not isinstance(prior.get("verified"), dict):
        raise MediaError("invalid_variant_checkpoint")
    lease.assert_current()
    lease.reserve_egress(approved_manifest_sha + ":variant_metadata:" + str(prior.get("checkpoint_sha")), MAX_METADATA_EGRESS_BYTES)
    archive.assert_private()
    pointer = lease.current_checkpoint_sha()
    if not pointer or pointer != prior.get("checkpoint_sha"):
        raise MediaError("stale_checkpoint")
    raw = archive.read_checkpoint(pointer)
    if digest(raw) != pointer:
        raise MediaError("checkpoint_parity_failed")
    try:
        persisted = json.loads(raw)
    except (ValueError, TypeError):
        raise MediaError("invalid_checkpoint") from None
    if canonical(persisted) != canonical({k: v for k, v in prior.items() if k != "checkpoint_sha"}):
        raise MediaError("checkpoint_content_mismatch")
    originals = manifest["assets"]
    if set(prior["verified"]) != set(originals) or any(not _record_matches(prior["verified"][k], identity(v), v["bytes"]) for k, v in originals.items()):
        raise MediaError("original_archive_incomplete")
    verified = prior.get("verified_variants", {})
    if (not isinstance(verified, dict) or not set(verified) <= set(bindings)
            or (prior["phase"] == "original_archive" and verified)
            or any(not _record_matches(v, bindings[k], bindings[k]["variant"]["bytes"]) for k, v in verified.items())):
        raise MediaError("invalid_variant_checkpoint")
    selected = {}; selected_bytes = 0
    for key, binding in sorted(bindings.items()):
        if key in verified:
            continue
        size = binding["variant"]["bytes"]
        if len(selected) >= MAX_VARIANT_BATCH_OBJECTS or selected_bytes + size > MAX_BATCH_BYTES:
            break
        selected[key] = binding; selected_bytes += size
    if not selected:
        raise MediaError("no_pending_variants")
    observed_before = source.variant_identities(list(selected))
    if not _bindings_match_capture(observed_before, selected):
        raise MediaError("variant_identity_changed_before_copy")
    verified = dict(verified); created = 0
    for key, binding in selected.items():
        variant = binding["variant"]; size = variant["bytes"]
        operation = approved_manifest_sha + ":variant:" + key
        lease.assert_current()
        lease.reserve(operation, size, COPY_BUDGET_BYTES)
        lease.reserve_egress(operation, 2 * size + PER_OBJECT_CONTROL_EGRESS_BYTES)
        content = source.original(variant["secure_url"], size)
        if len(content) != size:
            raise MediaError("source_size_mismatch")
        checksum = digest(content); path = "sha256/" + checksum[:2] + "/" + checksum
        observed = archive.get_if_exists(path, maximum=size)
        if observed is None:
            lease.assert_current(); archive.insert_only(path, content)
            observed = archive.get_if_exists(path, maximum=size); created += 1
        if observed is None or digest(observed) != checksum or len(observed) != size:
            raise MediaError("destination_parity_failed")
        lease.settle_storage(operation, path, size)
        verified[key] = {"identity": binding, "sha256": checksum, "bytes": size, "path": path,
                         "observed_identity_sha256": digest(canonical(observed_before[key]))}
    lease.assert_current()
    if source.variant_identities(list(selected)) != observed_before:
        raise MediaError("variant_identity_changed_after_copy")
    checkpoint = {"schema_version": 1, "phase": "variant_archive", "manifest_sha": approved_manifest_sha,
                  "parent_checkpoint_sha": pointer, "verified": prior["verified"],
                  "verified_variants": verified, "application_cutover": False}
    raw = canonical(checkpoint)
    if len(raw) > MAX_PRIVATE_JSON_BYTES:
        raise MediaError("checkpoint_sharding_review_required")
    checksum = digest(raw)
    lease.reserve(checksum + ":checkpoint", len(raw) + 4096, COPY_BUDGET_BYTES)
    if archive.checkpoint(raw) != checksum:
        raise MediaError("checkpoint_parity_failed")
    lease.settle_storage(checksum + ":checkpoint", "checkpoints/" + checksum + ".json.gz", archive.checkpoint_stored_size(checksum))
    lease.assert_current(); lease.commit_checkpoint(pointer, checksum)
    return BatchResult(checksum, len(selected), selected_bytes, created)


def verify_delivery_batch(manifest, approved_manifest_sha, source_urls, source, lease):
    """Measure candidate URL content before planning/copying; never infer missing variants.

    The caller privately retains this evidence. A later full plan/copy must bind
    the exact bytes again; this function does not activate references or storage.
    """
    if digest(canonical(manifest)) != approved_manifest_sha or manifest.get("target_project") != PROJECT_REF:
        raise MediaError("unapproved_manifest")
    candidates = delivery_candidates(manifest); bindings = variant_bindings(manifest)
    if (not isinstance(source_urls, list) or not 0 < len(source_urls) <= MAX_BATCH_OBJECTS // 2
            or any(not isinstance(url, str) for url in source_urls) or len(set(source_urls)) != len(source_urls)):
        raise MediaError("delivery_batch_limit")
    selected = {}
    total = 0
    for url in source_urls:
        candidate = candidates.get(url)
        if candidate is None or len(candidate["variant_ids"]) != 1:
            raise MediaError("delivery_variant_not_uniquely_materialized")
        key = candidate["variant_ids"][0]; binding = bindings[key]
        selected[key] = binding; total += 2 * binding["variant"]["bytes"]
    if total + PER_OBJECT_CONTROL_EGRESS_BYTES > MAX_BATCH_BYTES:
        raise MediaError("delivery_batch_byte_limit")
    lease.assert_current()
    lease.reserve_egress(approved_manifest_sha + ":delivery_probe", total + PER_OBJECT_CONTROL_EGRESS_BYTES)
    observed_before = source.variant_identities(list(selected))
    if not _bindings_match_capture(observed_before, selected):
        raise MediaError("variant_identity_changed_before_copy")
    result = {}
    for url in source_urls:
        lease.assert_current()
        key = candidates[url]["variant_ids"][0]; variant = bindings[key]["variant"]
        expected = source.original(variant["secure_url"], variant["bytes"])
        delivered = source.original(url, variant["bytes"])
        if len(expected) != variant["bytes"] or len(delivered) != variant["bytes"] or delivered != expected:
            raise MediaError("delivery_content_mismatch")
        result[digest(url.encode())] = {"source_url": url, "variant_id": key,
            "sha256": digest(delivered), "bytes": len(delivered), "identity": bindings[key],
            "observed_identity_sha256": digest(canonical(observed_before[key]))}
    lease.assert_current()
    if source.variant_identities(list(selected)) != observed_before:
        raise MediaError("variant_identity_changed_after_copy")
    return {"manifest_sha": approved_manifest_sha, "verified_deliveries": result,
            "source_bytes": total, "application_cutover": False}
