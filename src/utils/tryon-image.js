// Derivatives are temporary request inputs. Retained originals are never modified.
export const MAX_TRYON_SOURCE_BYTES = 8 * 1024 * 1024
export const MAX_TRYON_IMAGE_BYTES = 1024 * 1024
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export async function fetchTryOnImage(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Unable to load the clothing image')
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!imageTypes.has(type) || Number(response.headers.get('content-length')) > MAX_TRYON_SOURCE_BYTES) {
    await response.body?.cancel()
    throw new Error('Clothing image exceeds the supported type or size')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Unable to read the clothing image')
  const chunks = []
  let size = 0, complete = false
  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) { complete = true; break }
      size += value.byteLength
      if (size > MAX_TRYON_SOURCE_BYTES) throw new Error('Clothing image is too large for try-on')
      chunks.push(value)
    }
    return new Blob(chunks, { type })
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function prepareTryOnImage(blob, { signal } = {}) {
  signal?.throwIfAborted()
  if (!blob?.size || blob.size > MAX_TRYON_SOURCE_BYTES || !imageTypes.has(blob.type)) {
    throw new Error('Clothing image exceeds the supported type or size')
  }
  const bitmap = await createImageBitmap(blob)
  let canvas
  try {
    signal?.throwIfAborted()
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_777_216) {
      throw new Error('Clothing image dimensions are too large for try-on')
    }
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && blob.size <= MAX_TRYON_IMAGE_BYTES && ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
      return blob
    }
    canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare the clothing image')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.85, 0.65, 0.45]) {
      signal?.throwIfAborted()
      const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      signal?.throwIfAborted()
      if (result?.size && result.size <= MAX_TRYON_IMAGE_BYTES) return result
    }
    throw new Error('Unable to prepare a small enough clothing image')
  } finally {
    bitmap.close()
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}
