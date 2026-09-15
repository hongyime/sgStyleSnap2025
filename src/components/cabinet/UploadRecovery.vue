<template>
  <section v-if="privateUploadsEnabled && (drafts.length || message)" class="my-4 rounded-xl border border-stone-300 p-4 dark:border-zinc-700" aria-label="Saved uploads">
    <h3 class="font-medium">Saved uploads</h3>
    <p class="mt-1 text-sm text-stone-600 dark:text-zinc-400">Finish or confirm uploads saved on this device.</p>
    <p v-if="message" class="mt-2 text-sm" role="status">{{ message }}</p>
    <ul class="mt-3 space-y-3">
      <li v-for="draft in drafts" :key="draft.id" class="flex flex-wrap items-center justify-between gap-2">
        <span class="min-w-0 break-words text-sm">{{ draft.name }}</span>
        <button type="button" class="rounded-lg border border-stone-400 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-600"
          :disabled="disabled || Boolean(recovering)" @click="recover(draft.id)">
          {{ recovering === draft.id ? 'Checking…' : draft.state === 'complete' ? 'Confirm saved item' : 'Retry upload' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { getPrivateUploader, privateUploadsEnabled } from '@/lib/private-upload-runtime.js'
defineProps({ disabled: { type: Boolean, default: false } })
const emit = defineEmits(['recovered', 'busy'])
const drafts = ref([]), message = ref(''), recovering = ref('')
let generation = 0, subscription, authRefresh
async function refresh() {
  if (!privateUploadsEnabled) return
  const current = ++generation
  try {
    const result = await getPrivateUploader().pending()
    if (current === generation) drafts.value = result
  } catch {
    if (current === generation) drafts.value = []
  }
}
async function recover(id) {
  if (recovering.value) return
  recovering.value = id
  message.value = ''
  emit('busy', true)
  const current = generation
  try {
    const uploader = getPrivateUploader(), result = await uploader.resume(id)
    if (current !== generation) return
    await uploader.acknowledge(result.upload_receipt).catch(() => {})
    emit('recovered', result)
    await refresh()
  } catch (error) {
    if (current === generation) message.value = error.message || 'Could not confirm this upload. Keep the draft and retry later.'
  } finally {
    recovering.value = ''
    emit('busy', false)
  }
}
onMounted(() => {
  if (!privateUploadsEnabled) return
  void refresh()
  subscription = supabase?.auth.onAuthStateChange(() => {
    generation++
    drafts.value = []
    message.value = ''
    clearTimeout(authRefresh)
    authRefresh = setTimeout(() => { void refresh() }, 0)
  })?.data?.subscription
})
onBeforeUnmount(() => { generation++; clearTimeout(authRefresh); subscription?.unsubscribe() })
defineExpose({ refresh })
</script>
