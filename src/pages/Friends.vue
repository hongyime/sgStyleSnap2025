<template>
  <div class="min-h-screen p-4 md:p-12 bg-background max-w-full overflow-x-hidden">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div class="flex-1 min-w-0 w-full md:w-auto">
          <h1 class="text-4xl font-bold text-foreground break-words text-left">
            Friends
          </h1>
        </div>
        
        <!-- Add Friend Button -->
        <button
          @click="showAddFriendModal = true"
          class="px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 flex-shrink-0"
        >
          <Plus class="w-5 h-5" />
          Add
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="mb-6">
        <!-- Mobile: Stack buttons vertically, Desktop: Horizontal -->
        <div class="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <router-link
            to="/friends"
            :class="`inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 ${
              currentTab === 'friends'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
          >
            <Users class="w-4 h-4" />
            My Friends
            <span
              v-if="friends.length > 0"
              :class="currentTab === 'friends' ? 'px-2 py-1 text-xs rounded-full bg-white text-black dark:bg-black dark:text-white' : 'px-2 py-1 text-xs rounded-full bg-stone-300 text-stone-800 dark:bg-zinc-600 dark:text-zinc-200'"
            >
              {{ friends.length }}
            </span>
          </router-link>

          <router-link
            to="/friends/requests/received"
            :class="`inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 ${
              currentTab === 'requests'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
          >
            <Bell class="w-4 h-4" />
            Requests Received
            <span
              v-if="friendRequests.length > 0"
              :class="currentTab === 'requests' ? 'px-2 py-1 text-xs rounded-full bg-white text-black dark:bg-black dark:text-white' : 'px-2 py-1 text-xs rounded-full bg-stone-300 text-stone-800 dark:bg-zinc-600 dark:text-zinc-200'"
            >
              {{ friendRequests.length }}
            </span>
          </router-link>

          <router-link
            to="/friends/requests/sent"
            :class="`inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 ${
              currentTab === 'sent'
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
          >
            <UserPlus class="w-4 h-4" />
            Requests Sent
            <span
              v-if="sentRequests.length > 0"
              :class="currentTab === 'sent' ? 'px-2 py-1 text-xs rounded-full bg-white text-black dark:bg-black dark:text-white' : 'px-2 py-1 text-xs rounded-full bg-stone-300 text-stone-800 dark:bg-zinc-600 dark:text-zinc-200'"
            >
              {{ sentRequests.length }}
            </span>
          </router-link>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="mb-8">
        <div class="relative search-input-group">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-zinc-400" />
          <input
            ref="searchInputRef"
            v-model="searchTerm"
            type="text"
            placeholder="Search friends..."
            class="w-full pl-10 pr-32 py-3 rounded-lg border bg-stone-100 border-stone-300 text-black placeholder-stone-500 search-input dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400"
            @input="handleSearch"
            @focus="handleSearchFocus"
            @blur="handleSearchBlur"
          />
          <!-- Raycast-style keyboard hint -->
          <div class="keyboard-hint hidden md:block">
            <span class="keyboard-hint-key">{{ isMac ? '⌘' : 'Ctrl' }}</span>
            <span>+</span>
            <span class="keyboard-hint-key">K</span>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex flex-col items-center py-16">
        <div class="spinner-modern mb-6"></div>
        <p class="text-stone-600 dark:text-zinc-400">
          Loading your friends...
        </p>
      </div>

      <!-- Content Area -->
      <div v-else-if="currentTab === 'friends'">
        <!-- My Friends -->
        <TransitionGroup 
          v-if="filteredFriends.length > 0" 
          name="list" 
          tag="div" 
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <div
            v-for="(friend, index) in filteredFriends"
            :key="friend.id"
            class="p-6 rounded-xl transition-all duration-200 hover:scale-105 cursor-pointer bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800"
            :style="{ transitionDelay: `${index * 50}ms` }"
            @click="viewFriendProfile(friend.username)"
          >
            <!-- Mobile row layout; stacked on md+ -->
            <div class="flex items-center gap-4 md:block">
              <!-- Avatar -->
              <div class="w-12 h-12 md:w-16 md:h-16 md:mx-auto rounded-full overflow-hidden bg-stone-100 dark:bg-zinc-800">
                <MediaImage
                  v-if="friend.avatar_url"
                  :record="friend" table="users" :source-url="friend?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="getProxiedImageUrl(friend.avatar_url)"
                  :alt="friend.name"
                  class="w-full h-full object-cover"
                  crossorigin="anonymous"
                  @error="handleImageError"
                />
                <div class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700" v-else>
                  <span class="text-lg md:text-xl font-bold text-stone-500 dark:text-zinc-400">
                    {{ (friend.name || friend.username || 'F').charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>

              <!-- Friend Info -->
              <div class="text-left md:text-center md:mt-4">
                <h3 class="font-bold text-lg mb-0 md:mb-1 text-foreground">
                  {{ friend.name || 'Friend User' }}
                </h3>
                <p class="text-sm text-stone-600 dark:text-zinc-400">
                  @{{ friend.username || 'username' }}
                </p>
              </div>
            </div>
          </div>
        </TransitionGroup>
        
        <div v-else class="text-center py-12">
          <Users class="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-zinc-600" />
          <p class="text-lg text-stone-600 dark:text-zinc-400">
            {{ searchTerm ? 'No friends found matching your search.' : 'You don\'t have any friends yet.' }}
          </p>
          <p v-if="!searchTerm" class="text-sm mt-2 text-stone-500 dark:text-zinc-500">
            Click "Add" to start connecting!
          </p>
        </div>
      </div>

      <!-- Friend Requests Tab -->
      <div v-else-if="currentTab === 'requests'">
        <TransitionGroup 
          v-if="friendRequests.length > 0" 
          name="list" 
          tag="div" 
          class="space-y-4"
        >
          <div
            v-for="(request, index) in friendRequests"
            :key="request.id"
            class="p-6 rounded-xl bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800"
            :style="{ transitionDelay: `${index * 50}ms` }"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <!-- Avatar -->
                <div class="w-12 h-12 md:w-12 md:h-12 rounded-full overflow-hidden bg-stone-100 dark:bg-zinc-800">
                  <MediaImage
                    v-if="request.requester?.avatar_url"
                    :record="request.requester" table="users" :source-url="request.requester?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="getProxiedImageUrl(request.requester.avatar_url)"
                    :alt="request.requester.name"
                    class="w-full h-full object-cover"
                    crossorigin="anonymous"
                    @error="handleImageError"
                  />
                  <div class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700" v-else>
                    <span class="text-sm font-bold text-stone-500 dark:text-zinc-400">
                      {{ (request.requester?.name || 'U').charAt(0).toUpperCase() }}
                    </span>
                  </div>
                </div>
                
                <!-- Request Info -->
                <div class="text-left">
                  <h3 class="font-medium text-foreground">
                    {{ request.requester?.name || 'Unknown User' }}
                  </h3>
                  <p class="text-sm text-stone-600 dark:text-zinc-400">
                    @{{ request.requester?.username || 'unknown' }}
                  </p>
                </div>
              </div>
              
              <!-- Action Buttons -->
              <div class="flex gap-2">
                <button
                  @click.stop="acceptFriendRequest(request.id)"
                  @touchstart.stop.prevent="acceptFriendRequest(request.id)"
                  class="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-all duration-200 flex items-center justify-center"
                  title="Accept"
                >
                  <Check class="w-5 h-5" />
                </button>
                <button
                  @click.stop="declineFriendRequest(request.id)"
                  @touchstart.stop.prevent="declineFriendRequest(request.id)"
                  class="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all duration-200 flex items-center justify-center"
                  title="Decline"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </TransitionGroup>
        
        <div v-else class="text-center py-12">
          <Bell class="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-zinc-600" />
          <p class="text-lg text-stone-600 dark:text-zinc-400">
            No pending friend requests.
          </p>
        </div>
      </div>

      <!-- My Requests Tab -->
      <div v-else-if="currentTab === 'sent'">
        <TransitionGroup 
          v-if="sentRequests.length > 0" 
          name="list" 
          tag="div" 
          class="space-y-4"
        >
          <div
            v-for="(request, index) in sentRequests"
            :key="request.id"
            class="p-6 rounded-xl bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800"
            :style="{ transitionDelay: `${index * 50}ms` }"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <!-- Avatar -->
                <div class="w-12 h-12 md:w-12 md:h-12 rounded-full overflow-hidden bg-stone-100 dark:bg-zinc-800">
                  <MediaImage
                    v-if="request.receiver?.avatar_url"
                    :record="request.receiver" table="users" :source-url="request.receiver?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="getProxiedImageUrl(request.receiver.avatar_url)"
                    :alt="request.receiver.name"
                    class="w-full h-full object-cover"
                    crossorigin="anonymous"
                    @error="handleImageError"
                  />
                  <div class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700" v-else>
                    <span class="text-sm font-bold text-stone-500 dark:text-zinc-400">
                      {{ (request.receiver?.name || 'U').charAt(0).toUpperCase() }}
                    </span>
                  </div>
                </div>
                
                <!-- Request Info -->
                <div class="text-left">
                  <h3 class="font-medium text-black dark:text-white">
                    {{ request.receiver?.name || 'Unknown User' }}
                  </h3>
                  <p class="text-sm text-stone-600 dark:text-zinc-400">
                    @{{ request.receiver?.username || 'unknown' }}
                  </p>
                  <p class="text-xs text-stone-500 dark:text-zinc-500">
                    Sent {{ formatDate(request.created_at) }}
                  </p>
                </div>
              </div>
              
              <!-- Action Button -->
              <div class="flex gap-2">
                <button
                  @click="cancelFriendRequest(request.id)"
                  class="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </TransitionGroup>
        
        <div v-else class="text-center py-12">
          <UserPlus class="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-zinc-600" />
          <p class="text-lg text-stone-600 dark:text-zinc-400">
            No sent friend requests.
          </p>
        </div>
      </div>

      <!-- Add Friend Modal -->
      <div
        v-if="showAddFriendModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        @click="showAddFriendModal = false"
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
              @click="showAddFriendModal = false"
              class="p-2 rounded-lg transition-all bg-white/90 shadow-lg hover:bg-stone-100 text-stone-500 hover:text-black dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white"
              aria-label="Close dialog"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          
          <h3 class="text-xl font-bold mb-4 text-black dark:text-white pr-8">
            Add Your Friend
          </h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2 text-stone-700 dark:text-zinc-300">
                Search by username
              </label>
              <input
                v-model="addFriendSearch"
                type="text"
                placeholder="Enter at least 4 characters"
                class="w-full px-3 py-2 rounded-lg border bg-white border-stone-300 text-black placeholder-stone-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400"
                @input="handleFriendSearchInput"
                @keyup.enter="addFriendSearch && addFriendSearch.trim().length >= 4 && searchAndAddFriend()"
              />
              <!-- Results count / No results message - shown below input -->
              <div class="mt-2">
                <p v-if="!addFriendSearch || addFriendSearch.length < 4" class="text-xs text-stone-400 dark:text-zinc-500">
                  Type at least 4 characters to search
                </p>
                <p v-else-if="isSearchingFriends" class="text-xs text-stone-500 dark:text-zinc-400">
                  Searching...
                </p>
                <p v-else-if="friendSearchPerformed && addFriendResults && addFriendResults.length > 0" class="text-xs text-stone-600 dark:text-zinc-400">
                  {{ addFriendResults.length }} {{ addFriendResults.length === 1 ? 'result' : 'results' }} found
                </p>
                <p v-else-if="friendSearchPerformed && (!addFriendResults || addFriendResults.length === 0)" class="text-xs text-stone-600 dark:text-zinc-400">
                  No results found
                </p>
              </div>
            </div>
            
            <div v-if="addFriendResults && addFriendResults.length > 0" class="space-y-2 max-h-40 overflow-y-auto">
              <div
                v-for="user in addFriendResults"
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
                      crossorigin="anonymous"
                      @error="handleImageError"
                    />
                    <div class="w-full h-full flex items-center justify-center bg-stone-300 dark:bg-zinc-600" v-else>
                      <span class="text-xs font-bold text-stone-500 dark:text-zinc-400">
                        {{ (user.name || 'U').charAt(0).toUpperCase() }}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p class="font-medium text-sm text-black dark:text-white">
                      {{ user.name }}
                    </p>
                    <p class="text-xs text-stone-600 dark:text-zinc-400">
                      @{{ user.username }}
                    </p>
                  </div>
                </div>
                <button
                  @click="sendFriendRequest(user)"
                  :disabled="isRequestSent(user.id) || isFriend(user.id)"
                  :class="(isRequestSent(user.id) || isFriend(user.id))
                    ? 'px-3 py-1 rounded-lg text-xs font-medium bg-zinc-600 text-zinc-300 cursor-not-allowed'
                    : 'px-3 py-1 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600'"
                >
                  {{ isFriend(user.id) ? 'Friends' : isRequestSent(user.id) ? 'Pending' : 'Add' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Toasts -->
      <div class="fixed top-4 right-4 z-[60]">
        <transition-group name="toast-fade" tag="div" class="flex flex-col gap-6">
          <div
            v-for="t in toasts"
            :key="t.id"
            :class="t.type === 'success'
              ? 'flex items-start gap-3 px-4 py-3 rounded-lg shadow-md text-sm bg-green-500 text-white dark:bg-green-600'
              : 'flex items-start gap-3 px-4 py-3 rounded-lg shadow-md text-sm bg-red-500 text-white dark:bg-red-600'"
          >
            <component :is="t.type === 'success' ? CheckCircle : XCircle" class="w-5 h-5 mt-0.5" />
            <div class="flex-1">{{ t.message }}</div>
            <button class="opacity-80 hover:opacity-100" @click="dismissToast(t.id)">
              <X class="w-4 h-4" />
            </button>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script setup>
import MediaImage from '@/components/ui/MediaImage.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useSanitize } from '@/composables/useSanitize'
import { useAuthStore } from '@/stores/auth-store'
import { FriendsService } from '@/services/friendsService'
import { UserService } from '@/services/userService'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { getProxiedImageUrl } from '@/utils/imageProxy'
import { Users, UserPlus, Bell, Search, CheckCircle, XCircle, X, Check, Plus } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const { theme } = useTheme()
const { sanitizeSearch } = useSanitize()
const authStore = useAuthStore()

// Initialize services
const friendsService = new FriendsService()
const userService = new UserService()

// Get current tab from route
const currentTab = computed(() => {
  return route.meta.subRoute || 'friends'
})

// State
const searchTerm = ref('')
const friends = ref([])
const friendRequests = ref([])
const sentRequests = ref([])
const showAddFriendModal = ref(false)
const addFriendSearch = ref('')
const addFriendResults = ref([])
const isSearchingFriends = ref(false)
const friendSearchPerformed = ref(false)
const isLoading = ref(true)

// Debounce timer for friend search
let friendSearchDebounceTimer = null

// Computed
const filteredFriends = computed(() => {
  const query = searchTerm.value.toLowerCase();
  return friends.value.filter(friend =>
    (friend.name?.toLowerCase().includes(query)) ||
    (friend.username?.toLowerCase().includes(query))
  )
})

// Methods
const loadFriendsData = async () => {
  isLoading.value = true
  try {
    console.log('🔧 Friends: Loading friends data...')
    
    // Load friends using FriendsService
    const friendsData = await friendsService.getFriends()
    friends.value = friendsData || []
    
    // Load friend requests (incoming)
    const requestsData = await friendsService.getFriendRequests()
    friendRequests.value = requestsData || []
    
    // Load sent requests
    const sentData = await friendsService.getSentRequests()
    sentRequests.value = sentData || []
    
    console.log('✅ Friends: Loaded friends:', friends.value.length)
    console.log('✅ Friends: Loaded requests:', friendRequests.value.length)
    console.log('✅ Friends: Loaded sent requests:', sentRequests.value.length)
  } catch (error) {
    console.error('❌ Friends: Error loading friends data:', error)
    friends.value = []
    friendRequests.value = []
    sentRequests.value = []
  } finally {
    isLoading.value = false
  }
}

const handleSearch = () => {
  // Sanitize search input in real-time
  searchTerm.value = sanitizeSearch(searchTerm.value)
}

// Handle friend search input with debouncing
const handleFriendSearchInput = () => {
  // Sanitize input in real-time
  addFriendSearch.value = sanitizeSearch(addFriendSearch.value)
  
  // Clear previous debounce timer if exists
  if (friendSearchDebounceTimer) {
    clearTimeout(friendSearchDebounceTimer)
    friendSearchDebounceTimer = null
  }
  
  // If less than 4 characters, clear results and don't search
  if (!addFriendSearch.value || addFriendSearch.value.trim().length < 4) {
    addFriendResults.value = []
    friendSearchPerformed.value = false
    isSearchingFriends.value = false
    return
  }
  
  // Set loading state while waiting for debounce
  isSearchingFriends.value = true
  friendSearchPerformed.value = false
  
  // Debounce: wait 2 seconds after user stops typing
  friendSearchDebounceTimer = setTimeout(() => {
    // User stopped typing for 2 seconds, perform search
    searchAndAddFriend()
    friendSearchDebounceTimer = null
  }, 2000) // 2 second delay
}

// Handle image loading errors
const handleImageError = (event) => {
  // Hide the broken image - fallback will show
  event.target.style.display = 'none'
}

const searchAndAddFriend = async () => {
  const raw = addFriendSearch.value.trim()
  if (!raw || raw.length < 4) {
    addFriendResults.value = []
    friendSearchPerformed.value = false
    isSearchingFriends.value = false
    return
  }

  // Only allow username searches; strip leading '@' if present
  const usernameQuery = raw.startsWith('@') ? raw.slice(1) : raw

  console.log('🔧 Friends: Searching for users by username:', usernameQuery)
  
  isSearchingFriends.value = true
  friendSearchPerformed.value = false
  
  try {
    const result = await userService.searchUsersByUsername(usernameQuery)
    console.log('✅ Friends: Search result:', result)
    
    // Get current user ID from auth store to filter out from results
    const currentUserId = authStore.userId
    
    // Filter out the current user from search results
    const filteredResults = (result || []).filter(user => user.id !== currentUserId)
    
    if (filteredResults.length < result?.length) {
      console.log('🔧 Friends: Filtered out current user from search results')
    }
    
    addFriendResults.value = filteredResults
    friendSearchPerformed.value = true
  } catch (error) {
    console.error('❌ Friends: Error searching users:', error)
    addFriendResults.value = []
    friendSearchPerformed.value = true
  } finally {
    isSearchingFriends.value = false
  }
}

const toasts = ref([])

const showToast = (message, type = 'success') => {
  const id = `${Date.now()}-${Math.random()}`
  // Keep only the last 2 so adding this makes max 3
  if (toasts.value.length >= 3) {
    toasts.value = toasts.value.slice(-2)
  }
  toasts.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), 4000)
}

const dismissToast = (id) => {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

const sendFriendRequest = async (user) => {
  try {
    // Optimistic: add to sentRequests immediately
    const tempId = `temp-${Date.now()}`
    const optimistic = {
      id: tempId,
      receiver: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar_url: user.avatar_url
      },
      status: 'pending',
      created_at: new Date().toISOString()
    }
    sentRequests.value = [optimistic, ...sentRequests.value]

    const result = await friendsService.sendFriendRequest(user.id)
    if (result && result.id) {
      sentRequests.value = sentRequests.value.map(r => r.id === tempId ? { ...r, id: result.id } : r)
    }
    showToast('Friend request sent', 'success')
  } catch (error) {
    // Rollback
    sentRequests.value = sentRequests.value.filter(r => !String(r.id).startsWith('temp-'))
    showToast(error.message || 'Failed to send friend request', 'error')
  }
}

const acceptFriendRequest = async (requestId) => {
  try {
    // Optimistic: remove from incoming list immediately
    const prev = [...friendRequests.value]
    friendRequests.value = friendRequests.value.filter(r => r.id !== requestId)
    const res = await friendsService.acceptFriendRequest(requestId)
    if (!res || !res.success) throw new Error('Failed to accept request')
    showToast('Friend request accepted', 'success')
    await loadFriendsData() // refresh after accept
  } catch (error) {
    await loadFriendsData()
    showToast(error.message || 'Failed to accept friend request', 'error')
  }
}

const declineFriendRequest = async (requestId) => {
  try {
    // Optimistic: remove from incoming list immediately
    const prev = [...friendRequests.value]
    friendRequests.value = friendRequests.value.filter(r => r.id !== requestId)
    const res = await friendsService.rejectFriendRequest(requestId)
    if (!res || !res.success) throw new Error('Failed to decline request')
    showToast('Friend request declined', 'success')
  } catch (error) {
    console.error('Error declining friend request:', error)
    await loadFriendsData()
    showToast(error.message || 'Failed to decline friend request', 'error')
  }
}

const cancelFriendRequest = async (requestId) => {
  try {
    // Optimistic: remove from sent list immediately
    const prev = [...sentRequests.value]
    sentRequests.value = sentRequests.value.filter(req => req.id !== requestId)
    await friendsService.cancelFriendRequest(requestId)
    showToast('Friend request cancelled', 'success')
  } catch (error) {
    await loadFriendsData()
    showToast(error.message || 'Failed to cancel friend request', 'error')
  }
}

const formatDate = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now - date)
  const diffMinutes = Math.floor(diffTime / (1000 * 60))
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // Show more precise timing for recent requests
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`
  // For older dates, show full date in "28 Oct 2025" format
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

const viewFriendProfile = (friendUsername) => {
  router.push(`/friend/${friendUsername}/profile`)
}

const isRequestSent = (userId) => {
  return sentRequests.value.some(req => req.receiver?.id === userId)
}

const isFriend = (userId) => {
  return friends.value.some(friend => friend.id === userId)
}

const handleSearchFocus = (event) => {
  event.target.classList.add('search-input-focus')
}

const handleSearchBlur = (event) => {
  event.target.classList.remove('search-input-focus')
}

// Search input ref and registration
const searchInputRef = ref(null)
const { registerSearchInput } = useKeyboardShortcuts()

// Detect Mac for keyboard shortcut display
const isMac = ref(false)

// Desktop detection for ESC hint
const isDesktop = ref(false)

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

// Handle ESC key to close modal
const handleEsc = (e) => {
  if (e.key === 'Escape' && showAddFriendModal.value) {
    showAddFriendModal.value = false
  }
}

// Reset search state when modal closes
watch(showAddFriendModal, (isOpen) => {
  if (!isOpen) {
    // Clear debounce timer
    if (friendSearchDebounceTimer) {
      clearTimeout(friendSearchDebounceTimer)
      friendSearchDebounceTimer = null
    }
    // Reset search state when modal closes
    addFriendSearch.value = ''
    addFriendResults.value = []
    friendSearchPerformed.value = false
    isSearchingFriends.value = false
  }
})

// Lifecycle
onMounted(() => {
  // Detect Mac OS
  isMac.value = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
  
  // Initialize desktop detection
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', handleResize)
  
  // Register search input for keyboard shortcuts
  if (searchInputRef.value) {
    registerSearchInput(searchInputRef.value)
  }
  loadFriendsData()
  
  // Add ESC key listener for modal
  window.addEventListener('keydown', handleEsc)
  
  // Add test function to window for debugging
  window.testFriendSearch = async (query) => {
    console.log('🔧 Friends: Testing friend search with query:', query)
    try {
      const result = await friendsService.searchUsers(query)
      console.log('✅ Friends: Test search result:', result)
      return result
    } catch (error) {
      console.error('❌ Friends: Test search error:', error)
      return null
    }
  }
})

onUnmounted(() => {
  // Clean up event listeners
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleEsc)
  
  // Clear debounce timer on unmount
  if (friendSearchDebounceTimer) {
    clearTimeout(friendSearchDebounceTimer)
    friendSearchDebounceTimer = null
  }
})

// Removed auto-search on keypress; search happens on explicit action only
</script>