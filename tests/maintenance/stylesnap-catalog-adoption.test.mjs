import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, beforeEach, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createCatalogAdoptionHandler } from '../../supabase/functions/private-catalog-adoption/handler.mjs'
import { createPrivateCatalogClient } from '../../src/lib/private-catalog-client.js'

const project='https://nztqjmknblelnzpeatyx.supabase.co'
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const catalog='00000000-0000-4000-8000-000000000003',second='00000000-0000-4000-8000-000000000004'
const manifest='a'.repeat(64),digest='d'.repeat(64),path='sha256/dd/'+digest
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
let db,calls,loseResponse
before(async()=>{
  db=new PGlite()
  for(const name of ['stylesnap-media-access.sql','stylesnap-upload-schema.sql']) await db.exec(await readFile(new URL('./fixtures/'+name,import.meta.url),'utf8'))
  for(const name of ['20260914045924_private_media_archive_control.sql','20260914134525_private_media_delivery.sql',
    '20260915021000_private_media_binding_publication.sql','20260915021427_private_media_binding_versions.sql',
    '20260915043300_private_media_upload_receipts.sql','20260915095918_private_catalog_adoption.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'))
  }
  assert.equal((await db.query('SELECT catalog_adoptions_enabled FROM stylesnap_archive.upload_control')).rows[0].catalog_adoptions_enabled,false)
})
after(async()=>{await db?.close()})
beforeEach(async()=>{
  calls=[];loseResponse=false
  await db.exec(await readFile(new URL('./fixtures/stylesnap-catalog-adoption-seed.sql',import.meta.url),'utf8'))
})
async function rpc(owner=actor,id=catalog,privacy='friends') {
  await db.exec('SET ROLE service_role')
  try{return (await db.query('SELECT public.stylesnap_adopt_catalog_item($1) AS value',[{owner_id:owner,catalog_item_id:id,privacy}])).rows[0].value}
  finally{await db.exec('RESET ROLE')}
}
async function count(table){return (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n}
async function provider(url,options={}) {
  assert.equal(options.redirect,'error');assert.ok(options.signal)
  assert.ok(url.startsWith(project+'/'));calls.push({url,method:options.method||'GET'})
  if(url===project+'/auth/v1/user')return options.headers.authorization==='Bearer invalid'?json({},401):json({id:actor})
  assert.equal(url,project+'/rest/v1/rpc/stylesnap_adopt_catalog_item')
  assert.equal(options.headers.authorization,'Bearer synthetic-service')
  const {payload}=JSON.parse(options.body)
  assert.equal(payload.owner_id,actor)
  let result
  try{result=await rpc(payload.owner_id,payload.catalog_item_id,payload.privacy)}catch(error){return json({message:error.message},400)}
  if(loseResponse){loseResponse=false;throw new TypeError('lost committed response')}
  return json({...result,catalog_snapshot:'must never reach the browser'})
}
const config=()=>({enabled:true,url:project,anonKey:'synthetic-anon',serviceKey:'synthetic-service',allowedOrigins:['https://fixture.invalid']})
const request=(body={catalog_item_id:catalog,privacy:'friends'},headers={})=>new Request(project+'/functions/v1/private-catalog-adoption',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-user',...headers},body:JSON.stringify(body)})
function client(overrides={}) {
  const api=createCatalogAdoptionHandler(config(),provider)
  return createPrivateCatalogClient({client:{auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'synthetic-user'}}})}},
    url:project,anonKey:'synthetic-anon',fetcher:(url,options)=>api(new Request(url,options)),...overrides})
}

