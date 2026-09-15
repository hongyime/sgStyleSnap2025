import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const hash = value => createHash('sha256').update(value).digest('hex')
const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12,'0')}`
const actor = uuid(1), request = uuid(2), worker = uuid(3), other = uuid(4)
const manifest = 'a'.repeat(64), checkpoint = 'b'.repeat(64), plan = 'c'.repeat(64)
const descriptor = (name, bytes) => ({sha256:hash(name),bytes,mime_type:'image/png',file_name:`${name}.png`})
const incoming = () => ({intent:{mode:'create',fields:{name:'Jacket',category:'outerwear',privacy:'private'}},
  original:descriptor('original',50),processed:descriptor('processed',25),thumbnail:descriptor('thumbnail',12)})
let db
before(async () => {
  db = new PGlite()
  for (const fixture of ['stylesnap-media-access.sql','stylesnap-upload-schema.sql']) {
    await db.exec(await readFile(new URL(`./fixtures/${fixture}`,import.meta.url),'utf8'))
  }
  for (const migration of ['20260914045924_private_media_archive_control.sql','20260914134525_private_media_delivery.sql',
    '20260915021000_private_media_binding_publication.sql','20260915021427_private_media_binding_versions.sql',
    '20260915043300_private_media_upload_receipts.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`,import.meta.url),'utf8'))
  }
})
after(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    SELECT set_config('request.jwt.claim.sub','',false),set_config('storage.operation','',false);
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false,manifest_sha=NULL;
    TRUNCATE stylesnap_archive.upload_receipts,stylesnap_archive.binding_members,stylesnap_archive.binding_publications,
      stylesnap_archive.binding_versions,public.stylesnap_media_bindings,stylesnap_archive.reservations,
      storage.objects,storage.buckets,public.clothes,public.catalog_items,public.users CASCADE;
    UPDATE stylesnap_archive.control SET writes_enabled=true,manifest_sha='${manifest}',checkpoint_sha='${checkpoint}',
      manifest_retained=true,headroom_verified_at=now(),egress_verified_at=now(),other_organization_storage_bytes=0,
      approved_egress_bytes=4000000000,max_database_bytes=450000000,max_storage_bytes=800000000,checkpoint_pool_remaining=0;
    UPDATE stylesnap_archive.upload_control SET uploads_enabled=true,catalog_policy='opt_in';
    INSERT INTO stylesnap_archive.binding_publications(plan_sha,manifest_sha,copy_checkpoint_sha,expected_batches,expected_count,complete)
      VALUES('${plan}','${manifest}','${checkpoint}','[]',0,true);
    INSERT INTO storage.buckets VALUES('stylesnap-media-archive',false);
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha='${manifest}';
    INSERT INTO public.users(id) VALUES('${actor}'),('${other}');`)
})

async function store(data=incoming(),extra={}) {
  const prepared=await call('prepare',{request:data,...extra})
  await addObjects(prepared,data)
  await call('verified',{request:data,...extra})
  return prepared
}

test('invalid constrained fields cannot reserve retained storage',async()=>{
  for(const [field,value] of [['category','invalid'],['clothing_type','invalid'],['primary_color','invalid']]) {
    const data=incoming();data.intent.fields[field]=value
    await assert.rejects(call('prepare',{request:data}),/invalid_upload_fields/)
    assert.equal(await count('stylesnap_archive.upload_receipts'),0)
    assert.equal(await count('stylesnap_archive.reservations'),0)
  }
  const oversized=incoming();oversized.original.bytes=4194305
  await assert.rejects(call('prepare',{request:oversized}),/invalid_upload_descriptor/)
  assert.equal(await count('stylesnap_archive.reservations'),0)
})

test('a catalog policy change refuses new reservations and pending publication',async()=>{
  const data=incoming();data.intent.catalog_policy='legacy'
  await assert.rejects(call('prepare',{request:data}),/upload_catalog_policy_changed/)
  assert.equal(await count('stylesnap_archive.reservations'),0)
  data.intent.catalog_policy='opt_in'
  await store(data)
  await db.exec("UPDATE stylesnap_archive.upload_control SET catalog_policy='legacy'")
  await assert.rejects(call('publish',{request:data}),/upload_catalog_policy_changed/)
  assert.equal(await count('public.clothes'),0)
  assert.equal((await rows('stylesnap_archive.upload_receipts'))[0].state,'stored')
  assert.equal(await count('storage.objects'),3)
})

test('source row, processed mappings and receipt publish atomically while original bytes remain private',async () => {
  await store()
  const published=await call('publish')
  assert.equal(published.state,'published')
  assert.equal(published.receipt.item.name,'Jacket')
  assert.equal(published.receipt.item.owner_id,actor)
  assert.match(published.receipt.item.image_url,/^stylesnap-private:\/\//)
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('public.catalog_items'),0)
  assert.equal(await count('public.stylesnap_media_bindings'),2)
  assert.equal(await count('stylesnap_archive.binding_versions'),2)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('storage.operation','object.get_authenticated',false)",[actor])
  const visible=await asRole('authenticated',()=>rows('storage.objects'))
  assert.equal(visible.length,2)
  assert.ok(visible.every(row=>row.name.startsWith('sha256/')))
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other])
  assert.equal((await asRole('authenticated',()=>rows('storage.objects'))).length,0)
  assert.equal((await asRole('anon',()=>rows('storage.objects'))).length,0)
  assert.equal((await rows('storage.objects')).length,3)
})

test('each catalog policy controls only new contributions and never binds original files',async () => {
  const cases=[['opt_in','private',false,0],['opt_in','private',true,1],
    ['public_only','private',true,0],['public_only','public',false,1],['legacy','private',false,1]]
  let expected=0
  for (let index=0;index<cases.length;index++) {
    const [policy,privacy,consent,added]=cases[index]
    await db.query('UPDATE stylesnap_archive.upload_control SET catalog_policy=$1',[policy])
    const data=incoming();data.intent.fields.privacy=privacy;data.intent.catalog_consent=consent
    const extra={request_id:uuid(100+index)}
    await store(data,extra)
    const result=await call('publish',{request:data,...extra})
    expected+=added
    assert.equal(await count('public.catalog_items'),expected)
    assert.equal(Boolean(result.receipt.catalog_item_id),Boolean(added))
    if (added) {
      const catalog=(await db.query('SELECT * FROM public.catalog_items WHERE id=$1',[result.receipt.catalog_item_id])).rows[0]
      assert.equal(catalog.image_url,result.receipt.item.image_url)
      assert.equal(catalog.privacy,'public')
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.stylesnap_media_bindings WHERE source_table='catalog_items' AND source_id=$1",[catalog.id])).rows[0].n,2)
    }
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.stylesnap_media_bindings WHERE object_path LIKE 'originals/%'")).rows[0].n,0)
})

test('replacement retains prior source and both binding versions without changing initial import receipts',async () => {
  await store();const original=await call('publish')
  const retained=(await rows('stylesnap_archive.binding_versions')).map(row=>row.version_sha).sort()
  const oldReceipt=(await rows('stylesnap_archive.upload_receipts'))[0]
  const data=incoming();data.intent={mode:'update',source_id:original.receipt.item.id,fields:{name:'Updated',brand:'New brand'}}
  data.original=descriptor('new-original',55);data.processed=descriptor('new-processed',28);data.thumbnail=descriptor('new-thumbnail',15)
  const extra={request_id:uuid(200)}
  await store(data,extra)
  const result=await call('publish',{request:data,...extra})
  assert.equal(result.receipt.item.id,original.receipt.item.id)
  assert.equal(result.receipt.item.name,'Updated')
  assert.equal(result.receipt.item.privacy,'private')
  assert.equal(result.receipt.item.brand,'New brand')
  assert.notEqual(result.receipt.item.image_url,original.receipt.item.image_url)
  const operations=await rows('stylesnap_archive.upload_receipts')
  assert.deepEqual(operations.find(row=>row.request_id===request),oldReceipt)
  assert.equal(operations.find(row=>row.request_id===extra.request_id).prior_source.image_url,original.receipt.item.image_url)
  assert.equal(await count('stylesnap_archive.binding_versions'),4)
  assert.equal(await count('public.stylesnap_media_bindings'),2)
  assert.ok((await rows('stylesnap_archive.binding_versions')).filter(row=>retained.includes(row.version_sha)).length===2)
  assert.equal((await rows('stylesnap_archive.binding_publications'))[0].expected_count,0)
  assert.equal((await rows('stylesnap_archive.binding_publications'))[0].complete,true)
})

test('a concurrent source edit prevents publication and preserves the uploaded bytes and old receipt',async () => {
  await store();const original=await call('publish')
  const data=incoming();data.intent={mode:'update',source_id:original.receipt.item.id,fields:{name:'Would overwrite'}}
  const extra={request_id:uuid(201)}
  await store(data,extra)
  await db.query("UPDATE public.clothes SET brand='Changed elsewhere' WHERE id=$1",[original.receipt.item.id])
  await assert.rejects(call('publish',{request:data,...extra}),/upload_source_changed/)
  assert.equal((await rows('public.clothes'))[0].brand,'Changed elsewhere')
  assert.equal((await rows('public.clothes'))[0].name,'Jacket')
  assert.equal((await rows('stylesnap_archive.upload_receipts')).find(row=>row.request_id===extra.request_id).state,'stored')
  assert.equal(await count('storage.objects'),3)
  assert.equal(await count('stylesnap_archive.binding_versions'),2)
})

test('failure during the second binding rolls back item, catalog, first binding, versions and receipt together',async () => {
  const data=incoming();data.intent.catalog_consent=true
  await store(data)
  await db.exec(`CREATE FUNCTION public.fail_upload_binding_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.source_column='thumbnail_url' THEN RAISE EXCEPTION 'synthetic_binding_failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_upload_binding_test BEFORE INSERT ON public.stylesnap_media_bindings FOR EACH ROW EXECUTE FUNCTION public.fail_upload_binding_test();`)
  try {
    await assert.rejects(call('publish',{request:data}),/synthetic_binding_failure/)
    for (const table of ['public.clothes','public.catalog_items','public.stylesnap_media_bindings','stylesnap_archive.binding_versions']) assert.equal(await count(table),0)
    assert.equal((await rows('stylesnap_archive.upload_receipts'))[0].state,'stored')
    assert.equal((await rows('stylesnap_archive.upload_receipts'))[0].receipt,null)
    assert.equal(await count('storage.objects'),3)
  } finally {
    await db.exec('DROP TRIGGER fail_upload_binding_test ON public.stylesnap_media_bindings; DROP FUNCTION public.fail_upload_binding_test();')
  }
  assert.equal((await call('publish',{request:data})).state,'published')
})

