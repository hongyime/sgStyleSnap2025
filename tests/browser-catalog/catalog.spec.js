import { test, expect } from '@playwright/test'

const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const catalog='00000000-0000-4000-8000-000000000003',itemId='00000000-0000-4000-8000-000000000004'
const endpoint='https://nztqjmknblelnzpeatyx.supabase.co/functions/v1/private-catalog-adoption'
async function backend(context,options={}) {
  const state={requests:[],items:[],unexpected:[],errors:[],release:null}
  await context.route('**/*',async route=>{
    const req=route.request(),url=req.url()
    if(url.startsWith('http://127.0.0.1:4480/'))return route.continue()
    if(url!==endpoint){state.unexpected.push(url);return route.abort()}
    const headers={'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:4480',
      'access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
    const body=req.postDataJSON();state.requests.push(body)
    expect(Object.keys(body).sort()).toEqual(['catalog_item_id','privacy']);expect(body.catalog_item_id).toBe(catalog)
    expect(req.headers().authorization).toBe('Bearer synthetic-user')
    const created=state.items.length===0
    if(created)state.items.push({id:itemId,owner_id:actor,catalog_item_id:catalog,privacy:body.privacy})
    if(options.hold)await new Promise(resolve=>{state.release=resolve})
    if(options.loseFirst && state.requests.length===1)return route.fulfill({status:503,headers,body:JSON.stringify({error:'catalog_adoption_unconfirmed'})})
    return route.fulfill({status:200,headers,body:JSON.stringify({created,item:state.items[0]})})
  })
  return state
}
async function open(page,state){page.on('pageerror',error=>state.errors.push(error.message));await page.goto('/tests/browser-catalog/fixture.html');await page.waitForFunction(()=>!!window.catalogFixture)}

test('keyboard submission uses the private service and creates one wardrobe copy',async({page,context})=>{
  const state=await backend(context);await open(page,state)
  await page.getByLabel('Sharing').selectOption('private')
  await page.getByRole('button',{name:'Add catalog item'}).focus();await page.keyboard.press('Enter')
  await expect(page.locator('output')).toHaveText('Saved item: '+itemId)
  expect(state.items).toHaveLength(1);expect(state.items[0].privacy).toBe('private')
  expect(state.requests).toHaveLength(1);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
})
test('an uncertain response survives page reload and explicit retry without duplicate insertion',async({page,context})=>{
  const state=await backend(context,{loseFirst:true});await open(page,state)
  await page.getByRole('button',{name:'Add catalog item'}).click()
  await expect(page.locator('output')).toContainText('could not be confirmed')
  expect(state.requests).toHaveLength(1);expect(state.items).toHaveLength(1)
  await page.reload();await page.waitForFunction(()=>!!window.catalogFixture)
  await page.getByRole('button',{name:'Add catalog item'}).click()
  await expect(page.locator('output')).toHaveText('Saved item: '+itemId)
  expect(state.requests).toHaveLength(2);expect(state.items).toHaveLength(1)
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
})
test('an account change cannot display a previous account’s successful result',async({page,context})=>{
  const state=await backend(context,{hold:true});await open(page,state)
  await page.getByRole('button',{name:'Add catalog item'}).click()
  await expect.poll(()=>typeof state.release).toBe('function')
  await page.evaluate(id=>window.catalogFixture.signIn(id),other);state.release()
  await expect(page.locator('output')).toContainText('Your account changed')
  await expect(page.locator('output')).not.toContainText('Saved item:')
  expect(state.items[0].owner_id).toBe(actor);expect(state.requests).toHaveLength(1)
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
})
