<template>
  <img ref="element" :src="displaySource" @error="handleError" />
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { CLOTHING_PLACEHOLDER_URL, clothingImageUrl } from '@/utils/clothing-image'
import { mediaReference } from '@/lib/media-loader'
import { getMediaRuntime, privateMediaEnabled } from '@/lib/media-runtime'

const props = defineProps({
  src: { type: String, default: '' },
  record: { type: Object, default: null },
  table: { type: String, default: 'clothes' },
  sourceUrl: { type: String, default: '' },
  fallback: { type: String, default: CLOTHING_PLACEHOLDER_URL },
})
// Parent error handlers may try another provider URL. Only legacy mode emits it.
const emit = defineEmits(['error'])
const element = ref(null), visible = ref(false), failed = ref(false), privateUrl = ref('')
const reference = computed(() => mediaReference(props.table, props.record, props.sourceUrl || props.src))
const displaySource = computed(() => {
  if (failed.value) return props.fallback
  if (privateMediaEnabled) return privateUrl.value || props.fallback
  return props.table === 'users' ? (props.src || props.fallback) : clothingImageUrl(props.src)
})
let release, observer
function clear() { release?.(); release = undefined; privateUrl.value = '' }
watch([() => props.src, reference, visible], () => {
  clear(); failed.value = false
  if (!privateMediaEnabled || !visible.value || !reference.value) return
  release = getMediaRuntime().subscribe(reference.value, state => { privateUrl.value = state.url })
}, { flush: 'sync' })
onMounted(() => {
  if (privateMediaEnabled && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => { visible.value = entries.some(entry => entry.isIntersecting) }, { rootMargin: '200px' })
    observer.observe(element.value)
  } else visible.value = true
})
onBeforeUnmount(() => { observer?.disconnect(); clear() })
function handleError(event) {
  failed.value = true; clear()
  if (!privateMediaEnabled) emit('error', event)
}
</script>
