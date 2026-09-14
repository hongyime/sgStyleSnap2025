<template>
  <div class="min-h-screen p-4 md:p-12 bg-background max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="max-w-6xl mx-auto mb-8">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex-1 min-w-0 w-full md:w-auto">
          <h1 class="text-4xl font-bold text-foreground break-words text-left">
            Your Outfits
          </h1>
        </div>
        
        <!-- Add Outfit Dropdown Button -->
        <div class="relative flex-shrink-0">
          <button
            @click="showAddMenu = !showAddMenu"
            :class="`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200`"
          >
            <Plus class="w-5 h-5" />
            Add
            <ChevronDown :class="`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`" />
          </button>
          <!-- Dropdown Menu: AI Suggestions first, then Personal, then Friend -->
          <div v-if="showAddMenu" class="absolute right-0 mt-2 w-64 rounded-xl shadow-xl border overflow-hidden z-50 bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800">
            <!-- AI Suggestions first -->
            <button @click="navigateToCreate('suggested')" class="w-full px-4 py-3 flex items-center gap-3 transition-colors text-left hover:bg-stone-50 dark:hover:bg-zinc-800 text-black dark:text-white">
              <Sparkles class="w-5 h-5" />
              <div>
                <div class="font-medium">AI Suggestions</div>
                <div :class="`text-xs text-stone-500 dark:text-zinc-400`">Get AI-powered outfit recommendations</div>
              </div>
            </button>
            <!-- Personal second -->
            <button @click="navigateToCreate('personal')" class="w-full px-4 py-3 flex items-center gap-3 transition-colors text-left hover:bg-stone-50 dark:hover:bg-zinc-800 text-black dark:text-white">
              <User class="w-5 h-5" />
              <div>
                <div class="font-medium">Personal Creation</div>
                <div :class="`text-xs text-stone-500 dark:text-zinc-400`">Create your own outfit combinations</div>
              </div>
            </button>
            <!-- Friend third -->
            <button @click="navigateToCreate('friend')" class="w-full px-4 py-3 flex items-center gap-3 transition-colors text-left hover:bg-stone-50 dark:hover:bg-zinc-800 text-black dark:text-white">
              <Users class="w-5 h-5" />
              <div>
                <div class="font-medium">Friend Creation</div>
                <div :class="`text-xs text-stone-500 dark:text-zinc-400`">Use items from friends' closets</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Category Filters -->
      <div class="mb-6">
        <!-- Category Filters (All Outfits, Suggestions) - Always visible, side-by-side on mobile -->
        <div class="flex gap-2 mb-4">
          <button
            v-for="filter in categoryFilters"
            :key="filter.value"
            @click="activeFilter = filter.value"
            :class="`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium transition-all duration-200 text-sm md:text-base flex items-center justify-center gap-2 ${
              activeFilter === filter.value
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
          >
            {{ filter.label }}
            <span v-if="filter.value === 'suggestions' && suggestionStats.pending > 0" 
                  class="px-2 py-0.5 text-xs rounded-full bg-blue-500 text-white">
              {{ suggestionStats.pending }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Search Bar and Favourites Button -->
    <div class="max-w-6xl mx-auto mb-8">
      <div class="flex items-center gap-3">
        <!-- Search Bar (85% when All Outfits, 100% when Suggestions) -->
        <div :class="`${activeFilter === 'all' ? 'flex-[0.85]' : 'flex-1'} relative search-input-group`">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-zinc-400" />
          <input
            ref="searchInputRef"
            v-model="searchTerm"
            type="text"
            :placeholder="activeFilter === 'suggestions' 
              ? 'Search suggestions...'
              : 'Search your outfits...'"
            class="w-full pl-10 pr-3 md:pr-32 py-3 rounded-lg border bg-stone-100 dark:bg-zinc-800 border-stone-300 dark:border-zinc-700 text-black dark:text-white placeholder-stone-500 dark:placeholder-zinc-400 search-input"
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
        
        <!-- Favourites Button (15%) - Only show when All Outfits is selected -->
        <div v-if="activeFilter === 'all'" class="flex-[0.15]">
          <button
            @click="showFavoritesOnly = !showFavoritesOnly"
            :class="`w-full h-12 rounded-lg font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2 border ${
              showFavoritesOnly
                ? 'bg-red-500 text-white dark:bg-red-600 border-0'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 border-stone-300 dark:border-zinc-700'
            }`"
          >
            <Heart :class="`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`" />
            <span class="hidden sm:inline">Favourites</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Suggestions Section -->
    <div v-if="activeFilter === 'suggestions'" class="max-w-6xl mx-auto">
      <!-- Loading state -->
      <div v-if="suggestionsLoading" class="flex flex-col items-center py-16">
        <div class="spinner-modern mb-6"></div>
        <p class="text-stone-600 dark:text-zinc-400">
          Loading suggestions...
        </p>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredSuggestions.length === 0" class="text-center py-12">
        <div :class="`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800`">
          <Sparkles :class="`w-12 h-12 text-stone-500 dark:text-zinc-400`" />
        </div>
        <h3 :class="`text-xl font-semibold mb-2 text-black dark:text-white`">
          {{ searchTerm ? 'No suggestions found matching your search.' : 'No outfit suggestions yet' }}
        </h3>
        <p :class="`text-lg mb-4 text-stone-600 dark:text-zinc-400`">
          {{ searchTerm ? 'Try adjusting your search terms.' : 'When friends suggest outfits using your items, they\'ll appear here.' }}
        </p>
      </div>

      <!-- Suggestions Grid -->
      <div v-else class="space-y-6">
        <div
          v-for="suggestion in filteredSuggestions"
          :key="suggestion.id"
        >
          <FriendSuggestionCard
            :suggestion="suggestion"
            @suggestion-processed="handleSuggestionProcessed"
          />
        </div>
      </div>
    </div>

    <!-- Outfits Grid -->
    <div v-else class="max-w-6xl mx-auto">
      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center py-16">
        <div class="spinner-modern mb-6"></div>
        <p class="text-stone-600 dark:text-zinc-400">
          Loading your outfits...
        </p>
      </div>

      <div v-else-if="filteredOutfits.length === 0" class="text-center py-12">
        <div :class="`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800`">
          <Shirt :class="`w-12 h-12 text-stone-500 dark:text-zinc-400`" />
        </div>
        <h3 :class="`text-xl font-semibold mb-2 text-black dark:text-white`">
          {{ searchTerm ? 'No outfits found matching your search.' : 'No outfits found' }}
        </h3>
        <p :class="`text-lg mb-4 text-stone-600 dark:text-zinc-400`">
          {{ searchTerm ? 'Try adjusting your search terms.' : 'Start creating your first outfit!' }}
        </p>
        <button
          @click="navigateToCreate('personal')"
          class="px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          Create Outfit
        </button>
      </div>

      <TransitionGroup 
        v-else 
        name="list" 
        tag="div" 
        class="grid grid-cols-2 md:grid-cols-4 gap-6"
      >
        <div
          v-for="(outfit, index) in filteredOutfits"
          :key="outfit.id"
          class="group cursor-pointer transition-all duration-300 hover:scale-105 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden"
          v-memo="[outfit.id, outfit.outfit_name, outfit.preview_url, outfit.is_favorite, activeFilter, searchTerm]"
          @click="viewOutfit(outfit)"
        >
          <div class="aspect-square relative overflow-hidden">
            <!-- Outfit Canvas Miniature (shows items in their positions) -->
              <OutfitCanvasMiniature 
                :items="outfit.outfit_items || []"
                :scale-factor="0.4"
              />
            
            <!-- Action buttons overlay -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"></div>
              <div class="flex items-center gap-3 absolute inset-0 justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
              <button
                @click.stop="editOutfit(outfit)"
                  class="p-3 rounded-xl transition-all duration-200 bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 z-30"
                title="Edit"
              >
                <Pencil class="w-5 h-5" />
              </button>
              <button
                @click.stop="deleteOutfit(outfit)"
                  class="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all duration-200 z-30"
                title="Delete"
              >
                <Trash2 class="w-5 h-5" />
              </button>
              </div>
            </div>
          </div>
          
          <div class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <h3 :class="`font-semibold mb-1 text-black dark:text-white`">
                  {{ outfit.outfit_name || outfit.name || 'Untitled Outfit' }}
                </h3>
                <p :class="`text-xs text-stone-500 dark:text-zinc-500`">
                  {{ outfit.item_count || 0 }} items, {{ formatDate(outfit.created_at) }}
                </p>
              </div>
              <button
                @click.stop="toggleFavorite(outfit)"
                @touchstart.stop.prevent="toggleFavorite(outfit)"
                class="flex-shrink-0 p-2 rounded-full transition-all duration-200"
                :class="outfit.is_favorite ? 'text-red-500 dark:text-red-400' : 'text-stone-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400'"
                title="Favorite"
                style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
              >
                <Heart :class="`w-5 h-5 ${outfit.is_favorite ? 'fill-current text-red-500 dark:text-red-400' : ''}`" />
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Click outside to close dropdown -->
    <div
      v-if="showAddMenu"
      class="fixed inset-0 z-40"
      @click="showAddMenu = false"
    />

    <!-- Outfit Detail Modal -->
    <Transition name="modal-backdrop">
      <div
        v-if="showOutfitDetail && selectedOutfit"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 md:pb-4 bg-black/50 overflow-y-auto"
        @click="closeOutfitDetail"
      >
        <Transition name="modal" appear>
          <div
            v-if="showOutfitDetail && selectedOutfit"
            class="relative w-full max-w-4xl max-h-[calc(100vh-6rem)] md:max-h-[90vh] rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 my-auto"
            @click.stop
          >
        <!-- Modal Header -->
        <div class="p-4 md:p-6 border-b border-stone-200 dark:border-zinc-800">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h2 :class="`text-xl md:text-2xl font-bold mb-3 text-black dark:text-white`">
                {{ selectedOutfit.outfit_name || selectedOutfit.name || 'Untitled Outfit' }}
              </h2>
              <!-- Details stacked vertically on mobile, horizontal on desktop -->
              <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm">
                <span class="text-stone-600 dark:text-zinc-400 whitespace-nowrap">
                  {{ selectedOutfit.item_count || (selectedOutfit.outfit_items?.length || 0) }} items
                </span>
                <span class="text-stone-600 dark:text-zinc-400 whitespace-nowrap">
                  Created {{ formatDate(selectedOutfit.created_at) }}
                </span>
                <span v-if="createdLocation" class="text-stone-600 dark:text-zinc-400 whitespace-nowrap truncate md:max-w-[50%]">
                  {{ createdLocation }}
                </span>
              </div>
            </div>
            
            <!-- Close button -->
            <div class="flex items-center gap-2">
              <!-- ESC Key Hint (Desktop only) -->
              <div v-if="isDesktop" class="keyboard-hint-modal">
                <span class="keyboard-hint-key">ESC</span>
              </div>
              <button
                @click="closeOutfitDetail"
                class="p-2 rounded-lg transition-all bg-white/90 shadow-lg hover:bg-stone-100 text-stone-500 hover:text-black dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Content -->
        <div class="p-4 md:p-6 overflow-y-auto" style="max-height: calc(100vh - 280px);">
          <!-- Description moved to header; keep space but no duplicate -->
          <div v-if="false" class="mb-6"></div>

          <!-- Outfit Items -->
          <div v-if="selectedOutfit.outfit_items && selectedOutfit.outfit_items.length > 0">
            <h3 :class="`text-sm font-semibold mb-4 text-stone-700 dark:text-zinc-300`">
              Items in this Outfit
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div
                v-for="outfitItem in selectedOutfit.outfit_items"
                :key="outfitItem.id"
                class="rounded-xl overflow-hidden bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700"
              >
                <div class="aspect-square relative">
                  <ClothingImage
                    v-if="outfitItem.clothing_item?.image_url"
                    :record="outfitItem.clothing_item" table="clothes" :src="outfitItem.clothing_item.image_url"
                    :alt="outfitItem.clothing_item.name"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-900"
                  >
                    <Shirt class="w-12 h-12 text-stone-400 dark:text-zinc-600" />
                  </div>
                </div>
                <div class="p-3">
                  <p class="text-sm font-medium truncate text-black dark:text-white">
                    {{ outfitItem.clothing_item?.name || 'Unknown Item' }}
                  </p>
                  <p class="text-xs truncate capitalize text-stone-500 dark:text-zinc-400">
                    {{ outfitItem.clothing_item?.category || 'No category' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty state for items -->
          <div v-else class="text-center py-12">
            <Shirt class="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-zinc-600" />
            <p class="text-stone-600 dark:text-zinc-400">
              No items in this outfit
            </p>
          </div>

          <!-- Metadata -->
          <div v-if="selectedOutfit.occasion || selectedOutfit.weather_condition" class="mt-6 pt-6 border-t border-stone-200 dark:border-zinc-800">
            <h3 :class="`text-sm font-semibold mb-3 text-stone-700 dark:text-zinc-300`">
              Additional Details
            </h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-if="selectedOutfit.occasion"
                class="px-3 py-1 rounded-full text-sm bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300"
              >
                {{ selectedOutfit.occasion }}
              </span>
              <span
                v-if="selectedOutfit.weather_condition"
                class="px-3 py-1 rounded-full text-sm bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300"
              >
                {{ selectedOutfit.weather_condition }}
              </span>
            </div>
          </div>
        </div>

        <!-- Modal Footer with Actions -->
        <div class="p-4 md:p-6 border-t flex items-center justify-end gap-3 border-stone-200 dark:border-zinc-800">
          <button
            @click="toggleFavorite(selectedOutfit)"
            @touchstart.prevent="toggleFavorite(selectedOutfit)"
            :class="`p-3 rounded-xl transition-all duration-200 ${
              selectedOutfit.is_favorite
                ? 'bg-red-500 text-white dark:bg-red-600'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
            title="Toggle Favourite"
            style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
          >
            <Heart :class="`w-5 h-5 ${selectedOutfit.is_favorite ? 'fill-current text-white' : ''}`" />
          </button>
          <button
            @click="deleteOutfit(selectedOutfit)"
            @touchstart.prevent="deleteOutfit(selectedOutfit)"
            class="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all duration-200"
            title="Delete Outfit"
            style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
          >
            <Trash2 class="w-5 h-5" />
          </button>
          <button
            @click="editOutfit(selectedOutfit)"
            :class="`px-6 py-3 rounded-xl font-medium transition-all bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200`"
          >
            Edit Outfit
          </button>
        </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useSanitize } from '@/composables/useSanitize'
