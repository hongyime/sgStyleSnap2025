import { supabase } from './supabase.js'
import { privateMediaEnabled } from './media-runtime.js'
import { createPrivateUploadClient } from './private-upload-client.js'

export const privateUploadsEnabled = privateMediaEnabled && import.meta.env.VITE_PRIVATE_UPLOADS_ENABLED === 'true'
export const privateCatalogPolicy = import.meta.env.VITE_PRIVATE_CATALOG_POLICY || ''
let uploader
export function getPrivateUploader() {
  if (!privateUploadsEnabled) throw new Error('Uploads are temporarily unavailable. Keep your selected files for retry.')
  if (!uploader) uploader = createPrivateUploadClient({
    client: supabase,
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    catalogPolicy: privateCatalogPolicy,
  })
  return uploader
}
