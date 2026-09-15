import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { beforeEach, afterEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const manifest = 'a'.repeat(64), checkpoint = 'b'.repeat(64), plan = 'c'.repeat(64)
const owner = '00000000-0000-4000-8000-000000000001'
const lease = '00000000-0000-4000-8000-000000000002'
const item = '00000000-0000-4000-8000-000000000003'
const bucket = 'stylesnap-media-archive'
const hash = value => createHash('sha256').update(value).digest('hex')
const migration = await readFile(new URL('../../supabase/migrations/20260915021427_private_media_binding_versions.sql', import.meta.url), 'utf8')
const original = {
  source_table: 'clothes', source_id: item, source_column: 'image_url',
  source_url: 'https://fixtures.example.invalid/original.png', manifest_sha: manifest,
  content_sha256: hash('original'), object_path: `sha256/${hash('original').slice(0, 2)}/${hash('original')}`,
  content_bytes: 32, mime_type: 'image/png',
}
const replacement = { ...original, source_url: 'https://fixtures.example.invalid/replacement.png',
  content_sha256: hash('replacement'), object_path: `sha256/${hash('replacement').slice(0, 2)}/${hash('replacement')}` }
let db, beforeMigration
async function role(name, fn) {
  await db.exec(`SET ROLE ${name}`)
  try { return await fn() } finally { await db.exec('RESET ROLE') }
}
async function call(action, extra = {}) {
  return role('service_role', async () => (await db.query('SELECT public.stylesnap_publish_media_bindings($1,$2) AS result',
    [action, { owner: lease, plan_sha: plan, manifest_sha: manifest, copy_checkpoint_sha: checkpoint, ...extra }])).rows[0].result)
}
async function initialize(apply = true) {
  db = new PGlite()
  await db.exec(await readFile(new URL('./fixtures/stylesnap-media-access.sql', import.meta.url), 'utf8'))
  await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
    GRANT SELECT ON public.clothes,public.catalog_items,public.users,public.outfit_collections,public.outfit_history TO service_role;`)
  for (const name of ['20260914045924_private_media_archive_control.sql', '20260914134525_private_media_delivery.sql', '20260915021000_private_media_binding_publication.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  await db.exec(`UPDATE stylesnap_archive.control SET writes_enabled=true,manifest_sha='${manifest}',checkpoint_sha='${checkpoint}',
    manifest_retained=true,lease_owner='${lease}',lease_expires_at=now()+interval '5 minutes',headroom_verified_at=now(),
    egress_verified_at=now(),other_organization_storage_bytes=0,approved_egress_bytes=4000000000,
    plan_sha=repeat('e',64),checkpoint_pool_remaining=0;`)
  await db.query('INSERT INTO storage.buckets VALUES($1,false)', [bucket])
  for (const row of [original, replacement]) {
    await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)', [bucket, row.object_path, { size: row.content_bytes }])
  }
  await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)', [bucket, `manifests/${plan}.json.gz`, { size: 100 }])
  await db.query(`INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes,object_path,settled)
    VALUES('storage',$1,$2,100,$3,true)`, ['d'.repeat(64), manifest, `manifests/${plan}.json.gz`])
  await db.query("INSERT INTO public.clothes(id,owner_id,privacy,image_url) VALUES($1,$2,'private',$3)", [item, owner, original.source_url])
  const wire = JSON.stringify([original])
  await call('start', { expected_batches: [{ sha256: hash(wire), count: 1 }], expected_count: 1 })
  await call('append', { batch_index: 0, rows_json: wire })
  await call('finish')
  beforeMigration = {
    binding: (await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows,
    publication: (await db.query('SELECT * FROM stylesnap_archive.binding_publications')).rows,
    delivery: (await db.query('SELECT * FROM public.stylesnap_media_delivery_control')).rows,
  }
  if (apply && process.env.STYLESNAP_VERSION_BASELINE !== '1') await db.exec(migration)
}
beforeEach(async () => { await initialize() })
afterEach(async () => { await db?.close() })
async function versions() {
  return (await db.query('SELECT source_url,content_sha256,version_sha FROM stylesnap_archive.binding_versions ORDER BY version_sha')).rows
}
async function replace(row = replacement) {
  // Future trusted upload publication must wrap these writes and its receipt in
  // one transaction. No new production UPDATE grant is introduced by this patch.
  await db.query(`UPDATE public.stylesnap_media_bindings SET source_url=$1,content_sha256=$2,object_path=$3,
    content_bytes=$4,mime_type=$5 WHERE source_id=$6`,
  [row.source_url, row.content_sha256, row.object_path, row.content_bytes, row.mime_type, row.source_id])
  await db.query('UPDATE public.clothes SET image_url=$1 WHERE id=$2', [row.source_url, row.source_id])
}
const activate = () => role('service_role', () => db.query('UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha=$1', [manifest]))
async function addActive() {
  const row = { ...replacement, source_id: '00000000-0000-4000-8000-000000000004' }
  await db.query("INSERT INTO public.clothes(id,owner_id,privacy,image_url) VALUES($1,$2,'private',$3)", [row.source_id, owner, row.source_url])
  await role('service_role', () => db.query('INSERT INTO public.stylesnap_media_bindings SELECT * FROM jsonb_populate_record(NULL::public.stylesnap_media_bindings,$1)', [row]))
  return row
}

test('backfill preserves all original mapping fields, publication receipts and disabled delivery', async () => {
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows, beforeMigration.binding)
  assert.deepEqual((await db.query('SELECT * FROM stylesnap_archive.binding_publications')).rows, beforeMigration.publication)
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_delivery_control')).rows, beforeMigration.delivery)
  const retained = (await db.query('SELECT to_jsonb(version)-\'version_sha\'-\'retained_at\' AS binding FROM stylesnap_archive.binding_versions version')).rows
  assert.deepEqual(retained, [{ binding: original }])
  assert.equal((await db.query('SELECT binding_version_sha FROM stylesnap_archive.binding_members')).rows[0].binding_version_sha, (await versions())[0].version_sha)
})

test('replacement preserves the old version while the unchanged reader sees only the current permitted object', async () => {
  await replace()
  assert.equal((await versions()).length, 2)
  await activate()
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
  await db.exec("SELECT set_config('storage.operation','object.get_authenticated',false)")
  await role('authenticated', async () => {
    assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings WHERE source_id=$1 AND source_url=$2', [item, replacement.source_url])).rows, [replacement])
    assert.equal((await db.query('SELECT * FROM public.stylesnap_media_bindings WHERE source_url=$1', [original.source_url])).rows.length, 0)
    assert.deepEqual((await db.query('SELECT name FROM storage.objects')).rows, [{ name: replacement.object_path }])
    await assert.rejects(() => db.query('SELECT * FROM stylesnap_archive.binding_versions'), /permission denied/)
  })
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", ['00000000-0000-4000-8000-000000000099'])
  await role('authenticated', async () => { assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length, 0) })
})

test('same source URL with different bytes is retained as a distinct immutable version', async () => {
  await replace({ ...replacement, source_url: original.source_url })
  const retained = await versions()
  assert.equal(retained.length, 2)
  assert.equal(new Set(retained.map(v => v.version_sha)).size, 2)
  assert.deepEqual(new Set(retained.map(v => v.content_sha256)), new Set([original.content_sha256, replacement.content_sha256]))
})

test('exact retries and restoring an original mapping retain two versions without duplicate history', async () => {
  const initial = (await versions())[0].version_sha
  await replace(); await replace(); await replace(original)
  assert.equal((await versions()).length, 2)
  assert.equal((await db.query('SELECT binding_version_sha FROM stylesnap_archive.binding_members')).rows[0].binding_version_sha, initial)
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows, [original])
})

test('added active records do not invalidate the retained initial plan or its replayed finish', async () => {
  await addActive()
  await replace()
  assert.deepEqual(await call('finish'), { next_batch: 1, published_count: 1, complete: true })
  await activate()
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.stylesnap_media_bindings')).rows[0].n, 2)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM stylesnap_archive.binding_members')).rows[0].n, 1)
})

test('additional records cannot hide a missing original plan member', async () => {
  await addActive()
  await db.exec('DELETE FROM stylesnap_archive.binding_members')
  await assert.rejects(() => call('finish'), /binding_publication_incomplete/)
  await assert.rejects(activate, /complete_binding_publication_required/)
})

test('private history alone cannot enable an initial field whose active mapping is missing', async () => {
  await db.query('DELETE FROM public.stylesnap_media_bindings WHERE source_id=$1', [item])
  assert.equal((await versions()).length, 1)
  await assert.rejects(activate, /complete_binding_publication_required/)
})

test('a failed publication transaction rolls back source, active mapping and new history together', async () => {
  await db.exec('BEGIN')
  try {
    await replace()
    await assert.rejects(() => db.exec("DO $$ BEGIN RAISE EXCEPTION 'synthetic_receipt_failure'; END $$"), /synthetic_receipt_failure/)
  } finally { await db.exec('ROLLBACK') }
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows, [original])
  assert.equal((await versions()).length, 1)
  assert.equal((await db.query('SELECT image_url FROM public.clothes WHERE id=$1', [item])).rows[0].image_url, original.source_url)
})

test('identity edits are rejected without creating orphan history', async () => {
  for (const [column, value] of [['source_id','00000000-0000-4000-8000-000000000088'], ['manifest_sha','f'.repeat(64)], ['source_column','thumbnail_url'], ['source_table','catalog_items']]) {
    await assert.rejects(() => db.query(`UPDATE public.stylesnap_media_bindings SET ${column}=$1`, [value]), /binding_identity_is_immutable/)
  }
  assert.equal((await versions()).length, 1)
})

test('a different field version cannot be supplied or substituted as an initial member', async () => {
  const other = await addActive()
  const otherVersion = (await db.query('SELECT version_sha FROM stylesnap_archive.binding_versions WHERE source_id=$1', [other.source_id])).rows[0].version_sha
  await db.exec('DELETE FROM stylesnap_archive.binding_members')
  await assert.rejects(() => role('service_role', () => db.query('INSERT INTO stylesnap_archive.binding_members VALUES($1,$2,$3,$4,$5)',
    [plan, original.source_table, item, original.source_column, otherVersion])), /binding_plan_version_mismatch/)
  await db.query('INSERT INTO stylesnap_archive.binding_members VALUES($1,$2,$3,$4)', [plan, original.source_table, item, original.source_column])
  await db.query('UPDATE stylesnap_archive.binding_members SET binding_version_sha=$1', [otherVersion])
  await assert.rejects(activate, /complete_binding_publication_required/)
})

for (const name of ['anon', 'authenticated']) {
  test(`${name} cannot read history, invoke its helpers or mutate current bindings`, async () => {
    await role(name, async () => {
      for (const sql of ['SELECT * FROM stylesnap_archive.binding_versions', 'DELETE FROM stylesnap_archive.binding_versions',
        'UPDATE public.stylesnap_media_bindings SET content_bytes=1', 'SELECT stylesnap_archive.binding_plan_is_retained(NULL,NULL,0)']) {
        await assert.rejects(() => db.exec(sql), /permission denied/)
      }
    })
  })
}

test('service role can append verified history but gains no update, delete, truncate or replacement grant', async () => {
  await addActive()
  await role('service_role', async () => {
    assert.equal((await db.query('SELECT count(*)::int AS n FROM stylesnap_archive.binding_versions')).rows[0].n, 2)
    for (const sql of ['UPDATE stylesnap_archive.binding_versions SET content_bytes=1', 'DELETE FROM stylesnap_archive.binding_versions',
      'TRUNCATE stylesnap_archive.binding_versions', 'UPDATE stylesnap_archive.binding_members SET binding_version_sha=NULL',
      'UPDATE public.stylesnap_media_bindings SET content_bytes=1']) {
      await assert.rejects(() => db.exec(sql), /permission denied/)
    }
  })
})

test('database capacity failure rejects a replacement without losing either current mapping or history', async () => {
  await db.exec('UPDATE stylesnap_archive.control SET max_database_bytes=1')
  await assert.rejects(() => replace(), /database_capacity_limit/)
  assert.equal((await versions()).length, 1)
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows, [original])
})

test('backfill refuses an orphaned member and rolls the whole migration back', async () => {
  await db.close(); await initialize(false)
  await db.query('UPDATE stylesnap_archive.binding_members SET source_id=$1', ['00000000-0000-4000-8000-000000000099'])
  const before = (await db.query('SELECT * FROM stylesnap_archive.binding_members')).rows
  await assert.rejects(() => db.exec(migration), error =>
    error.code === '23502' && error.message.includes('binding_version_sha'))
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT to_regclass('stylesnap_archive.binding_versions') AS relation")).rows[0].relation, null)
  assert.deepEqual((await db.query('SELECT * FROM stylesnap_archive.binding_members')).rows, before)
  assert.deepEqual((await db.query('SELECT * FROM public.stylesnap_media_bindings')).rows, beforeMigration.binding)
})

test('long Unicode URLs retain exact text without becoming oversized index keys', async () => {
  const url = 'https://fixtures.example.invalid/' + '衣'.repeat(3500)
  await replace({ ...replacement, source_url: url })
  assert.equal((await versions()).find(v => v.source_url === url).content_sha256, replacement.content_sha256)
  assert.equal((await db.query('SELECT source_url FROM public.stylesnap_media_bindings')).rows[0].source_url, url)
})
