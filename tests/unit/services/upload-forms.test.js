import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AddItemForm from '@/components/cabinet/AddItemForm.vue'
import ManualUploadForm from '@/components/cabinet/ManualUploadForm.vue'

const f = vi.hoisted(() => ({ add: vi.fn(), background: vi.fn(), classify: vi.fn(), error: vi.fn(), success: vi.fn(), push: vi.fn() }))
vi.mock('@/services/clothesService', () => ({ ClothesService: class { addClothes(data) { return f.add(data) } } }))
vi.mock('@/utils/background-removal', () => ({ removeBackground: f.background }))
vi.mock('@/services/fashion-rnn-service', () => ({ classifyClothingItem: f.classify, validateImageForClassification: () => ({ isValid: true }) }))
vi.mock('@/utils/color-detector', () => ({ detectColors: async () => ({ primary: 'blue' }) }))
vi.mock('@/composables/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('@/composables/useSanitize', () => ({ useSanitize: () => ({ sanitizeText: value => value }) }))
vi.mock('@/composables/usePopup', () => ({ usePopup: () => ({ showError: f.error, showSuccess: f.success }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: f.push }) }))
vi.mock('@/lib/cloudinary', () => ({ cloudinary: {} }))

let wrappers = []
beforeEach(() => {
  Object.values(f).forEach(mock => mock.mockReset())
  f.background.mockResolvedValue(new Blob(['PROCESSED'], { type: 'image/png' }))
  f.classify.mockResolvedValue({ success: true, confidence: 0.95, styleSnapCategory: 'top', topPrediction: 'Shirt' })
  let previewSequence = 0
  URL.createObjectURL = vi.fn(() => `blob:upload-preview-${++previewSequence}`)
  URL.revokeObjectURL = vi.fn()
  for (const method of ['log', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {})
})
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers = []; vi.restoreAllMocks() })
async function prepare(component) {
  const wrapper = mount(component, { props: { isOpen: true }, global: { stubs: { BrandAutocomplete: true }, mocks: { $router: { push: f.push } } } })
  wrappers.push(wrapper)
  if (component === ManualUploadForm) await wrapper.get('#manual-upload-name').setValue('Retained shirt')
  else await wrapper.get('input[placeholder="Enter item name"]').setValue('Retained shirt')
  const file = new File(['ORIGINAL'], 'original.jpg', { type: 'image/jpeg' })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change'); await flushPromises()
  if (component === ManualUploadForm) {
    await wrapper.get('#manual-upload-type').setValue('T-Shirt')
    await wrapper.get('#manual-upload-privacy').setValue('private')
  }
  return { wrapper, file, submit: () => component === ManualUploadForm
    ? wrapper.findAll('button').find(b => b.text() === 'Add to Closet').trigger('click')
    : wrapper.get('form').trigger('submit') }
}

for (const [name, component, event] of [['dialog', AddItemForm, 'itemAdded'], ['manual', ManualUploadForm, 'item-added']]) {
  describe(`${name} upload draft`, () => {
    it('retains the original and processed file through failure and explicit retry', async () => {
      f.add.mockRejectedValueOnce(new Error('Image upload failed')).mockResolvedValue({ success: true, data: { id: 'saved' } })
      const { wrapper, file, submit } = await prepare(component)
      await submit(); await flushPromises()
      expect(wrapper.emitted(event)).toBeUndefined()
      expect(f.push).not.toHaveBeenCalled()
      const first = f.add.mock.calls[0][0]
      expect(first.original_file).toBe(file)
      expect(first.image_file).not.toBe(file)
      expect(first.image_file.name).toBe('original-nobg.png')
      await submit(); await flushPromises()
      expect(f.add.mock.calls[1][0].original_file).toBe(first.original_file)
      expect(f.add.mock.calls[1][0].image_file).toBe(first.image_file)
      expect(wrapper.emitted(event)).toHaveLength(1)
    })
  })
}

it('does not submit the dialog while background processing is unfinished', async () => {
  let resolve
  f.background.mockImplementation(() => new Promise(done => { resolve = done }))
  const { wrapper, submit } = await prepare(AddItemForm)
  await wrapper.get('input[list="category-suggestions"]').setValue('Top')
  await submit(); await flushPromises()
  expect(f.add).not.toHaveBeenCalled()
  resolve(new Blob(['PROCESSED'], { type: 'image/png' })); await flushPromises()
})

it('releases a replaced recognition-error preview without waiting for unmount', async () => {
  f.classify.mockResolvedValue({ success: false, error: 'Recognition unavailable' })
  const { wrapper } = await prepare(ManualUploadForm)
  expect(f.error.mock.calls[0][2]).toBe('blob:upload-preview-1')
  await wrapper.get('input[type="file"]').trigger('change'); await flushPromises()
  expect(f.error.mock.calls[1][2]).toBe('blob:upload-preview-2')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:upload-preview-1')
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:upload-preview-2')
})

it('ignores processing from a dialog that has been closed and reopened', async () => {
  let resolve
  f.background.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const { wrapper } = await prepare(AddItemForm)
  await wrapper.setProps({ isOpen: false }); await wrapper.setProps({ isOpen: true })
  resolve(new Blob(['LATE'], { type: 'image/png' })); await flushPromises()
  expect(wrapper.text()).not.toContain('original.jpg')
  expect(f.classify).not.toHaveBeenCalled()
  expect(f.add).not.toHaveBeenCalled()
})

for (const [name, component] of [['dialog', AddItemForm], ['manual', ManualUploadForm]]) {
  it(`${name} retains the selected file when optional background removal fails`, async () => {
    f.background.mockRejectedValue(new Error('Processor unavailable'))
    f.add.mockResolvedValue({ success: true, data: { id: 'saved' } })
    const { file, submit } = await prepare(component)
    await submit(); await flushPromises()
    expect(f.add.mock.calls[0][0].original_file).toBe(file)
    expect(f.add.mock.calls[0][0].image_file).toBe(file)
  })
}
