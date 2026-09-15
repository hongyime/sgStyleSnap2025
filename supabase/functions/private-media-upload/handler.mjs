// Web APIs only: the same handler runs in the Supabase Edge runtime and tests.
// Privileged credentials never leave the configured project or reach a client.
const PROJECT = 'https://nztqjmknblelnzpeatyx.supabase.co'
const MAX_FILE = 4 * 1024 * 1024
const MAX_THUMBNAIL = 1024 * 1024
const MAX_BODY = 2 * MAX_FILE + MAX_THUMBNAIL + 65536
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8',{fatal:true})

class UploadError extends Error {
  constructor(code, status=400) { super(code); this.status=status }
}
const requireThat = (condition,code,status) => { if (!condition) throw new UploadError(code,status) }
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('')

export async function boundedBody(body, maximum, signal) {
  requireThat(body,'missing_body')
  signal.throwIfAborted()
  const reader = body.getReader(), chunks=[]
  let length=0
  const cancel = () => { void reader.cancel().catch(()=>{}) }
  signal.addEventListener('abort',cancel,{once:true})
  try {
    while (true) {
      const next = await reader.read()
      signal.throwIfAborted()
      if (next.done) break
      length += next.value.byteLength
      requireThat(length<=maximum,'body_too_large',413)
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset=0
    for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength }
    return bytes
  } finally {
    signal.removeEventListener('abort',cancel)
    cancel()
  }
}

