import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { ClothesService } from '@/services/clothesService'

const f=vi.hoisted(()=>({save:vi.fn(),update:vi.fn(),cloudinary:vi.fn(),get:vi.fn()}))
vi.mock('@/lib/media-runtime.js',()=>({privateMediaEnabled:true}))
vi.mock('@/lib/private-upload-runtime.js',()=>({getPrivateUploader:()=>f.get()}))
vi.mock('@/lib/cloudinary',()=>({cloudinary:{uploadImage:f.cloudinary}}))
vi.mock('@/lib/supabase',()=>({handleSupabaseError:error=>{throw error},supabase:{
  auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
  from:()=>({update:fields=>{f.update(fields);const query={eq:()=>query,select:()=>query,single:async()=>({data:{id:'item',...fields}})};return query}}),
}}))
beforeEach(()=>{Object.values(f).forEach(mock=>mock.mockReset());f.get.mockReturnValue({save:f.save});f.save.mockResolvedValue({success:true,upload_receipt:'receipt'});vi.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(()=>vi.restoreAllMocks())
const files=()=>({original_file:new File(['original'],'original.png'),image_file:new File(['processed'],'processed.png')})

it('sends both originals and processed files to the trusted writer without trusting caller ownership or URLs',async()=>{
  const selected=files()
  const result=await new ClothesService().addClothes({...selected,name:'Jacket',color:'blue',privacy:'private',catalog_consent:true,owner_id:'other',image_url:'unverified'})
  expect(result.upload_receipt).toBe('receipt')
  expect(f.save).toHaveBeenCalledWith({mode:'create',fields:{name:'Jacket',primary_color:'blue',privacy:'private'},catalog_consent:true},{original:selected.original_file,processed:selected.image_file})
  expect(f.update).not.toHaveBeenCalled();expect(f.cloudinary).not.toHaveBeenCalled()
})
it('replacement images use the same trusted publication path',async()=>{
  const selected=files()
  await new ClothesService().updateClothes('item',{...selected,name:'Replacement',image_url:'old',thumbnail_url:'old-thumb'})
  expect(f.save).toHaveBeenCalledWith({mode:'update',source_id:'item',fields:{name:'Replacement'}},{original:selected.original_file,processed:selected.image_file})
  expect(f.update).not.toHaveBeenCalled()
})
it('rejects direct image pointer edits before issuing a database update',async()=>{
  for(const field of ['image_url','thumbnail_url'])await expect(new ClothesService().updateClothes('item',{[field]:'unverified'})).rejects.toThrow(/verified/)
  expect(f.update).not.toHaveBeenCalled();expect(f.cloudinary).not.toHaveBeenCalled()
})
it('preserves normal metadata edits through owner-scoped RLS updates',async()=>{
  await new ClothesService().updateClothes('item',{name:'Renamed'})
  expect(f.update).toHaveBeenCalledWith({name:'Renamed'});expect(f.save).not.toHaveBeenCalled()
})
it('disabled private uploads cannot silently fall back to Cloudinary',async()=>{
  f.get.mockImplementation(()=>{throw new Error('Uploads are temporarily unavailable')})
  await expect(new ClothesService().addClothes({...files(),name:'Jacket'})).rejects.toThrow(/temporarily unavailable/)
  expect(f.cloudinary).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled()
})
