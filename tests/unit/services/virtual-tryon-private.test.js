import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({ enabled: true, read: vi.fn(), unsubscribe: vi.fn(), authChanged: null,
  client: { auth: { onAuthStateChange: vi.fn() } } }))
vi.mock('@/lib/media-runtime.js', () => ({ get privateMediaEnabled() { return f.enabled } }))
vi.mock('@/lib/supabase.js', () => ({ supabase: f.client }))
vi.mock('@/lib/private-media.js', () => ({ readPrivateMedia: f.read }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class {} }))
vi.mock('@/utils/log-sanitizer', () => ({ sanitizeUrl: () => '[image]', safeLog: vi.fn(), safeWarn: vi.fn(), safeError: vi.fn() }))
import { VirtualTryOnService } from '@/services/virtualTryOnService'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = n => ({ id: `canvas-${n}`, originalId: id(n), image_url: `https://old-provider.example/${n}.png` })
const top = item(1), bottom = item(2)
let fetchMock
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
beforeEach(() => {
  f.enabled = true; f.read.mockReset()
  f.unsubscribe.mockReset()
  f.client.auth.onAuthStateChange.mockImplementation(callback => {
    f.authChanged = callback
    return { data: { subscription: { unsubscribe: f.unsubscribe } } }
  })
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })))
  f.read.mockResolvedValue({ blob: new Blob(['verified image'], { type: 'image/png' }), bytes: 14 })
  fetchMock = vi.fn(async (url, options) => {
    if (url !== '/api/proxy-gemini') throw new Error('Unexpected external image fetch')
    const body = JSON.parse(options.body)
    return { ok: true, json: async () => body.type === 'analyzeClothingImages'
      ? { success: true, description: 'A top and trousers.' }
      : { success: true, imageBytes: 'aW1hZ2U=' } }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_GEMINI_API_KEY', '')
  class TestURL extends URL {}
  TestURL.createObjectURL = vi.fn(() => 'blob:generated')
  vi.stubGlobal('URL', TestURL)
})

describe('private try-on image consumption', () => {
  it('reads both retained rows and sends image bytes without fetching old provider URLs', async () => {
    const service = new VirtualTryOnService()
    const result = await service.generateTryOn({ topImageUrl: top.image_url, bottomImageUrl: bottom.image_url, topItem: top, bottomItem: bottom })
    expect(result.success).toBe(true)
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(f.read.mock.calls.map(args => args[1])).toEqual([top, bottom].map(row => ({ table: 'clothes', id: row.originalId, column: 'image_url', sourceUrl: row.image_url })))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe('/api/proxy-gemini')
      const body = JSON.parse(options.body)
      expect(body.topImageBase64).toMatch(/^data:image\/png;base64,/)
      expect(body.bottomImageBase64).toMatch(/^data:image\/png;base64,/)
      expect(options.body).not.toContain('old-provider.example')
    }
  })

  it('stops before provider calls when a private binding is denied', async () => {
    f.read.mockRejectedValue(new Error('media_unavailable'))
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top })
    expect(result.success).toBe(false)
    expect(f.read).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a display-only ID before reading or sending an image', async () => {
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: { id: 'canvas-only', image_url: top.image_url } })
    expect(result.success).toBe(false)
    expect(f.read).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not read the first image if the second reference is invalid', async () => {
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top, bottomImageUrl: bottom.image_url })
    expect(result.success).toBe(false)
    expect(f.read).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops on sign-out while an image is being read', async () => {
    f.read.mockImplementation(async () => {
      f.authChanged('SIGNED_OUT')
      return { blob: new Blob(['image'], { type: 'image/png' }) }
    })
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not generate after analysis is cancelled', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top, signal: controller.signal })
    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects images above the input cap before sending to AI', async () => {
    f.read.mockResolvedValue({ blob: new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' }) })
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves legacy source reads when private mode is off', async () => {
    f.enabled = false
    const proxy = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((url, options) => url === top.image_url
      ? Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
      : proxy(url, options))
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url })
    expect(result.success).toBe(true)
    expect(f.read).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('bounds both complete proxy request bodies below three megabytes', async () => {
    f.read.mockResolvedValue({ blob: new Blob([new Uint8Array(1024 * 1024)], { type: 'image/png' }) })
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url, topItem: top, bottomImageUrl: bottom.image_url, bottomItem: bottom })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, options] of fetchMock.mock.calls) expect(new Blob([options.body]).size).toBeLessThan(3_000_000)
  })

  it('keeps private media on the proxy even when a legacy development key exists', () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'synthetic-development-key')
    const service = new VirtualTryOnService()
    expect(service.useProxy).toBe(true)
    expect(service.client).toBeNull()
  })

  it('cancels an oversized legacy stream even when its length header is absent', async () => {
    f.enabled = false
    const cancel = vi.fn()
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)) }, cancel,
    }), { headers: { 'content-type': 'image/png' } }))
    const result = await new VirtualTryOnService().generateTryOn({ topImageUrl: top.image_url })
    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
