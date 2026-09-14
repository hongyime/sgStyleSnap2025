import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { CLOTHING_PLACEHOLDER_URL } from '@/utils/clothing-image'

const fixture = vi.hoisted(() => ({ read: vi.fn(), auth: null }))
vi.mock('@/lib/private-media', () => ({ readPrivateMedia: fixture.read }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { onAuthStateChange: (callback) => { fixture.auth = callback; return { data: { subscription: { unsubscribe() {} } } } } },
} }))
const source = 'https://res.cloudinary.com/fixture/image/upload/v1/retained.webp'
const row = Object.freeze({ id: '00000000-0000-4000-8000-000000000001', image_url: source })
let wrappers = []

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_PRIVATE_MEDIA_ENABLED', 'true')
  fixture.read.mockReset()
  fixture.auth = null
  URL.createObjectURL = vi.fn(() => 'blob:private-fixture')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount()); wrappers = []
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
async function image(props = {}) {
  const { default: ClothingImage } = await import('@/components/ui/ClothingImage.vue')
  const wrapper = mount(ClothingImage, { props: { src: source, record: row, ...props } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('private persisted-image presentation', () => {
  it('uses the row binding and releases the verified object URL on unmount', async () => {
    fixture.read.mockResolvedValue({ blob: new Blob(['fixture']), bytes: 7, sha256: 'a'.repeat(64) })
    const wrapper = await image()
    expect(fixture.read).toHaveBeenCalledOnce()
    expect(fixture.read.mock.calls[0][1]).toEqual({ table: 'clothes', id: row.id, column: 'image_url', sourceUrl: source })
    expect(wrapper.get('img').attributes('src')).toBe('blob:private-fixture')
    expect(row.image_url).toBe(source)
    wrapper.unmount(); wrappers = []
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-fixture')
  })

  it('shows a local placeholder for a denied binding without provider fallback', async () => {
    fixture.read.mockRejectedValue(new Error('media_unavailable'))
    const wrapper = await image()
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    expect(fixture.read).toHaveBeenCalledOnce()
  })

  it('does not load an unbound source URL in private mode', async () => {
    const wrapper = await image({ record: null })
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    expect(fixture.read).not.toHaveBeenCalled()
  })

  it('revokes a loaded image when the first auth event is sign-out', async () => {
    fixture.read.mockResolvedValueOnce({ blob: new Blob(['fixture']), bytes: 7 })
      .mockRejectedValue(new Error('denied'))
    const wrapper = await image()
    fixture.auth('SIGNED_OUT', null)
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-fixture')
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    expect(fixture.read).toHaveBeenCalledTimes(2)
  })

  it('revalidates a token change once and ignores repeated events for the same session', async () => {
    fixture.read.mockResolvedValue({ blob: new Blob(['fixture']), bytes: 7 })
    const wrapper = await image()
    const session = { user: { id: row.id }, access_token: 'fixture-session-a' }
    fixture.auth('INITIAL_SESSION', session)
    await flushPromises()
    expect(fixture.read).toHaveBeenCalledOnce()
    fixture.auth('TOKEN_REFRESHED', { ...session, access_token: 'fixture-session-b' })
    await flushPromises()
    expect(fixture.read).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    fixture.auth('SIGNED_IN', { ...session, access_token: 'fixture-session-b' })
    await flushPromises()
    expect(fixture.read).toHaveBeenCalledTimes(2)
    expect(wrapper.get('img').attributes('src')).toBe('blob:private-fixture')
  })

  it('invalidates on explicit sign-out even when the initial session was already empty', async () => {
    fixture.read.mockResolvedValueOnce({ blob: new Blob(['fixture']), bytes: 7 })
      .mockRejectedValue(new Error('denied'))
    const wrapper = await image()
    fixture.auth('INITIAL_SESSION', null)
    fixture.auth('SIGNED_OUT', null)
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
  })

  it('cancels a replaced source and ignores its late download', async () => {
    let finishOld
    fixture.read.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValue({ blob: new Blob(['new']), bytes: 3 })
    const wrapper = await image()
    const replacement = source.replace('retained', 'replacement')
    await wrapper.setProps({ src: replacement, record: { ...row, image_url: replacement } })
    await flushPromises()
    finishOld({ blob: new Blob(['old']), bytes: 3 })
    await flushPromises()
    expect(fixture.read.mock.calls[0][2].signal.aborted).toBe(true)
    expect(fixture.read.mock.calls[1][1].sourceUrl).toBe(replacement)
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(wrapper.get('img').attributes('src')).toBe('blob:private-fixture')
  })

  it('loads only visible images and releases them when they leave the viewport', async () => {
    let intersect
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { intersect = callback }
      observe() {}
      disconnect() { disconnect() }
    })
    fixture.read.mockResolvedValue({ blob: new Blob(['fixture']), bytes: 7 })
    const wrapper = await image()
    expect(fixture.read).not.toHaveBeenCalled()
    intersect([{ isIntersecting: true }]); await flushPromises()
    expect(fixture.read).toHaveBeenCalledOnce()
    intersect([{ isIntersecting: false }]); await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    wrapper.unmount(); wrappers = []
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('blocks parent avatar error handlers from restoring an external URL', async () => {
    const { default: MediaImage } = await import('@/components/ui/MediaImage.vue')
    fixture.read.mockResolvedValue({ blob: new Blob(['fixture']), bytes: 7 })
    const fallback = '/images/avatar-placeholder.svg'
    const onError = vi.fn(event => { event.target.src = source })
    const wrapper = mount(MediaImage, { props: { src: '/api/proxy-image?url=fixture',
      table: 'users', record: { id: row.id, avatar_url: source }, sourceUrl: source, fallback, onError } })
    wrappers.push(wrapper); await flushPromises()
    await wrapper.get('img').trigger('error'); await flushPromises()
    expect(onError).not.toHaveBeenCalled()
    expect(wrapper.get('img').attributes('src')).toBe(fallback)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(fixture.read.mock.calls[0][1]).toEqual({ table: 'users', id: row.id, column: 'avatar_url', sourceUrl: source })
  })

  it('keeps legacy images and events working with private delivery disabled', async () => {
    vi.stubEnv('VITE_PRIVATE_MEDIA_ENABLED', 'false')
    const { default: MediaImage } = await import('@/components/ui/MediaImage.vue')
    const onError = vi.fn()
    const wrapper = mount(MediaImage, { props: { src: source, table: 'users', onError } })
    wrappers.push(wrapper); await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBe(source)
    await wrapper.get('img').trigger('error')
    expect(onError).toHaveBeenCalledOnce()
    expect(fixture.read).not.toHaveBeenCalled()
    expect(fixture.auth).toBe(null)
  })
})
