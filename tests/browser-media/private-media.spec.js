import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')
const sha = createHash('sha256').update(png).digest('hex')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function fixture(page, options = {}) {
  const calls = [], external = [], errors = []
  const control = { deny: false, ...options }
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.mediaURLs = { created: [], revoked: [] }
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = blob => { const url = create(blob); window.mediaURLs.created.push(url); return url }
    URL.revokeObjectURL = url => { window.mediaURLs.revoked.push(url); revoke(url) }
  })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.hostname === '127.0.0.1') {
      if (url.pathname.startsWith('/api/')) { external.push(url.pathname); return route.abort() }
      return route.continue()
    }
    if (url.hostname !== 'media-fixture.supabase.co') { external.push(url.origin); return route.abort() }
    calls.push({ path: url.pathname, query: url.searchParams, method: request.method() })
    if (url.pathname === '/rest/v1/stylesnap_media_bindings') {
      const value = key => url.searchParams.get(key)?.slice(3)
      if (control.deny) return route.fulfill({ status: 403, json: { message: 'denied' } })
      if (control.metadataStatus) return route.fulfill({ status: control.metadataStatus, json: { message: 'unavailable' } })
      return route.fulfill({ json: [{ source_table: value('source_table'), source_id: value('source_id'),
        source_column: value('source_column'), source_url: value('source_url'), manifest_sha: 'a'.repeat(64),
        content_sha256: sha, object_path: `sha256/${sha.slice(0, 2)}/${sha}`, content_bytes: png.length, mime_type: 'image/png' }] })
    }
    if (url.pathname === `/storage/v1/object/stylesnap-media-archive/sha256/${sha.slice(0, 2)}/${sha}`) {
      return route.fulfill({ contentType: 'image/png', body: control.corrupt ? Buffer.alloc(png.length) : png })
    }
    external.push(url.pathname); return route.abort()
  })
  await page.goto('/tests/browser-media/fixture.html')
  await expect(page.locator('#clothing img')).toHaveCount(1)
  return { calls, external, errors, control,
    metadata: () => calls.filter(call => call.path.startsWith('/rest/')),
    storage: () => calls.filter(call => call.path.startsWith('/storage/')) }
}

test('real components use exact row bindings, share downloads and release every URL', async ({ page }) => {
  const f = await fixture(page)
  for (const selector of ['#clothing', '#outfit', '#catalog', '#avatar']) {
    await expect(page.locator(`${selector} img`)).toHaveAttribute('src', /^blob:/)
    expect(await page.locator(`${selector} img`).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  }
  expect(f.metadata()).toHaveLength(3)
  expect(f.storage()).toHaveLength(3)
  const catalog = f.metadata().find(call => call.query.get('source_table') === 'eq.catalog_items')
  expect(catalog.query.get('source_id')).toBe(`eq.${id(3)}`)
  expect(catalog.query.get('source_column')).toBe('eq.thumbnail_url')
  expect(await page.locator('#outfit img').getAttribute('src')).toBe(await page.locator('#clothing img').getAttribute('src'))
  await page.evaluate(() => window.mediaFixture.unmount())
  const urls = await page.evaluate(() => window.mediaURLs)
  expect(urls.created.sort()).toEqual(urls.revoked.sort())
  expect(f.external).toEqual([]); expect(f.errors).toEqual([])
})

test('scrolling starts the offscreen binding only when its image becomes visible', async ({ page }) => {
  const f = await fixture(page)
  await expect(page.locator('#clothing img')).toHaveAttribute('src', /^blob:/)
  expect(f.metadata().some(call => call.query.get('source_id') === `eq.${id(2)}`)).toBe(false)
  await page.locator('#offscreen').scrollIntoViewIfNeeded()
  await expect(page.locator('#offscreen img')).toHaveAttribute('src', /^blob:/)
  expect(f.metadata().filter(call => call.query.get('source_id') === `eq.${id(2)}`)).toHaveLength(1)
  expect(f.external).toEqual([]); expect(f.errors).toEqual([])
})

test('sign-out clears already displayed images before denied revalidation', async ({ page }) => {
  const f = await fixture(page)
  await expect(page.locator('#avatar img')).toHaveAttribute('src', /^blob:/)
  f.control.deny = true
  await page.evaluate(() => window.mediaFixture.signOut())
  await expect(page.locator('#avatar img')).toHaveAttribute('src', '/images/avatar-placeholder.svg')
  await expect(page.locator('#clothing img')).toHaveAttribute('src', '/images/clothing-placeholder.svg')
  expect((await page.evaluate(() => window.mediaURLs.revoked)).length).toBeGreaterThan(0)
  expect(f.external).toEqual([]); expect(f.errors).toEqual([])
})

for (const options of [{ metadataStatus: 520 }, { corrupt: true }]) {
  test(`failed private reads remain placeholders without provider fallback (${JSON.stringify(options)})`, async ({ page }) => {
    const f = await fixture(page, options)
    await expect.poll(() => f.metadata().length).toBe(3)
    await expect(page.locator('#clothing img')).toHaveAttribute('src', '/images/clothing-placeholder.svg')
    await page.locator('#avatar img').dispatchEvent('error')
    await expect(page.locator('#avatar img')).toHaveAttribute('src', '/images/avatar-placeholder.svg')
    await page.waitForTimeout(300)
    expect(f.metadata()).toHaveLength(3)
    expect(f.storage()).toHaveLength(options.corrupt ? 3 : 0)
    expect(await page.evaluate(() => window.mediaURLs.created)).toEqual([])
    expect(f.external).toEqual([]); expect(f.errors).toEqual([])
  })
}