import { usePopup } from '@/composables/usePopup'
import { useAuthStore } from '@/stores/auth-store'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { OutfitsService } from '@/services/outfitsService'
import { friendSuggestionsService } from '@/services/friendSuggestionsService'
import { Plus, Shirt, User, Users, Sparkles, ChevronDown, Pencil, Trash2, Heart, Search, X } from 'lucide-vue-next'
import OutfitCanvasMiniature from '@/components/dashboard/OutfitCanvasMiniature.vue'
import FriendSuggestionCard from '@/components/outfits/FriendSuggestionCard.vue'

const { theme } = useTheme()
const { sanitizeSearch } = useSanitize()
const { showError, showSuccess, showConfirm } = usePopup()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

// Keyboard shortcuts
const { registerSearchInput } = useKeyboardShortcuts()

// Initialize outfits service
const outfitsService = new OutfitsService()

// Use computed to get reactive user data from auth store
const currentUser = computed(() => authStore.user || authStore.profile)

const outfits = ref([])
const loading = ref(true)
const showAddMenu = ref(false)
const activeFilter = ref('all')
const showFavoritesOnly = ref(false) // Independent favorites toggle, same as Closet page
const showOutfitDetail = ref(false)
const selectedOutfit = ref(null)
const createdLocation = ref(null)
const searchTerm = ref('')
const searchInputRef = ref(null)

