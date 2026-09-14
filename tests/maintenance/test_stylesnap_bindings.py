"""Offline binding parity and interruption tests using the actual copy workers."""
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from test_stylesnap_archive import ASSET, URL, setup, failed
from test_stylesnap_copy import Archive, Lease, Source
from test_stylesnap_variants import VariantSource
from stylesnap_media import MediaError, PROJECT_REF, REFERENCE_COLUMNS, canonical, digest, map_references
from stylesnap_copy import run_original_batch
from stylesnap_variants import run_variant_batch, verify_delivery_batch
from stylesnap_private_json import encode_private_json
from stylesnap_archive import DurableLease
from stylesnap_archive_plan import KNOWN_MISSING_DEFAULTS
from stylesnap_bindings import build_binding_plan, binding_batches
from stylesnap_binding_publish import BindingPublisher, prepare_binding_publication, publish_next_binding_batch


def uuid(number):
    return f'00000000-0000-4000-8000-{number:012d}'


def fixture(count=1):
    variant = {'id': 'variant-one', 'public_id': 'source', 'resource_type': 'image', 'type': 'upload',
               'format': 'webp', 'bytes': 2, 'secure_url': URL.replace('/v1/', '/f_webp,q_auto:good/v1/')}
    rows = {table: [] for table in REFERENCE_COLUMNS}
    rows['clothes'] = [{'id': uuid(100 + i), 'owner_id': uuid(1), 'privacy': 'private', 'removed_at': None,
                       'image_url': URL, 'thumbnail_url': URL.replace('/v1/', '/q_auto:good,f_webp/') if i == 0 else None} for i in range(count)]
    manifest = {'schema_version': 1, 'target_project': PROJECT_REF, 'source_cloud': 'unit-cloud',
                'assets': {ASSET['asset_id']: copy.deepcopy(ASSET)}, 'derived': {'variant-one': variant},
                'database_references': rows, 'backups': {}, 'versions': {}, 'usage': {}}
    manifest['reference_mapping'] = map_references(manifest)
    return manifest


class PrivateArchive(Archive):
    def write_private_json(self, namespace, raw, expected_descriptor=None):
        compressed, descriptor = encode_private_json(namespace, raw)
        if descriptor != expected_descriptor:
            raise MediaError('private_json_descriptor_mismatch')
        self.objects[f'{namespace}/{descriptor["raw_sha256"]}.json.gz'] = compressed
        return descriptor['raw_sha256']


def copied(manifest):
    approved = digest(canonical(manifest))
    archive, lease = PrivateArchive(), Lease()
    lease.manifest_sha = approved
    result = run_original_batch(manifest, approved, {'phase': 'original_archive', 'manifest_sha': approved, 'verified': {}},
                                Source(manifest['assets']), archive, lease)
    prior = json.loads(archive.checkpoints[-1])
    prior['checkpoint_sha'] = result.checkpoint_sha
    result = run_variant_batch(manifest, approved, prior, VariantSource(manifest), archive, lease)
    checkpoint = json.loads(archive.checkpoints[-1])
    checkpoint['checkpoint_sha'] = result.checkpoint_sha
    urls = sorted({row['thumbnail_url'] for row in manifest['database_references']['clothes'] if row.get('thumbnail_url') and row['thumbnail_url'] not in KNOWN_MISSING_DEFAULTS.values()})
    proof = verify_delivery_batch(manifest, approved, urls, VariantSource(manifest), lease)
    return approved, checkpoint, [proof], archive, lease


