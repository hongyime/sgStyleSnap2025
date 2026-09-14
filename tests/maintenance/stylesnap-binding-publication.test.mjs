import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const manifest = 'a'.repeat(64), checkpoint = 'b'.repeat(64), plan = 'c'.repeat(64)
const owner = '00000000-0000-4000-8000-000000000001'
const leaseOwner = '00000000-0000-4000-8000-000000000002'
const bucket = 'stylesnap-media-archive'
const sha = value => createHash('sha256').update(value).digest('hex')
const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const rows = Array.from({ length: 201 }, (_, i) => {
  const hash = sha(`synthetic image ${i}`)
  return { source_table: 'clothes', source_id: uuid(100 + i), source_column: 'image_url',
    source_url: `https://fixtures.example.invalid/image-${i}.png`, manifest_sha: manifest,
    content_sha256: hash, object_path: `sha256/${hash.slice(0, 2)}/${hash}`, content_bytes: 32, mime_type: 'image/png' }
})
let db
before(async () => {
  db = new PGlite()
  await db.exec(await readFile(new URL('./fixtures/stylesnap-media-access.sql', import.meta.url), 'utf8'))
  await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
    GRANT SELECT ON public.clothes,public.catalog_items,public.users,public.outfit_collections,public.outfit_history TO service_role;`)
  for (const name of ['20260914045924_private_media_archive_control.sql', '20260914134525_private_media_delivery.sql', '20260915021000_private_media_binding_publication.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
})
after(async () => { await db?.close() })

beforeEach(async () => {
  await db.exec(`RESET ROLE;
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false,manifest_sha=NULL;
    TRUNCATE public.stylesnap_media_bindings,stylesnap_archive.binding_members,stylesnap_archive.binding_publications,
      stylesnap_archive.reservations,storage.objects,storage.buckets,public.clothes,public.catalog_items,
      public.users,public.outfit_collections,public.outfit_history,public.friends;
    UPDATE stylesnap_archive.control SET writes_enabled=true,manifest_sha='${manifest}',checkpoint_sha='${checkpoint}',
      manifest_retained=true,lease_owner='${leaseOwner}',lease_expires_at=now()+interval '5 minutes',
      headroom_verified_at=now(),egress_verified_at=now(),other_organization_storage_bytes=0,
      approved_egress_bytes=4000000000,max_database_bytes=450000000,max_storage_bytes=800000000,
      plan_sha='${'e'.repeat(64)}',checkpoint_pool_remaining=0;`)
  await db.query('INSERT INTO storage.buckets VALUES($1,false)', [bucket])
  await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)', [bucket, `manifests/${plan}.json.gz`, { size: 100 }])
  await db.query(`INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes,object_path,settled)
    VALUES('storage',$1,$2,100,$3,true)`, ['d'.repeat(64), manifest, `manifests/${plan}.json.gz`])
  for (const row of rows) {
    await db.query('INSERT INTO public.clothes(id,owner_id,privacy,image_url) VALUES($1,$2,\'private\',$3)', [row.source_id, owner, row.source_url])
    await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)', [bucket, row.object_path, { size: row.content_bytes }])
  }
})

async function call(action, extra = {}, role = 'service_role') {
  await db.exec(`SET ROLE ${role};`)
  try {
    const result = await db.query('SELECT public.stylesnap_publish_media_bindings($1,$2) AS result', [action,
      { owner: leaseOwner, plan_sha: plan, manifest_sha: manifest, copy_checkpoint_sha: checkpoint, ...extra }])
    return result.rows[0].result
  } finally { await db.exec('RESET ROLE;') }
}
const expected = batches => batches.map(batch => ({ sha256: sha(JSON.stringify(batch)), count: batch.length }))
const start = batches => call('start', { expected_batches: expected(batches), expected_count: batches.reduce((sum, batch) => sum + batch.length, 0) })
const append = (index, batch) => call('append', { batch_index: index, rows_json: JSON.stringify(batch) })
async function counts() {
  return (await db.query(`SELECT
    (SELECT count(*)::int FROM public.stylesnap_media_bindings) AS bindings,
    (SELECT count(*)::int FROM stylesnap_archive.binding_members) AS members`)).rows[0]
}

test('all 201 fields publish in bounded batches, preserve source rows and enable RLS only after completion', async () => {
  const before = (await db.query('SELECT * FROM public.clothes ORDER BY id')).rows
  const batches = [rows.slice(0, 100), rows.slice(100, 200), rows.slice(200)]
  assert.deepEqual(await start(batches), { next_batch: 0, published_count: 0, complete: false })
  await assert.rejects(() => call('finish'), /binding_publication_incomplete/)
  await append(0, batches[0])
  await assert.rejects(() => db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha=$1', [manifest]), /complete_binding_publication_required/)
  await append(1, batches[1])
  await append(2, batches[2])
  assert.deepEqual(await call('finish'), { next_batch: 3, published_count: 201, complete: true })
  await db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha=$1', [manifest])
  assert.deepEqual((await db.query('SELECT * FROM public.clothes ORDER BY id')).rows, before)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
  await db.exec('SET ROLE authenticated;')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.stylesnap_media_bindings')).rows[0].n, 201)
  await db.exec('RESET ROLE;')
})

test('replaying start and an acknowledged or lost-response batch does not count or overwrite twice', async () => {
  const batch = rows.slice(0, 3)
  await start([batch])
  const result = await append(0, batch)
  assert.deepEqual(await append(0, batch), result)
  assert.deepEqual(await start([batch]), result)
  await call('finish')
  assert.deepEqual(await append(0, batch), { ...result, complete: true })
  assert.deepEqual(await counts(), { bindings: 3, members: 3 })
})

test('all seven supported source fields publish with exact identities across the five source tables', async () => {
  const url = rows[0].source_url
  await db.query('UPDATE public.clothes SET thumbnail_url=$1 WHERE id=$2', [url, rows[0].source_id])
  await db.query("INSERT INTO public.catalog_items VALUES($1,$2,$2,'public',true)", [uuid(500), url])
  await db.query('INSERT INTO public.users VALUES($1,$2,NULL)', [owner, url])
  await db.query("INSERT INTO public.outfit_collections VALUES($1,$2,'private',$3)", [uuid(501), owner, url])
  await db.query('INSERT INTO public.outfit_history VALUES($1,$2,$3)', [uuid(502), owner, url])
  const batch = [['clothes', rows[0].source_id, 'image_url'], ['clothes', rows[0].source_id, 'thumbnail_url'],
    ['catalog_items', uuid(500), 'image_url'], ['catalog_items', uuid(500), 'thumbnail_url'],
    ['users', owner, 'avatar_url'], ['outfit_collections', uuid(501), 'cover_image_url'], ['outfit_history', uuid(502), 'photo_url']]
    .map(([source_table, source_id, source_column]) => ({ ...rows[0], source_table, source_id, source_column }))
  await start([batch])
  await append(0, batch)
  assert.deepEqual(await call('finish'), { next_batch: 1, published_count: 7, complete: true })
  await db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha=$1', [manifest])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
  await db.exec('SET ROLE authenticated;')
  try { assert.equal((await db.query('SELECT count(*)::int AS n FROM public.stylesnap_media_bindings')).rows[0].n, 7) }
  finally { await db.exec('RESET ROLE;') }
})

test('a changed source late in the batch rolls back earlier inserts and progress', async () => {
  const batch = rows.slice(0, 3)
  await start([batch])
  await db.query('UPDATE public.clothes SET image_url=$1 WHERE id=$2', ['https://fixtures.example.invalid/new.png', batch[2].source_id])
  const before = (await db.query('SELECT * FROM public.clothes ORDER BY id')).rows
  await assert.rejects(() => append(0, batch), /binding_source_changed/)
  assert.deepEqual(await counts(), { bindings: 0, members: 0 })
  assert.deepEqual(await call('inspect'), { next_batch: 0, published_count: 0, complete: false })
  assert.deepEqual((await db.query('SELECT * FROM public.clothes ORDER BY id')).rows, before)
})

test('missing destination bytes and changed object size roll back the entire batch', async () => {
  const batch = rows.slice(0, 3)
  await start([batch])
  await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2', [{ size: 31 }, batch[2].object_path])
  await assert.rejects(() => append(0, batch), /binding_object_size_mismatch/)
  assert.deepEqual(await counts(), { bindings: 0, members: 0 })
})

test('batch wire hash, ordering and declared count are bound to the retained plan', async () => {
  const batches = [rows.slice(0, 2), rows.slice(2, 4)]
  await start(batches)
  await assert.rejects(() => append(1, batches[1]), /binding_batch_content_mismatch/)
  await assert.rejects(() => append(0, [...batches[0]].reverse()), /binding_batch_content_mismatch/)
  await assert.rejects(() => append(0, [{ ...batches[0][0], content_sha256: 'f'.repeat(64) }, batches[0][1]]), /binding_batch_content_mismatch/)
  await assert.rejects(() => call('start', { expected_batches: expected(batches), expected_count: 3 }), /binding_count_mismatch/)
  assert.deepEqual(await counts(), { bindings: 0, members: 0 })
})

test('duplicate source fields across plan batches cannot satisfy the completion count', async () => {
  await start([[rows[0]], [rows[0]]])
  await append(0, [rows[0]])
  await assert.rejects(() => append(1, [rows[0]]), /duplicate key/)
  assert.deepEqual(await counts(), { bindings: 1, members: 1 })
  await assert.rejects(() => call('finish'), /binding_publication_incomplete/)
})

test('a conflicting retained binding is never overwritten', async () => {
  await start([[rows[0]]])
  await db.query(`INSERT INTO public.stylesnap_media_bindings SELECT * FROM jsonb_populate_record(NULL::public.stylesnap_media_bindings,$1)`, [{ ...rows[0], mime_type: 'image/jpeg' }])
  await assert.rejects(() => append(0, [rows[0]]), /retained_binding_conflict/)
  assert.equal((await db.query('SELECT mime_type FROM public.stylesnap_media_bindings')).rows[0].mime_type, 'image/jpeg')
  assert.deepEqual(await counts(), { bindings: 1, members: 0 })
})

for (const [name, change, error] of [
  ['disabled writes', 'UPDATE stylesnap_archive.control SET writes_enabled=false', 'archive_writes_disabled'],
  ['stale lease', "UPDATE stylesnap_archive.control SET lease_expires_at=now()-interval '1 second'", 'lease_lost'],
  ['wrong owner', `UPDATE stylesnap_archive.control SET lease_owner='${owner}'`, 'lease_lost'],
  ['stale headroom', "UPDATE stylesnap_archive.control SET headroom_verified_at=now()-interval '2 hours'", 'storage_headroom_unverified'],
  ['missing monthly headroom', 'UPDATE stylesnap_archive.control SET approved_egress_bytes=NULL', 'egress_headroom_unverified'],
  ['changed checkpoint', `UPDATE stylesnap_archive.control SET checkpoint_sha='${'f'.repeat(64)}'`, 'binding_copy_checkpoint_changed'],
  ['public bucket', 'UPDATE storage.buckets SET public=true', 'private_media_bucket_required'],
  ['unretained plan', 'UPDATE stylesnap_archive.reservations SET settled=false', 'binding_plan_not_retained'],
  ['database allowance', 'UPDATE stylesnap_archive.control SET max_database_bytes=1', 'database_capacity_limit'],
]) {
  test(`${name} prevents publication`, async () => {
    await db.exec(change)
    await assert.rejects(() => start([[rows[0]]]), new RegExp(error))
    assert.deepEqual(await counts(), { bindings: 0, members: 0 })
  })
}

for (const role of ['anon', 'authenticated']) {
  test(`${role} cannot publish, inspect private provenance or activate media`, async () => {
    await assert.rejects(() => call('start', {}, role), /permission denied/)
    await db.exec(`SET ROLE ${role};`)
    try {
      await assert.rejects(() => db.query('SELECT * FROM stylesnap_archive.binding_publications'), /permission denied/)
      await assert.rejects(() => db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true'), /permission denied/)
    } finally { await db.exec('RESET ROLE;') }
  })
}

test('a 101-row or oversized serialized batch is rejected before writing', async () => {
  await start([rows.slice(0, 100)])
  await assert.rejects(() => append(0, rows.slice(0, 101)), /binding_batch_limit/)
  await assert.rejects(() => call('append', { batch_index: 0, rows_json: ' '.repeat(256001) }), /binding_batch_limit/)
  assert.deepEqual(await counts(), { bindings: 0, members: 0 })
})

test('changing the copy checkpoint invalidates even a completed activation gate', async () => {
  await start([[rows[0]]])
  await append(0, [rows[0]])
  await call('finish')
  await db.query('UPDATE stylesnap_archive.control SET checkpoint_sha=$1', ['f'.repeat(64)])
  await assert.rejects(() => db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha=$1', [manifest]), /complete_binding_publication_required/)
})

test('binding-plan bytes have their own durable reservation and use the existing settlement protocol', async () => {
  const operation = sha(`${manifest}:binding_plan:${plan}`)
  const reserve = () => call('reserve', { maximum_bytes: 100 })
  assert.deepEqual(await reserve(), { reserved: true })
  assert.deepEqual(await reserve(), { reserved: true })
  const pending = (await db.query("SELECT maximum_bytes,settled FROM stylesnap_archive.reservations WHERE kind='storage' AND operation_sha=$1", [operation])).rows
  assert.deepEqual(pending, [{ maximum_bytes: 100, settled: false }])
  await assert.rejects(() => call('reserve', { maximum_bytes: 101 }), /reservation_conflict/)
  await db.exec('SET ROLE service_role;')
  try {
    const receipt = (await db.query('SELECT public.stylesnap_archive_control($1,$2) AS result', ['settle_storage',
      { owner: leaseOwner, manifest_sha: manifest, operation_sha: operation, object_path: `manifests/${plan}.json.gz`, observed_bytes: 100 }])).rows[0].result
    assert.deepEqual(receipt, { settled: true })
  } finally { await db.exec('RESET ROLE;') }
  assert.deepEqual(await reserve(), { reserved: true })
  assert.equal((await db.query('SELECT checkpoint_pool_remaining FROM stylesnap_archive.control')).rows[0].checkpoint_pool_remaining, 0)
})

test('capacity includes stored objects, pending reservations, checkpoint pool and other organization projects', async () => {
  const stored = Number((await db.query("SELECT sum((metadata->>'size')::bigint) AS n FROM storage.objects")).rows[0].n)
  await db.query("INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes) VALUES('storage',$1,$2,200)", ['f'.repeat(64), manifest])
  await db.query('UPDATE stylesnap_archive.control SET checkpoint_pool_remaining=300,other_organization_storage_bytes=400,max_storage_bytes=$1', [stored + 200 + 300 + 400 + 99])
  await assert.rejects(() => call('reserve', { maximum_bytes: 100 }), /storage_capacity_limit/)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM stylesnap_archive.reservations')).rows[0].n, 2)
  await db.exec('UPDATE stylesnap_archive.control SET max_storage_bytes=max_storage_bytes+1')
  await call('reserve', { maximum_bytes: 100 })
  await assert.rejects(() => call('reserve', { maximum_bytes: 1, plan_sha: '9'.repeat(64) }), /storage_capacity_limit/)
})

test('unknown object sizes, absent archive plans and invalid plan sizes fail before reserving', async () => {
  for (const value of [null, 0, true, 8000001]) {
    await assert.rejects(() => call('reserve', { maximum_bytes: value }), /invalid_binding_plan_reservation/)
  }
  await db.exec('UPDATE stylesnap_archive.control SET plan_sha=NULL')
  await assert.rejects(() => call('reserve', { maximum_bytes: 100 }), /invalid_binding_plan_reservation/)
  await db.query('UPDATE stylesnap_archive.control SET plan_sha=$1', ['e'.repeat(64)])
  await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2', [{}, rows[0].object_path])
  await assert.rejects(() => call('reserve', { maximum_bytes: 100 }), /storage_size_metadata_missing/)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM stylesnap_archive.reservations')).rows[0].n, 1)
})
