"""Offline detail-endpoint, paired request-budget and copy-recovery contracts."""
import io
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch

from test_stylesnap_archive import ASSET, PRIVATE, setup
from test_stylesnap_copy import Archive, Lease
from stylesnap_media import MediaError, canonical, digest, REFERENCE_COLUMNS, map_references
import stylesnap_archive as adapters
import stylesnap_archive_plan as planner
import stylesnap_copy as originals
import stylesnap_variants as variants


def manifest(parent_count=1, variant_count=1):
    assets = {}
    for index in range(parent_count):
        key = f"{index + 1:032x}"
        public_id = f"source-{index}"
        assets[key] = {**ASSET, "asset_id": key, "public_id": public_id,
                       "secure_url": f"https://res.cloudinary.com/unit-cloud/image/upload/v1/{public_id}.jpg"}
    derived = {}
    parents = list(assets.values())
    for index in range(variant_count):
        parent = parents[index % parent_count]
        key = f"variant-{index:04}"
        derived[key] = {"id": key, "bytes": 2, "public_id": parent["public_id"],
                        "resource_type": "image", "type": "upload", "format": "webp",
                        "secure_url": parent["secure_url"].replace('/v1/', f'/w_{index + 1}/v1/')}
    value = {"target_project": "nztqjmknblelnzpeatyx", "source_cloud": "unit-cloud", "assets": assets,
             "derived": derived, "database_references": {table: [] for table in REFERENCE_COLUMNS},
             "backups": {}, "versions": {}, "usage": {"resources": parent_count, "derived_resources": variant_count,
                                                         "storage": {"usage": parent_count * 4 + variant_count * 2}}}
    value['reference_mapping'] = map_references(value)
    return value


