<template>
  <div class="min-h-screen p-4 md:p-12 bg-background max-w-full overflow-x-hidden">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4 flex-1 min-w-0">
          <button
            @click="$router.back()"
            class="p-2 rounded-lg transition-all duration-200 bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 flex-shrink-0"
          >
            <ArrowLeft class="w-5 h-5" />
          </button>
          <div class="flex-1 min-w-0">
            <h1 class="text-4xl font-bold text-foreground text-left">
              {{ getFirstName(friend?.name) || (friend?.username ? `@${friend.username}` : 'Friend') }}'s Closet
            </h1>
            <p class="text-lg text-stone-600 dark:text-zinc-400">
              Browse their wardrobe and get style inspiration
            </p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <button
            @click="toggleView"
            class="p-2 rounded-lg transition-all duration-200 bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <component :is="viewMode === 'grid' ? List : Grid" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Friend Info -->
      <div v-if="friend" class="rounded-xl p-6 mb-8 bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800">
        <div class="flex items-center gap-6">
          <div class="w-20 h-20 rounded-full overflow-hidden bg-stone-100 dark:bg-zinc-800">
            <MediaImage
              v-if="friend.avatar_url"
              :record="friend" table="users" :source-url="friend?.avatar_url || ''" fallback="/images/avatar-placeholder.svg" :src="getProxiedImageUrl(friend.avatar_url)"
              :alt="friend.name"
              class="w-full h-full object-cover"
              crossorigin="anonymous"
              @error="handleImageError"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700"
            >
              <User class="w-10 h-10 text-stone-500 dark:text-zinc-400" />
            </div>
          </div>
          <div class="flex-1">
            <h2 class="text-2xl font-bold text-black dark:text-white">
              {{ getFirstName(friend.name) || (friend.username ? `@${friend.username}` : 'Friend') }}
            </h2>
            <p class="text-lg text-stone-600 dark:text-zinc-400">
              @{{ friend.username }}
            </p>
            <div class="flex gap-6 mt-2">
              <div class="text-center">
                <p class="text-2xl font-bold text-black dark:text-white">
                  {{ friend.outfit_count || 0 }}
                </p>
                <p class="text-sm text-stone-600 dark:text-zinc-400">
                  Outfits
                </p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-black dark:text-white">
                  {{ friend.item_count || 0 }}
                </p>
                <p class="text-sm text-stone-600 dark:text-zinc-400">
                  Items
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="rounded-xl p-6 mb-8 bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800">
        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex-1">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Search items..."
              class="w-full px-4 py-3 rounded-lg border bg-white border-stone-300 text-black placeholder-stone-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400"
              @input="handleSearch"
            />
          </div>
          <div class="flex gap-2">
            <button
              v-for="category in categories"
              :key="category"
              @click="activeCategory = category"
              :class="`px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeCategory === category
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`"
            >
              {{ category === 'all' ? 'All' : category }}
            </button>
          </div>
        </div>
      </div>

      <!-- Items Grid/List -->
      <div v-if="loading" class="flex flex-col items-center py-12">
        <div class="spinner-modern mb-4" />
        <p class="text-lg text-stone-600 dark:text-zinc-400">
          Loading items...
        </p>
      </div>

      <div v-else-if="filteredItems.length === 0" class="text-center py-12">
        <div class="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800">
          <Shirt class="w-12 h-12 text-stone-500 dark:text-zinc-400" />
        </div>
        <h2 class="text-2xl font-semibold mb-2 text-black dark:text-white">
          No items found
        </h2>
        <p class="text-lg text-stone-600 dark:text-zinc-400">
          {{ searchQuery ? 'Try adjusting your search' : 'This friend hasn\'t added any items yet' }}
        </p>
      </div>

      <div v-else :class="viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6' : 'space-y-4'">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          :class="`group relative transition-all duration-300 cursor-pointer hover:-translate-y-2 ${
            viewMode === 'grid'
              ? 'aspect-square rounded-3xl overflow-hidden'
              : 'flex items-center gap-4 p-4 rounded-xl'
          } bg-white border border-stone-200 hover:border-stone-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700`"
        >
          <!-- Image -->
          <div :class="viewMode === 'grid' ? 'w-full h-full p-4 flex items-center justify-center' : 'w-20 h-20 rounded-lg overflow-hidden flex-shrink-0'">
            <ClothingImage
              v-if="item.image_url"
              :record="item" table="clothes" :src="item.image_url"
              :alt="item.name"
              :class="viewMode === 'grid' ? 'max-w-full max-h-full object-contain' : 'w-full h-full object-cover'"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800"
            >
              <Shirt :class="`${viewMode === 'grid' ? 'w-12 h-12' : 'w-6 h-6'} text-stone-500 dark:text-zinc-400`" />
            </div>
          </div>

          <!-- Overlay (Grid view only) -->
          <div v-if="viewMode === 'grid'" class="absolute inset-0 transition-all duration-300 flex flex-col justify-end p-4 bg-background bg-opacity-0 group-hover:bg-opacity-90">
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <h3 class="font-semibold text-lg mb-1 text-black dark:text-white">
                {{ item.name }}
              </h3>
              <p class="text-sm mb-3 text-stone-600 dark:text-zinc-400">
                {{ item.category }}
                {{ item.brand ? ` • ${item.brand}` : '' }}
              </p>
            </div>
          </div>

          <!-- List view content -->
          <div v-if="viewMode === 'list'" class="flex-1">
            <h3 class="font-semibold text-lg text-black dark:text-white">
              {{ item.name }}
            </h3>
            <p class="text-sm text-stone-600 dark:text-zinc-400">
              {{ item.category }}
              {{ item.brand ? ` • ${item.brand}` : '' }}
            </p>
            <p class="text-xs mt-1 text-stone-500 dark:text-zinc-500">
              Added {{ formatDate(item.created_at) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import MediaImage from '@/components/ui/MediaImage.vue'
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useSanitize } from '@/composables/useSanitize'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { api } from '@/api/client'
import { clothesService } from '@/services/clothesService'
import { formatDate, getFirstName } from '@/utils'
import { getProxiedImageUrl } from '@/utils/imageProxy'
import { ArrowLeft, User, Shirt, Grid, List } from 'lucide-vue-next'

const route = useRoute()
const { theme } = useTheme()
const { sanitizeSearch } = useSanitize()
const { registerSearchInput } = useKeyboardShortcuts()
const friend = ref(null)
const items = ref([])
const loading = ref(true)
const searchQuery = ref('')
const searchInputRef = ref(null)
const activeCategory = ref('all')
const viewMode = ref('grid')

const categories = ['all', 'tops', 'bottoms', 'shoes', 'outerwear', 'accessories']

const filteredItems = computed(() => {
  let filtered = items.value

  if (activeCategory.value !== 'all') {
    filtered = filtered.filter(item => item.category === activeCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.brand?.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    )
  }

  return filtered
})

const loadFriend = async () => {
  try {
    const friendId = route.query.friendId
    if (!friendId) {
      console.error('No friend ID provided')
      return
    }

    const friendData = await api.entities.User.get(friendId)
    friend.value = friendData
  } catch (error) {
    console.error('Error loading friend:', error)
  }
}

const loadFriendItems = async () => {
  try {
    const friendId = route.query.friendId
    if (!friendId) return

    // Use the proper getFriendCloset method that respects privacy settings
    const result = await clothesService.getFriendCloset(friendId)
    
    if (result && result.success) {
      items.value = result.data || []
      console.log('FriendCabinet: Loaded friend items:', items.value.length, 'items')
    } else {
      console.error('FriendCabinet: Failed to load friend items:', result?.error || 'Unknown error')
      items.value = []
    }
  } catch (error) {
    console.error('Error loading friend items:', error)
    items.value = []
  } finally {
    loading.value = false
  }
}

const toggleView = () => {
  viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid'
}

const handleSearch = () => {
  // Sanitize search input in real-time
  searchQuery.value = sanitizeSearch(searchQuery.value)
}

onMounted(async () => {
  await loadFriend()
  await loadFriendItems()
  
  // Register search input for keyboard shortcuts after DOM is ready
  await nextTick()
  if (searchInputRef.value) {
    registerSearchInput(searchInputRef.value)
  }
})
</script>