// Detect Mac for keyboard shortcut display
const isMac = ref(false)

// Desktop detection for keyboard hints
const isDesktop = ref(false)
const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

// Initialize activeFilter from URL parameter or route
if (route.query.filter === 'suggestions' || route.meta.subRoute === 'suggestions') {
  activeFilter.value = 'suggestions'
}

// Suggestions state
const suggestions = ref([])
const suggestionsLoading = ref(false)
const suggestionStats = ref({ pending: 0, approved: 0, rejected: 0, total: 0 })

// Category filters (All Outfits, Suggestions) - separate from favorites toggle
const categoryFilters = [
  { value: 'all', label: 'All Outfits' },
  { value: 'suggestions', label: 'Suggestions' }
]

const filteredOutfits = computed(() => {
  let filtered = outfits.value

  // Apply search filter
  if (searchTerm.value) {
    const query = searchTerm.value.toLowerCase()
    // Only process up to 50 items for instant results
    const maxFilter = 50
    filtered = filtered.slice(0, maxFilter).filter(outfit => {
      // search main fields
      const matchMain = (
        outfit.outfit_name?.toLowerCase().includes(query) ||
        outfit.name?.toLowerCase().includes(query) ||
        outfit.description?.toLowerCase().includes(query) ||
        outfit.occasion?.toLowerCase().includes(query) ||
        outfit.weather_condition?.toLowerCase().includes(query) ||
        outfit.style?.toLowerCase().includes(query) ||
        outfit.season?.toLowerCase().includes(query) ||
        outfit.color_palette?.toLowerCase().includes(query) ||
        outfit.notes?.toLowerCase().includes(query) ||
        (Array.isArray(outfit.tags) && outfit.tags.some(tag => tag?.toLowerCase().includes(query)))
      );
      // search inside items
      const matchItems = Array.isArray(outfit.outfit_items) && outfit.outfit_items.some(item =>
        item.clothing_item?.name?.toLowerCase().includes(query) ||
        item.clothing_item?.brand?.toLowerCase().includes(query) ||
        item.clothing_item?.color?.toLowerCase().includes(query) ||
        item.clothing_item?.material?.toLowerCase().includes(query) ||
        item.clothing_item?.category?.toLowerCase().includes(query) ||
        item.clothing_item?.type?.toLowerCase().includes(query) ||
        (Array.isArray(item.clothing_item?.tags) && item.clothing_item.tags.some(tag => tag?.toLowerCase().includes(query)))
      );
      return matchMain || matchItems;
    })
  }

  // Apply favorites filter (independent toggle, same as Closet page)
  if (showFavoritesOnly.value) {
    filtered = filtered.filter(outfit => outfit.is_favorite)
  }

  return filtered
})

