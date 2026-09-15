import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { boundedBody, createUploadHandler, validateIntent } from '../../supabase/functions/private-media-upload/handler.mjs'

const project='https://nztqjmknblelnzpeatyx.supabase.co'
const actor='00000000-0000-4000-8000-000000000001'
const requestId='00000000-0000-4000-8000-000000000002'
const sourceId='00000000-0000-4000-8000-000000000003'
const origin='https://stylesnap.example.invalid'
const config={enabled:true,url:project,anonKey:'synthetic-anon',serviceKey:'synthetic-service',allowedOrigins:[origin]}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lZQAAAAASUVORK5CYII=','base64')
const sha=value=>createHash('sha256').update(value).digest('hex')
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
function uploadRequest(edit=()=>{},headers={}) {
  const form=new FormData()
  form.append('metadata',JSON.stringify({request_id:requestId,intent:{mode:'create',fields:{name:'Jacket',category:'outerwear',privacy:'private'}}}))
  for(const part of ['original','processed','thumbnail']) form.append(part,new File([png],part+'.png',{type:'image/png'}))
  edit(form)
  return new Request(project+'/functions/v1/private-media-upload',{method:'POST',body:form,
    headers:{authorization:'Bearer synthetic-user',origin,...headers}})
}
function provider(override=()=>null) {
  const calls=[],objects=new Map()
  let prepared,published=false,verified=false
  const receipt={request_id:requestId,item:{id:sourceId,owner_id:actor,name:'Jacket',image_url:'stylesnap-private://item/image'},catalog_item_id:null}
  const fetcher=async (url,options={})=>{
    assert.ok(url.startsWith(project+'/'))
    assert.equal(options.redirect,'error')
    assert.ok(options.signal instanceof AbortSignal)
    const path=url.slice(project.length),method=options.method||'GET'
    const call={path,method,headers:options.headers,body:options.body}
    calls.push(call)
    const replaced=await override(call,{objects,calls,receipt})
    if(replaced) return replaced
    if(path==='/auth/v1/user') {
      assert.equal(options.headers.apikey,config.anonKey)
      assert.equal(options.headers.authorization,'Bearer synthetic-user')
      return json({id:actor})
    }
    assert.equal(options.headers.apikey,config.serviceKey)
    assert.equal(options.headers.authorization,'Bearer '+config.serviceKey)
    if(path==='/rest/v1/rpc/stylesnap_media_upload') {
      const {action,payload}=JSON.parse(options.body)
      assert.equal(payload.owner_id,actor)
      if(action==='inspect') return json({state:published?'published':prepared?'reserved':'missing',...(published?{receipt}:{})})
      if(action==='prepare') {
        if(published) return json({state:'published',receipt})
        prepared=payload.request
        for(const part of ['original','processed','thumbnail']) {
          assert.equal(prepared[part].sha256,sha(png))
          assert.equal(prepared[part].bytes,png.length)
          assert.equal(prepared[part].mime_type,'image/png')
        }
        return json({state:'reserved',source_id:sourceId,attempt:1,original_path:`originals/${actor}/${sha(png)}`,
          processed_path:`sha256/${sha(png).slice(0,2)}/${sha(png)}`,thumbnail_path:`sha256/${sha(png).slice(0,2)}/${sha(png)}`})
      }
      if(action==='verified') {verified=true;return json({state:'stored'})}
      if(action==='publish') {assert.equal(verified,true);published=true;return json({state:'published',receipt})}
      throw new Error('unexpected RPC')
    }
    assert.ok(path.startsWith('/storage/v1/object/stylesnap-media-archive/'))
    if(method==='POST') {
      assert.equal(options.headers['x-upsert'],'false')
      assert.equal(options.headers['content-type'],'image/png')
      if(objects.has(path)) return json({statusCode:'409',error:'Duplicate',message:'The resource already exists'},400)
      objects.set(path,Buffer.from(options.body));return json({Key:path},201)
    }
    assert.equal(method,'GET')
    assert.ok(objects.has(path))
    return new Response(objects.get(path),{headers:{'content-type':'image/png'}})
  }
  return {fetcher,calls,objects,receipt,actions:()=>calls.filter(c=>c.path.includes('/rpc/')).map(c=>JSON.parse(c.body).action)}
}

