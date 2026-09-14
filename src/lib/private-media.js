const BUCKET = 'stylesnap-media-archive'
export const MAX_PRIVATE_MEDIA_BYTES = 50_000_000
const fields = {
  clothes: ['image_url', 'thumbnail_url'],
  catalog_items: ['image_url', 'thumbnail_url'],
  users: ['avatar_url'],
  outfit_collections: ['cover_image_url'],
  outfit_history: ['photo_url'],
}
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const checksumPattern = /^[0-9a-f]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PrivateMediaError extends Error {
  constructor(code) {
    super(code)
    this.name = 'PrivateMediaError'
    this.code = code
  }
}

function validReference(reference) {
  return reference && fields[reference.table]?.includes(reference.column)
    && uuidPattern.test(reference.id)
    && typeof reference.sourceUrl === 'string'
    && reference.sourceUrl.length > 0 && reference.sourceUrl.length <= 4096
}

function validBinding(binding, reference) {
  return binding && binding.source_table === reference.table
    && binding.source_id === reference.id && binding.source_column === reference.column
    && binding.source_url === reference.sourceUrl
    && checksumPattern.test(binding.manifest_sha) && checksumPattern.test(binding.content_sha256)
    && binding.object_path === `sha256/${binding.content_sha256.slice(0, 2)}/${binding.content_sha256}`
    && Number.isSafeInteger(binding.content_bytes)
    && binding.content_bytes > 0 && binding.content_bytes <= MAX_PRIVATE_MEDIA_BYTES
    && imageTypes.has(binding.mime_type)
}

/**
 * Read one verified image through the caller's existing Supabase client and RLS.
 * No service key, signed URL, transform, source-provider request, cache or retry.
 * The application must bound concurrent calls and revoke its own object URLs.
 */
export async function readPrivateMedia(client, reference, { signal, timeoutMs = 10_000 } = {}) {
  if (!validReference(reference) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) {
    throw new PrivateMediaError('invalid_media_reference')
  }
  if (signal?.aborted) throw new PrivateMediaError('media_read_cancelled')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const deadline = setTimeout(cancel, timeoutMs)
  let reader
  const cancelRead = () => { reader?.cancel().catch(() => {}) }
  controller.signal.addEventListener('abort', cancelRead)
  try {
    const { data: binding, error } = await client.from('stylesnap_media_bindings')
      .select('source_table,source_id,source_column,source_url,manifest_sha,content_sha256,object_path,content_bytes,mime_type')
      .eq('source_table', reference.table).eq('source_id', reference.id)
      .eq('source_column', reference.column).eq('source_url', reference.sourceUrl)
      .retry(false).abortSignal(controller.signal).maybeSingle()
    if (controller.signal.aborted) throw new PrivateMediaError('media_read_cancelled')
    if (error || !binding) throw new PrivateMediaError('media_unavailable')
    if (!validBinding(binding, reference)) throw new PrivateMediaError('invalid_media_binding')

    const download = await client.storage.from(BUCKET)
      .download(binding.object_path, {}, { signal: controller.signal, cache: 'no-store' }).asStream()
    if (download.error || !download.data) throw new PrivateMediaError('media_unavailable')
    reader = download.data.getReader()
    const chunks = []
    let size = 0
    while (true) {
      if (controller.signal.aborted) throw new PrivateMediaError('media_read_cancelled')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > binding.content_bytes) throw new PrivateMediaError('media_size_mismatch')
      chunks.push(value)
    }
    if (controller.signal.aborted) throw new PrivateMediaError('media_read_cancelled')
    if (size !== binding.content_bytes) throw new PrivateMediaError('media_size_mismatch')
    const content = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      content.set(chunk, offset)
      offset += chunk.byteLength
    }
    const hash = await globalThis.crypto.subtle.digest('SHA-256', content)
    const checksum = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    if (checksum !== binding.content_sha256) throw new PrivateMediaError('media_checksum_mismatch')
    if (controller.signal.aborted) throw new PrivateMediaError('media_read_cancelled')
    return { blob: new Blob([content], { type: binding.mime_type }), sha256: checksum, bytes: size }
  } catch (error) {
    if (controller.signal.aborted) throw new PrivateMediaError('media_read_cancelled')
    if (error instanceof PrivateMediaError) throw error
    throw new PrivateMediaError('media_read_failed')
  } finally {
    clearTimeout(deadline)
    signal?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', cancelRead)
    controller.abort()
    if (reader) {
      try { await reader.cancel() } catch { /* The request may already be aborted. */ }
      reader.releaseLock()
    }
  }
}
