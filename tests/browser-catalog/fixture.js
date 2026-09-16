import { supabase } from '../../src/lib/supabase.js'
import { catalogService } from '../../src/services/catalogService.js'

let identity='00000000-0000-4000-8000-000000000001'
supabase.auth.getSession=async()=>({data:{session:identity?{user:{id:identity},access_token:'synthetic-user'}:null}})
window.catalogFixture={signIn:value=>{identity=value}}
const button=document.querySelector('#add'),output=document.querySelector('#result')
button.addEventListener('click',async()=>{
  button.disabled=true;output.textContent='Adding…'
  try {
    const id=await catalogService.addToCloset('00000000-0000-4000-8000-000000000003',document.querySelector('#privacy').value)
    output.textContent='Saved item: '+id
  } catch(error){output.textContent=error.message}
  finally{button.disabled=false}
})