function imageType(bytes) {
  const text=(start,end)=>String.fromCharCode(...bytes.subarray(start,end))
  if (bytes.length>=33 && text(1,4)==='PNG' && bytes[0]===137 && text(12,16)==='IHDR'
      && bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10) return 'image/png'
  if (bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg'
  if (bytes.length>=13 && ['GIF87a','GIF89a'].includes(text(0,6))) return 'image/gif'
  if (bytes.length>=20 && text(0,4)==='RIFF' && text(8,12)==='WEBP') return 'image/webp'
  if (bytes.length>=24 && text(4,8)==='ftyp' && ['avif','avis'].includes(text(8,12))) return 'image/avif'
  throw new UploadError('unsupported_image')
}

export function validateIntent(value) {
  requireThat(value && typeof value==='object' && !Array.isArray(value),'invalid_intent')
  requireThat(Object.keys(value).every(key=>['mode','source_id','fields','catalog_consent','catalog_policy'].includes(key)),'invalid_intent')
  requireThat(['create','update'].includes(value.mode),'invalid_intent')
  requireThat(value.mode==='create' ? value.source_id===undefined : UUID.test(value.source_id||''),'invalid_source')
  requireThat(value.catalog_consent===undefined || typeof value.catalog_consent==='boolean','invalid_catalog_consent')
  requireThat(value.catalog_policy===undefined || ['opt_in','public_only','legacy'].includes(value.catalog_policy),'invalid_catalog_policy')
  const fields=value.fields
  requireThat(fields && typeof fields==='object' && !Array.isArray(fields),'invalid_fields')
  const limits={name:255,category:50,clothing_type:50,brand:100,size:20,privacy:20,primary_color:50}
  requireThat(Object.keys(fields).every(key=>Object.hasOwn(limits,key) || ['is_favorite','style_tags','secondary_colors'].includes(key)),'invalid_fields')
  if (value.mode==='create') requireThat(typeof fields.name==='string' && fields.name.trim().length>0,'name_required')
  for (const [key,limit] of Object.entries(limits)) {
    if (fields[key]===undefined || fields[key]===null) continue
    requireThat(typeof fields[key]==='string' && fields[key].length<=limit,'invalid_fields')
  }
  if ('name' in fields) requireThat(typeof fields.name==='string' && fields.name.trim().length>0,'name_required')
  if ('privacy' in fields) requireThat(['private','friends','public'].includes(fields.privacy),'invalid_privacy')
  if ('is_favorite' in fields) requireThat(typeof fields.is_favorite==='boolean','invalid_fields')
  for (const [key,limit] of [['style_tags',20],['secondary_colors',3]]) {
    if (fields[key]===undefined || fields[key]===null) continue
    requireThat(Array.isArray(fields[key]) && fields[key].length<=limit
      && fields[key].every(item=>typeof item==='string' && item.length<=64),'invalid_fields')
  }
  return {mode:value.mode,...(value.mode==='update'?{source_id:value.source_id.toLowerCase()}:{}),
    fields,catalog_consent:value.catalog_consent===true,...(value.catalog_policy?{catalog_policy:value.catalog_policy}:{})}
}

async function parseUpload(request,signal) {
  const contentType=request.headers.get('content-type')||''
  requireThat(contentType.toLowerCase().startsWith('multipart/form-data;'),'multipart_required',415)
  const declared=request.headers.get('content-length')
  requireThat(!declared || /^\d+$/.test(declared) && Number(declared)<=MAX_BODY,'body_too_large',413)
  const bytes=await boundedBody(request.body,MAX_BODY,signal)
  const form=await new Response(bytes,{headers:{'content-type':contentType}}).formData()
  const names=['metadata','original','processed','thumbnail']
  requireThat([...form.keys()].length===4 && names.every(name=>form.getAll(name).length===1),'invalid_upload_parts')
  const metadata=form.get('metadata')
  requireThat(typeof metadata==='string' && encoder.encode(metadata).length<=8192,'invalid_metadata')
  let input
  try {input=JSON.parse(metadata)} catch {throw new UploadError('invalid_metadata')}
  requireThat(input && typeof input==='object' && !Array.isArray(input)
    && Object.keys(input).every(key=>['request_id','intent'].includes(key)) && UUID.test(input.request_id||''),'invalid_metadata')
  const payload={intent:validateIntent(input.intent)}, files={}
  for (const part of names.slice(1)) {
    const file=form.get(part)
    requireThat(file instanceof File && file.size>0 && file.size<=(part==='thumbnail'?MAX_THUMBNAIL:MAX_FILE),'invalid_file_size',413)
    requireThat(file.name.length<=255,'invalid_file_name')
    const content=new Uint8Array(await file.arrayBuffer()), mime=imageType(content)
    requireThat(!file.type || file.type.replace('image/jpg','image/jpeg')===mime,'file_type_mismatch')
    payload[part]={sha256:await sha256(content),bytes:content.length,mime_type:mime,file_name:file.name}
    files[part]=content
  }
  signal.throwIfAborted()
  return {requestId:input.request_id.toLowerCase(),payload,files}
}

export function createUploadHandler(config,fetcher=fetch) {
  // A worker may serve concurrent requests. Keep only one bounded multipart
  // upload in its memory; other workers still share the SQL capacity ledger.
  let activeUploads=0
  return async request => {
    const headers={'content-type':'application/json','cache-control':'private, no-store','vary':'Origin'}
    const origin=request.headers.get('origin')
    const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers})
    let acquired=false
    try {
      if (origin) {
        requireThat(Array.isArray(config.allowedOrigins) && config.allowedOrigins.includes(origin),'origin_not_allowed',403)
        headers['access-control-allow-origin']=origin
      }
      if (request.method==='OPTIONS') {
        headers['access-control-allow-methods']='GET, POST, OPTIONS'
        headers['access-control-allow-headers']='authorization, apikey, content-type, x-client-info'
        return new Response(null,{status:204,headers})
      }
      requireThat(['GET','POST'].includes(request.method),'method_not_allowed',405)
      requireThat(config.enabled===true,'media_uploads_disabled',503)
      requireThat(config.url===PROJECT && config.anonKey && config.serviceKey,'upload_configuration_unavailable',503)
      const authorization=request.headers.get('authorization')||''
      requireThat(/^Bearer [^\s]{1,8192}$/.test(authorization),'authentication_required',401)
      if (request.method==='POST') {
        requireThat(activeUploads===0,'upload_worker_busy',429)
        activeUploads++;acquired=true
      }
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(90000)])
      let requests=0,readbackBytes=0
      const provider=async (path,options={},limit=65536) => {
        requireThat(path.startsWith('/') && !path.includes('..') && !path.includes('\\') && ++requests<=12,'request_budget_exceeded',503)
        const response=await fetcher(PROJECT+path,{...options,redirect:'error',signal})
        let data
        try {data=await boundedBody(response.body,limit,signal)} catch(error) {
          if (error instanceof UploadError && error.status===413) throw new UploadError('provider_response_too_large',503)
          throw error
        }
        return {response,data}
      }
      const userReply=await provider('/auth/v1/user',{headers:{apikey:config.anonKey,authorization}})
      requireThat(userReply.response.ok,'authentication_failed',[401,403].includes(userReply.response.status)?401:503)
      const user=JSON.parse(decoder.decode(userReply.data))
      requireThat(UUID.test(user.id||''),'authentication_failed',401)
      const actor=user.id.toLowerCase()
      const serviceHeaders={apikey:config.serviceKey,authorization:`Bearer ${config.serviceKey}`,'content-type':'application/json'}
      const rpc=async (action,payload) => {
        const result=await provider('/rest/v1/rpc/stylesnap_media_upload',{method:'POST',headers:serviceHeaders,
          body:JSON.stringify({action,payload:{...payload,owner_id:actor}})})
        let data
        try {data=JSON.parse(decoder.decode(result.data))} catch {throw new UploadError('invalid_provider_response',503)}
        if (!result.response.ok) {
          const code=typeof data?.message==='string'?data.message:''
          const conflict=['upload_in_progress','upload_request_conflict','upload_source_changed','upload_manifest_changed','upload_catalog_policy_changed']
          const rejected=['upload_source_unavailable','upload_owner_unavailable']
          const budget=['storage_capacity_limit','egress_capacity_limit','pending_upload_limit','daily_upload_limit','item_upload_quota','upload_retry_limit']
          throw new UploadError(conflict.includes(code)?code:rejected.includes(code)?'upload_not_allowed':budget.includes(code)?'upload_limit_reached':'upload_unavailable',
            conflict.includes(code)?409:rejected.includes(code)?403:budget.includes(code)?429:503)
        }
        return data
      }
      const publishedReply=(result,id)=>{
        requireThat(result?.state==='published' && result.receipt?.request_id===id
          && result.receipt.item?.owner_id===actor && UUID.test(result.receipt.item?.id||''),'publication_unconfirmed',503)
        return reply(200,{state:'published',receipt:result.receipt})
      }
      if (request.method==='GET') {
        const url=new URL(request.url), id=url.searchParams.get('request_id')
        requireThat(UUID.test(id||''),'invalid_request_id')
        const result=await rpc('inspect',{request_id:id.toLowerCase()})
        requireThat(['missing','reserved','stored','published'].includes(result?.state),'invalid_upload_state',503)
        return result.state==='published'?publishedReply(result,id.toLowerCase()):reply(200,{state:result.state})
      }
      const {requestId,payload,files}=await parseUpload(request,signal)
      const worker=crypto.randomUUID(), args={request_id:requestId,worker_id:worker,request:payload}
      const prepared=await rpc('prepare',args)
      if (prepared.state==='published') return publishedReply(prepared,requestId)
      requireThat(['reserved','stored'].includes(prepared.state),'invalid_upload_state',503)
      if (prepared.state==='reserved') {
        for (const part of ['original','processed','thumbnail']) {
          const digest=payload[part].sha256
          const expected=part==='original'?`originals/${actor}/${digest}`:`sha256/${digest.slice(0,2)}/${digest}`
          requireThat(prepared[`${part}_path`]===expected,'untrusted_object_path',503)
          const path='/storage/v1/object/stylesnap-media-archive/'+expected
          const uploaded=await provider(path,{method:'POST',headers:{...serviceHeaders,'content-type':payload[part].mime_type,'x-upsert':'false'},body:files[part]})
          if (!uploaded.response.ok) {
            let problem
            try {problem=JSON.parse(decoder.decode(uploaded.data))} catch {throw new UploadError('storage_upload_failed',503)}
            requireThat([400,409].includes(uploaded.response.status) &&
              (problem.code==='KeyAlreadyExists' || problem.error==='Duplicate' && String(problem.statusCode)==='409'),
            'storage_upload_failed',503)
          }
          const verified=await provider(path,{headers:serviceHeaders},payload[part].bytes)
          readbackBytes+=verified.data.length
          requireThat(readbackBytes<=2*MAX_FILE+MAX_THUMBNAIL && verified.response.ok
            && verified.data.length===payload[part].bytes && await sha256(verified.data)===digest,'stored_bytes_mismatch',503)
        }
        const verified=await rpc('verified',args)
        requireThat(verified.state==='stored','invalid_upload_state',503)
      }
      const published=await rpc('publish',args)
      return publishedReply(published,requestId)
    } catch (error) {
      if (error instanceof UploadError) return reply(error.status,{error:error.message})
      return reply(503,{error:'upload_incomplete'})
    } finally {
      if (acquired) activeUploads--
    }
  }
}
