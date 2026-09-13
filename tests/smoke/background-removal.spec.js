import { readdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const entry = readdirSync('dist/js').find(name => /^background-removal-.*\.js$/.test(name))
const origin = 'http://127.0.0.1:4477'

for (const isolated of [false, true]) {
  test(`bundled background removal works with cross-origin isolation ${isolated}`, async ({ page }) => {
    test.setTimeout(90000)
    const errors = []
    const blocked = []
    page.on('pageerror', error => errors.push(error.message))
    // Keep CI resource use bounded; production verification also uses the
    // browser's native hardwareConcurrency value.
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 }))
    await page.route('**/*', async route => {
      const request = route.request()
      if (new URL(request.url()).origin !== origin) {
        blocked.push(request.url())
        return route.fulfill({ status: 204, body: '' })
      }
      if (request.resourceType() === 'document' && isolated) {
        const response = await route.fetch()
        return route.fulfill({ response, headers: {
          ...response.headers(),
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'credentialless',
        } })
      }
      return route.continue()
    })
    await page.goto('/login')
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(isolated)
    expect(entry).toBeTruthy()
    const result = await page.evaluate(async entry => {
      const canvas = new OffscreenCanvas(64, 64)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = 'red'; ctx.fillRect(16, 8, 32, 48)
      const input = await canvas.convertToBlob({ type: 'image/png' })
      const { removeBackground } = await import('/js/' + entry)
      const results = []
      // A second call exercises reuse after the first inference releases its session.
      for (const options of [undefined, { output: 'mask' }]) {
        const output = await removeBackground(input, options)
        const bitmap = await createImageBitmap(output)
        ctx.clearRect(0, 0, 64, 64)
        ctx.drawImage(bitmap, 0, 0)
        const pixels = ctx.getImageData(0, 0, 64, 64).data
        const alphas = [...pixels].filter((_, index) => index % 4 === 3)
        results.push({ type: output.type, width: bitmap.width, height: bitmap.height,
          minAlpha: Math.min(...alphas), maxAlpha: Math.max(...alphas) })
        bitmap.close()
      }
      return results
    }, entry)
    expect(result).toHaveLength(2)
    for (const output of result) {
      expect(output).toMatchObject({ type: 'image/png', width: 64, height: 64 })
      expect(output.minAlpha).toBeLessThan(100)
      expect(output.maxAlpha).toBeGreaterThan(150)
    }
    expect(errors).toEqual([])
    // Only the optional font stylesheet may be attempted; model assets stay local.
    expect(blocked.every(url => url.startsWith('https://fonts.googleapis.com/'))).toBe(true)
  })
}