// Filter suggestions based on search term
const filteredSuggestions = computed(() => {
  if (!searchTerm.value) {
    return suggestions.value
  }

  const query = searchTerm.value.toLowerCase()
  
  return suggestions.value.filter(suggestion => {
    // Search by outfit name (message field contains the outfit name)
    const matchOutfitName = suggestion.message?.toLowerCase().includes(query)
    
    // Search by friend name
    const matchFriendName = suggestion.suggester?.name?.toLowerCase().includes(query)
    
    // Search by username
    const matchUsername = suggestion.suggester?.username?.toLowerCase().includes(query)
    
    return matchOutfitName || matchFriendName || matchUsername
  })
})

const loadOutfits = async () => {
  try {
    console.log('Outfits: Loading outfits for user:', currentUser.value?.id)
    
    if (!currentUser.value?.id) {
      console.log('Outfits: No user ID, cannot load outfits')
      outfits.value = []
      loading.value = false // Important: Set loading to false so empty state shows
      return
    }
    
    // Load outfits from Supabase using OutfitsService
    console.log('Outfits: Fetching from Supabase...')
    const data = await outfitsService.getOutfits({
      orderBy: '-created_at', // Most recent first
      limit: 50
    })
    
    // Transform outfit data to include item_count and preview
    outfits.value = (data || []).map(outfit => ({
      ...outfit,
      item_count: outfit.outfit_items?.length || 0,
      // Use first item's image as preview if no preview_url
      preview_url: outfit.preview_url || outfit.outfit_items?.[0]?.clothing_item?.image_url
    }))
    
    console.log('Outfits: Loaded', outfits.value.length, 'outfits from Supabase')
    
  } catch (error) {
    console.error('Outfits: Error loading outfits:', error)
    outfits.value = []
    // Ensure loading is set to false on error
    loading.value = false
  } finally {
    loading.value = false
  }
}

