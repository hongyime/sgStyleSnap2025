import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { CatalogService } from '@/services/catalogService'

const f=vi.hoisted(()=>({enabled:true,add:vi.fn(),get:vi.fn(),rpc:vi.fn(),getUser:vi.fn()}))
vi.mock('@/lib/media-runtime.js',()=>({get privateMediaEnabled(){return f.enabled}}))
vi.mock('@/lib/private-catalog-runtime.js',()=>({getPrivateCatalogClient:()=>f.get()}))
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:f.getUser},rpc:f.rpc}}))
beforeEach(()=>{
  f.enabled=true;f.add.mockReset().mockResolvedValue('saved-item');f.get.mockReset().mockReturnValue({add:f.add})
  f.rpc.mockReset().mockResolvedValue({data:'legacy-item',error:null});f.getUser.mockReset().mockResolvedValue({data:{user:{id:'owner'}}})
  vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{})
})
afterEach(()=>vi.restoreAllMocks())
it('private mode sends catalog identity and sharing to the trusted path',async()=>{
  expect(await new CatalogService().addToCloset('catalog','private')).toBe('saved-item')
  expect(f.add).toHaveBeenCalledWith('catalog','private');expect(f.rpc).not.toHaveBeenCalled();expect(f.getUser).not.toHaveBeenCalled()
})
it('a disabled private writer never falls back to the unbound legacy insert',async()=>{
  f.get.mockImplementation(()=>{throw new Error('Temporarily unavailable')})
  await expect(new CatalogService().addToCloset('catalog')).rejects.toThrow(/unavailable/)
  expect(f.rpc).not.toHaveBeenCalled()
})
it('failed private publication remains a visible error',async()=>{
  f.add.mockRejectedValue(new Error('Could not confirm'))
  await expect(new CatalogService().addToCloset('catalog')).rejects.toThrow(/confirm/)
  expect(f.rpc).not.toHaveBeenCalled()
})
it('the current Cloudinary mode retains its existing catalog RPC and return contract',async()=>{
  f.enabled=false
  expect(await new CatalogService().addToCloset('catalog','friends')).toBe('legacy-item')
  expect(f.rpc).toHaveBeenCalledWith('add_catalog_item_to_closet',{user_id_param:'owner',catalog_item_id_param:'catalog',privacy_param:'friends'})
  expect(f.get).not.toHaveBeenCalled()
})
