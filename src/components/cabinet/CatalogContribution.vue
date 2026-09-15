<template>
  <div v-if="privateUploadsEnabled" class="rounded-xl border border-stone-200 p-3 text-sm text-stone-700 dark:border-zinc-700 dark:text-zinc-300">
    <p class="mb-2">Original and processed images can each be up to 4 MiB.</p>
    <label v-if="privateCatalogPolicy === 'opt_in'" class="flex items-start gap-3">
      <input type="checkbox" class="mt-1" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)" />
      <span>Also share this item's image anonymously in the public catalog.</span>
    </label>
    <p v-else-if="privateCatalogPolicy === 'public_only'">Public items also appear in the public catalog. Private and friends-only items stay out.</p>
    <p v-else-if="privateCatalogPolicy === 'legacy'">Uploads also contribute an anonymous public catalog image, regardless of the item's privacy setting.</p>
    <p v-else>Uploads are temporarily unavailable while sharing settings are confirmed.</p>
  </div>
</template>

<script setup>
import { privateUploadsEnabled, privateCatalogPolicy } from '@/lib/private-upload-runtime.js'
defineProps({ modelValue: { type: Boolean, default: false }, disabled: { type: Boolean, default: false } })
defineEmits(['update:modelValue'])
</script>
