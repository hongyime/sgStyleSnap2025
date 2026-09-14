"""Finite private binding publication; no CLI, live activation or source edits."""
from __future__ import annotations

from typing import Any

from stylesnap_media import MediaError, SUPABASE_URL, canonical, digest, decode_json
from stylesnap_copy import MAX_METADATA_EGRESS_BYTES, PER_OBJECT_CONTROL_EGRESS_BYTES
from stylesnap_private_json import encode_private_json
from stylesnap_bindings import build_binding_plan, binding_batches, MAX_BINDINGS
from stylesnap_archive import DurableLease, PrivateStorage


class BindingPublisher:
    """Service-only, insert-only RPC with fixed origin and no automatic retries."""
    def __init__(self, lease: DurableLease) -> None:
        self.lease = lease
        self.requests = 0

    def call(self, action: str, plan: dict[str, Any], values: dict[str, Any] | None = None) -> dict[str, Any]:
        if action not in ('reserve', 'start', 'inspect', 'append', 'finish') or self.requests >= 3000:
            raise MediaError('binding_request_budget_reached')
        if (plan.get('manifest_sha') != self.lease.manifest_sha
                or set(values or {}) & {'plan_sha', 'manifest_sha', 'copy_checkpoint_sha', 'owner'}):
            raise MediaError('binding_publication_identity_mismatch')
        payload = {'plan_sha': digest(canonical(plan)), 'manifest_sha': self.lease.manifest_sha,
                   'copy_checkpoint_sha': plan['copy_checkpoint_sha'], 'owner': self.lease.owner,
                   **(values or {})}
        body = canonical({'action': action, 'payload': payload})
        if len(body) > 512_000:
            raise MediaError('binding_request_size_limit')
        self.requests += 1
        reader = self.lease.reader
        raw = reader.request(SUPABASE_URL + '/rest/v1/rpc/stylesnap_publish_media_bindings',
                             {'Authorization': 'Bearer ' + reader.supabase_key, 'apikey': reader.supabase_key,
                              'Content-Type': 'application/json'}, maximum=8192, method='POST', data=body)
        value = decode_json(raw)
        if action == 'reserve':
            if not isinstance(value, dict) or set(value) != {'reserved'} or value['reserved'] is not True:
                raise MediaError('invalid_binding_reservation_response')
            return value
        if (not isinstance(value, dict) or set(value) != {'next_batch', 'published_count', 'complete'}
                or type(value['next_batch']) is not int or not 0 <= value['next_batch'] <= len(plan['batches'])
                or type(value['published_count']) is not int or not 0 <= value['published_count'] <= len(plan['rows'])
                or type(value['complete']) is not bool
                or value['published_count'] != sum(batch['count'] for batch in plan['batches'][:value['next_batch']])
                or (value['complete'] and value['next_batch'] != len(plan['batches']))):
            raise MediaError('invalid_binding_publication_response')
        return value

    def reserve(self, plan: dict[str, Any], maximum_bytes: int) -> dict[str, Any]:
        if type(maximum_bytes) is not int or not 0 < maximum_bytes <= 8_000_000:
            raise MediaError('invalid_binding_plan_reservation')
        return self.call('reserve', plan, {'maximum_bytes': maximum_bytes})

    def start(self, plan: dict[str, Any]) -> dict[str, Any]:
        return self.call('start', plan, {'expected_batches': plan['batches'], 'expected_count': len(plan['rows'])})

    def inspect(self, plan: dict[str, Any]) -> dict[str, Any]:
        return self.call('inspect', plan)

    def append(self, plan: dict[str, Any], index: int, rows: list[dict[str, Any]]) -> dict[str, Any]:
        return self.call('append', plan, {'batch_index': index, 'rows_json': canonical(rows).decode()})

    def finish(self, plan: dict[str, Any]) -> dict[str, Any]:
        return self.call('finish', plan)


def prepare_binding_publication(manifest: dict[str, Any], approved_manifest_sha: str, checkpoint: dict[str, Any],
                                archive: PrivateStorage, lease: DurableLease, publisher: BindingPublisher, *,
                                delivery_evidence: list[dict[str, Any]] | tuple = (),
                                missing_default_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    """Retain the full binding plan only after authenticating its copy checkpoint.

    Reservations include private metadata read-back; uncertain uploads remain
    charged. The existing lease/capacity switches apply to every operation.
    """
    if lease.manifest_sha != approved_manifest_sha:
        raise MediaError('binding_publication_identity_mismatch')
    plan = build_binding_plan(manifest, approved_manifest_sha, checkpoint,
                              delivery_evidence=delivery_evidence, missing_default_evidence=missing_default_evidence)
    if not plan['cloudinary_bindings_complete']:
        raise MediaError('incomplete_media_bindings')
    lease.assert_current()
    if lease.current_checkpoint_sha() != plan['copy_checkpoint_sha']:
        raise MediaError('stale_checkpoint')
    lease.reserve_egress(approved_manifest_sha + ':binding_plan_metadata', MAX_METADATA_EGRESS_BYTES)
    archive.assert_private()
    prior = archive.read_checkpoint(plan['copy_checkpoint_sha'])
    expected = canonical({key: value for key, value in checkpoint.items() if key != 'checkpoint_sha'})
    if prior != expected or digest(prior) != plan['copy_checkpoint_sha']:
        raise MediaError('checkpoint_content_mismatch')
    raw = canonical(plan)
    _, descriptor = encode_private_json('manifests', raw)
    plan_sha = descriptor['raw_sha256']
    operation = approved_manifest_sha + ':binding_plan:' + plan_sha
    publisher.reserve(plan, descriptor['compressed_bytes'])
    lease.assert_current()
    checksum = archive.write_private_json('manifests', raw, expected_descriptor=descriptor)
    if checksum != plan_sha:
        raise MediaError('binding_plan_parity_failed')
    lease.settle_storage(operation, 'manifests/' + plan_sha + '.json.gz', descriptor['compressed_bytes'])
    lease.assert_current()
    publisher.start(plan)
    return plan


def publish_next_binding_batch(plan: dict[str, Any], publisher: BindingPublisher, lease: DurableLease) -> dict[str, Any]:
    """Publish at most 100 source fields; inspect committed state on resumption."""
    if (not isinstance(plan, dict) or plan.get('phase') != 'media_bindings'
            or plan.get('cloudinary_bindings_complete') is not True or plan.get('blockers') != []
            or plan.get('application_cutover') is not False or plan.get('manifest_sha') != lease.manifest_sha
            or not isinstance(plan.get('rows'), list) or len(plan['rows']) > MAX_BINDINGS):
        raise MediaError('invalid_binding_plan')
    batches = binding_batches(plan['rows'])
    if plan['batches'] != [{'sha256': batch['sha256'], 'count': batch['count']} for batch in batches]:
        raise MediaError('binding_batch_content_mismatch')
    lease.assert_current()
    if lease.current_checkpoint_sha() != plan['copy_checkpoint_sha']:
        raise MediaError('stale_checkpoint')
    lease.reserve_egress(plan['manifest_sha'] + ':binding_batch:' + digest(canonical(plan)), PER_OBJECT_CONTROL_EGRESS_BYTES)
    state = publisher.inspect(plan)
    if state['complete']:
        return state
    index = state['next_batch']
    if index < len(batches):
        state = publisher.append(plan, index, batches[index]['rows'])
    if state['next_batch'] == len(batches):
        state = publisher.finish(plan)
    return state
