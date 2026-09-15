import { createUploadHandler } from './handler.mjs'

// Source preparation only. Activation also requires the database controls,
// complete retained-byte parity, all writer paths, quota and hosted validation.
Deno.serve(createUploadHandler({
  enabled: Deno.env.get('STYLESNAP_PRIVATE_UPLOADS_ENABLED') === 'true',
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: (Deno.env.get('STYLESNAP_UPLOAD_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean),
}))
