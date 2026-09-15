import { test, expect } from '@playwright/test'

const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const item='00000000-0000-4000-8000-000000000003'
async function fixture(context, page, options={}) {
  const external=[],errors=[],posts=[],receipts=new Map(),control={...options}
  context.on('page', tab=>tab.on('pageerror',error=>errors.push(error.message)))
  page.on('pageerror',error=>errors.push(error.message))
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.hostname==='127.0.0.1')return route.continue()
    if(url.hostname!=='nztqjmknblelnzpeatyx.supabase.co'||url.pathname!=='/functions/v1/private-media-upload') {
      external.push(url.pathname);return route.abort()
    }
    expect(request.headers().authorization).toBe('Bearer synthetic-user')
    if(request.method()==='GET') {
      const receipt=receipts.get(url.searchParams.get('request_id'))
      return route.fulfill({json:receipt?{state:'published',receipt}:{state:'missing'}})
    }
    expect(request.method()).toBe('POST')
    const body=request.postDataBuffer(),match=body.toString().match(/name="metadata"\r\n\r\n([^\r]+)\r\n/)
    expect(match).not.toBeNull()
    const metadata=JSON.parse(match[1]);posts.push({metadata,body})
    const receipt={request_id:metadata.request_id,item:{id:item,owner_id:actor,name:metadata.intent.fields.name}}
    receipts.set(metadata.request_id,receipt)
    if(control.loseReply){control.loseReply=false;return route.abort('failed')}
    return route.fulfill({json:{state:'published',receipt}})
  })
  await page.goto('/tests/browser-uploads/fixture.html')
  await expect.poll(()=>page.evaluate(()=>Boolean(window.uploadFixture))).toBe(true)
  return {external,errors,posts,receipts,control}
}

test('IndexedDB retains exact original and processed Files across reloads and isolates accounts',async({context,page})=>{
  const f=await fixture(context,page)
  const expected=await page.evaluate(async()=>{
    const f=window.uploadFixture,files=await f.files()
    const record=await f.store.prepare({id:crypto.randomUUID(),owner:f.owner,active_key:f.owner+':one',state:'pending',created_at:Date.now(),intent:{fields:{name:'Saved image'}},files})
    return {id:record.id,bytes:Array.from(new Uint8Array(await files.original.arrayBuffer()))}
  })
  await page.reload();await expect.poll(()=>page.evaluate(()=>Boolean(window.uploadFixture))).toBe(true)
  const actual=await page.evaluate(async({id,other})=>{
    const f=window.uploadFixture,record=await f.store.get(id,f.owner)
    return {originalName:record.files.original.name,processedName:record.files.processed.name,
      bytes:Array.from(new Uint8Array(await record.files.original.arrayBuffer())),foreign:await f.store.get(id,other),foreignList:await f.store.list(other)}
  },{id:expected.id,other})
  expect(actual).toEqual({originalName:'selected-original.png',processedName:'processed.png',bytes:expected.bytes,foreign:undefined,foreignList:[]})
  expect(f.posts).toHaveLength(0);expect(f.external).toEqual([]);expect(f.errors).toEqual([])
})

test('two tabs atomically reuse one pending operation for identical input',async({context,page})=>{
  const f=await fixture(context,page),second=await context.newPage()
  await second.goto('/tests/browser-uploads/fixture.html')
  await expect.poll(()=>second.evaluate(()=>Boolean(window.uploadFixture))).toBe(true)
  const create=tab=>tab.evaluate(async()=>{
    const f=window.uploadFixture
    return (await f.store.prepare({id:crypto.randomUUID(),owner:f.owner,active_key:f.owner+':same',state:'pending',created_at:Date.now(),files:await f.files()})).id
  })
  const ids=await Promise.all([create(page),create(second)])
  expect(ids[0]).toBe(ids[1])
  expect(await page.evaluate(async()=> (await window.uploadFixture.store.list(window.uploadFixture.owner)).length)).toBe(1)
  expect(f.posts).toHaveLength(0);expect(f.errors).toEqual([])
})