const navigateToCreate = (type) => {
  showAddMenu.value = false
  
  if (type === 'personal') {
    router.push('/outfits/add/personal')
  } else if (type === 'friend') {
    // Navigate to friend selection page
    router.push('/outfits/add/friend')
  } else if (type === 'suggested') {
    router.push('/outfits/add/suggested')
  }
}

const viewOutfit = (outfit) => {
  // Show outfit details in modal
  selectedOutfit.value = outfit
  showOutfitDetail.value = true
}

const editOutfit = (outfit) => {
  // Navigate to outfit editor with outfit ID
  console.log('Edit outfit:', outfit)
  router.push(`/outfits/edit/${outfit.id}`)
}

const closeOutfitDetail = () => {
  showOutfitDetail.value = false
  selectedOutfit.value = null
}

const toggleFavorite = async (outfit) => {
  try {
    // Add pulse animation to heart
    const event = window.event
    if (event && event.target) {
      const heartIcon = event.target.closest('button')?.querySelector('svg')
      if (heartIcon) {
        heartIcon.classList.add('heart-pulse')
        setTimeout(() => heartIcon.classList.remove('heart-pulse'), 300)
      }
    }
    
    // Toggle the favorite status using the outfits service
    const result = await outfitsService.toggleFavorite(outfit.id)
    
    if (result.success) {
      outfit.is_favorite = result.data.is_favorite
      console.log('Outfits: Toggled favorite for outfit:', outfit.outfit_name || outfit.name, 'New status:', outfit.is_favorite)
    } else {
      console.error('Outfits: Failed to toggle favorite:', result.error)
    }
  } catch (error) {
    console.error('Outfits: Error toggling favorite:', error)
  }
}