test('published receipt replay works after uploads are disabled without creating any new budget or data',async () => {
  await store();const first=await call('publish')
  const reservations=await rows('stylesnap_archive.reservations')
  await db.exec("UPDATE stylesnap_archive.upload_control SET uploads_enabled=false; UPDATE stylesnap_archive.control SET headroom_verified_at=NULL")
  assert.deepEqual(await call('prepare'),first)
  assert.deepEqual(await call('publish'),first)
  assert.deepEqual(await call('inspect'),first)
  assert.deepEqual(await rows('stylesnap_archive.reservations'),reservations)
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('stylesnap_archive.binding_versions'),2)
})

test('quota reservations include unpublished creations and existing legacy quota still applies',async () => {
  for (let index=0;index<49;index++) await db.query(
    "INSERT INTO public.clothes(owner_id,name,category,image_url) VALUES($1,'Retained item','top','https://old.example/image.png')",[actor])
  await store()
  await assert.rejects(call('prepare',{request_id:uuid(210)}),/item_upload_quota/)
  assert.equal((await call('publish')).state,'published')
  assert.equal(await count('public.clothes'),50)
  await assert.rejects(db.query("INSERT INTO public.clothes(owner_id,name,category,image_url) VALUES($1,'Extra item','top','https://old.example/extra.png')",[actor]),/Item upload quota exceeded/)
})