test('unfinished files survive limits and invalid receipts; only confirmed receipts permit compaction',async({context,page})=>{
  await fixture(context,page)
  const result=await page.evaluate(async({other,item})=>{
    const f=window.uploadFixture,files=await f.files(),ids=[]
    for(let i=0;i<5;i++)ids.push((await f.store.prepare({id:crypto.randomUUID(),owner:f.owner,active_key:f.owner+':'+i,state:'pending',created_at:Date.now(),files})).id)
    let limit='',invalid=''
    try{await f.store.prepare({id:crypto.randomUUID(),owner:f.owner,active_key:f.owner+':six',state:'pending',created_at:Date.now(),files})}catch(error){limit=error.message}
    try{await f.store.complete(ids[0],f.owner,{request_id:ids[0],item:{id:item,owner_id:other}})}catch(error){invalid=error.message}
    const retained=Boolean((await f.store.get(ids[0],f.owner)).files.original)
    await f.store.complete(ids[0],f.owner,{request_id:ids[0],item:{id:item,owner_id:f.owner}})
    const compacted=(await f.store.get(ids[0],f.owner)).files===undefined
    await f.store.acknowledge(ids[0],f.owner)
    const replacement=await f.store.prepare({id:crypto.randomUUID(),owner:f.owner,active_key:f.owner+':0',state:'pending',created_at:Date.now(),files})
    return {limit,invalid,retained,compacted,replacement:replacement.id!==ids[0],count:(await f.store.list(f.owner)).length}
  },{other,item})
  expect(result.limit).toMatch(/Finish the saved uploads/);expect(result.invalid).toMatch(/receipt/)
  expect(result).toMatchObject({retained:true,compacted:true,replacement:true,count:5})
})

test('real thumbnail and multipart client preserve both source files and explicit catalog consent',async({context,page})=>{
  const f=await fixture(context,page)
  const checkbox=page.getByRole('checkbox');await expect(checkbox).not.toBeChecked();await checkbox.check()
  const result=await page.evaluate(()=>window.uploadFixture.save())
  expect(result.success).toBe(true);expect(f.posts).toHaveLength(1)
  expect(f.posts[0].metadata.intent).toMatchObject({catalog_policy:'opt_in',catalog_consent:true,fields:{privacy:'private'}})
  const body=f.posts[0].body.toString()
  for(const filename of ['selected-original.png','processed.png','thumbnail.png'])expect(body).toContain(`filename="${filename}"`)
  expect(await page.evaluate(async()=> (await window.uploadFixture.store.list(window.uploadFixture.owner))[0].files)).toBeUndefined()
  expect(f.external).toEqual([]);expect(f.errors).toEqual([])
})

test('reload exposes a lost-response draft and keyboard recovery confirms it without transferring files again',async({context,page})=>{
  const f=await fixture(context,page,{loseReply:true})
  const error=await page.evaluate(async()=>{try{await window.uploadFixture.save()}catch(error){return error.message}})
  expect(error).toBeTruthy();expect(f.posts).toHaveLength(1)
  await page.reload()
  const retry=page.getByRole('button',{name:'Retry upload'});await expect(retry).toBeVisible()
  await retry.focus();await page.keyboard.press('Enter')
  await expect(page.getByRole('region',{name:'Saved uploads'})).toHaveCount(0)
  expect(await page.evaluate(()=>window.uploadFixture.recovered.length)).toBe(1)
  expect(f.posts).toHaveLength(1);expect(f.external).toEqual([]);expect(f.errors).toEqual([])
})

test('sign-out clears another account’s recovery names',async({context,page})=>{
  const f=await fixture(context,page,{loseReply:true})
  await page.evaluate(async()=>{try{await window.uploadFixture.save()}catch{}})
  await page.reload();await expect(page.getByText('Retained jacket',{exact:true})).toBeVisible()
  await page.evaluate(()=>window.uploadFixture.signIn(null))
  await expect(page.getByRole('region',{name:'Saved uploads'})).toHaveCount(0)
  await page.evaluate(other=>window.uploadFixture.signIn(other),other)
  await expect(page.getByRole('region',{name:'Saved uploads'})).toHaveCount(0)
  expect(f.posts).toHaveLength(1);expect(f.errors).toEqual([])
})