const deleteOutfit = async (outfit) => {
  const outfitName = outfit.outfit_name || outfit.name || 'this outfit'
  showConfirm(
    `Are you sure you want to delete "${outfitName}"?`,
    'Delete Outfit',
    async () => {
      try {
        console.log('Outfits: Deleting outfit:', outfit.id)
        await outfitsService.deleteOutfit(outfit.id)
        
        // Remove from local array
        outfits.value = outfits.value.filter(o => o.id !== outfit.id)
        
        // Close detail modal if the deleted outfit was being viewed
        if (selectedOutfit.value?.id === outfit.id) {
          closeOutfitDetail()
        }
        
        console.log('Outfits: Successfully deleted outfit')
        showSuccess('Outfit deleted successfully!')
      } catch (error) {
        console.error('Outfits: Error deleting outfit:', error)
        showError('Failed to delete outfit. Please try again.')
      }
    }
  )
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// Get where the outfit was created
const getCreatedLocation = async (outfit) => {
  if (!outfit) {
    createdLocation.value = null
    return
  }
  
  // Check if this outfit was created from a friend suggestion
  if (outfit.description && outfit.description.includes('Created from friend suggestion')) {
    // Try to get the friend's username who created it
    try {
      const { supabase } = await import('@/lib/supabase')
      
      // Find the friend_outfit_suggestion that created this outfit
      const { data: suggestion, error } = await supabase
        .from('friend_outfit_suggestions')
        .select(`
          suggester_id,
          suggester:users!friend_outfit_suggestions_suggester_id_fkey (
            username,
            name
          )
        `)
        .eq('outfit_id', outfit.id)
        .single()
      
      if (!error && suggestion && suggestion.suggester) {
        const username = suggestion.suggester.username
        if (username) {
          createdLocation.value = `Created by @${username}`
          return
        }
      }
    } catch (error) {
      console.error('Outfits: Error fetching friend suggester info:', error)
    }
    
    // Fallback if we can't find the suggester - try to get username from outfit data
    // Check if outfit has friend_suggester_id or similar field
    if (outfit.friend_suggester_id) {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: friendUser, error: friendError } = await supabase
          .from('users')
          .select('username')
          .eq('id', outfit.friend_suggester_id)
          .single()
        
        if (!friendError && friendUser && friendUser.username) {
          createdLocation.value = `Created by @${friendUser.username}`
          return
        }
      } catch (error) {
        console.error('Outfits: Error fetching friend username from outfit:', error)
      }
    }
    
    // Final fallback if we still can't find the username
    createdLocation.value = 'Created by friend'
    return
  }
  
  // Check if description contains location info
  if (outfit.description && outfit.description.includes('Created in')) {
    // Extract location from description (e.g., "Created in Outfit Creator")
    const match = outfit.description.match(/Created in (.+)/i)
    if (match && match[1]) {
      createdLocation.value = `Created in ${match[1]}`
      return
    }
    createdLocation.value = outfit.description
    return
  }
  
  // Default fallback - if no description, assume it was created in Outfits page
  createdLocation.value = 'Created in Outfits'
}

// Watch for selected outfit changes and update created location
watch(selectedOutfit, (newOutfit) => {
  if (newOutfit) {
    getCreatedLocation(newOutfit)
  } else {
    createdLocation.value = null
  }
}, { immediate: true })

