<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    @click="$emit('close')"
  >
    <div
      class="w-full max-w-md rounded-xl p-6 relative bg-white dark:bg-zinc-900"
      @click.stop
    >
      <!-- Close Button -->
      <div class="absolute top-4 right-4 z-50 flex items-center gap-2">
        <!-- ESC Key Hint (Desktop only) -->
        <div v-if="isDesktop" class="keyboard-hint-modal">
          <span class="keyboard-hint-key">ESC</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 rounded-lg transition-all shadow-lg
                bg-white border border-stone-300 text-stone-700
                hover:bg-stone-100 hover:text-black 
                dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 
                dark:hover:bg-zinc-700 dark:hover:text-white
                active:scale-95"
          aria-label="Close dialog"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <h3 class="text-xl font-bold mb-4 text-foreground pr-8">
        Add Your Friend
      </h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2 text-stone-700 dark:text-zinc-300">
            Search by username or email
          </label>
          <div class="relative search-input-group">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Enter username or email..."
              class="w-full px-3 pr-28 py-2 rounded-lg border bg-white border-stone-300 text-black placeholder-stone-500 search-input dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400"
              @keyup="handleInputKeyup"
            />
            <!-- Small keyboard hint for search suggestions -->
            <div v-if="isDesktop" class="keyboard-hint" style="font-size: 10px; padding: 3px 6px;">
              <span class="keyboard-hint-key">{{ isMac ? '⌘' : 'Ctrl' }}</span>
              <span>+</span>
              <span class="keyboard-hint-key">K</span>
            </div>
          </div>
          
          <!-- Results count / No results message - shown below input -->
          <div class="mt-2">
            <p v-if="searchQuery.length < 4" class="text-xs text-stone-400 dark:text-zinc-500">
              Type at least 4 characters to search
            </p>
            <p v-else-if="searching" class="text-xs text-stone-500 dark:text-zinc-400">
              Searching...
            </p>
            <p v-else-if="searchPerformed && searchResults.length > 0" class="text-xs text-stone-600 dark:text-zinc-400">
              {{ searchResults.length }} {{ searchResults.length === 1 ? 'result' : 'results' }} found
            </p>
            <p v-else-if="searchPerformed && searchResults.length === 0" class="text-xs text-stone-600 dark:text-zinc-400">
              No results found
            </p>
          </div>
        </div>
        
        <div v-if="searchResults.length > 0" class="space-y-2 max-h-40 overflow-y-auto">
          <div
            v-for="user in searchResults"
            :key="user.id"
            class="flex items-center justify-between p-3 rounded-lg bg-stone-100 dark:bg-zinc-800"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full overflow-hidden bg-stone-200 dark:bg-zinc-700">
                <MediaImage
                  v-if="user.avatar_url"
                  :record="user" table="users" :source-url="user?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="getProxiedImageUrl(user.avatar_url)"
                  :alt="user.name"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center bg-stone-300 dark:bg-zinc-600"
                >
                  <span class="text-xs font-bold text-stone-500 dark:text-zinc-400">
                    {{ (user.name || 'U').charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>
              <div>
                <p class="font-medium text-foreground">
                  {{ user.name || (user.username ? `@${user.username}` : 'User') }}
                </p>
                <p class="text-xs text-stone-600 dark:text-zinc-400">
                  @{{ user.username }}
                </p>
              </div>
            </div>
            <button
              @click="sendFriendRequest(user.id)"
              :disabled="sendingRequest === user.id"
              :class="`px-3 py-1 rounded text-sm font-medium transition-all duration-200 ${
                sendingRequest === user.id
                  ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
              }`"
            >
              <span v-if="sendingRequest === user.id" class="ellipsis-animated">Sending</span>
              <span v-else>Add</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import MediaImage from '@/components/ui/MediaImage.vue'
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { usePopup } from '@/composables/usePopup'
import { useDebounce } from '@/composables/useDebounce'
import { useSanitize } from '@/composables/useSanitize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { UserService } from '@/services/userService'
import { FriendsService } from '@/services/friendsService'
import { X } from 'lucide-vue-next'
import { getProxiedImageUrl } from '@/utils/imageProxy'

// Service instances
const userService = new UserService()
const friendsService = new FriendsService()

// Sanitization
const { sanitizeSearch } = useSanitize()

// Keyboard shortcuts
const { registerSearchInput, unregisterSearchInput } = useKeyboardShortcuts()

// Props
const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'friendRequestSent'])

// Theme
const { theme } = useTheme()
const { showError } = usePopup()

// Desktop detection for ESC hint
const isDesktop = ref(false)

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

const handleEsc = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

// State
const searchQuery = ref('')
const searchInputRef = ref(null)
const searchResults = ref([])
const searching = ref(false)
const sendingRequest = ref(null)
const searchPerformed = ref(false) // Track if a search has been performed

// Detect Mac for keyboard shortcut display
const isMac = ref(false)

// Watch for search input ref to become available and register it with priority
watch(searchInputRef, async (newRef) => {
  if (newRef && props.isOpen) {
    await nextTick()
    registerSearchInput(newRef, 1)
    console.log('⌨️ AddFriendDialog: Search input ref registered via watch with priority 1')
  }
}, { immediate: true })

// Create debounced search function
const { debounce } = useDebounce()
const debouncedAutoSearch = debounce(() => {
  if (searchQuery.value.length >= 4) {
    searchUsers()
  } else {
    searchResults.value = []
    searchPerformed.value = false // Reset search performed flag if query is too short
  }
}, 400)

// Search users
const searchUsers = async () => {
  console.log('🔍 AddFriendDialog: ========== Searching Users ==========')
  console.log('🔍 AddFriendDialog: Search query:', searchQuery.value)
  
  // Sanitize search query
  const sanitized = sanitizeSearch(searchQuery.value)
  
  if (!sanitized.trim()) {
    console.log('🔍 AddFriendDialog: Empty search query, clearing results')
    searchResults.value = []
    return
  }
  
  console.log('🔍 AddFriendDialog: Starting user search...')
  searching.value = true
  searchPerformed.value = false // Reset before search
  
  try {
    console.log('🔍 AddFriendDialog: Calling userService.searchUsers...')
    const result = await userService.searchUsers(sanitized)
    
    console.log('🔍 AddFriendDialog: Search result:', {
      hasResult: !!result,
      resultCount: result?.length || 0,
      users: result?.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name
      }))
    })
    
    searchResults.value = result || []
    searchPerformed.value = true // Mark that search has been performed
  } catch (error) {
    console.error('❌ AddFriendDialog: Error searching users:', error)
    console.error('❌ AddFriendDialog: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    searchResults.value = []
    searchPerformed.value = true // Mark search as performed even on error
  } finally {
    searching.value = false
    console.log('🔍 AddFriendDialog: Search completed')
  }
}

// Send friend request
const sendFriendRequest = async (userId) => {
  console.log('🤝 AddFriendDialog: ========== Sending Friend Request ==========')
  console.log('🤝 AddFriendDialog: Target user ID:', userId)
  console.log('🤝 AddFriendDialog: Current search results:', searchResults.value.length)
  
  sendingRequest.value = userId
  console.log('🤝 AddFriendDialog: Setting sendingRequest state to:', userId)
  
  try {
    console.log('🤝 AddFriendDialog: Calling friendsService.sendFriendRequest...')
    console.log('🤝 AddFriendDialog: Target user ID:', userId)
    
    await friendsService.sendFriendRequest(userId)
    
    console.log('✅ AddFriendDialog: Friend request sent successfully!')
    console.log('🤝 AddFriendDialog: Emitting friendRequestSent event')
    emit('friendRequestSent')
    
    console.log('🤝 AddFriendDialog: Clearing search form...')
    searchQuery.value = ''
    searchResults.value = []
  } catch (error) {
    console.error('❌ AddFriendDialog: Error sending friend request:', error)
    console.error('❌ AddFriendDialog: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    showError(error.message || 'Failed to send friend request')
  } finally {
    sendingRequest.value = null
    console.log('🤝 AddFriendDialog: Clearing sendingRequest state')
  }
}

// Watch for dialog open/close to detect Mac and reset search state
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    // Detect Mac OS when dialog opens
    isMac.value = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    
    // Register search input for keyboard shortcuts when dialog opens
    // Use priority 1 to ensure modal search takes precedence over page-level search
    await nextTick()
    if (searchInputRef.value) {
      registerSearchInput(searchInputRef.value, 1)
      console.log('⌨️ AddFriendDialog: Modal search input registered with priority 1')
    }
  } else {
    // Unregister search input when dialog closes (priority 1)
    unregisterSearchInput(1)
    console.log('⌨️ AddFriendDialog: Modal search input unregistered')
    
    // Reset search state when dialog closes
    searchQuery.value = ''
    searchResults.value = []
    searchPerformed.value = false
    searching.value = false
  }
})

// Watch for search query changes with debounce
watch(searchQuery, () => {
  debouncedAutoSearch()
})

// (Optional, retain Enter for access)
const handleInputKeyup = (ev) => {
  if (ev.key === 'Enter' && searchQuery.value.length >= 4) {
    searchUsers()
  }
}

// Lifecycle hooks
onMounted(() => {
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleEsc)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleEsc)
})
</script>