test('invalid source fields and fabricated pointers fail before any reservation',async () => {
  for (const field of ['owner_id','id','image_url','thumbnail_url','catalog_item_id','removed_at','constructor']) {
    const data=incoming();data.intent.fields[field]=actor
    await assert.rejects(call('prepare',{request:data}),/invalid_upload_fields/)
    assert.equal(await count('stylesnap_archive.upload_receipts'),0)
  }
  const data=incoming();data.intent.fields.name=null
  await assert.rejects(call('prepare',{request:data}),/invalid_upload_name/)
  assert.equal(await count('stylesnap_archive.reservations'),0)
})

test('category mapping is retained and missing original objects stop the final commit',async () => {
  const data=incoming();data.intent.fields.category=null;data.intent.fields.clothing_type='Pants'
  const prepared=await store(data)
  await db.query('DELETE FROM storage.objects WHERE name=$1',[prepared.original_path])
  await assert.rejects(call('publish',{request:data}),/verified_upload_object_missing/)
  assert.equal(await count('public.clothes'),0)
  await addObjects(prepared,data)
  assert.equal((await call('publish',{request:data})).receipt.item.category,'bottom')
})
async function asRole(name, action) {
  await db.exec(`SET ROLE ${name}`)
  try { return await action() } finally { await db.exec('RESET ROLE') }
}
const call = (action, extra={}, role='service_role') => asRole(role, async () =>
  (await db.query('SELECT public.stylesnap_media_upload($1,$2) AS result',
    [action,{owner_id:actor,request_id:request,worker_id:worker,request:incoming(),...extra}])).rows[0].result)
