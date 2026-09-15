import { createCatalogAdoptionHandler } from './handler.mjs'

// Preparation only. Database, delivery, quota and this endpoint all default off.
Deno.serve(createCatalogAdoptionHandler({
  enabled: Deno.env.get('STYLESNAP_CATALOG_ADOPTIONS_ENABLED') === 'true',
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: (Deno.env.get('STYLESNAP_UPLOAD_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean),
}))
