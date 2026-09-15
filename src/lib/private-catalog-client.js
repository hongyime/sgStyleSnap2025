const PROJECT = 'https://nztqjmknblelnzpeatyx.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uncertain = 'Adding this item could not be confirmed. Check your closet or retry; an existing item will not be added twice.'

export function createPrivateCatalogClient({ client, url, anonKey, fetcher=fetch }) {
  const running=new Map()
  async function identity() {
    if(url!==PROJECT || !anonKey) throw new Error('Catalog additions are temporarily unavailable.')
    const {data,error}=await client.auth.getSession()
    if(error || !UUID.test(data?.session?.user?.id||'') || !data.session.access_token) throw new Error('Sign in to add this catalog item.')
    return {owner:data.session.user.id.toLowerCase(),token:data.session.access_token}
  }
  return {
    async add(catalogId,privacy='friends') {
      if(!UUID.test(catalogId||'') || !['private','friends','public'].includes(privacy)) throw new Error('Choose a valid catalog item and sharing setting.')
      const who=await identity(), catalog=catalogId.toLowerCase(), key=who.owner+':'+catalog+':'+privacy
      if(!running.has(key)) running.set(key,(async()=>{
        const signal=AbortSignal.timeout(25000)
        const response=await fetcher(PROJECT+'/functions/v1/private-catalog-adoption',{
          method:'POST',headers:{authorization:'Bearer '+who.token,apikey:anonKey,'content-type':'application/json'},
          body:JSON.stringify({catalog_item_id:catalog,privacy}),redirect:'error',cache:'no-store',signal,
        })
        const reader=response.body?.getReader()
        if(!reader) throw new Error(uncertain)
        const cancel=()=>{void reader.cancel().catch(()=>{})}
        signal.addEventListener('abort',cancel,{once:true})
        const chunks=[];let length=0
        try {
          signal.throwIfAborted()
          while(true) {
            const next=await reader.read();signal.throwIfAborted()
            if(next.done)break
            length+=next.value.length
            if(length>4096)throw new Error(uncertain)
            chunks.push(next.value)
          }
        } finally {signal.removeEventListener('abort',cancel);cancel()}
        const bytes=new Uint8Array(length);let offset=0
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
        let result
        try {result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))} catch {throw new Error(uncertain)}
        if(!response.ok) {
          if(result.error==='catalog_source_unavailable')throw new Error('This catalog item is no longer available.')
          if(result.error==='catalog_limit_reached')throw new Error('Catalog additions have reached a limit. Try again later.')
          throw new Error(uncertain)
        }
        if(typeof result.created!=='boolean' || !UUID.test(result.item?.id||'') || result.item.owner_id!==who.owner
          || result.item.catalog_item_id!==catalog)throw new Error(uncertain)
        if((await identity()).owner!==who.owner)throw new Error('Your account changed. Return to the original account to find this item.')
        if(result.item.privacy!==privacy)throw new Error('This item is already in your closet with a different sharing setting. Review it there.')
        return result.item.id
      })().catch(error=>{throw new Error(error?.name==='Error'?error.message:uncertain)}).finally(()=>running.delete(key)))
      return running.get(key)
    },
  }
}