test('authenticated upload hashes actual files, reserves first, reads bytes back and publishes last',async()=>{
  const remote=provider(),response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{state:'published',receipt:remote.receipt})
  assert.deepEqual(remote.actions(),['prepare','verified','publish'])
  const storageStart=remote.calls.findIndex(c=>c.path.includes('/storage/'))
  assert.equal(JSON.parse(remote.calls[storageStart-1].body).action,'prepare')
  assert.equal(remote.calls.filter(c=>c.method==='GET'&&c.path.includes('/storage/')).length,3)
  assert.ok([...remote.objects.values()].every(value=>value.equals(png)))
  assert.equal(remote.objects.size,2)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.equal(response.headers.get('access-control-allow-origin'),origin)
})

test('disabled, forbidden-origin and unauthenticated requests never reach a provider',async()=>{
  for(const [settings,request,status] of [
    [{...config,enabled:false},uploadRequest(),503],
    [config,uploadRequest(()=>{},{origin:'https://other.example.invalid'}),403],
    [config,uploadRequest(()=>{},{authorization:''}),401],
  ]) {
    let calls=0
    const response=await createUploadHandler(settings,()=>{calls++;throw new Error('must not call')})(request)
    assert.equal(response.status,status);assert.equal(calls,0)
  }
})

test('authentication is verified remotely; invalid or missing identities cannot reserve uploads',async()=>{
  for(const auth of [json({message:'invalid'},401),json({id:'not-an-id'})]) {
    const remote=provider(call=>call.path==='/auth/v1/user'?auth:null)
    const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
    assert.equal(response.status,401)
    assert.deepEqual(remote.actions(),[])
    assert.equal(remote.objects.size,0)
  }
})

test('client ownership, hashes and arbitrary image pointers are rejected before reservations',async()=>{
  for(const extra of [{owner_id:actor},{hash:'fake'},{image_url:'https://untrusted.example/file'}]) {
    const remote=provider()
    const request=uploadRequest(form=>form.set('metadata',JSON.stringify({request_id:requestId,intent:{mode:'create',fields:{name:'Jacket',...extra}}})))
    const response=await createUploadHandler(config,remote.fetcher)(request)
    assert.equal(response.status,400)
    assert.deepEqual(remote.actions(),[])
  }
})

test('duplicate parts, unsupported content and misleading MIME types cannot upload objects',async()=>{
  const edits=[
    form=>form.append('original',new File([png],'duplicate.png',{type:'image/png'})),
    form=>form.set('original',new File(['<svg></svg>'],'image.svg',{type:'image/svg+xml'})),
    form=>form.set('processed',new File([png],'image.jpg',{type:'image/jpeg'})),
    form=>form.set('metadata','{malformed'),
  ]
  for(const edit of edits) {
    const remote=provider(),response=await createUploadHandler(config,remote.fetcher)(uploadRequest(edit))
    assert.ok([400,413].includes(response.status))
    assert.equal(remote.objects.size,0)
    assert.deepEqual(remote.actions(),[])
  }
})

test('oversized declared requests stop before parsing or reserving',async()=>{
  const remote=provider(),response=await createUploadHandler(config,remote.fetcher)(uploadRequest(()=>{},{'content-length':String(30*1024*1024)}))
  assert.equal(response.status,413)
  assert.deepEqual(remote.actions(),[])
})

test('files above the server CPU bound stop before storage reservations',async()=>{
  const remote=provider(),oversized=new Uint8Array(4194305);oversized.set(png)
  const response=await createUploadHandler(config,remote.fetcher)(uploadRequest(form=>form.set('original',new File([oversized],'large.png',{type:'image/png'}))))
  assert.equal(response.status,413);assert.deepEqual(remote.actions(),[]);assert.equal(remote.objects.size,0)
})

test('stream bounds and aborts cancel the reader even without a trustworthy Content-Length',async()=>{
  let cancelled=false
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(8))},cancel(){cancelled=true}})
  await assert.rejects(boundedBody(body,10,new AbortController().signal),/body_too_large/)
  assert.equal(cancelled,true)
  const abort=new AbortController()
  const stalled=new ReadableStream({cancel(){cancelled=true}})
  cancelled=false
  const read=boundedBody(stalled,10,abort.signal)
  abort.abort()
  await assert.rejects(read,{name:'AbortError'})
  assert.equal(cancelled,true)
})

test('storage byte mismatch never acknowledges verification or publishes a row',async()=>{
  const remote=provider(call=>call.method==='GET'&&call.path.includes('/storage/')?new Response(new Uint8Array(png.length)):null)
  const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
  assert.equal(response.status,503)
  assert.deepEqual(remote.actions(),['prepare'])
  assert.equal(remote.objects.size,1)
  assert.ok(!remote.calls.some(c=>['DELETE','PUT','PATCH'].includes(c.method)))
})

