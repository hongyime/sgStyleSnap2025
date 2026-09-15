import { boundedBody } from '../private-media-upload/handler.mjs'

const PROJECT = 'https://nztqjmknblelnzpeatyx.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const decoder = new TextDecoder('utf-8', { fatal: true })
class CatalogError extends Error {
  constructor(code, status=400) { super(code); this.status=status }
}
function requireThat(condition,code,status) { if (!condition) throw new CatalogError(code,status) }

export function createCatalogAdoptionHandler(config, fetcher=fetch) {
  let active=0
  return async request => {
    const headers={'content-type':'application/json','cache-control':'private, no-store','vary':'Origin'}
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers})
    let acquired=false
    try {
      const origin=request.headers.get('origin')
      if (origin) {
        requireThat(config.allowedOrigins?.includes(origin),'origin_not_allowed',403)
        headers['access-control-allow-origin']=origin
      }
      if (request.method==='OPTIONS') {
        headers['access-control-allow-methods']='POST, OPTIONS'
        headers['access-control-allow-headers']='authorization, apikey, content-type, x-client-info'
        return new Response(null,{status:204,headers})
      }
      requireThat(request.method==='POST','method_not_allowed',405)
      requireThat(config.enabled===true,'catalog_adoptions_disabled',503)
      requireThat(config.url===PROJECT && config.anonKey && config.serviceKey,'catalog_configuration_unavailable',503)
      requireThat(active<4,'catalog_worker_busy',429)
      active++;acquired=true
      const authorization=request.headers.get('authorization')||''
      requireThat(/^Bearer [^\s]{1,8192}$/.test(authorization),'authentication_required',401)
      requireThat((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='application/json','json_required',415)
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(20000)])
      let input
      try { input=JSON.parse(decoder.decode(await boundedBody(request.body,1024,signal))) }
      catch(error) { throw new CatalogError(error.status===413?'body_too_large':'invalid_catalog_request',error.status===413?413:400) }
      requireThat(input && typeof input==='object' && !Array.isArray(input)
        && Object.keys(input).length===2 && UUID.test(input.catalog_item_id||'')
        && ['private','friends','public'].includes(input.privacy),'invalid_catalog_request')
      const provider=async(path,options)=>{
        const response=await fetcher(PROJECT+path,{...options,redirect:'error',signal})
        let body
        try {body=JSON.parse(decoder.decode(await boundedBody(response.body,65536,signal)))}
        catch {throw new CatalogError('invalid_provider_response',503)}
        return {response,body}
      }
      const auth=await provider('/auth/v1/user',{headers:{apikey:config.anonKey,authorization}})
      requireThat(auth.response.ok,'authentication_failed',[401,403].includes(auth.response.status)?401:503)
      requireThat(UUID.test(auth.body?.id||''),'authentication_failed',401)
      const actor=auth.body.id.toLowerCase(),catalog=input.catalog_item_id.toLowerCase()
      const result=await provider('/rest/v1/rpc/stylesnap_adopt_catalog_item',{
        method:'POST',headers:{apikey:config.serviceKey,authorization:'Bearer '+config.serviceKey,'content-type':'application/json'},
        body:JSON.stringify({payload:{owner_id:actor,catalog_item_id:catalog,privacy:input.privacy}}),
      })
      if (!result.response.ok) {
        const code=result.body?.message
        if (code==='catalog_source_unavailable') throw new CatalogError(code,404)
        if (code==='catalog_owner_unavailable') throw new CatalogError('authentication_failed',401)
        if (['database_capacity_limit','egress_capacity_limit'].includes(code)) throw new CatalogError('catalog_limit_reached',429)
        throw new CatalogError('catalog_adoption_unavailable',503)
      }
      const item=result.body?.item
      requireThat(typeof result.body?.created==='boolean' && UUID.test(item?.id||'') && item?.owner_id===actor
        && item?.catalog_item_id===catalog && ['private','friends','public'].includes(item?.privacy),'publication_unconfirmed',503)
      // The private catalog/provenance journal is never part of a client response.
      return reply(200,{created:result.body.created,item:{id:item.id,owner_id:actor,catalog_item_id:catalog,privacy:item.privacy}})
    } catch(error) {
      return error instanceof CatalogError ? reply(error.status,{error:error.message}) : reply(503,{error:'catalog_adoption_unconfirmed'})
    } finally {if(acquired)active--}
  }
}
