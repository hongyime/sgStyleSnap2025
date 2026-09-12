import { test, expect } from '@playwright/test'

const failures = new WeakMap()
const requests = new WeakMap()
const heavyRuntime = /\/(?:ort[^/]*|u2netp[^/]*|background-removal[^/]*)\.(?:js|wasm)(?:\?|$)/

test.beforeEach(async ({ page }) => {
  failures.set(page, [])
  requests.set(page, [])
  page.on('pageerror', error => failures.get(page).push(error.message))
  page.on('request', request => requests.get(page).push(new URL(request.url()).pathname))
  // This suite exercises the application built without provider credentials.
  // No OAuth, image upload, database write or external model request can leave
  // the isolated local browser.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === 'http://127.0.0.1:4477'
      ? route.continue()
      : route.fulfill({ status: 204, body: '' })
  })
})

test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('login loads without private pages, 3D code or the image-processing runtime', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  expect(requests.get(page).some(path => /\/(Cabinet|OutfitCreator|Landing|three-vendor)-/.test(path))).toBe(false)
  expect(requests.get(page).some(path => heavyRuntime.test(path))).toBe(false)
  await expect(page.getByText('Your digital closet awaits')).toBeVisible()
})

test('protected URLs redirect before downloading their page modules', async ({ page }) => {
  for (const path of ['/closet', '/outfits', '/friends', '/profile', '/outfits/add/personal', '/friend/example/closet']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  }
  expect(requests.get(page).some(path => /\/(Cabinet|Outfits|OutfitCreator|Friends|Profile|FriendCabinet)-/.test(path))).toBe(false)
  expect(requests.get(page).some(path => heavyRuntime.test(path))).toBe(false)
})

test('landing navigation, mobile menu and signup intent survive lazy loading', async ({ page }, testInfo) => {
  // Keep native observers, but retain a callback to reproduce delivery queued
  // just before unmount and verify that avatar observers are disconnected.
  await page.addInitScript(() => {
    const active = new Set()
    const queued = []
    for (const name of ['ResizeObserver', 'IntersectionObserver']) {
      const NativeObserver = window[name]
      window[name] = class extends NativeObserver {
        constructor(callback) {
          super(callback)
          this.deliverQueued = () => callback([], this)
        }
        observe(target, options) {
          if (target.classList.contains('single-avatar-container')) {
            active.add(this)
            queued.push(this.deliverQueued)
          }
          return super.observe(target, options)
        }
        disconnect() {
          active.delete(this)
          return super.disconnect()
        }
      }
    }
    window.avatarObserverTest = {
      activeCount: () => active.size,
      deliverQueued: () => queued.splice(0).forEach(callback => callback()),
    }
  })
  await page.goto('/')
  const skip = page.getByRole('button', { name: 'Skip Animation' })
  if (testInfo.project.name === 'desktop') {
    await skip.click()
  }
  const nav = page.locator('.landing-nav-pill')
  await expect(nav).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.avatarObserverTest.activeCount())).toBeGreaterThan(0)
  if (testInfo.project.name === 'mobile') {
    const toggle = page.getByRole('button', { name: 'Open menu' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#landing-mobile-menu')).toBeVisible()
    await expect(page.locator('#landing-mobile-menu')).toHaveCSS('background-color', 'rgba(243, 244, 246, 0.85)')
    await page.screenshot({ path: testInfo.outputPath('mobile-menu.png') })
    await page.locator('#landing-mobile-menu').getByRole('button', { name: 'Log In', exact: true }).click()
  } else {
    await nav.getByRole('button', { name: 'Log In', exact: true }).click()
  }
  await expect(page).toHaveURL(/\/login\?mode=login$/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.avatarObserverTest.activeCount())).toBe(0)
  await page.evaluate(() => window.avatarObserverTest.deliverQueued())
  await page.goBack()
  await expect(page).toHaveURL('http://127.0.0.1:4477/')
  if (testInfo.project.name === 'desktop') await page.getByRole('button', { name: 'Skip Animation' }).click()
  await page.getByRole('button', { name: 'Sign Up Now', exact: true }).first().click()
  await expect(page).toHaveURL(/\/login\?mode=signup$/)
  await expect.poll(() => page.evaluate(() => window.avatarObserverTest.activeCount())).toBe(0)
  await page.evaluate(() => window.avatarObserverTest.deliverQueued())
})

test('unknown route renders the existing recovery page', async ({ page }) => {
  await page.goto('/maintenance-missing-page')
  await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Go Home/ }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('mock authentication unlocks page navigation without loading image processing', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.locator('#app')).not.toBeEmpty()
  for (const path of ['/closet', '/outfits', '/friends', '/profile']) {
    await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
    await expect(page).toHaveURL('http://127.0.0.1:4477' + path)
    await expect(page.locator('#app')).not.toBeEmpty()
  }
  expect(requests.get(page).some(path => heavyRuntime.test(path))).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('mock-profile.png') })
})
