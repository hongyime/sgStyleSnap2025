import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import ClothingItemCard from '../../src/components/cabinet/ClothingItemCard.vue'
import OutfitCanvasMiniature from '../../src/components/dashboard/OutfitCanvasMiniature.vue'
import ClothingImage from '../../src/components/ui/ClothingImage.vue'
import MediaImage from '../../src/components/ui/MediaImage.vue'
import { supabase } from '../../src/lib/supabase.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const source = 'https://res.cloudinary.com/fixture/image/upload/retained.png'
const clothing = ref({ id: id(1), name: 'Retained clothing', image_url: source })
const catalog = { id: 'canvas-fixture', originalId: id(3), thumbnail_url: source }
const avatar = { id: id(4), avatar_url: 'https://lh3.googleusercontent.com/fixture' }
const app = createApp({ setup: () => () => h('main', [
  h('section', { id: 'clothing' }, [h(ClothingItemCard, { item: clothing.value })]),
  h('section', { id: 'outfit' }, [h(OutfitCanvasMiniature, { items: [
    { id: 'outfit-instance', clothing_item: clothing.value },
  ] })]),
  h('section', { id: 'catalog' }, [h(ClothingImage, { record: catalog,
    table: 'catalog_items', src: source, alt: 'Catalog canvas' })]),
  h('section', { id: 'avatar' }, [h(MediaImage, { record: avatar, table: 'users',
    src: '/api/proxy-image?url=fixture', sourceUrl: avatar.avatar_url,
    fallback: '/images/avatar-placeholder.svg', alt: 'Friend avatar',
    onError: event => { event.target.src = avatar.avatar_url } })]),
  h('section', { id: 'offscreen', class: 'far' }, [h(ClothingImage, {
    record: { id: id(2), image_url: source }, src: source, alt: 'Offscreen garment',
  })]),
]) })
app.use(createPinia()); app.mount('#fixture')
window.mediaFixture = {
  replace: () => { clothing.value = { ...clothing.value, image_url: `${source}?replacement=1` } },
  unmount: () => app.unmount(),
  signOut: () => supabase.auth.signOut({ scope: 'local' }),
}
