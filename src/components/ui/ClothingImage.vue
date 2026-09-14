<template>
  <MediaImage :src="src" :record="record" :table="table" :source-url="sourceUrl" />
</template>

<script setup>
import MediaImage from './MediaImage.vue'
defineProps({
  src: { type: String, default: '' }, record: { type: Object, default: null },
  table: { type: String, default: 'clothes' }, sourceUrl: { type: String, default: '' },
})
</script>