class SourceBudgetTests(unittest.TestCase):
    def test_paired_detail_reads_use_200_units_for_100_assets_and_discard_extra_metadata(self):
        value = manifest(100, 0)
        def response(request):
            url = urllib.parse.urlsplit(request.full_url)
            self.assertEqual(urllib.parse.parse_qs(url.query), {'image_metadata': ['true'], 'max_results': ['1']})
            self.assertEqual(url.netloc, 'api.cloudinary.com')
            self.assertEqual(request.get_method(), 'GET')
            key = url.path.rsplit('/', 1)[1]
            self.assertIn(key, value['assets'])
            return {**value['assets'][key], 'image_metadata': {'private': PRIVATE}, 'derived_next_cursor': PRIVATE}
        reader, opener = setup(response)
        source = adapters.OriginalSource(reader)
        expected = {key: originals.identity(row) for key, row in value['assets'].items()}
        self.assertEqual(source.identities(list(expected)), expected)
        self.assertEqual(source.identities(list(reversed(expected))), expected)
        self.assertEqual((reader.admin_units, len(opener.requests)), (200, 200))
        with self.assertRaises(MediaError):
            source.identities(list(expected))
        self.assertEqual(len(opener.requests), 200)

    def test_insufficient_shared_allowance_rejects_both_passes_before_any_request(self):
        reader, opener = setup(lambda req: self.fail('An underfunded pair made a request'))
        reader.admin_units = 1
        with self.assertRaisesRegex(MediaError, 'identity_lookup_budget_reached'):
            adapters.OriginalSource(reader).identities(list(manifest(100, 0)['assets']))
        self.assertEqual((reader.admin_units, len(opener.requests)), (1, 0))

    def test_detail_shape_identity_etag_and_counter_failures_are_not_retried(self):
        row = next(iter(manifest()['assets'].values()))
        for payload in ({'resources': [row]}, [], {**row, 'asset_id': 'f' * 32}, {**row, 'bytes': True},
                        {key: value for key, value in row.items() if key != 'etag'}):
            reader, opener = setup(lambda req: payload)
            source = adapters.OriginalSource(reader)
            with self.assertRaises(MediaError) as failure:
                source.identities([row['asset_id']])
            self.assertNotIn(PRIVATE, str(failure.exception))
            with self.assertRaisesRegex(MediaError, 'source_attempt_failed'):
                source.identities([row['asset_id']])
            self.assertEqual((reader.admin_units, len(opener.requests)), (1, 1))

    def test_detail_body_is_capped_at_64k_and_failed_attempt_blocks_payloads(self):
        reader, opener = setup(lambda req: b'x' * 65_537)
        source = adapters.OriginalSource(reader)
        row = next(iter(manifest()['assets'].values()))
        with self.assertRaisesRegex(MediaError, 'response_too_large'):
            source.identities([row['asset_id']])
        with self.assertRaisesRegex(MediaError, 'source_attempt_failed'):
            source.original(row['secure_url'], row['bytes'])
        self.assertEqual((reader.admin_units, len(opener.requests)), (1, 1))

    def test_unsafe_asset_ids_and_invalid_unit_charges_make_no_request(self):
        reader, opener = setup(lambda req: self.fail('Invalid input made a request'))
        for asset_id in ('../usage', 'a?fields=private', 'a/versions', 'bad%2fpath', 'a' * 129):
            with self.assertRaises(MediaError):
                adapters.OriginalSource(reader).identities([asset_id])
        for units in (True, 0, -1, 1.5):
            with self.assertRaises(MediaError):
                reader.admin('usage', units=units)
        self.assertEqual((reader.admin_units, len(opener.requests)), (0, 0))

    def test_payload_failure_ends_the_attempt_without_retrying_or_resetting_counts(self):
        def response(request):
            raise urllib.error.HTTPError(request.full_url, 503, PRIVATE, {}, io.BytesIO(PRIVATE.encode()))
        reader, opener = setup(response)
        source = adapters.OriginalSource(reader)
        row = next(iter(manifest()['assets'].values()))
        with self.assertRaises(MediaError):
            source.original(row['secure_url'], row['bytes'])
        with self.assertRaisesRegex(MediaError, 'source_attempt_failed'):
            source.original(row['secure_url'], row['bytes'])
        self.assertEqual((reader.source_requests, len(opener.requests)), (1, 1))

    def test_variant_allowance_is_checked_before_scanning_and_malformed_lineage_ends_attempt(self):
        value = manifest(88, 88)
        reader, opener = setup(lambda req: self.fail('Insufficient variant allowance made a request'))
        reader.admin_units = 1
        with self.assertRaisesRegex(MediaError, 'variant_lookup_budget_reached'):
            adapters.VariantSource(reader, value).variant_identities(list(value['derived']))
        self.assertEqual((reader.admin_units, len(opener.requests)), (1, 0))
        value = manifest()
        reader, opener = setup(lambda req: next(iter(value['assets'].values())))
        source = adapters.VariantSource(reader, value)
        bad = {key: {**row, 'public_id': 'wrong-parent'} for key, row in value['derived'].items()}
        with patch('stylesnap_media.derived_inventory', return_value=({}, bad)):
            with self.assertRaises(MediaError):
                source.variant_identities(list(value['derived']))
            with self.assertRaisesRegex(MediaError, 'source_attempt_failed'):
                source.variant_identities(list(value['derived']))
        self.assertEqual((reader.admin_units, len(opener.requests)), (1, 1))

    def test_variant_budget_reserves_two_scans_and_both_parent_passes(self):
        value = manifest(88, 88)
        def response(request):
            key = urllib.parse.urlsplit(request.full_url).path.rsplit('/', 1)[1]
            return value['assets'][key] if key in value['assets'] else {}
        reader, opener = setup(response)
        source = adapters.VariantSource(reader, value)
        def inventory(actual_reader):
            for _ in range(12):
                actual_reader.admin('transformations')
            return {}, value['derived']
        with patch('stylesnap_media.derived_inventory', side_effect=inventory):
            expected = variants.variant_bindings(value)
            self.assertEqual(source.variant_identities(list(expected)), expected)
            self.assertEqual(source.variant_identities(list(expected)), expected)
        self.assertEqual((reader.admin_units, len(opener.requests), reader.admin_unit_limit), (200, 200, 200))
        value = manifest(89, 89)
        reader, opener = setup(lambda req: self.fail('Oversized variant batch made a request'))
        with self.assertRaises(MediaError):
            adapters.VariantSource(reader, value).variant_identities(list(value['derived']))
        self.assertEqual(len(opener.requests), 0)

    def test_plan_accounts_for_every_identity_and_each_smaller_variant_checkpoint(self):
        value = manifest(1, 89)
        before = canonical(value)
        plan = planner.build_reservation_plan(value)
        self.assertEqual(plan['original_identity_admin_units'], 2)
        self.assertEqual(plan['variant_identity_admin_units_upper'], 52)  # Two batches: 2 parents + 24 scan units each.
        self.assertEqual(plan['source_admin_units_before_retries_upper'], 54)
        self.assertEqual(plan['checkpoint_count_budget'], 3)  # One original batch, two variant batches.
        self.assertEqual(plan['source_metadata_response_bytes_upper'], 6 * 65_536 + 48 * 8 * 1024 * 1024)
        self.assertFalse(plan['source_admin_headroom_verified'])
        self.assertEqual(canonical(value), before)

    def test_post_copy_identity_failure_keeps_staged_bytes_and_prior_checkpoint(self):
        value = manifest(1, 0)
        key = next(iter(value['assets']))
        approved = digest(canonical(value))
        prior = {'phase': 'original_archive', 'manifest_sha': approved, 'verified': {}, 'checkpoint_sha': None}
        archive, lease = Archive(), Lease()
        metadata_calls = 0
        def response(request):
            nonlocal metadata_calls
            if urllib.parse.urlsplit(request.full_url).netloc == 'res.cloudinary.com':
                return b'data'
            metadata_calls += 1
            if metadata_calls == 2:
                raise urllib.error.HTTPError(request.full_url, 429, PRIVATE, {}, io.BytesIO(PRIVATE.encode()))
            return value['assets'][key]
        reader, opener = setup(response)
        source = adapters.OriginalSource(reader)
        with self.assertRaises(MediaError):
            originals.run_original_batch(value, approved, prior, source, archive, lease)
        self.assertTrue(archive.objects)
        self.assertEqual(archive.checkpoints, [])
        self.assertEqual(lease.committed, [])
        self.assertTrue(lease.reservations)
        self.assertEqual(reader.admin_units, 2)
        count = len(opener.requests)
        with self.assertRaisesRegex(MediaError, 'source_attempt_failed'):
            source.identities([key])
        self.assertEqual(len(opener.requests), count)


if __name__ == '__main__':
    unittest.main()
