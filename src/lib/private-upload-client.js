import { createUploadDraftStore } from './upload-drafts.js'

const PROJECT = 'https://nztqjmknblelnzpeatyx.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fileLimit = 4 * 1024 * 1024
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(byte => byte.toString(16).padStart(2, '0')).join('')
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
export async function createUploadThumbnail(file) {
  const image = await createImageBitmap(file)
  try {
    if (!image.width || !image.height || image.width * image.height > 50000000) throw new Error('This image is too large to prepare a preview.')
    const ratio = Math.min(1, 256 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * ratio))
    canvas.height = Math.max(1, Math.round(image.height * ratio))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.size > 1024 * 1024) throw new Error('Could not prepare this image preview.')
    return new File([blob], 'thumbnail.png', { type: 'image/png' })
  } finally { image.close() }
}

function userMessage(code) {
  if (code === 'upload_worker_busy') return 'The upload service is busy. Your draft is saved; retry shortly.'
  if (code === 'upload_in_progress') return 'This upload is still finishing. Keep the draft and retry shortly.'
  if (code === 'upload_source_changed') return 'This item changed while uploading. Your files are saved; review the item before retrying.'
  if (code === 'upload_limit_reached') return 'Uploads have reached a limit. Your draft is saved for later.'
  if (code === 'upload_catalog_policy_changed') return 'The sharing settings changed. Your draft is saved; reload before retrying.'
  if (code === 'authentication_required' || code === 'authentication_failed') return 'Sign in again to resume this upload.'
  return 'The upload could not be confirmed. Your draft is saved; retry it below.'
}

export function createPrivateUploadClient({ client, url, anonKey, catalogPolicy, store = createUploadDraftStore(), fetcher = fetch, thumbnail = createUploadThumbnail }) {
  const running = new Map()
  async function identity() {
    if (url !== PROJECT || !anonKey || !['opt_in', 'public_only', 'legacy'].includes(catalogPolicy)) throw new Error('Private uploads are not available yet.')
    const { data, error } = await client.auth.getSession()
    const session = data?.session
    if (error || !UUID.test(session?.user?.id || '') || !session.access_token) throw new Error('Sign in to upload or recover a draft.')
    return { owner: session.user.id.toLowerCase(), token: session.access_token }
  }
  async function call(method, token, id, body) {
    const response = await fetcher(PROJECT + '/functions/v1/private-media-upload' + (method === 'GET' ? '?request_id=' + id : ''), {
      method, headers: { authorization: 'Bearer ' + token, apikey: anonKey }, ...(body ? { body } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(95000),
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error(userMessage())
    let length = 0
    const chunks = []
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        length += next.value.length
        if (length > 65536) throw new Error(userMessage())
        chunks.push(next.value)
      }
    } finally { void reader.cancel().catch(() => {}) }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    let result
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new Error(userMessage()) }
    if (!response.ok) throw new Error(userMessage(result.error))
    return result
  }
  async function send(record, who) {
    // The original request id survives a lost response, page reload or another
    // tab. Inspect first; a completed upload never sends the files again.
    let result = await call('GET', who.token, record.id)
    if (result.state !== 'published') {
      if (record.state === 'complete' || !record.files || !['missing', 'reserved', 'stored'].includes(result.state)) throw new Error(userMessage())
      const body = new FormData()
      body.append('metadata', JSON.stringify({ request_id: record.id, intent: record.intent }))
      for (const part of ['original', 'processed', 'thumbnail']) body.append(part, record.files[part], record.files[part].name)
      result = await call('POST', who.token, record.id, body)
    }
    if (result.state !== 'published' || result.receipt?.request_id !== record.id
        || result.receipt.item?.owner_id !== who.owner || !UUID.test(result.receipt.item?.id || '')) throw new Error(userMessage())
    // Publication is authoritative even if a browser refuses cache compaction.
    // The retained active key still lets a later retry recover this same receipt.
    await store.complete(record.id, who.owner, result.receipt).catch(() => {})
    const current = await identity()
    if (current.owner !== who.owner) throw new Error('Your account changed. Sign in to the original account to confirm this saved upload.')
    return { success: true, data: result.receipt.item, upload_receipt: record.id }
  }
  function once(key, action) {
    if (!running.has(key)) {
      const work = action().catch(error => { throw new Error(error?.message || userMessage()) }).finally(() => running.delete(key))
      running.set(key, work)
    }
    return running.get(key)
  }
  return {
    async save(intent, files) {
      const who = await identity()
      for (const part of ['original', 'processed']) {
        if (!(files[part] instanceof File) || !files[part].size || files[part].size > fileLimit) throw new Error('Keep both the original and processed image, each no larger than 4 MiB. Your selected files have not been changed.')
      }
      const finalIntent = { ...intent, catalog_policy: catalogPolicy, catalog_consent: intent.catalog_consent === true }
      const descriptors = {}
      for (const part of ['original', 'processed']) descriptors[part] = { sha256: await hash(await files[part].arrayBuffer()), name: files[part].name, bytes: files[part].size }
      const fingerprint = await hash(new TextEncoder().encode(JSON.stringify(canonical({ intent: finalIntent, descriptors }))))
      const key = who.owner + ':' + fingerprint
      return once(key, async () => {
        const preview = await thumbnail(files.processed)
        const record = await store.prepare({ id: crypto.randomUUID(), owner: who.owner, active_key: key, intent: finalIntent,
          files: { original: files.original, processed: files.processed, thumbnail: preview }, state: 'pending', created_at: Date.now() })
        return send(record, who)
      })
    },
    async pending() {
      const who = await identity()
      return (await store.list(who.owner)).map(record => ({ id: record.id, name: record.intent?.fields?.name || 'Saved item', state: record.state }))
    },
    async resume(id) {
      const who = await identity(), record = await store.get(id, who.owner)
      if (!record || record.state === 'acknowledged') throw new Error('This recovery draft is no longer available.')
      return once(record.active_key, () => send(record, who))
    },
    async acknowledge(id) {
      if (!id) return
      const who = await identity()
      await store.acknowledge(id, who.owner)
    },
  }
}
