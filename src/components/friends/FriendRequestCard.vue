<template>
  <div
    class="p-4 rounded-xl bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800 transition-all duration-300"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <div class="w-12 h-12 rounded-full overflow-hidden bg-stone-200 dark:bg-zinc-700">
          <MediaImage
            v-if="proxiedAvatarUrl"
            :record="request.requester" table="users" :source-url="request.requester?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="proxiedAvatarUrl"
            :alt="request.requester.name"
            class="w-full h-full object-cover"
            crossorigin="anonymous"
            @error="handleImageError"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-stone-300 dark:bg-zinc-600"
          >
            <span class="text-sm font-bold text-stone-500 dark:text-zinc-400">
              {{ (request.requester.name || 'U').charAt(0).toUpperCase() }}
            </span>
          </div>
        </div>
        
        <!-- User Info -->
        <div>
          <h3 class="font-semibold text-foreground">
            {{ request.requester.name || (request.requester.username ? `@${request.requester.username}` : 'User') }}
          </h3>
          <p class="text-sm text-stone-600 dark:text-zinc-400">
            @{{ request.requester.username }}
          </p>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex gap-2">
        <button
          @click="acceptRequest"
          :disabled="processing"
          class="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          :title="processing ? 'Processing...' : 'Accept'"
        >
          <Check class="w-5 h-5" />
        </button>
        <button
          @click="declineRequest"
          :disabled="processing"
          class="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          :title="processing ? 'Processing...' : 'Decline'"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import MediaImage from '@/components/ui/MediaImage.vue'
import { ref, computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { usePopup } from '@/composables/usePopup'
import { api } from '@/api/base44Client'
import { getProxiedImageUrl } from '@/utils/imageProxy'
import { Check, X } from 'lucide-vue-next'

// Props
const props = defineProps({
  request: {
    type: Object,
    required: true
  }
})

// Emits
const emit = defineEmits(['requestProcessed'])

// Theme
const { theme } = useTheme()
const { showError } = usePopup()

// State
const processing = ref(false)

// Computed property for proxied avatar URL (only proxies Google images)
const proxiedAvatarUrl = computed(() => {
  if (!props.request?.requester?.avatar_url) return null
  return getProxiedImageUrl(props.request.requester.avatar_url)
})

// Handle image loading errors
const handleImageError = (event) => {
  // Hide the broken image - fallback will show
  event.target.style.display = 'none'
}

// Accept friend request
const acceptRequest = async () => {
  processing.value = true
  try {
    await api.entities.Friendship.update(props.request.id, {
      status: 'accepted'
    })
    emit('requestProcessed')
  } catch (error) {
    console.error('Error accepting friend request:', error)
    showError('Failed to accept friend request')
  } finally {
    processing.value = false
  }
}

// Decline friend request
const declineRequest = async () => {
  processing.value = true
  try {
    await api.entities.Friendship.update(props.request.id, {
      status: 'declined'
    })
    emit('requestProcessed')
  } catch (error) {
    console.error('Error declining friend request:', error)
    showError('Failed to decline friend request')
  } finally {
    processing.value = false
  }
}
</script>