test('oversized storage responses are cancelled before hashing or publication',async()=>{
  const remote=provider(call=>call.method==='GET'&&call.path.includes('/storage/')?new Response(new Uint8Array(png.length+1)):null)
  const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
  assert.equal(response.status,503)
  assert.deepEqual(remote.actions(),['prepare'])
})

test('a failed upload response preserves uncertain stored bytes and never issues a cleanup delete',async()=>{
  const remote=provider((call,state)=>{
    if(call.method==='POST'&&call.path.includes('/storage/')) {
      state.objects.set(call.path,Buffer.from(call.body))
      throw new TypeError('synthetic lost response')
    }
  })
  const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
  assert.equal(response.status,503)
  assert.equal(remote.objects.size,1)
  assert.deepEqual(remote.actions(),['prepare'])
  assert.ok(!remote.calls.some(c=>c.method==='DELETE'))
})

test('only an exact duplicate-object error allows readback; arbitrary HTTP 400 failures stop',async()=>{
  const remote=provider(call=>call.method==='POST'&&call.path.includes('/storage/')?json({statusCode:'400',error:'InvalidBucket',message:'failed'},400):null)
  const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
  assert.equal(response.status,503)
  assert.deepEqual(remote.actions(),['prepare'])
  assert.equal(remote.calls.filter(c=>c.method==='GET'&&c.path.includes('/storage/')).length,0)
})

test('lost publication responses recover through authenticated receipt lookup without another media transfer',async()=>{
  const remote=provider()
  const fetcher=async (url,options)=>{
    const response=await remote.fetcher(url,options)
    if(url.endsWith('/rpc/stylesnap_media_upload')&&JSON.parse(options.body).action==='publish') throw new TypeError('lost committed reply')
    return response
  }
  const handler=createUploadHandler(config,fetcher)
  assert.equal((await handler(uploadRequest())).status,503)
  const transfers=remote.calls.filter(c=>c.path.includes('/storage/')).length
  const recovered=await handler(new Request(project+'/functions/v1/private-media-upload?request_id='+requestId,
    {headers:{authorization:'Bearer synthetic-user',origin}}))
  assert.equal(recovered.status,200)
  assert.deepEqual(await recovered.json(),{state:'published',receipt:remote.receipt})
  assert.equal(remote.calls.filter(c=>c.path.includes('/storage/')).length,transfers)
})

test('quota refusals and concurrent attempts do not write bytes or automatically retry',async()=>{
  for(const [message,status] of [['storage_capacity_limit',429],['upload_in_progress',409]]) {
    const remote=provider(call=>call.path.includes('/rpc/')?json({message},400):null)
    const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
    assert.equal(response.status,status)
    assert.deepEqual(remote.actions(),['prepare'])
    assert.equal(remote.objects.size,0)
  }
})

test('metadata prototype keys and immutable identifiers are rejected',()=>{
  for(const fields of [JSON.parse('{"constructor":"bad"}'),JSON.parse('{"__proto__":"bad"}'),{id:sourceId}]) {
    assert.throws(()=>validateIntent({mode:'create',fields:{name:'Jacket',...fields}}),/invalid_fields/)
  }
})

test('malformed and cross-owner publication receipts never reach the browser',async()=>{
  for(const receipt of [{request_id:requestId,item:{id:sourceId,owner_id:'other-owner'}},
    {request_id:'other-request',item:{id:sourceId,owner_id:actor}},
    {request_id:requestId,item:{id:'invalid',owner_id:actor}}]) {
    const remote=provider(call=>call.path.includes('/rpc/')?json({state:'published',receipt}):null)
    const response=await createUploadHandler(config,remote.fetcher)(uploadRequest())
    assert.equal(response.status,503)
    assert.deepEqual(await response.json(),{error:'publication_unconfirmed'})
    assert.equal(remote.objects.size,0)
  }
})

test('one worker never parses overlapping uploads and releases its slot after completion',async()=>{
  let release,entered
  const started=new Promise(resolve=>{entered=resolve}),hold=new Promise(resolve=>{release=resolve})
  let first=true
  const remote=provider(async call=>{
    if(first&&call.path==='/auth/v1/user'){first=false;entered();await hold}
  })
  const handler=createUploadHandler(config,remote.fetcher),pending=handler(uploadRequest())
  await started
  try {
    const overlapping=await handler(uploadRequest())
    assert.equal(overlapping.status,429)
    assert.deepEqual(await overlapping.json(),{error:'upload_worker_busy'})
  } finally {release();await pending}
  assert.equal((await handler(uploadRequest())).status,200)
})