const rows = table => db.query(`SELECT * FROM ${table}`).then(r=>r.rows)
const count = table => rows(table).then(r=>r.length)
async function addObjects(prepared, data=incoming()) {
  for (const part of ['original','processed','thumbnail']) await db.query(
    'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    ['stylesnap-media-archive',prepared[`${part}_path`],{size:data[part].bytes}])
}

test('trusted reserve keeps the original private, retains descriptors and charges all three files before any object exists',async () => {
  const result = await call('prepare')
  assert.equal(result.state,'reserved')
  assert.equal(result.attempt,1)
  assert.equal(result.original_path,`originals/${actor}/${incoming().original.sha256}`)
  assert.equal(await count('storage.objects'),0)
  assert.equal(await count('public.clothes'),0)
  const saved = (await rows('stylesnap_archive.upload_receipts'))[0]
  assert.deepEqual(saved.request_payload,incoming())
  const reservations = await rows('stylesnap_archive.reservations')
  assert.equal(reservations.filter(r=>r.kind==='storage').reduce((n,r)=>n+Number(r.maximum_bytes),0),87)
  assert.equal(reservations.filter(r=>r.kind==='egress').length,1)
})

test('exact retry by the current worker reuses reservations and source identity',async () => {
  const first = await call('prepare')
  assert.deepEqual(await call('prepare'),first)
  assert.equal(await count('stylesnap_archive.reservations'),4)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('another worker cannot race a live upload; an expired lease keeps uncertain storage charged',async () => {
  const first = await call('prepare')
  await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)', ['stylesnap-media-archive',first.original_path,{size:50}])
  await assert.rejects(call('prepare',{worker_id:uuid(5)}),/upload_in_progress/)
  await db.exec("UPDATE stylesnap_archive.upload_receipts SET lease_expires_at=now()-interval '1 second'")
  const resumed = await call('prepare',{worker_id:uuid(5)})
  assert.equal(resumed.source_id,first.source_id)
  assert.equal(resumed.attempt,2)
  assert.equal((await rows('stylesnap_archive.reservations')).filter(r=>r.kind==='storage'&&!r.settled).length,3)
  assert.equal(await count('storage.objects'),1)
  await assert.rejects(call('verified'),/upload_lease_lost/)
})

test('request ids cannot change bytes, metadata or owner identity',async () => {
  await call('prepare')
  for (const edit of [p=>{p.original.sha256=hash('changed')},p=>{p.intent.fields.privacy='public'},p=>{p.thumbnail.bytes=13}]) {
    const requestPayload = incoming(); edit(requestPayload)
    await assert.rejects(call('prepare',{request:requestPayload}),/upload_request_conflict/)
  }
  assert.deepEqual(await call('inspect',{owner_id:other}),{state:'missing'})
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('ordinary and anonymous callers cannot reserve, inspect or manufacture trusted state under observed public defaults',async () => {
  for (const role of ['anon','authenticated']) {
    await assert.rejects(call('prepare',{},role),/permission denied/)
    await assert.rejects(call('inspect',{},role),/permission denied/)
    await assert.rejects(asRole(role,()=>rows('stylesnap_archive.upload_receipts')),/permission denied/)
  }
  await call('prepare')
  await assert.rejects(asRole('service_role',()=>db.exec("UPDATE stylesnap_archive.upload_receipts SET request_sha=repeat('f',64)")),/permission denied/)
  await assert.rejects(asRole('service_role',()=>db.exec('DELETE FROM stylesnap_archive.upload_receipts')),/permission denied/)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('verified state requires all private objects and exact sizes, then settles reservations without publishing source rows',async () => {
  const prepared = await call('prepare')
  await assert.rejects(call('verified'),/verified_upload_object_missing/)
  await addObjects(prepared)
  await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2',[{size:13},prepared.thumbnail_path])
  await assert.rejects(call('verified'),/verified_upload_object_missing/)
  assert.equal((await rows('stylesnap_archive.reservations')).filter(r=>r.settled).length,0)
  await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2',[{size:12},prepared.thumbnail_path])
  assert.equal((await call('verified')).state,'stored')
  assert.equal((await rows('stylesnap_archive.reservations')).filter(r=>r.kind==='storage'&&r.settled).length,3)
  assert.equal(await count('public.clothes'),0)
  assert.equal(await count('public.stylesnap_media_bindings'),0)
})

test('global capacity includes other organization storage, migration reservations and checkpoint pool',async () => {
  await db.exec('UPDATE stylesnap_archive.control SET max_storage_bytes=100,other_organization_storage_bytes=10,checkpoint_pool_remaining=4')
  await assert.rejects(call('prepare'),/storage_capacity_limit/)
  assert.equal(await count('stylesnap_archive.upload_receipts'),0)
  assert.equal(await count('stylesnap_archive.reservations'),0)
  await db.exec('UPDATE stylesnap_archive.control SET checkpoint_pool_remaining=3')
  assert.equal((await call('prepare')).state,'reserved')
  await assert.rejects(call('prepare',{request_id:uuid(10)}),/storage_capacity_limit/)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('unknown Storage sizes fail closed and retain previously reserved uploads',async () => {
  await call('prepare')
  await db.query('INSERT INTO storage.objects VALUES($1,$2,$3)',['another-project','unknown',{}])
  await assert.rejects(call('prepare',{request_id:uuid(10)}),/storage_size_metadata_missing/)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
  assert.equal(await count('stylesnap_archive.reservations'),4)
})

test('disabled migration, delivery, stale headroom and egress limits stop uploads before new reservations',async () => {
  const cases = [
    ['UPDATE stylesnap_archive.upload_control SET uploads_enabled=false',/media_uploads_disabled/],
    ['UPDATE stylesnap_archive.control SET writes_enabled=false',/archive_writes_disabled/],
    ["UPDATE stylesnap_archive.control SET headroom_verified_at=now()-interval '2 hours'",/storage_headroom_unverified/],
    ["UPDATE stylesnap_archive.control SET egress_verified_at=now()-interval '2 hours'",/egress_headroom_unverified/],
    ['UPDATE stylesnap_archive.control SET approved_egress_bytes=1',/egress_capacity_limit/],
    ['UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false',/verified_private_delivery_required/],
  ]
  for (const [sql,error] of cases) {
    await db.exec(sql)
    await assert.rejects(call('prepare'),error)
    await db.exec(`UPDATE stylesnap_archive.upload_control SET uploads_enabled=true;
      UPDATE stylesnap_archive.control SET writes_enabled=true,headroom_verified_at=now(),egress_verified_at=now(),approved_egress_bytes=4000000000;
      UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true;`)
    assert.equal(await count('stylesnap_archive.upload_receipts'),0)
  }
})

test('retry attempt limits retain uncertain objects and all their reservations',async () => {
  await call('prepare')
  for (let i=2;i<=3;i++) {
    await db.exec("UPDATE stylesnap_archive.upload_receipts SET lease_expires_at=now()-interval '1 second'")
    assert.equal((await call('prepare',{worker_id:uuid(20+i)})).attempt,i)
  }
  await db.exec("UPDATE stylesnap_archive.upload_receipts SET lease_expires_at=now()-interval '1 second'")
  await assert.rejects(call('prepare',{worker_id:uuid(24)}),/upload_retry_limit/)
  assert.equal((await rows('stylesnap_archive.reservations')).filter(r=>r.kind==='egress').length,3)
  assert.equal((await rows('stylesnap_archive.reservations')).filter(r=>r.kind==='storage').length,3)
})

test('pending requests are bounded and missing or removed owners cannot upload',async () => {
  for (let i=0;i<5;i++) await call('prepare',{request_id:uuid(30+i)})
  await assert.rejects(call('prepare',{request_id:uuid(40)}),/pending_upload_limit/)
  await assert.rejects(call('prepare',{owner_id:uuid(99)}),/upload_owner_unavailable/)
  await db.query('UPDATE public.users SET removed_at=now() WHERE id=$1',[other])
  await assert.rejects(call('prepare',{owner_id:other}),/upload_owner_unavailable/)
  assert.equal(await count('stylesnap_archive.upload_receipts'),5)
})

test('replacement requests preserve the complete prior row and reject other owners',async () => {
  await db.query("INSERT INTO public.clothes(id,owner_id,name,category,privacy,image_url,brand) VALUES($1,$2,'Original','top','private','https://old.example/image.png','Old brand')",[uuid(50),actor])
  const data = incoming(); data.intent.mode='update'; data.intent.source_id=uuid(50)
  const before = (await rows('public.clothes'))[0]
  await assert.rejects(call('prepare',{owner_id:other,request:data}),/upload_source_unavailable/)
  const prepared = await call('prepare',{request:data})
  const retained = (await rows('stylesnap_archive.upload_receipts'))[0]
  assert.equal(prepared.source_id,uuid(50))
  assert.equal(retained.prior_source.name,before.name)
  assert.equal(retained.prior_source.brand,before.brand)
  assert.equal(retained.prior_source.image_url,before.image_url)
  assert.deepEqual((await rows('public.clothes'))[0],before)
})
