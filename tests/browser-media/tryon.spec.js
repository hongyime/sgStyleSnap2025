import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64')
const sha = createHash('sha256').update(png).digest('hex')

async function fixture(page, { denied = false, corrupt = false } = {}) {
  const external = [], metadata = [], ai = []
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.hostname === '127.0.0.1') {
      if (url.pathname === '/api/proxy-gemini') {
        const body = request.postDataJSON(); ai.push(body)
        return route.fulfill({ json: body.type === 'analyzeClothingImages'
          ? { success: true, description: 'A top and trousers.' }
          : { success: true, imageBytes: png.toString('base64') } })
      }
      return route.continue()
    }
    if (url.hostname === 'media-fixture.supabase.co') {
      if (url.pathname === '/rest/v1/stylesnap_media_bindings') {
        const value = key => url.searchParams.get(key)?.slice(3)
        metadata.push(value('source_id'))
        if (denied) return route.fulfill({ status: 403, json: { message: 'denied' } })
        return route.fulfill({ json: [{ source_table: value('source_table'), source_id: value('source_id'),
          source_column: value('source_column'), source_url: value('source_url'), manifest_sha: 'a'.repeat(64),
          content_sha256: sha, object_path: `sha256/${sha.slice(0, 2)}/${sha}`, content_bytes: png.length, mime_type: 'image/png' }] })
      }
      if (url.pathname.endsWith(`/sha256/${sha.slice(0, 2)}/${sha}`)) {
        return route.fulfill({ contentType: 'image/png', body: corrupt ? Buffer.alloc(png.length) : png })
      }
    }
    external.push(url.origin); return route.abort()
  })
  await page.goto('/tests/browser-media/tryon.html')
  await page.waitForFunction(() => !!window.tryOnFixture)
  return { external, metadata, ai }
}

test('try-on uses verified private bytes with no old-provider or unused AI requests', async ({ page }) => {
  const f = await fixture(page)
  const result = await page.evaluate(() => window.tryOnFixture.generate())
  expect(result).toMatchObject({ success: true, bytes: png.length })
  expect(f.metadata).toEqual([1, 2].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`))
  expect(f.ai.map(body => body.type)).toEqual(['analyzeClothingImages', 'generateImages'])
  for (const body of f.ai) {
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(3_000_000)
    expect(body.topImageBase64).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(JSON.stringify(body)).not.toContain('old-provider')
  }
  expect(f.external).toEqual([])
})

for (const options of [{ denied: true }, { corrupt: true }]) {
  test(`failed private input does not call an AI provider ${JSON.stringify(options)}`, async ({ page }) => {
    const f = await fixture(page, options)
    expect((await page.evaluate(() => window.tryOnFixture.generate())).success).toBe(false)
    expect(f.metadata).toHaveLength(1)
    expect(f.ai).toEqual([])
    expect(f.external).toEqual([])
  })
}

test('large images become bounded readable derivatives while original bytes remain intact', async ({ page }) => {
  await fixture(page)
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200; canvas.height = 900
    const context = canvas.getContext('2d'), pixels = context.createImageData(canvas.width, canvas.height)
    let seed = 12345
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      pixels.data[i] = seed & 255; pixels.data[i + 1] = seed >>> 8 & 255
      pixels.data[i + 2] = seed >>> 16 & 255; pixels.data[i + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const before = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer())))
    const derivative = await window.tryOnFixture.prepareTryOnImage(original)
    const after = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer())))
    const decoded = await createImageBitmap(derivative)
    const result = { original: original.size, bytes: derivative.size, type: derivative.type,
      width: decoded.width, height: decoded.height, before, after }
    decoded.close(); return result
  })
  expect(result.original).toBeGreaterThan(1024 * 1024)
  expect(result.bytes).toBeLessThanOrEqual(1024 * 1024)
  expect(result.type).toBe('image/jpeg')
  expect(result.width).toBe(1024); expect(result.height).toBe(768)
  expect(result.before).toEqual(result.after)
})

test('malformed images are rejected before sending bytes to AI', async ({ page }) => {
  await fixture(page)
  expect(await page.evaluate(async () => {
    try { await window.tryOnFixture.prepareTryOnImage(new Blob(['invalid png'], { type: 'image/png' })); return false }
    catch { return true }
  })).toBe(true)
})
