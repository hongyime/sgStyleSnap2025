import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, beforeEach, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createUploadHandler } from '../../supabase/functions/private-media-upload/handler.mjs'
import { createPrivateUploadClient } from '../../src/lib/private-upload-client.js'

const project='https://nztqjmknblelnzpeatyx.supabase.co'
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const manifest='a'.repeat(64),checkpoint='b'.repeat(64),plan='c'.repeat(64)
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lZQAAAAASUVORK5CYII=','base64')
const files=()=>({original:new File([png],'original.png',{type:'image/png'}),processed:new File([png],'processed.png',{type:'image/png'})})
const intent=()=>({mode:'create',fields:{name:'Retained jacket',category:'outerwear',privacy:'private'}})
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
let db,objects,calls,drafts,losePublication,apiEnabled
before(async()=>{
  db=new PGlite()
  for(const name of ['stylesnap-media-access.sql','stylesnap-upload-schema.sql']) await db.exec(await readFile(new URL(`./fixtures/${name}`,import.meta.url),'utf8'))
  for(const name of ['20260914045924_private_media_archive_control.sql','20260914134525_private_media_delivery.sql',
    '20260915021000_private_media_binding_publication.sql','20260915021427_private_media_binding_versions.sql',
    '20260915043300_private_media_upload_receipts.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'))
})
after(async()=>{await db?.close()})
beforeEach(async()=>{
  objects=new Map();calls=[];drafts=new Map();losePublication=false;apiEnabled=true
  await db.exec(`RESET ROLE;
    DROP TRIGGER IF EXISTS fail_flow_binding ON public.stylesnap_media_bindings;
    DROP FUNCTION IF EXISTS public.fail_flow_binding();
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
const count=async table=>(await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
const store={
  async prepare(record){
    const previous=[...drafts.values()].find(row=>row.active_key===record.active_key)
    if(previous)return previous
    drafts.set(record.id,record);return record
  },
  async list(owner){return [...drafts.values()].filter(row=>row.owner===owner&&row.state!=='acknowledged')},
  async get(id,owner){const row=drafts.get(id);return row?.owner===owner?row:undefined},
  async complete(id,owner,receipt){
    const row=drafts.get(id);assert.equal(row.owner,owner);assert.equal(receipt.item.owner_id,owner)
    drafts.set(id,{...row,state:'complete',receipt,files:undefined})
  },
  async acknowledge(id,owner){const row=drafts.get(id);if(row?.owner===owner&&row.state==='complete')drafts.set(id,{id,owner,state:'acknowledged'})},
}
async function provider(url,options={}) {
  assert.ok(url.startsWith(project+'/'))
  assert.equal(options.redirect,'error')
  const path=url.slice(project.length),method=options.method||'GET'
  calls.push({path,method})
  if(path==='/auth/v1/user') return json({id:options.headers.authorization==='Bearer other-user'?other:actor})
  assert.equal(options.headers.authorization,'Bearer synthetic-service')
  if(path==='/rest/v1/rpc/stylesnap_media_upload') {
    const {action,payload}=JSON.parse(options.body)
    let result
    await db.exec('SET ROLE service_role')
    try {result=(await db.query('SELECT public.stylesnap_media_upload($1,$2) AS result',[action,payload])).rows[0].result}
    catch(error){return json({code:error.code,message:error.message},400)}
    finally{await db.exec('RESET ROLE')}
    if(action==='publish'&&losePublication){losePublication=false;throw new TypeError('synthetic lost response')}
    return json(result)
  }
  assert.ok(path.startsWith('/storage/v1/object/stylesnap-media-archive/'))
  const name=path.slice('/storage/v1/object/stylesnap-media-archive/'.length)
  if(method==='POST') {
    assert.equal(options.headers['x-upsert'],'false')
    if(objects.has(name))return json({error:'Duplicate',statusCode:'409'},400)
    const bytes=Buffer.from(options.body)
    objects.set(name,bytes)
    await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', ['stylesnap-media-archive',name,{size:bytes.length}])
    return json({Key:name},201)
  }
  return new Response(objects.get(name))
}
function client(owner=actor,overrides={}) {
  const api=createUploadHandler({enabled:apiEnabled,url:project,anonKey:'synthetic-anon',serviceKey:'synthetic-service',allowedOrigins:[]},provider)
  return createPrivateUploadClient({
    client:{auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:owner===other?'other-user':'synthetic-user'}}})}},
    url:project,anonKey:'synthetic-anon',catalogPolicy:'opt_in',store,
    thumbnail:async()=>new File([png],'thumbnail.png',{type:'image/png'}),
    fetcher:(url,options)=>api(new Request(url,options)),...overrides,
  })
}

test('browser client, Edge handler and actual SQL commit one complete private upload',async()=>{
  const uploader=client(),selected=files()
  const result=await uploader.save(intent(),selected)
  assert.equal(result.success,true)
  assert.equal(result.data.name,'Retained jacket')
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('public.stylesnap_media_bindings'),2)
  assert.equal(await count('stylesnap_archive.binding_versions'),2)
  assert.equal(await count('public.catalog_items'),0)
  assert.ok([...objects.values()].every(bytes=>bytes.equals(png)))
  const operations=(await db.query('SELECT * FROM stylesnap_archive.upload_receipts')).rows
  assert.equal(operations[0].request_payload.original.file_name,'original.png')
  assert.equal(operations[0].state,'published')
  assert.equal(drafts.get(result.upload_receipt).state,'complete')
  assert.equal(drafts.get(result.upload_receipt).files,undefined)
  assert.equal((await uploader.pending()).length,1)
  await uploader.acknowledge(result.upload_receipt)
  assert.equal((await uploader.pending()).length,0)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('a lost committed response resumes after client restart without uploading the files again',async()=>{
  losePublication=true
  await assert.rejects(client().save(intent(),files()),/draft is saved/)
  assert.equal(await count('public.clothes'),1)
  const record=[...drafts.values()][0]
  assert.equal(record.state,'pending')
  assert.ok(record.files.original instanceof File)
  const uploads=calls.filter(row=>row.method==='POST'&&row.path.includes('/storage/')).length
  const restarted=client(),result=await restarted.resume(record.id)
  assert.equal(result.success,true)
  assert.equal(result.upload_receipt,record.id)
  assert.equal(calls.filter(row=>row.method==='POST'&&row.path.includes('/storage/')).length,uploads)
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('publication failure retains original bytes and resumes the same operation after its lease expires',async()=>{
  await db.exec(`CREATE FUNCTION public.fail_flow_binding() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.source_column='thumbnail_url' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_flow_binding BEFORE INSERT ON public.stylesnap_media_bindings FOR EACH ROW EXECUTE FUNCTION public.fail_flow_binding();`)
  await assert.rejects(client().save({...intent(),catalog_consent:true},files()),/draft is saved/)
  assert.equal(await count('public.clothes'),0)
  assert.equal(await count('public.catalog_items'),0)
  assert.equal(await count('stylesnap_archive.binding_versions'),0)
  assert.equal((await db.query('SELECT state FROM stylesnap_archive.upload_receipts')).rows[0].state,'stored')
  assert.equal(objects.size,2)
  const record=[...drafts.values()][0],uploads=calls.filter(row=>row.method==='POST'&&row.path.includes('/storage/')).length
  await assert.rejects(client().resume(record.id),/still finishing/)
  await db.exec(`DROP TRIGGER fail_flow_binding ON public.stylesnap_media_bindings;
    UPDATE stylesnap_archive.upload_receipts SET lease_expires_at=now()-interval '1 second';`)
  assert.equal((await client().resume(record.id)).success,true)
  assert.equal(calls.filter(row=>row.method==='POST'&&row.path.includes('/storage/')).length,uploads)
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('public.catalog_items'),1)
  assert.equal(await count('public.stylesnap_media_bindings'),4)
})

test('a storage-budget refusal leaves files only in the browser recovery draft',async()=>{
  await db.exec('UPDATE stylesnap_archive.control SET max_storage_bytes=1')
  await assert.rejects(client().save(intent(),files()),/reached a limit/)
  assert.equal(objects.size,0)
  assert.equal(await count('stylesnap_archive.upload_receipts'),0)
  assert.equal(await count('stylesnap_archive.reservations'),0)
  assert.equal([...drafts.values()][0].files.original.size,png.length)
})

test('the same pending files and details recover their existing id after a client restart',async()=>{
  losePublication=true
  await assert.rejects(client().save(intent(),files()))
  const id=[...drafts.keys()][0]
  const result=await client().save(intent(),files())
  assert.equal(result.upload_receipt,id)
  assert.equal(await count('public.clothes'),1)
  assert.equal(await count('stylesnap_archive.upload_receipts'),1)
})

test('acknowledging a confirmed upload permits an intentional second identical item',async()=>{
  const uploader=client(),first=await uploader.save(intent(),files())
  await uploader.acknowledge(first.upload_receipt)
  const second=await uploader.save(intent(),files())
  assert.notEqual(second.upload_receipt,first.upload_receipt)
  assert.notEqual(second.data.id,first.data.id)
  assert.equal(await count('public.clothes'),2)
  assert.equal(objects.size,2)
})

test('another signed-in account cannot list or resume the first account’s local draft',async()=>{
  losePublication=true
  await assert.rejects(client().save(intent(),files()))
  const id=[...drafts.keys()][0],before=calls.length
  assert.deepEqual(await client(other).pending(),[])
  await assert.rejects(client(other).resume(id),/no longer available/)
  assert.equal(calls.length,before)
})

test('failure to persist a recovery draft prevents every provider request',async()=>{
  const failedStore={...store,prepare:async()=>{throw new Error('synthetic browser quota failure')}}
  await assert.rejects(client(actor,{store:failedStore}).save(intent(),files()),/browser quota failure/)
  assert.equal(calls.length,0)
  assert.equal(objects.size,0)
  assert.equal(await count('public.clothes'),0)
})

test('an account change during publication retains the old owner receipt without displaying it in the new account',async()=>{
  let signedIn=actor
  const uploader=client(actor,{client:{auth:{getSession:async()=>({data:{session:{user:{id:signedIn},access_token:'synthetic-user'}}})}},
    store:{...store,complete:async(...args)=>{await store.complete(...args);signedIn=other}}})
  await assert.rejects(uploader.save(intent(),files()),/account|Sign in/)
  assert.equal(await count('public.clothes'),1)
  assert.equal([...drafts.values()][0].state,'complete')
  assert.equal([...drafts.values()][0].owner,actor)
  assert.deepEqual(await uploader.pending(),[])
})