class PlannerTests(unittest.TestCase):
    def test_bindings_require_actual_original_variant_and_delivery_copy_receipts(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        before = canonical((manifest, checkpoint, evidence))
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        self.assertTrue(plan['cloudinary_bindings_complete'])
        self.assertFalse(plan['application_cutover'])
        self.assertEqual(len(plan['rows']), 2)
        self.assertEqual([row['mime_type'] for row in plan['rows']], ['image/jpeg', 'image/webp'])
        self.assertEqual(plan['rows'][0]['content_sha256'], digest(b'data'))
        self.assertEqual(plan['rows'][1]['content_sha256'], digest(b'vv'))
        self.assertEqual(plan['delivery_evidence'], evidence)
        self.assertEqual(canonical((manifest, checkpoint, evidence)), before)

    def test_a_recipe_candidate_without_delivery_bytes_stays_unresolved(self):
        manifest = fixture()
        approved, checkpoint, _, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint)
        self.assertEqual(len(plan['rows']), 1)
        self.assertEqual(plan['blockers'][0]['reason'], 'delivery_bytes_unverified')
        self.assertFalse(plan['cloudinary_bindings_complete'])

    def test_all_five_source_tables_keep_exact_field_identities_and_external_references(self):
        manifest = fixture()
        for i, table in enumerate(('catalog_items', 'users', 'outfit_collections', 'outfit_history'), 1):
            row = {column: None for column in REFERENCE_COLUMNS[table]}
            row['id'] = uuid(i)
            for column in row:
                if column.endswith('_url'):
                    row[column] = URL
            manifest['database_references'][table].append(row)
        manifest['database_references']['users'].append({'id': uuid(10), 'avatar_url': 'https://profiles.example.invalid/avatar.png'})
        manifest['reference_mapping'] = map_references(manifest)
        approved, checkpoint, evidence, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        self.assertEqual(len(plan['rows']), 7)
        self.assertEqual(len(plan['external_references']), 1)
        self.assertEqual({row['source_table'] for row in plan['rows']}, set(REFERENCE_COLUMNS))

    def test_retained_missing_defaults_require_exact_hash_bound_review(self):
        manifest = fixture()
        manifest['source_cloud'] = 'sgstylesnap'
        for item in [*manifest['assets'].values(), *manifest['derived'].values()]:
            item['secure_url'] = item['secure_url'].replace('unit-cloud', 'sgstylesnap')
        for row in manifest['database_references']['clothes']:
            for column in ('image_url', 'thumbnail_url'):
                row[column] = row[column].replace('unit-cloud', 'sgstylesnap')
        manifest['database_references']['clothes'].append({'id': uuid(200), 'owner_id': uuid(1), 'privacy': 'private', 'removed_at': None, **KNOWN_MISSING_DEFAULTS})
        manifest['reference_mapping'] = map_references(manifest)
        approved, checkpoint, evidence, _, _ = copied(manifest)
        review = {'manifest_sha256': approved, 'unresolved_count': 2, 'unresolved_all_exact_known_legacy_defaults': True,
                  'each_known_default_present_once': True, 'unresolved_references_preserved_in_raw_rows': True, 'unresolved_unique_records': 1}
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence, missing_default_evidence=review)
        self.assertTrue(plan['cloudinary_bindings_complete'])
        self.assertEqual(len(plan['retained_missing']), 2)
        self.assertEqual(len(plan['rows']), 2)
        self.assertFalse(build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)['cloudinary_bindings_complete'])
        review['manifest_sha256'] = 'f' * 64
        with self.assertRaisesRegex(MediaError, 'missing_default_review_mismatch'):
            build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence, missing_default_evidence=review)

    def test_changed_raw_source_mapping_cannot_reuse_the_approved_manifest(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        manifest['database_references']['clothes'][0]['image_url'] += '?changed=1'
        with self.assertRaisesRegex(MediaError, 'unapproved_manifest'):
            build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)

    def test_missing_copy_receipts_and_tampered_checkpoints_fail(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        for field, error in [('verified', 'original_archive_incomplete'), ('verified_variants', 'variant_archive_incomplete')]:
            broken = copy.deepcopy(checkpoint)
            broken[field] = {}
            with self.assertRaisesRegex(MediaError, 'checkpoint_content_mismatch'):
                build_binding_plan(manifest, approved, broken, delivery_evidence=evidence)
            broken['checkpoint_sha'] = digest(canonical({k: v for k, v in broken.items() if k != 'checkpoint_sha'}))
            with self.assertRaisesRegex(MediaError, error):
                build_binding_plan(manifest, approved, broken, delivery_evidence=evidence)

    def test_delivery_must_match_copied_bytes_and_full_observed_identity(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        for field, value in [('sha256', 'f' * 64), ('bytes', True), ('variant_id', 'missing'), ('observed_identity_sha256', 'e' * 64)]:
            broken = copy.deepcopy(evidence)
            next(iter(broken[0]['verified_deliveries'].values()))[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(MediaError, 'delivery_copy_parity_mismatch'):
                build_binding_plan(manifest, approved, checkpoint, delivery_evidence=broken)

    def test_full_pagination_retains_reused_objects_and_limits_wire_bytes(self):
        manifest = fixture(251)
        approved, checkpoint, evidence, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        self.assertEqual([batch['count'] for batch in plan['batches']], [100, 100, 52])
        self.assertEqual(len(plan['rows']), 252)
        self.assertEqual(len({row['content_sha256'] for row in plan['rows']}), 2)
        wide_rows = [{**row, 'source_url': 'https://example.invalid/' + 'x' * 4000} for row in plan['rows']]
        batches = binding_batches(wide_rows)
        self.assertGreater(len(batches), 3)
        self.assertEqual(sum(batch['count'] for batch in batches), 252)
        self.assertTrue(all(len(canonical(batch['rows'])) <= 256000 for batch in batches))


class MemoryPublisher:
    def __init__(self, capacity=True):
        self.state = {'next_batch': 0, 'published_count': 0, 'complete': False}
        self.rows = []
        self.lost_response = False
        self.capacity = capacity

    def reserve(self, plan, maximum_bytes):
        if not self.capacity:
            raise MediaError('storage_capacity_limit')
        self.reserved_bytes = maximum_bytes

    def start(self, plan):
        self.plan_sha = digest(canonical(plan))
        return dict(self.state)

    def inspect(self, plan):
        if digest(canonical(plan)) != self.plan_sha:
            raise MediaError('binding_publication_conflict')
        return dict(self.state)

    def append(self, plan, index, rows):
        self.inspect(plan)
        self.rows.extend(copy.deepcopy(rows))
        self.state.update(next_batch=index + 1, published_count=len(self.rows))
        if self.lost_response:
            self.lost_response = False
            raise MediaError('provider_request_failed')
        return dict(self.state)

    def finish(self, plan):
        self.state['complete'] = True
        return dict(self.state)


class PublicationTests(unittest.TestCase):
    def test_retains_complete_plan_before_bounded_publication_and_resumes_lost_response(self):
        manifest = fixture(201)
        approved, checkpoint, evidence, archive, lease = copied(manifest)
        publisher = MemoryPublisher()
        plan = prepare_binding_publication(manifest, approved, checkpoint, archive, lease, publisher, delivery_evidence=evidence)
        self.assertIn('manifests/' + digest(canonical(plan)) + '.json.gz', archive.objects)
        publisher.lost_response = True
        with self.assertRaisesRegex(MediaError, 'provider_request_failed'):
            publish_next_binding_batch(plan, publisher, lease)
        self.assertEqual(len(publisher.rows), 100)
        self.assertEqual(publish_next_binding_batch(plan, publisher, lease)['published_count'], 200)
        self.assertTrue(publish_next_binding_batch(plan, publisher, lease)['complete'])
        self.assertEqual(publisher.rows, plan['rows'])
        self.assertTrue(publish_next_binding_batch(plan, publisher, lease)['complete'])
        self.assertEqual(len(publisher.rows), 202)
        self.assertEqual(lease.current_checkpoint_sha(), checkpoint['checkpoint_sha'])

    def test_stale_lease_capacity_and_missing_delivery_stop_before_plan_upload(self):
        for problem in ('lease', 'capacity', 'egress', 'delivery'):
            manifest = fixture()
            approved, checkpoint, evidence, archive, lease = copied(manifest)
            before = dict(archive.objects)
            if problem == 'lease': lease.current = False
            if problem == 'egress': lease.egress_available = False
            if problem == 'delivery': evidence = []
            with self.subTest(problem=problem), self.assertRaises(MediaError):
                prepare_binding_publication(manifest, approved, checkpoint, archive, lease, MemoryPublisher(capacity=problem != 'capacity'), delivery_evidence=evidence)
            self.assertEqual(archive.objects, before)

    def test_real_rpc_adapter_keeps_fixed_destination_and_counts_one_failed_request(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        reader, opener = setup(failed(503))
        publisher = BindingPublisher(DurableLease(reader, approved))
        with self.assertRaises(MediaError): publisher.start(plan)
        self.assertEqual(len(opener.requests), 1)
        self.assertEqual(opener.requests[0].full_url, f'https://{PROJECT_REF}.supabase.co/rest/v1/rpc/stylesnap_publish_media_bindings')

    def test_malformed_or_inconsistent_rpc_progress_is_rejected(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        for value in ({}, {'next_batch': True, 'published_count': 0, 'complete': False},
                      {'next_batch': 0, 'published_count': 1, 'complete': False},
                      {'next_batch': 0, 'published_count': 0, 'complete': True}):
            reader, _ = setup(lambda request: value)
            with self.subTest(value=value), self.assertRaisesRegex(MediaError, 'invalid_binding_publication_response'):
                BindingPublisher(DurableLease(reader, approved)).inspect(plan)

    def test_plan_reservation_uses_explicit_capacity_rpc_and_fixed_identity(self):
        manifest = fixture()
        approved, checkpoint, evidence, _, _ = copied(manifest)
        plan = build_binding_plan(manifest, approved, checkpoint, delivery_evidence=evidence)
        reader, opener = setup(lambda request: {'reserved': True})
        publisher = BindingPublisher(DurableLease(reader, approved))
        publisher.reserve(plan, 345)
        body = json.loads(opener.requests[0].data)
        self.assertEqual(body['action'], 'reserve')
        self.assertEqual(body['payload']['maximum_bytes'], 345)
        self.assertEqual(body['payload']['plan_sha'], digest(canonical(plan)))
        self.assertEqual(body['payload']['copy_checkpoint_sha'], checkpoint['checkpoint_sha'])
        for value in (0, True, 8_000_001):
            with self.assertRaisesRegex(MediaError, 'invalid_binding_plan_reservation'):
                publisher.reserve(plan, value)
        for key in ('owner', 'plan_sha', 'manifest_sha', 'copy_checkpoint_sha'):
            with self.assertRaisesRegex(MediaError, 'binding_publication_identity_mismatch'):
                publisher.call('reserve', plan, {key: 'changed'})
        self.assertEqual(len(opener.requests), 1)

    def test_wrong_lease_manifest_stops_before_private_reads_or_reservations(self):
        manifest = fixture()
        approved, checkpoint, evidence, archive, lease = copied(manifest)
        lease.manifest_sha = 'f' * 64
        before = copy.deepcopy((archive.objects, lease.egress_reservations, lease.settlements))
        with self.assertRaisesRegex(MediaError, 'binding_publication_identity_mismatch'):
            prepare_binding_publication(manifest, approved, checkpoint, archive, lease, MemoryPublisher(), delivery_evidence=evidence)
        self.assertEqual((archive.objects, lease.egress_reservations, lease.settlements), before)


if __name__ == '__main__':
    unittest.main()
