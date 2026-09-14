import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const manifest = 'a'.repeat(64);
const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const owner = uuid(1), friend = uuid(2), outsider = uuid(3);
const bucket = 'stylesnap-media-archive';
const assets = [
  ['private', 'clothes', 'image_url', 100],
  ['friends', 'clothes', 'image_url', 101],
  ['public', 'clothes', 'image_url', 102],
  ['catalog-public', 'catalog_items', 'image_url', 103],
  ['catalog-private', 'catalog_items', 'image_url', 104],
  ['catalog-inactive', 'catalog_items', 'image_url', 105],
  ['history', 'outfit_history', 'photo_url', 106],
  ['avatar', 'users', 'avatar_url', 1],
  ['collection-friends', 'outfit_collections', 'cover_image_url', 108],
  ['collection-public', 'outfit_collections', 'cover_image_url', 109],
  ['collection-private', 'outfit_collections', 'cover_image_url', 110],
].map(([label, table, column, id]) => {
  const sha = id.toString(16).padStart(64, '0');
  return { label, table, column, id: uuid(id), sha, path: `sha256/${sha.slice(0, 2)}/${sha}`, url: `https://fixtures.example.invalid/${label}.png` };
});
let db;

before(async () => {
  // No data directory or provider connection: this PostgreSQL instance is in memory.
  db = new PGlite();
  await db.exec(await readFile(new URL('./fixtures/stylesnap-media-access.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20260914134525_private_media_delivery.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });

async function bind(asset, targetManifest = manifest) {
  await db.query(`INSERT INTO public.stylesnap_media_bindings
    (source_table,source_id,source_column,source_url,manifest_sha,content_sha256,object_path,content_bytes,mime_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,32,'image/png')`,
  [asset.table, asset.id, asset.column, asset.url, targetManifest, asset.sha, asset.path]);
}

beforeEach(async () => {
  await db.exec(`RESET ROLE;
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false, manifest_sha=NULL;
    TRUNCATE public.stylesnap_media_bindings, storage.objects, storage.buckets,
      public.clothes, public.catalog_items, public.friends, public.outfit_collections,
      public.outfit_history, public.users;`);
  await db.query('INSERT INTO storage.buckets VALUES ($1,false)', [bucket]);
  await db.query('INSERT INTO public.users(id) VALUES ($1),($2),($3)', [owner, friend, outsider]);
  await db.query(`INSERT INTO public.friends VALUES ($1,$2,$3,'accepted')`, [uuid(10), owner, friend]);
  for (const asset of assets) {
    if (asset.table === 'clothes') {
      await db.query('INSERT INTO public.clothes(id,owner_id,privacy,image_url) VALUES ($1,$2,$3,$4)', [asset.id, owner, asset.label, asset.url]);
    } else if (asset.table === 'catalog_items') {
      await db.query('INSERT INTO public.catalog_items(id,image_url,privacy,is_active) VALUES ($1,$2,$3,$4)',
        [asset.id, asset.url, asset.label === 'catalog-private' ? 'private' : 'public', asset.label !== 'catalog-inactive']);
    } else if (asset.table === 'users') {
      await db.query('UPDATE public.users SET avatar_url=$1 WHERE id=$2', [asset.url, asset.id]);
    } else if (asset.table === 'outfit_collections') {
      await db.query('INSERT INTO public.outfit_collections VALUES ($1,$2,$3,$4)', [asset.id, owner, asset.label.split('-')[1], asset.url]);
    } else {
      await db.query('INSERT INTO public.outfit_history VALUES ($1,$2,$3)', [asset.id, owner, asset.url]);
    }
    await bind(asset);
    await db.query('INSERT INTO storage.objects VALUES ($1,$2)', [bucket, asset.path]);
  }
  await db.query('UPDATE public.stylesnap_media_delivery_control SET manifest_sha=$1', [manifest]);
});

async function enable() {
  await db.exec('RESET ROLE; UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true;');
}

async function reader(user, operation = 'object.get_authenticated') {
  await db.exec(`RESET ROLE; SET ROLE ${user ? 'authenticated' : 'anon'};`);
  await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false), set_config('storage.operation',$2,false)`, [user || '', operation]);
}

async function visible(table = 'storage.objects') {
  const column = table === 'storage.objects' ? 'name' : 'object_path';
  const { rows } = await db.query(`SELECT ${column} AS path FROM ${table}`);
  return rows.map(row => assets.find(asset => asset.path === row.path)?.label ?? row.path).sort();
}

test('default-disabled delivery exposes neither bindings nor objects', async () => {
  for (const user of [owner, friend, outsider, null]) {
    await reader(user);
    assert.deepEqual(await visible('public.stylesnap_media_bindings'), []);
    assert.deepEqual(await visible(), []);
  }
});

for (const [label, user, expected] of [
  ['owner', owner, ['private', 'friends', 'public', 'catalog-public', 'history', 'avatar', 'collection-friends', 'collection-public', 'collection-private']],
  ['accepted friend', friend, ['friends', 'public', 'catalog-public', 'avatar', 'collection-friends', 'collection-public']],
  ['unrelated user', outsider, ['public', 'catalog-public', 'avatar', 'collection-public']],
  ['anonymous reader', null, ['public', 'catalog-public', 'collection-public']],
]) {
  test(`${label} receives exactly the media allowed by current source-row RLS`, async () => {
    await enable();
    await reader(user);
    assert.deepEqual(await visible('public.stylesnap_media_bindings'), expected.sort());
    assert.deepEqual(await visible(), expected.sort());
  });
}

test('friendship revocation removes wardrobe and collection access on the next read', async () => {
  await enable();
  await db.exec(`UPDATE public.friends SET status='rejected';`);
  await reader(friend);
  assert.deepEqual(await visible(), ['avatar', 'catalog-public', 'collection-public', 'public']);
});

test('changing source URLs invalidates old mappings without deleting retained bindings', async () => {
  await enable();
  await db.exec(`UPDATE public.clothes SET image_url='https://fixtures.example.invalid/replacement.png';`);
  await reader(owner);
  assert.ok(!(await visible()).some(label => ['private', 'friends', 'public'].includes(label)));
  await db.exec('RESET ROLE;');
  assert.equal((await db.query('SELECT count(*)::int AS total FROM public.stylesnap_media_bindings')).rows[0].total, assets.length);
});

test('soft removal hides shared images but preserves the owner access allowed by source RLS', async () => {
  await enable();
  await db.exec('UPDATE public.clothes SET removed_at=now();');
  await reader(friend);
  assert.ok(!(await visible()).includes('friends'));
  await reader(owner);
  assert.ok((await visible()).includes('friends'));
});

test('a different active manifest cannot expose earlier bindings', async () => {
  await enable();
  await db.query('UPDATE public.stylesnap_media_delivery_control SET manifest_sha=$1', ['b'.repeat(64)]);
  await reader(owner);
  assert.deepEqual(await visible(), []);
});

for (const operation of ['', 'object.list', 'object.sign', 'object.upload', 'object.delete']) {
  test(`storage operation ${operation || '(absent)'} cannot use download access`, async () => {
    await enable();
    await reader(owner, operation);
    assert.deepEqual(await visible(), []);
  });
}

test('authenticated object info accepts the provider operation prefix', async () => {
  await enable();
  await reader(owner, 'storage.object.get_authenticated_info');
  assert.ok((await visible()).includes('private'));
});

test('manifests, checkpoints, unbound content and other buckets remain inaccessible', async () => {
  await enable();
  for (const path of [`manifests/${manifest}.json.gz`, `checkpoints/${manifest}.json.gz`, `sha256/ff/${'f'.repeat(64)}`]) {
    await db.query('INSERT INTO storage.objects VALUES ($1,$2)', [bucket, path]);
  }
  await db.query('INSERT INTO storage.objects VALUES ($1,$2)', ['another-bucket', assets[0].path]);
  await reader(owner);
  assert.equal((await visible()).length, 9);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM storage.objects WHERE bucket_id<>$1', [bucket])).rows[0].total, 0);
});

test('deduplicated bytes need at least one currently visible source binding', async () => {
  await enable();
  const shared = { ...assets.find(asset => asset.label === 'catalog-public'), ...Object.fromEntries(['sha', 'path'].map(key => [key, assets[0][key]])) };
  await db.exec('DELETE FROM public.stylesnap_media_bindings WHERE source_table=\'catalog_items\';');
  await bind(shared);
  await reader(outsider);
  assert.ok((await visible()).includes('private'));
  await db.exec('RESET ROLE; UPDATE public.catalog_items SET is_active=false;');
  await reader(outsider);
  assert.ok(!(await visible()).includes('private'));
});

for (const user of [owner, null]) {
  test(`${user ? 'authenticated' : 'anonymous'} clients cannot write bindings or enable delivery`, async () => {
    await reader(user);
    await assert.rejects(() => db.exec('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true;'), /permission denied/);
    await assert.rejects(() => db.exec('DELETE FROM public.stylesnap_media_bindings;'), /permission denied/);
    await assert.rejects(() => bind({ ...assets[0], id: uuid(999) }), /permission denied/);
    await assert.rejects(() => db.exec('UPDATE public.stylesnap_media_bindings SET source_url=\'forged\';'), /permission denied/);
  });
}

test('enabling delivery requires an existing private bucket and manifest identity', async () => {
  await db.exec(`UPDATE storage.buckets SET public=true;`);
  await assert.rejects(enable, /private_media_bucket_required/);
  await db.exec('DELETE FROM storage.buckets;');
  await assert.rejects(enable, /private_media_bucket_required/);
  await db.query('INSERT INTO storage.buckets VALUES ($1,false)', [bucket]);
  await db.exec('UPDATE public.stylesnap_media_delivery_control SET manifest_sha=NULL;');
  await assert.rejects(enable, /check constraint/);
});

test('bindings reject mismatched hashes, provenance paths and unsupported source columns', async () => {
  await assert.rejects(() => bind({ ...assets[0], id: uuid(999), path: `manifests/${manifest}.json.gz` }), /check constraint/);
  await assert.rejects(() => bind({ ...assets[0], id: uuid(999), sha: 'f'.repeat(64) }), /check constraint/);
  await assert.rejects(() => bind({ ...assets[0], id: uuid(999), column: 'owner_id' }), /check constraint/);
});

test('service role can inspect retained mappings while delivery stays disabled', async () => {
  await db.exec('SET ROLE service_role;');
  assert.equal((await visible('public.stylesnap_media_bindings')).length, assets.length);
  await db.exec('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true;');
  assert.equal((await db.query('SELECT reads_enabled FROM public.stylesnap_media_delivery_control')).rows[0].reads_enabled, true);
});