const handleSearch = () => {
  // Sanitize search input in real-time
  searchTerm.value = sanitizeSearch(searchTerm.value)
}

// Search focus handlers
const handleSearchFocus = (event) => {
  event.target.classList.add('search-input-focus')
}

const handleSearchBlur = (event) => {
  event.target.classList.remove('search-input-focus')
}

// Load suggestions
const loadSuggestions = async () => {
  try {
    suggestionsLoading.value = true
    console.log('Outfits: Loading suggestions...')
    
    const [suggestionsData, statsData] = await Promise.all([
      friendSuggestionsService.getReceivedSuggestions({ limit: 20 }),
      friendSuggestionsService.getSuggestionStats()
    ])
    
    suggestions.value = suggestionsData || []
    suggestionStats.value = statsData || { pending: 0, approved: 0, rejected: 0, total: 0 }
    
    console.log('Outfits: Loaded', suggestions.value.length, 'suggestions')
  } catch (error) {
    console.error('Outfits: Error loading suggestions:', error)
    suggestions.value = []
  } finally {
    suggestionsLoading.value = false
  }
}

// Handle suggestion processed (approved/rejected)
const handleSuggestionProcessed = ({ action, suggestionId }) => {
  console.log('Outfits: Suggestion processed:', action, suggestionId)
  
  // Remove the processed suggestion from the list
  suggestions.value = suggestions.value.filter(s => s.id !== suggestionId)
  
  // Update stats
  if (action === 'approved') {
    suggestionStats.value.pending = Math.max(0, suggestionStats.value.pending - 1)
    suggestionStats.value.approved += 1
  } else if (action === 'rejected') {
    suggestionStats.value.pending = Math.max(0, suggestionStats.value.pending - 1)
    suggestionStats.value.rejected += 1
  }
  
  // Reload outfits to show the new approved outfit
  if (action === 'approved') {
    loadOutfits()
  }
}

// Handle Esc key to close modal
const handleEscKey = (event) => {
  if (event.key === 'Escape' && showOutfitDetail.value) {
    closeOutfitDetail()
  }
}

onMounted(async () => {
  // Initialize desktop detection
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', handleResize)
  
  // Add event listener for Esc key
  window.addEventListener('keydown', handleEscKey)
  
  // Detect Mac OS
  isMac.value = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
  
  try {
    console.log('👕 Outfits: Component mounting...')
    console.log('👕 Outfits: Current route:', route.path)
    
    // Register search input for keyboard shortcuts
    if (searchInputRef.value) {
      registerSearchInput(searchInputRef.value)
    }
    
    // Ensure auth store is initialized
    if (!authStore.isAuthenticated) {
      console.log('🔐 Outfits: Auth not initialized, initializing...')
      await authStore.initializeAuth()
    }
    
    // If we have a user but no profile, fetch the profile
    if (authStore.user && !authStore.profile) {
      console.log('👤 Outfits: Fetching user profile...')
      await authStore.fetchUserProfile()
    }
    
    // Only load outfits if user is authenticated
    if (authStore.isAuthenticated && authStore.user?.id) {
      console.log('✅ Outfits: User is authenticated, loading outfits...')
      await Promise.all([
        loadOutfits(),
        loadSuggestions()
      ])
      console.log('✅ Outfits: Component mounted successfully')
    } else {
      console.log('⚠️ Outfits: User not authenticated, skipping outfit loading')
      console.log('⚠️ Outfits: Auth state:', {
        isAuthenticated: authStore.isAuthenticated,
        hasUser: !!authStore.user,
        userId: authStore.user?.id,
        loading: authStore.loading
      })
      loading.value = false // Ensure loading is false so empty state can show
    }
  } catch (error) {
    console.error('❌ Outfits: Error during mount:', error)
    console.error('❌ Outfits: Error stack:', error.stack)
    loading.value = false // Always set loading to false on error
    showError(`Failed to load outfits: ${error.message}`)
  }
})

// Watch for filter changes to load suggestions when needed
watch(activeFilter, (newFilter) => {
  if (newFilter === 'suggestions' && suggestions.value.length === 0 && !suggestionsLoading.value) {
    loadSuggestions()
  }
})

onUnmounted(() => {
  // Remove event listeners
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleEscKey)
})
</script>

