<template>
  <img :src="displaySource" @error="handleError" />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { CLOTHING_PLACEHOLDER_URL, clothingImageUrl } from '@/utils/clothing-image'

const props = defineProps({ src: { type: String, default: '' } })
const failed = ref(false)
const displaySource = computed(() => failed.value ? CLOTHING_PLACEHOLDER_URL : clothingImageUrl(props.src))
watch(() => props.src, () => { failed.value = false })

function handleError() {
  // A failed local fallback does not trigger another URL change or retry loop.
  failed.value = true
}
</script>
