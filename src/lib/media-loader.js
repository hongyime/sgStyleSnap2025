import { readPrivateMedia } from './private-media.js'

const columns = {
  clothes: ['image_url', 'thumbnail_url'], catalog_items: ['image_url', 'thumbnail_url'],
  users: ['avatar_url'], outfit_collections: ['cover_image_url'], outfit_history: ['photo_url'],
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identify the retained source row, never an outfit's display-instance ID. */
export function mediaReference(table, record, sourceUrl) {
  if (!record || typeof sourceUrl !== 'string' || !sourceUrl) return null
  const row = table === 'clothes' ? (record.clothing_item || record) : record
  const id = table === 'clothes'
    ? (row.originalId || row.clothes_id || row.clothing_item_id || row.id)
    : table === 'catalog_items' ? (row.originalId || row.id) : row.id
  const column = columns[table]?.find(name => row[name] === sourceUrl)
  return uuid.test(id || '') && column ? { table, id, column, sourceUrl } : null
}

/** Shared only by currently mounted views. No persisted URL or permission cache. */
export function createMediaLoader({ client, read = readPrivateMedia, maxConcurrent = 3,
  maxBytes = 64 * 1024 * 1024, maxQueued = 128,
  createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url),
} = {}) {
  const entries = new Map()
  let queue = [], active = 0, retainedBytes = 0, generation = 0, paused = false, stopped = false
  const notify = entry => {
    for (const listener of entry.listeners) listener({ state: entry.state, url: entry.url || '', error: entry.error || '' })
  }
  function revoke(entry) {
    if (entry.url) revokeUrl(entry.url)
    retainedBytes -= entry.bytes || 0
    entry.url = ''; entry.bytes = 0
  }
  function remove(entry) {
    entry.controller?.abort()
    queue = queue.filter(queued => queued !== entry)
    if (entries.get(entry.key) === entry) entries.delete(entry.key)
    revoke(entry)
  }
  function pump() {
    while (!paused && !stopped && active < maxConcurrent && queue.length) {
      const entry = queue.shift()
      if (!entry.listeners.size || entries.get(entry.key) !== entry) continue
      const epoch = generation
      const controller = new AbortController()
      entry.controller = controller; entry.state = 'loading'; entry.error = ''
      active++; notify(entry)
      const current = () => !controller.signal.aborted && epoch === generation
        && entries.get(entry.key) === entry && entry.listeners.size > 0
      Promise.resolve().then(() => {
        if (!current()) return null
        return read(client, entry.reference, { signal: controller.signal })
      }).then(result => {
        if (!current()) return
        if (!result || !Number.isSafeInteger(result.bytes) || result.bytes < 1
            || retainedBytes + result.bytes > maxBytes) throw new Error('media_memory_limit')
        entry.url = createUrl(result.blob); entry.bytes = result.bytes
        retainedBytes += result.bytes; entry.state = 'ready'; notify(entry)
      }).catch(error => {
        if (!current()) return
        entry.state = 'error'; entry.error = error?.code || 'media_unavailable'; notify(entry)
      }).finally(() => { active--; pump() })
    }
  }
  function subscribe(reference, listener) {
    if (stopped) { listener({ state: 'error', url: '', error: 'media_unavailable' }); return () => {} }
    const key = JSON.stringify(reference)
    let entry = entries.get(key)
    if (!entry) {
      if (queue.length >= maxQueued) {
        listener({ state: 'error', url: '', error: 'media_queue_full' }); return () => {}
      }
      entry = { key, reference, listeners: new Set(), state: 'queued', url: '', bytes: 0 }
      entries.set(key, entry); queue.push(entry)
    }
    entry.listeners.add(listener); notify(entry); pump()
    let released = false
    return () => {
      if (released) return
      released = true; entry.listeners.delete(listener)
      if (!entry.listeners.size) remove(entry)
    }
  }
  function invalidate() {
    generation++; queue = []
    for (const entry of entries.values()) {
      entry.controller?.abort(); revoke(entry)
      entry.state = 'queued'; entry.error = ''; queue.push(entry); notify(entry)
    }
    // Auth callbacks remain synchronous and never wait for another auth request.
    queueMicrotask(pump)
  }
  function setPaused(value) {
    if (paused === value) return
    paused = value
    if (paused) invalidate()
    else pump()
  }
  function dispose() {
    stopped = true
    for (const entry of entries.values()) { remove(entry); entry.listeners.clear() }
    queue = []
  }
  return { subscribe, invalidate, setPaused, dispose }
}
