<template>
  <div class="p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800">
    <!-- Header with friend info -->
    <div class="flex items-center gap-4 mb-4">
      <!-- Friend Avatar -->
      <div class="w-12 h-12 rounded-full overflow-hidden bg-stone-200 dark:bg-zinc-700">
        <MediaImage
          v-if="proxiedAvatarUrl"
          :record="suggestion.suggester" table="users" :source-url="suggestion.suggester?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="proxiedAvatarUrl"
          :alt="suggestion.suggester.name"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-stone-300 dark:bg-zinc-600"
        >
          <span class="text-sm font-bold text-stone-500 dark:text-zinc-400">
            {{ (suggestion.suggester?.name || suggestion.suggester?.username || 'F').charAt(0).toUpperCase() }}
          </span>
        </div>
      </div>
      
      <!-- Friend Info -->
      <div class="flex-1">
        <h3 class="font-semibold text-foreground">
          {{ getFirstName(suggestion.suggester?.name) || (suggestion.suggester?.username ? `@${suggestion.suggester.username}` : 'Unknown Friend') }}
        </h3>
        <p :class="`text-sm text-stone-600 dark:text-zinc-400}`">
          Suggested an outfit
        </p>
      </div>
      
      <!-- Time -->
      <span class="text-xs text-stone-500 dark:text-zinc-500">
        {{ formatTimeAgo(suggestion.created_at) }}
      </span>
    </div>

    <!-- Message (if provided) -->
    <div v-if="suggestion.message" class="mb-4">
      <p class="text-sm italic text-stone-700 dark:text-zinc-300">
        "{{ suggestion.message }}"
      </p>
    </div>

    <!-- Outfit Preview -->
    <div class="mb-6">
      <h4 class="text-sm font-medium mb-3 text-stone-700 dark:text-zinc-300">
        Suggested Outfit ({{ suggestion.outfit_items?.length || 0 }} items)
      </h4>
      
      <!-- Items Grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="item in suggestion.outfit_items"
          :key="item.clothes_id"
          class="aspect-square rounded-lg overflow-hidden bg-stone-100 dark:bg-zinc-800"
        >
          <ClothingImage
            v-if="item.image_url"
            :record="item" table="clothes" :src="item.image_url"
            :alt="item.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700"
          >
            <Shirt :class="`w-6 h-6 text-stone-400 dark:text-zinc-500`" />
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-3">
      <button
        @click="approveSuggestion"
        :disabled="processing"
        class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Check class="w-4 h-4" />
        <span v-if="processing" class="ellipsis-animated">Processing</span>
        <span v-else>Approve</span>
      </button>
      <button
        @click="rejectSuggestion"
        :disabled="processing"
        class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <X class="w-4 h-4" />
        <span v-if="processing" class="ellipsis-animated">Processing</span>
        <span v-else>Reject</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import MediaImage from '@/components/ui/MediaImage.vue'
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { usePopup } from '@/composables/usePopup'
import { friendSuggestionsService } from '@/services/friendSuggestionsService'
import { getFirstName } from '@/utils'
import { Check, X, Shirt } from 'lucide-vue-next'
import { getProxiedImageUrl } from '@/utils/imageProxy'

// Props
const props = defineProps({
  suggestion: {
    type: Object,
    required: true
  }
})

// Emits
const emit = defineEmits(['suggestionProcessed'])

// Theme and popup composables
const { theme } = useTheme()
const { showSuccess, showError } = usePopup()

// State
const processing = ref(false)

// Computed property for proxied avatar URL (only proxies Google images)
const proxiedAvatarUrl = computed(() => {
  if (!props.suggestion?.suggester?.avatar_url) return null
  return getProxiedImageUrl(props.suggestion.suggester.avatar_url)
})

// Format time ago
const formatTimeAgo = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now - date) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  // For older dates, show full date in "28 Oct 2025" format
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// Approve suggestion
const approveSuggestion = async () => {
  processing.value = true
  try {
    const result = await friendSuggestionsService.approveSuggestion(props.suggestion.id)
    
    if (result.success) {
      showSuccess('Outfit suggestion approved! The outfit has been added to your collection.')
      emit('suggestionProcessed', { action: 'approved', suggestionId: props.suggestion.id })
    } else {
      throw new Error(result.error?.message || 'Failed to approve suggestion')
    }
  } catch (error) {
    console.error('Error approving suggestion:', error)
    showError(error.message || 'Failed to approve suggestion')
  } finally {
    processing.value = false
  }
}

// Reject suggestion
const rejectSuggestion = async () => {
  processing.value = true
  try {
    const result = await friendSuggestionsService.rejectSuggestion(props.suggestion.id)
    
    if (result.success) {
      showSuccess('Suggestion rejected')
      emit('suggestionProcessed', { action: 'rejected', suggestionId: props.suggestion.id })
    } else {
      throw new Error(result.error?.message || 'Failed to reject suggestion')
    }
  } catch (error) {
    console.error('Error rejecting suggestion:', error)
    showError(error.message || 'Failed to reject suggestion')
  } finally {
    processing.value = false
  }
}
</script>
