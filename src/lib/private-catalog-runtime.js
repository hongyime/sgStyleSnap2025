import { supabase } from './supabase.js'
import { privateMediaEnabled } from './media-runtime.js'
import { createPrivateCatalogClient } from './private-catalog-client.js'

let catalogClient
export function getPrivateCatalogClient() {
  if(!privateMediaEnabled || import.meta.env.VITE_PRIVATE_CATALOG_ADOPTIONS_ENABLED!=='true') {
    throw new Error('Catalog additions are temporarily unavailable. Try again later.')
  }
  if(!catalogClient)catalogClient=createPrivateCatalogClient({client:supabase,
    url:import.meta.env.VITE_SUPABASE_URL,anonKey:import.meta.env.VITE_SUPABASE_ANON_KEY})
  return catalogClient
}
