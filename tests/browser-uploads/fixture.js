import { createApp, h, ref } from 'vue'
import UploadRecovery from '../../src/components/cabinet/UploadRecovery.vue'
import CatalogContribution from '../../src/components/cabinet/CatalogContribution.vue'
import { supabase } from '../../src/lib/supabase.js'
import { getPrivateUploader } from '../../src/lib/private-upload-runtime.js'
import { createUploadDraftStore } from '../../src/lib/upload-drafts.js'

const owner = '00000000-0000-4000-8000-000000000001'
let identity = owner
const listeners = new Set(), consent = ref(false), busy = ref(false)
supabase.auth.getSession = async () => ({ data: { session: identity ? { user: { id: identity }, access_token: 'synthetic-user' } : null } })
supabase.auth.onAuthStateChange = callback => {
  listeners.add(callback)
  return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }
}
const recovered = [], store = createUploadDraftStore()
const app = createApp({ setup: () => () => h('main', [
  h(CatalogContribution, { modelValue: consent.value, disabled: busy.value, 'onUpdate:modelValue': value => { consent.value = value } }),
  h(UploadRecovery, { onBusy: value => { busy.value = value }, onRecovered: value => recovered.push(value) }),
]) })
app.mount('#fixture')
async function file(name, width) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width
  const context = canvas.getContext('2d'); context.fillStyle = '#d04d32'; context.fillRect(0,0,width,width)
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'))
  return new File([blob],name,{type:'image/png'})
}
window.uploadFixture = {
  owner, store, recovered,
  async files() { return { original: await file('selected-original.png',16), processed: await file('processed.png',8) } },
  async save() { return getPrivateUploader().save({mode:'create',fields:{name:'Retained jacket',category:'outerwear',privacy:'private'},catalog_consent:consent.value},await this.files()) },
  signIn(value) { identity=value; for(const listener of listeners) listener(value?'SIGNED_IN':'SIGNED_OUT') },
  unmount: () => app.unmount(),
}
