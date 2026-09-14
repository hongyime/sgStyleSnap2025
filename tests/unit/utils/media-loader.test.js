import { describe, expect, it, vi } from 'vitest'
import { createMediaLoader, mediaReference } from '@/lib/media-loader'

const url = 'https://fixture.invalid/original.webp'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const reference = n => ({ table: 'clothes', id: id(n), column: 'image_url', sourceUrl: url })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const result = bytes => ({ blob: new Blob(['image']), bytes, sha256: 'a'.repeat(64) })
function fixture(options = {}) {
  const requests = [], revokeUrl = vi.fn(), createUrl = vi.fn(() => `blob:fixture-${createUrl.mock.calls.length}`)
  const read = vi.fn((_client, ref, { signal }) => new Promise((resolve, reject) => {
    requests.push({ ref, signal, resolve, reject })
  }))
  return { loader: createMediaLoader({ read, createUrl, revokeUrl, ...options }), requests, read, createUrl, revokeUrl }
}

describe('private media load ownership and resource limits', () => {
  it('bounds concurrent requests and does not start a cancelled queued image', async () => {
    const f = fixture({ maxConcurrent: 2 })
    const releases = [1, 2, 3, 4].map(n => f.loader.subscribe(reference(n), vi.fn()))
    await flush(); expect(f.requests).toHaveLength(2)
    releases[2]()
    f.requests[0].resolve(result(7)); await flush()
    expect(f.requests).toHaveLength(3)
    expect(f.requests[2].ref.id).toBe(id(4))
    releases.forEach(release => release()); f.loader.dispose()
  })

  it('shares one active image but revokes it when its final view unmounts', async () => {
    const f = fixture(), a = vi.fn(), b = vi.fn()
    const releaseA = f.loader.subscribe(reference(1), a)
    const releaseB = f.loader.subscribe(reference(1), b)
    await flush(); expect(f.read).toHaveBeenCalledOnce()
    f.requests[0].resolve(result(7)); await flush()
    expect(a.mock.lastCall[0].url).toBe(b.mock.lastCall[0].url)
    releaseA(); expect(f.revokeUrl).not.toHaveBeenCalled()
    releaseB(); releaseB(); expect(f.revokeUrl).toHaveBeenCalledOnce()
    f.loader.dispose()
  })

  it('invalidates current URLs and ignores a late result from the old session', async () => {
    const f = fixture(), listener = vi.fn()
    const release = f.loader.subscribe(reference(1), listener)
    await flush()
    f.loader.invalidate(); await flush()
    expect(f.requests[0].signal.aborted).toBe(true)
    f.requests[0].resolve(result(7)); await flush()
    expect(f.createUrl).not.toHaveBeenCalled()
    f.requests[1].resolve(result(7)); await flush()
    expect(listener.mock.lastCall[0].state).toBe('ready')
    f.loader.invalidate()
    expect(f.revokeUrl).toHaveBeenCalledOnce()
    expect(listener.mock.lastCall[0].url).toBe('')
    release(); f.loader.dispose()
  })

  it('retains no more than the configured byte budget and frees it on release', async () => {
    const f = fixture({ maxBytes: 10 }), a = vi.fn(), b = vi.fn()
    const releaseA = f.loader.subscribe(reference(1), a), releaseB = f.loader.subscribe(reference(2), b)
    await flush()
    f.requests[0].resolve(result(7)); await flush()
    f.requests[1].resolve(result(7)); await flush()
    expect(a.mock.lastCall[0].state).toBe('ready')
    expect(b.mock.lastCall[0].state).toBe('error')
    expect(f.createUrl).toHaveBeenCalledOnce()
    releaseA(); releaseB()
    const releaseC = f.loader.subscribe(reference(3), vi.fn())
    await flush(); f.requests[2].resolve(result(7)); await flush()
    expect(f.createUrl).toHaveBeenCalledTimes(2)
    releaseC(); f.loader.dispose()
  })

  it('caps waiting requests and never retries a failed read automatically', async () => {
    const f = fixture({ maxConcurrent: 1, maxQueued: 1 }), rejected = vi.fn()
    const a = f.loader.subscribe(reference(1), vi.fn()), b = f.loader.subscribe(reference(2), vi.fn())
    f.loader.subscribe(reference(3), rejected)
    expect(rejected.mock.lastCall[0].error).toBe('media_queue_full')
    await flush(); f.requests[0].reject(new Error('denied')); await flush()
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(f.requests[1].ref.id).toBe(id(2))
    a(); b(); f.loader.dispose()
  })

  it('pauses hidden views, revokes decoded images and revalidates when visible', async () => {
    const f = fixture(), listener = vi.fn()
    const release = f.loader.subscribe(reference(1), listener)
    await flush(); f.requests[0].resolve(result(7)); await flush()
    f.loader.setPaused(true)
    expect(f.revokeUrl).toHaveBeenCalledOnce()
    expect(listener.mock.lastCall[0].url).toBe('')
    await flush(); expect(f.read).toHaveBeenCalledOnce()
    f.loader.setPaused(false); await flush()
    expect(f.read).toHaveBeenCalledTimes(2)
    release(); f.loader.dispose()
  })

  it('does not create a URL when an unmounted request completes late', async () => {
    const f = fixture(), listener = vi.fn()
    const release = f.loader.subscribe(reference(1), listener)
    await flush(); release()
    const calls = listener.mock.calls.length
    f.requests[0].resolve(result(7)); await flush()
    expect(f.createUrl).not.toHaveBeenCalled()
    expect(listener.mock.calls).toHaveLength(calls)
    expect(f.requests[0].signal.aborted).toBe(true)
    f.loader.dispose()
  })
})

describe('persisted field references', () => {
  it('uses the original clothing identity in copies, nested outfits and suggestions', () => {
    for (const record of [
      { id: 'display-1', originalId: id(1), image_url: url },
      { id: id(2), clothing_item: { id: id(1), image_url: url } },
      { id: 'suggestion-copy', clothes_id: id(1), image_url: url },
      { clothing_item_id: id(1), image_url: url },
    ]) expect(mediaReference('clothes', record, url)).toEqual(reference(1))
  })

  it('keeps catalog, avatar and thumbnail source fields exact', () => {
    expect(mediaReference('catalog_items', { id: id(1), thumbnail_url: url }, url)).toEqual({ ...reference(1), table: 'catalog_items', column: 'thumbnail_url' })
    expect(mediaReference('users', { id: id(1), avatar_url: url }, url)).toEqual({ ...reference(1), table: 'users', column: 'avatar_url' })
    expect(mediaReference('users', { id: id(1), avatar_url: url }, '/api/proxy-image?url=other')).toBe(null)
    expect(mediaReference('clothes', { id: 'display-1', image_url: url }, url)).toBe(null)
    expect(mediaReference('unknown', { id: id(1), image_url: url }, url)).toBe(null)
  })

  it('resolves the landing demo canvas to its original catalog row', () => {
    const record = { id: 'canvas-123-random', originalId: id(1), thumbnail_url: url }
    expect(mediaReference('catalog_items', record, url)).toEqual({
      ...reference(1), table: 'catalog_items', column: 'thumbnail_url',
    })
  })
})
