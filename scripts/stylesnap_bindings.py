"""Derive private image bindings from retained, verified copy evidence.

The plan is private provenance, not a public report or proof of a live cutover.
Every raw reference remains represented; unknown matches never acquire a URL.
"""
from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from stylesnap_media import MediaError, PROJECT_REF, REFERENCE_COLUMNS, canonical, digest, map_references
from stylesnap_copy import identity
from stylesnap_variants import variant_bindings, delivery_candidates, _record_matches
from stylesnap_archive_plan import reviewed_missing_defaults

MAX_BINDINGS = 100_000
MAX_PLAN_BYTES = 32_000_000
MAX_BINDING_BATCH_ROWS = 100
MAX_BINDING_BATCH_BYTES = 256_000
IMAGE_TYPES = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
               'webp': 'image/webp', 'gif': 'image/gif', 'avif': 'image/avif'}
SHA = re.compile(r'^[0-9a-f]{64}$')


def reference_key(value: dict[str, Any]) -> tuple[str, str, str]:
    return value['source_table'], value['source_id'], value['source_column']


def binding_batches(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Stable batches bound both database work and the serialized request body."""
    batches, current = [], []
    for row in rows:
        if len(canonical([row])) > MAX_BINDING_BATCH_BYTES:
            raise MediaError('binding_row_too_large')
        if len(current) == MAX_BINDING_BATCH_ROWS or len(canonical(current + [row])) > MAX_BINDING_BATCH_BYTES:
            raw = canonical(current)
            batches.append({'rows': current, 'sha256': digest(raw), 'count': len(current)})
            current = []
        current.append(row)
    if current:
        batches.append({'rows': current, 'sha256': digest(canonical(current)), 'count': len(current)})
    return batches


def build_binding_plan(manifest: dict[str, Any], approved_manifest_sha: str, checkpoint: dict[str, Any], *,
                       delivery_evidence: list[dict[str, Any]] | tuple = (),
                       missing_default_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(manifest, dict) or manifest.get('target_project') != PROJECT_REF:
        raise MediaError('wrong_destination_project')
    if digest(canonical(manifest)) != approved_manifest_sha:
        raise MediaError('unapproved_manifest')
    raw_tables = manifest.get('database_references')
    if not isinstance(raw_tables, dict) or set(raw_tables) != set(REFERENCE_COLUMNS):
        raise MediaError('incomplete_raw_reference_inventory')
    reference_count = 0
    for table, rows in raw_tables.items():
        if not isinstance(rows, list):
            raise MediaError('invalid_raw_reference_inventory')
        seen = set()
        for row in rows:
            if not isinstance(row, dict) or not set(REFERENCE_COLUMNS[table]) <= set(row):
                raise MediaError('invalid_raw_reference_inventory')
            try:
                row_id = str(UUID(row['id']))
            except (ValueError, TypeError, AttributeError):
                raise MediaError('invalid_source_identity') from None
            if row_id != row['id'] or row_id in seen:
                raise MediaError('duplicate_or_noncanonical_source_identity')
            seen.add(row_id)
            reference_count += sum(column.endswith('_url') for column in REFERENCE_COLUMNS[table])
    if reference_count > MAX_BINDINGS:
        raise MediaError('binding_inventory_budget_reached')
    mapped = map_references(manifest)
    if canonical(mapped) != canonical(manifest.get('reference_mapping')):
        raise MediaError('raw_reference_mapping_mismatch')
    missing_review = reviewed_missing_defaults(approved_manifest_sha, mapped, missing_default_evidence)
    if not isinstance(checkpoint, dict) or checkpoint.get('manifest_sha') != approved_manifest_sha:
        raise MediaError('unapproved_checkpoint')
    checkpoint_sha = checkpoint.get('checkpoint_sha')
    if not isinstance(checkpoint_sha, str) or not SHA.fullmatch(checkpoint_sha):
        raise MediaError('invalid_checkpoint_identity')
    raw_checkpoint = {key: value for key, value in checkpoint.items() if key != 'checkpoint_sha'}
    if (digest(canonical(raw_checkpoint)) != checkpoint_sha or checkpoint.get('schema_version') != 1
            or checkpoint.get('application_cutover') is not False):
        raise MediaError('checkpoint_content_mismatch')
    variants = variant_bindings(manifest)
    originals = manifest['assets']
    copied = checkpoint.get('verified')
    copied_variants = checkpoint.get('verified_variants', {})
    if (not isinstance(copied, dict) or set(copied) != set(originals)
            or any(not _record_matches(copied[key], identity(asset), asset['bytes']) for key, asset in originals.items())):
        raise MediaError('original_archive_incomplete')
    if (checkpoint.get('phase') not in ('original_archive', 'variant_archive')
            or (variants and checkpoint.get('phase') != 'variant_archive')
            or not isinstance(copied_variants, dict) or set(copied_variants) != set(variants)
            or any(not _record_matches(copied_variants[key], value, value['variant']['bytes']) for key, value in variants.items())):
        raise MediaError('variant_archive_incomplete')

    by_url = {}
    for objects, receipts, category in ((originals, copied, 'original'), (manifest['derived'], copied_variants, 'variant')):
        for key, value in objects.items():
            url = value['secure_url']
            if url in by_url:
                raise MediaError('ambiguous_archived_url')
            by_url[url] = (receipts[key], value, category, key)
    candidates = delivery_candidates(manifest)
    proofs, proof_hashes = {}, []
    if not isinstance(delivery_evidence, (list, tuple)) or len(delivery_evidence) > 2_000:
        raise MediaError('delivery_evidence_budget_reached')
    for evidence in delivery_evidence:
        if (not isinstance(evidence, dict) or evidence.get('manifest_sha') != approved_manifest_sha
                or evidence.get('application_cutover') is not False
                or not isinstance(evidence.get('verified_deliveries'), dict)
                or not 0 < len(evidence['verified_deliveries']) <= 50):
            raise MediaError('invalid_delivery_evidence')
        proof_hashes.append(digest(canonical(evidence)))
        for url_sha, proof in evidence['verified_deliveries'].items():
            if not isinstance(proof, dict) or not isinstance(proof.get('source_url'), str):
                raise MediaError('invalid_delivery_evidence')
            url = proof['source_url']
            candidate = candidates.get(url)
            key = proof.get('variant_id')
            receipt = copied_variants.get(key)
            if (url_sha != digest(url.encode()) or not candidate or candidate['variant_ids'] != [key]
                    or not receipt or proof.get('identity') != variants[key]
                    or proof.get('sha256') != receipt['sha256'] or type(proof.get('bytes')) is not int
                    or proof['bytes'] != receipt['bytes']
                    or proof.get('observed_identity_sha256') != receipt['observed_identity_sha256']):
                raise MediaError('delivery_copy_parity_mismatch')
            if url in proofs and canonical(proofs[url]) != canonical(proof):
                raise MediaError('conflicting_delivery_evidence')
            proofs[url] = proof

    mappings = {(row['table'], row['row_id'], row['column']): row for row in mapped}
    bindings, blockers, retained_missing, external = [], [], [], []
    empty_count = 0
    for table, rows in sorted(raw_tables.items()):
        for row in rows:
            for column in REFERENCE_COLUMNS[table]:
                if not column.endswith('_url'):
                    continue
                url = row[column]
                reference = {'source_table': table, 'source_id': row['id'], 'source_column': column, 'source_url': url}
                if url is None or url == '':
                    empty_count += 1
                    continue
                if not isinstance(url, str) or len(url) > 4096:
                    blockers.append({**reference, 'reason': 'invalid_source_url'})
                    continue
                mapping = mappings.get((table, row['id'], column))
                if mapping is None:
                    # These URLs remain in the retained source inventory. This
                    # plan does not claim that external profile/model bytes moved.
                    external.append(reference)
                    continue
                if mapping['status'] != 'matched':
                    target = retained_missing if missing_review else blockers
                    target.append({**reference, 'reason': mapping['status']})
                    continue
                match = by_url.get(url)
                if match is None and url in proofs:
                    key = proofs[url]['variant_id']
                    match = (copied_variants[key], manifest['derived'][key], 'variant', key)
                if match is None:
                    blockers.append({**reference, 'reason': 'delivery_bytes_unverified'})
                    continue
                receipt, asset, _, _ = match
                mime = IMAGE_TYPES.get(asset.get('format'))
                resource_type = asset.get('resource_type')
                if mime is None or resource_type != 'image':
                    blockers.append({**reference, 'reason': 'unsupported_image_type'})
                    continue
                bindings.append({**reference, 'manifest_sha': approved_manifest_sha,
                                 'content_sha256': receipt['sha256'], 'object_path': receipt['path'],
                                 'content_bytes': receipt['bytes'], 'mime_type': mime})
    bindings.sort(key=reference_key)
    batches = binding_batches(bindings)
    plan = {'schema_version': 1, 'phase': 'media_bindings', 'manifest_sha': approved_manifest_sha,
            'copy_checkpoint_sha': checkpoint_sha, 'rows': bindings,
            'batches': [{'sha256': batch['sha256'], 'count': batch['count']} for batch in batches],
            'blockers': blockers, 'retained_missing': retained_missing, 'external_references': external,
            'empty_reference_count': empty_count, 'missing_default_review': missing_review,
            'delivery_evidence_sha256': sorted(set(proof_hashes)),
            'delivery_evidence': list(delivery_evidence),
            'cloudinary_bindings_complete': not blockers, 'application_cutover': False}
    if len(canonical(plan)) > MAX_PLAN_BYTES:
        raise MediaError('binding_plan_requires_sharding')
    return plan