test('adds full catalog fields, verified references and immutable provenance without copying bytes',async()=>{
  const beforeCatalog=(await db.query('SELECT to_jsonb(c) AS row FROM public.catalog_items c ORDER BY id')).rows
  const result=await rpc(actor,catalog,'private')
  assert.equal(result.created,true)
  const item=(await db.query('SELECT to_jsonb(c) AS value FROM public.clothes c WHERE id=$1',[result.item.id])).rows[0].value
  assert.equal(item.brand,'Retained brand');assert.equal(item.clothing_type,'Outwear');assert.equal(item.primary_color,'blue')
  assert.deepEqual(item.secondary_colors,['white']);assert.deepEqual(item.style_tags,['casual']);assert.equal(item.privacy,'private')
  assert.equal(await count('storage.objects'),1);assert.equal(await count('public.catalog_items'),2)
  assert.equal(await count('public.stylesnap_media_bindings'),6);assert.equal(await count('stylesnap_archive.binding_versions'),6)
  const retained=(await db.query('SELECT * FROM stylesnap_archive.catalog_adoptions')).rows[0]
  assert.equal(retained.catalog_snapshot.id,catalog);assert.equal(retained.binding_snapshot.length,2);assert.deepEqual(retained.item_snapshot,item)
  assert.deepEqual((await db.query('SELECT to_jsonb(c) AS row FROM public.catalog_items c ORDER BY id')).rows,beforeCatalog)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM stylesnap_archive.reservations WHERE kind='storage'")).rows[0].n,0)
  assert.equal((await db.query("SELECT sum(maximum_bytes)::int AS n FROM stylesnap_archive.reservations WHERE kind='egress'")).rows[0].n,262144)
})
test('duplicate requests return the same item and preserve its original privacy',async()=>{
  const first=await rpc(actor,catalog,'private'),again=await rpc(actor,catalog,'public')
  assert.equal(again.created,false);assert.equal(again.item.id,first.item.id);assert.equal(again.item.privacy,'private')
  assert.equal(await count('public.clothes'),1);assert.equal(await count('stylesnap_archive.catalog_adoptions'),1)
  assert.equal(await count('stylesnap_archive.reservations'),1)
})
test('a removed wardrobe copy and its provenance remain when the user adds the catalog item again',async()=>{
  const first=await rpc()
  await db.query('UPDATE public.clothes SET removed_at=now() WHERE id=$1',[first.item.id])
  const secondAdd=await rpc()
  assert.notEqual(secondAdd.item.id,first.item.id)
  assert.equal(await count('public.clothes'),2);assert.equal(await count('stylesnap_archive.catalog_adoptions'),2)
  assert.equal(await count('stylesnap_archive.binding_versions'),8)
})
test('quota remains based on new data rather than counting catalog items as uploaded photos',async()=>{
  await db.exec(`UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false;
    INSERT INTO public.clothes(owner_id,name,category,image_url,privacy) SELECT '${actor}','Existing upload','top','https://fixture.invalid/upload','private' FROM generate_series(1,50);
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true;`)
  await rpc();assert.equal(await count('public.clothes'),51)
})
test('inactive and non-public sources cannot be adopted',async()=>{
  for(const update of ["is_active=false","privacy='private'","privacy='friends'"]) {
    await db.exec(`UPDATE public.catalog_items SET is_active=true,privacy='public';UPDATE public.catalog_items SET ${update} WHERE id='${catalog}'`)
    await assert.rejects(rpc(),/catalog_source_unavailable/)
  }
  assert.equal(await count('public.clothes'),0)
})
test('changed source URLs, missing bindings and mismatched object metadata fail before any write',async()=>{
  await db.exec(`UPDATE public.catalog_items SET image_url='https://fixture.invalid/changed' WHERE id='${catalog}'`)
  await assert.rejects(rpc(),/verified_catalog_binding_required/)
  await db.exec(`UPDATE public.catalog_items SET image_url='https://fixture.invalid/image' WHERE id='${catalog}';UPDATE storage.objects SET metadata='{"size":51}'`)
  await assert.rejects(rpc(),/verified_catalog_object_required/)
  assert.equal(await count('public.clothes'),0);assert.equal(await count('stylesnap_archive.reservations'),0)
})
test('disabled adoption and stale or exhausted budgets stop new writes',async()=>{
  const controls=[
    ['UPDATE stylesnap_archive.upload_control SET catalog_adoptions_enabled=false','catalog_adoptions_disabled','UPDATE stylesnap_archive.upload_control SET catalog_adoptions_enabled=true'],
    ['UPDATE stylesnap_archive.control SET writes_enabled=false','archive_writes_disabled','UPDATE stylesnap_archive.control SET writes_enabled=true'],
    ["UPDATE stylesnap_archive.control SET headroom_verified_at=now()-interval '2 hours'",'storage_headroom_unverified','UPDATE stylesnap_archive.control SET headroom_verified_at=now()'],
    ['UPDATE stylesnap_archive.control SET approved_egress_bytes=1','egress_capacity_limit','UPDATE stylesnap_archive.control SET approved_egress_bytes=4000000000'],
    ['UPDATE stylesnap_archive.control SET max_database_bytes=1','database_capacity_limit','UPDATE stylesnap_archive.control SET max_database_bytes=450000000'],
  ]
  for(const [apply,error,restore] of controls){await db.exec(apply);await assert.rejects(rpc(),new RegExp(error));await db.exec(restore)}
  assert.equal(await count('public.clothes'),0);assert.equal(await count('stylesnap_archive.catalog_adoptions'),0)
})
test('existing successful additions remain confirmable after the write switch is disabled',async()=>{
  const first=await rpc()
  await db.exec('UPDATE stylesnap_archive.upload_control SET catalog_adoptions_enabled=false;UPDATE stylesnap_archive.control SET writes_enabled=false')
  assert.equal((await rpc()).item.id,first.item.id)
})
test('binding failure rolls back the item, provenance and all capacity reservations',async()=>{
  await db.exec(`CREATE FUNCTION public.fail_catalog_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.source_table='clothes' AND NEW.source_column='thumbnail_url' THEN RAISE EXCEPTION 'synthetic binding failure'; END IF;RETURN NEW;END;$$;
    CREATE TRIGGER fail_catalog_binding BEFORE INSERT ON public.stylesnap_media_bindings FOR EACH ROW EXECUTE FUNCTION public.fail_catalog_binding();`)
  await assert.rejects(rpc(),/synthetic binding failure/)
  assert.equal(await count('public.clothes'),0);assert.equal(await count('stylesnap_archive.catalog_adoptions'),0)
  assert.equal(await count('stylesnap_archive.reservations'),0);assert.equal(await count('stylesnap_archive.binding_versions'),4)
})
test('clients cannot call the privileged function, forge bindings or read private provenance',async()=>{
  await rpc()
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role};SELECT set_config('request.jwt.claim.sub','${actor}',false)`)
    for(const sql of ["SELECT public.stylesnap_adopt_catalog_item('{}')",'SELECT * FROM stylesnap_archive.catalog_adoptions',
      "INSERT INTO public.stylesnap_media_bindings SELECT * FROM public.stylesnap_media_bindings LIMIT 1"]){await assert.rejects(db.exec(sql),/permission denied/)}
    await db.exec('RESET ROLE')
  }
})
test('an old client cannot create an unbound catalog copy once private delivery is active',async()=>{
  await db.exec(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${actor}',false)`)
  await assert.rejects(db.exec(`INSERT INTO public.clothes(owner_id,catalog_item_id,name,category,image_url,thumbnail_url,privacy)
    VALUES('${actor}','${catalog}','Old client','top','https://fixture.invalid/image','https://fixture.invalid/thumb','private')`),/verified_catalog_writer_required/)
  await db.exec('RESET ROLE');assert.equal(await count('public.clothes'),0)
})
test('private ownership follows source RLS when the public catalog entry later becomes inactive',async()=>{
  const added=await rpc(actor,catalog,'private')
  await db.exec(`UPDATE public.catalog_items SET is_active=false;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${other}',false);`)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.stylesnap_media_bindings WHERE source_table='clothes'")).rows[0].n,0)
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actor}',false)`)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.stylesnap_media_bindings WHERE source_table='clothes' AND source_id=$1",[added.item.id])).rows[0].n,2)
  await db.exec('RESET ROLE')
})
test('client, handler and SQL complete a bounded adoption without Storage or Cloudinary traffic',async()=>{
  const id=await client().add(catalog,'private')
  assert.ok(id);assert.equal(calls.length,2)
  assert.equal(await count('public.clothes'),1);assert.equal(await count('storage.objects'),1)
})
test('a lost committed response is safely recovered by the same request or a fresh client',async()=>{
  loseResponse=true
  await assert.rejects(client().add(catalog),/could not be confirmed/)
  assert.equal(await count('public.clothes'),1)
  const recovered=await client().add(catalog)
  assert.ok(recovered);assert.equal(await count('public.clothes'),1);assert.equal(await count('stylesnap_archive.catalog_adoptions'),1)
})
test('one client coalesces simultaneous additions',async()=>{
  const catalogClient=client()
  const ids=await Promise.all([catalogClient.add(catalog),catalogClient.add(catalog)])
  assert.equal(ids[0],ids[1]);assert.equal(calls.length,2)
})
test('the handler rejects owner injection, cross-origin requests and invalid identity',async()=>{
  const api=createCatalogAdoptionHandler(config(),provider)
  assert.equal((await api(request({catalog_item_id:catalog,privacy:'private',owner_id:other}))).status,400)
  assert.equal((await api(request(undefined,{origin:'https://other.invalid'}))).status,403)
  assert.equal((await api(request(undefined,{authorization:'Bearer invalid'}))).status,401)
  assert.equal(await count('public.clothes'),0)
})
test('handler limits body size, excludes private journal fields and defaults disabled',async()=>{
  assert.equal((await createCatalogAdoptionHandler({...config(),enabled:false},provider)(request())).status,503)
  assert.equal((await createCatalogAdoptionHandler(config(),provider)(request({x:'x'.repeat(1200)}))).status,413)
  const response=await createCatalogAdoptionHandler(config(),provider)(request())
  const body=await response.json()
  assert.equal(response.status,200);assert.equal(body.catalog_snapshot,undefined)
  assert.deepEqual(Object.keys(body.item).sort(),['catalog_item_id','id','owner_id','privacy'])
})
test('client refuses an oversized or mismatched success and checks account changes',async()=>{
  await assert.rejects(client({fetcher:async()=>json({x:'x'.repeat(5000)})}).add(catalog),/could not be confirmed/)
  await assert.rejects(client({fetcher:async()=>json({created:true,item:{id:second,owner_id:other,catalog_item_id:catalog}})}).add(catalog),/could not be confirmed/)
  let identities=0
  const switched=client({client:{auth:{getSession:async()=>({data:{session:{user:{id:++identities===1?actor:other},access_token:'synthetic-user'}}})}}})
  await assert.rejects(switched.add(catalog),/account changed/)
  assert.equal(await count('public.clothes'),1)
})
