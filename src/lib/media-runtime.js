import { supabase } from './supabase.js'
import { createMediaLoader } from './media-loader.js'

// Enable only after the private bindings, byte parity and capacity gates pass.
export const privateMediaEnabled = import.meta.env.VITE_PRIVATE_MEDIA_ENABLED === 'true'
let runtime
export function getMediaRuntime() {
  if (!runtime) {
    runtime = createMediaLoader({ client: supabase })
    let identity
    supabase?.auth.onAuthStateChange((event, session) => {
      const next = `${session?.user?.id || ''}:${session?.access_token || ''}`
      if (event === 'SIGNED_OUT' || (identity !== next && (identity !== undefined || event !== 'INITIAL_SESSION'))) runtime.invalidate()
      identity = next
    })
    if (typeof document !== 'undefined') {
      runtime.setPaused(document.hidden)
      document.addEventListener('visibilitychange', () => runtime.setPaused(document.hidden))
    }
  }
  return runtime
}
