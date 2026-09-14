import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { CLOTHING_PLACEHOLDER_URL, clothingImageUrl } from '@/utils/clothing-image'

const original = 'https://private.example.test/retained-photo.webp'
const legacy = 'https://res.cloudinary.com/sgstylesnap/image/upload/f_webp,q_auto:good/v1/defaults/default-clothing-item.webp'

describe('clothing image presentation', () => {
  it('resolves only the known legacy default without changing source data', () => {
    const row = Object.freeze({ image_url: legacy, privacy: 'friends' })
    const wrapper = mount(ClothingImage, { props: { src: row.image_url }, attrs: { alt: 'Blue shirt' } })
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    expect(wrapper.get('img').attributes('alt')).toBe('Blue shirt')
    expect(row.image_url).toBe(legacy)
    expect(row.privacy).toBe('friends')
    expect(clothingImageUrl(original)).toBe(original)
    expect(clothingImageUrl(legacy + '?different-reference')).toBe(legacy + '?different-reference')
  })

  it('shows the local fallback after a load failure without retry loops or source mutation', async () => {
    const wrapper = mount(ClothingImage, { props: { src: original }, attrs: { class: 'object-contain', loading: 'lazy' } })
    expect(wrapper.get('img').attributes('src')).toBe(original)
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(CLOTHING_PLACEHOLDER_URL)
    expect(wrapper.props('src')).toBe(original)
    expect(wrapper.classes()).toContain('object-contain')
    expect(wrapper.attributes('loading')).toBe('lazy')
  })

  it('tries a newly supplied image after a previous failure', async () => {
    const wrapper = mount(ClothingImage, { props: { src: original } })
    await wrapper.get('img').trigger('error')
    const next = 'https://private.example.test/new-photo.webp'
    await wrapper.setProps({ src: next })
    expect(wrapper.get('img').attributes('src')).toBe(next)
    expect(clothingImageUrl('')).toBe(CLOTHING_PLACEHOLDER_URL)
  })

  it('retains native image attributes and load/drag events used by clothing views', async () => {
    const onLoad = vi.fn()
    const onDragstart = vi.fn()
    const wrapper = mount(ClothingImage, { props: { src: original }, attrs: {
      alt: 'My shirt', crossorigin: 'anonymous', draggable: 'true',
      style: 'width: 120px;', 'data-item-id': 'fixture-item', onLoad, onDragstart,
    } })
    const image = wrapper.get('img')
    expect(image.attributes()).toMatchObject({ alt: 'My shirt', crossorigin: 'anonymous', draggable: 'true', 'data-item-id': 'fixture-item' })
    expect(image.element.style.width).toBe('120px')
    await image.trigger('load')
    await image.trigger('dragstart')
    expect(onLoad).toHaveBeenCalledOnce()
    expect(onDragstart).toHaveBeenCalledOnce()
  })
})
