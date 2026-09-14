<template>
  <!-- Main container with theme-aware background -->
  <div class="min-h-screen p-4 md:p-12 bg-background max-w-full overflow-x-hidden">
    
    <!-- Page Header Section -->
    <div class="max-w-6xl mx-auto mb-8">
      <!-- Header with title, filter buttons, and add button -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <!-- Dynamic page title and navigation buttons row -->
        <div class="flex-1 min-w-0 w-full md:w-auto">
          <h1 class="text-4xl font-bold text-foreground break-words text-center md:text-left">
            {{ subRouteTitle }}
          </h1>
          
          <!-- Manual Upload and Browse Catalogue Buttons (only shown on manual/catalogue sub-routes) -->
          <div v-if="currentSubRoute === 'manual' || currentSubRoute === 'catalogue'" class="w-full md:w-auto flex items-center gap-2 flex-shrink-0 mt-4">
            <button
              @click="$router.push('/closet/add/manual')"
              :class="`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium transition-all duration-200 text-sm md:text-base flex items-center justify-center gap-2 ${
                currentSubRoute === 'manual'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`"
            >
              <Plus class="w-4 h-4" />
              Manual Upload
            </button>
            <button
              @click="$router.push('/closet/add/catalogue')"
              :class="`flex-1 md:flex-none px-3 py-2 md:px-4 md:py-2 rounded-lg font-medium transition-all duration-200 text-sm md:text-base flex items-center justify-center gap-2 ${
                currentSubRoute === 'catalogue'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`"
            >
              <Shirt class="w-4 h-4" />
              Browse Catalogue
            </button>
          </div>
        </div>
        
        
        <!-- Add Item Dropdown Button (only shown on default closet view) -->
        <div v-if="currentSubRoute === 'default'" class="relative flex-shrink-0">
          <!-- Toggle button for add item dropdown menu -->
          <button
            @click="showAddMenu = !showAddMenu"
            :class="`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200`"
          >
            <Plus class="w-5 h-5" />
            Add
            <!-- Animated chevron icon that rotates when menu is open -->
            <ChevronDown :class="`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`" />
          </button>

          <!-- Dropdown Menu with Add Item Options -->
          <div
            v-if="showAddMenu"
            :class="`absolute right-0 mt-2 w-64 rounded-xl shadow-xl dark:shadow-black/20 border overflow-hidden z-50 bg-white border-stone-200
              dark:bg-zinc-900 dark:border-zinc-800`"
          >
            <!-- Manual Upload Option -->
            <button
              @click="navigateToManual"
              :class="`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left hover:bg-stone-50 text-black
                dark:hover:bg-zinc-800 dark:text-white`"
            >
              <Plus class="w-5 h-5" />
              <div>
                <div class="font-medium">Manual Upload</div>
                <div :class="`text-xs text-stone-500 dark:text-zinc-400`">
                  Upload your own clothing items
                </div>
              </div>
            </button>

            <!-- Catalogue Browse Option -->
            <button
              @click="navigateToCatalogue"
              :class="`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left hover:bg-stone-50 text-black
                dark:hover:bg-zinc-800 dark:text-white`"
            >
              <Shirt class="w-5 h-5" />
              <div>
                <div class="font-medium">Browse Catalogue</div>
                <div :class="`text-xs text-stone-500 dark:text-zinc-400`">
                  Browse pre-populated items
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Sub-route Content -->
      <ManualUploadForm v-if="currentSubRoute === 'manual'" @item-added="handleItemAdded" />
      
      <CatalogueBrowser v-if="currentSubRoute === 'catalogue'" @item-added="handleItemAdded" />
      
      <div v-if="currentSubRoute === 'friend'" class="mb-8 p-6 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800">
        <div class="flex items-center gap-3 mb-4">
          <Heart class="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h3 class="text-xl font-semibold text-purple-900 dark:text-purple-100">@{{ route.params.username }}'s Closet</h3>
        </div>
        <p class="text-purple-700 dark:text-purple-300 mb-4">
          Browse @{{ route.params.username }}'s clothing collection. Get inspired by their style and see what they're wearing.
        </p>
        <div class="text-center py-8">
          <Heart class="w-16 h-16 text-purple-400 dark:text-purple-500 mx-auto mb-4" />
          <p class="text-purple-600 dark:text-purple-400">Loading @{{ route.params.username }}'s closet...</p>
        </div>
      </div>

      <!-- Filters Section (only show for default closet view) -->
      <div v-if="currentSubRoute === 'default'" class="mb-6">
        <div :class="`rounded-2xl border p-4 md:p-6 bg-white border-stone-200 dark:bg-zinc-900 dark:border-zinc-800`">
          <!-- Desktop: Search Bar, Favourites, and Clear Filters Row -->
          <div class="hidden md:flex items-center gap-3 mb-4">
            <!-- Search Bar -->
            <div class="flex-1 relative search-input-group">
              <Search :class="`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-zinc-400`" />
              <input
                ref="desktopSearchInputRef"
                v-model="searchTerm"
                type="text"
                placeholder="Search your closet..."
                :class="`w-full pl-10 pr-32 py-3 rounded-lg border bg-stone-100 border-stone-300 text-black placeholder-stone-500 search-input
                  dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400`"
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
            
            <!-- Favourites Button -->
            <div class="w-32 flex-shrink-0">
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
            
            <!-- Clear Filters Button -->
            <div class="w-32 flex-shrink-0">
              <button
                @click="clearFilters"
                :disabled="!hasActiveFilters"
                :class="`w-full h-12 rounded-lg font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2 border ${
                  hasActiveFilters
                    ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer border-stone-300 dark:border-zinc-700'
                    : 'bg-stone-50 text-stone-400 dark:bg-zinc-900 dark:text-zinc-600 cursor-not-allowed opacity-50 border-stone-300 dark:border-zinc-700'
                }`"
              >
                <X class="w-4 h-4" />
                <span class="hidden sm:inline">Clear Filters</span>
              </button>
            </div>
          </div>

          <!-- Mobile: Search Bar with Heart Button Inline -->
          <div class="md:hidden mb-3">
            <div class="flex items-center gap-2">
              <!-- Search Bar (full width minus heart button) -->
              <div class="flex-1 relative search-input-group">
                <Search :class="`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-zinc-400`" />
                <input
                  ref="mobileSearchInputRef"
                  v-model="searchTerm"
                  type="text"
                  placeholder="Search your closet..."
                  :class="`w-full pl-10 pr-3 py-3 rounded-lg border bg-stone-100 border-stone-300 text-black placeholder-stone-500 search-input
                    dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-zinc-400`"
                  @input="handleSearch"
                  @focus="handleSearchFocus"
                  @blur="handleSearchBlur"
                />
              </div>
              
              <!-- Heart Button (inline with search bar) -->
              <button
                @click="showFavoritesOnly = !showFavoritesOnly"
                :class="`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-all duration-200 flex items-center justify-center border ${
                  showFavoritesOnly
                    ? 'bg-red-500 text-white dark:bg-red-600 border-0'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 border-stone-300 dark:border-zinc-700'
                }`"
              >
                <Heart :class="`w-5 h-5 ${showFavoritesOnly ? 'fill-current' : ''}`" />
              </button>
            </div>
            
            <!-- Filter Toggle Button (Mobile Only - Below Search Bar) -->
            <button
              @click="filtersExpanded = !filtersExpanded"
              class="md:hidden w-full flex items-center justify-between py-3 px-4 rounded-lg bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700 transition-all duration-200 mt-3"
            >
              <span class="font-medium text-sm">Filters</span>
              <ChevronDown :class="`w-5 h-5 transition-transform duration-200 ${filtersExpanded ? 'rotate-180' : ''}`" />
            </button>
            
            <!-- Clear Filters Button (below search bar on mobile) -->
            <button
              @click="clearFilters"
              :disabled="!hasActiveFilters"
              :class="`w-full mt-3 h-12 rounded-lg font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2 border ${
                hasActiveFilters
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer border-stone-300 dark:border-zinc-700'
                  : 'bg-stone-50 text-stone-400 dark:bg-zinc-900 dark:text-zinc-600 cursor-not-allowed opacity-50 border-stone-300 dark:border-zinc-700'
              }`"
            >
              <X class="w-4 h-4" />
              <span>Clear Filters</span>
            </button>
          </div>
          
          <!-- Filter Dropdowns -->
          <div :class="`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-300 ${filtersExpanded ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0 overflow-hidden md:max-h-none md:opacity-100 md:mt-0'} md:!mt-0`">
            <!-- Category Filter -->
            <div>
              <label :class="`text-sm mb-2 block text-stone-600 dark:text-zinc-400`">
                Category
              </label>
              <select
                v-model="selectedCategory"
                :class="`w-full h-10 px-3 rounded-lg transition-colors bg-stone-50 border-stone-200 text-black border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white`"
              >
                <option :value="null">All Categories</option>
                <option v-for="category in availableCategoriesForDropdown" :key="category.value" :value="category.value">
                  {{ category.label }}
                </option>
              </select>
            </div>

            <!-- Color Filter -->
            <div>
              <label :class="`text-sm mb-2 block text-stone-600 dark:text-zinc-400`">
                Color
              </label>
              <select
                v-model="selectedColor"
                :class="`w-full h-10 px-3 rounded-lg transition-colors bg-stone-50 border-stone-200 text-black border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white`"
              >
                <option :value="null">All Colors</option>
                <option v-for="color in availableColors" :key="color" :value="color">
                  {{ color.charAt(0).toUpperCase() + color.slice(1) }}
                </option>
              </select>
            </div>

            <!-- Brand Filter -->
            <div>
              <label :class="`text-sm mb-2 block text-stone-600 dark:text-zinc-400`">
                Brand
              </label>
              <select
                v-model="selectedBrand"
                :class="`w-full h-10 px-3 rounded-lg transition-colors bg-stone-50 border-stone-200 text-black border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white`"
              >
                <option :value="null">All Brands</option>
                <option v-for="brand in availableBrands" :key="brand" :value="brand">
                  {{ toProperCase(brand) }}
                </option>
              </select>
            </div>

            <!-- Privacy Filter -->
            <div>
              <label :class="`text-sm mb-2 block text-stone-600 dark:text-zinc-400`">
                Privacy
              </label>
              <select
                v-model="selectedPrivacy"
                :class="`w-full h-10 px-3 rounded-lg transition-colors bg-stone-50 border-stone-200 text-black border dark:bg-zinc-800 dark:border-zinc-700 dark:text-white`"
              >
                <option :value="null">All Privacy</option>
                <option v-for="privacy in availablePrivacys" :key="privacy.value" :value="privacy.value">
                  {{ privacy.label }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Items Grid (only show for default closet view) -->
    <div v-if="currentSubRoute === 'default'" class="max-w-6xl mx-auto">
      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center py-16">
        <div class="spinner-modern mb-6"></div>
        <p :class="'text-stone-600 dark:text-zinc-300'">
          Loading your closet...
        </p>
      </div>

      <div v-else-if="filteredItems.length === 0" class="text-center py-12">
        <div :class="`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800`">
          <Shirt :class="`w-12 h-12 text-stone-500 dark:text-zinc-400`" />
        </div>
        <h3 class="text-xl font-semibold mb-2 text-foreground">
          {{ searchTerm ? 'No items found matching your search.' : 'No items found' }}
        </h3>
        <p :class="`text-lg mb-4 text-stone-600 dark:text-zinc-400`">
          {{ searchTerm ? 'Try adjusting your search terms.' : 'Start building your wardrobe by adding your first item!' }}
        </p>
        
        <!-- Add Item Button (only show when not searching and user is authenticated) -->
        <div v-if="!searchTerm && authStore.isAuthenticated && currentUser?.id">
          <button
            @click="$router.push('/closet/add/manual')"
            :class="`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 mx-auto bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200`"
          >
            <Plus class="w-5 h-5" />
            Add Item
          </button>
        </div>
        
        <div v-if="!authStore.isAuthenticated" :class="`mt-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700
          dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300`">
          <p class="text-sm">
            You need to be logged in to see your items. Please <router-link to="/login" class="underline hover:no-underline">sign in</router-link> to access your closet.
          </p>
        </div>
        <div v-else-if="!currentUser?.id" :class="`mt-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700
          dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300`">
          <p class="text-sm">
            User data is loading. If you have items in Supabase but they're not showing, check the browser console for debugging information.
          </p>
        </div>
      </div>

      <TransitionGroup 
        v-else 
        name="list" 
        tag="div" 
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
      >
        <div
          v-for="(item, index) in filteredItems"
          :key="item.id"
          :data-item-id="item.id"
          @click="handleCardClick(item, $event)"
          tabindex="0"
          @keydown.enter.prevent="openItemDetails(item)"
          @keydown.space.prevent="openItemDetails(item)"
          class="group cursor-pointer transition-all duration-300 hover:scale-105 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 hover:border-stone-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
          v-memo="[item.id, item.name, item.image_url, item.is_favorite, selectedCategory, selectedColor, selectedBrand, searchTerm]"
        >
          <div class="aspect-square relative overflow-hidden">
            <ClothingImage
              v-if="item.image_url"
              :src="item.image_url"
              :alt="item.name"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-500"
            >
              <Shirt class="w-12 h-12 text-stone-500 dark:text-white" />
            </div>
            
          </div>
          
          <div class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold mb-1 text-black dark:text-white truncate" :title="item.name">
                  {{ item.name }}
                </h3>
                <!-- Category and Brand on same row -->
                <p class="text-sm text-stone-600 dark:text-stone-100">
                  <span class="text-xs font-medium text-stone-700 dark:text-zinc-200">
                    {{ item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : '' }}
                  </span>
                  <span v-if="item.category && item.brand">,</span>
                  <span v-if="item.brand" class="text-xs font-medium text-stone-700 dark:text-zinc-200">
                    {{ item.brand }}
                  </span>
                </p>
              </div>
              <button
                @click.stop="toggleFavorite(item)"
                @touchstart.stop.prevent="toggleFavorite(item)"
                @mousedown="handleFavoritePress($event, item)"
                @mouseup="handleFavoriteRelease($event, item)"
                @mouseleave="handleFavoriteRelease($event, item)"
                class="liquid-favorite-btn flex-shrink-0 p-2 rounded-full transition-all duration-200"
                :class="item.is_favorite ? 'text-red-500 dark:text-red-400' : 'text-stone-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400'"
                title="Favorite"
                style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
              >
                <Heart :class="`w-5 h-5 ${item.is_favorite ? 'fill-current text-red-500 dark:text-red-400' : ''}`" />
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Upload Modal -->
    <UploadItemModal
      :is-open="showUpload"
      @close="showUpload = false"
      @item-added="handleItemAdded"
    />

    <!-- Item Details Modal -->
    <ItemDetailsModal
      :isOpen="showItemDetails"
      :item="selectedItem"
      @close="closeItemDetails"
      @item-removed="handleItemRemoved"
      @item-updated="handleItemUpdated"
    />
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
/**
 * Cabinet.vue - Closet Management Page
 * 
 * Main component for managing clothing items in the user's wardrobe.
 * Provides functionality for viewing, adding, editing, and organizing
 * clothing items with search and filtering capabilities.
 * 
 * Features:
 * - Display clothing items in responsive grid layout
 * - Search functionality across name, brand, color, and category
 * - Category and favorites filtering
 * - Add items via manual upload or catalogue browsing
 * - Item details modal with edit/delete functionality
 * - Liquid glass hover effects for enhanced UX
 * - Theme-aware styling (dark/light mode)
 * 
 * @author StyleSnap Team
 * @version 1.0.0
 */

// Vue 3 Composition API imports
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Composables and stores
import { useTheme } from '@/composables/useTheme'
import { useSanitize } from '@/composables/useSanitize'
import { useAuthStore } from '@/stores/auth-store'
import { ClothesService } from '@/services/clothesService'
import { useLiquidPress } from '@/composables/useLiquidGlass'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { toProperCase } from '@/utils/textFormatting'

// UI Components
import { Plus, Heart, Shirt, Search, ChevronDown, X } from 'lucide-vue-next'
import UploadItemModal from '@/components/cabinet/UploadItemModal.vue'
import ManualUploadForm from '@/components/cabinet/ManualUploadForm.vue'
import CatalogueBrowser from '@/components/cabinet/CatalogueBrowser.vue'
import ItemDetailsModal from '@/components/cabinet/ItemDetailsModal.vue'

// Initialize composables and services
const { theme } = useTheme()                    // Theme management
const { sanitizeSearch } = useSanitize()        // Input sanitization
const authStore = useAuthStore()                // Authentication state
const route = useRoute()                        // Current route information
const router = useRouter()                      // Router for navigation

// Liquid glass animation effects for enhanced UX
const { elementRef: favoriteButtonRefs, pressIn: favoritePressIn, pressOut: favoritePressOut } = useLiquidPress()

// Keyboard shortcuts
const { registerSearchInput, unregisterSearchInput } = useKeyboardShortcuts()

// Search input refs (separate for desktop and mobile)
const desktopSearchInputRef = ref(null)
const mobileSearchInputRef = ref(null)

// Detect Mac for keyboard shortcut display
const isMac = ref(false)

// Route-based computed properties for dynamic content
const currentSubRoute = computed(() => route.meta.subRoute || 'default')

// Helper function to register the visible search input
const registerVisibleSearchInput = () => {
  // Only register if we're on the default route where search input is visible
  if (currentSubRoute.value !== 'default') {
    return
  }
  
  // Check which input is visible (desktop or mobile)
  // Desktop is hidden on mobile (hidden md:flex), mobile is hidden on desktop (md:hidden)
  const isDesktop = window.innerWidth >= 768 // md breakpoint
  
  if (isDesktop && desktopSearchInputRef.value) {
    const actualElement = desktopSearchInputRef.value.$el || desktopSearchInputRef.value
    registerSearchInput(actualElement)
    console.log('⌨️ Cabinet: Desktop search input registered')
  } else if (!isDesktop && mobileSearchInputRef.value) {
    const actualElement = mobileSearchInputRef.value.$el || mobileSearchInputRef.value
    registerSearchInput(actualElement)
    console.log('⌨️ Cabinet: Mobile search input registered')
  } else if (desktopSearchInputRef.value) {
    // Fallback to desktop if mobile not available
    const actualElement = desktopSearchInputRef.value.$el || desktopSearchInputRef.value
    registerSearchInput(actualElement)
    console.log('⌨️ Cabinet: Desktop search input registered (fallback)')
  } else if (mobileSearchInputRef.value) {
    // Fallback to mobile if desktop not available
    const actualElement = mobileSearchInputRef.value.$el || mobileSearchInputRef.value
    registerSearchInput(actualElement)
    console.log('⌨️ Cabinet: Mobile search input registered (fallback)')
  }
}

const subRouteTitle = computed(() => {
  switch (currentSubRoute.value) {
    case 'manual': return 'Add Your Item'
    case 'catalogue': return 'Add Your Item'
    case 'friend': return `@${route.params.username}'s Closet`
    default: return 'Your Closet'
  }
})

// Initialize clothes service for API operations
const clothesService = new ClothesService()

// Reactive user data from authentication store
const currentUser = computed(() => authStore.user || authStore.profile)

// Reactive state variables
const items = ref([])                    // Array of clothing items
const loading = ref(true)                // Loading state for data fetching
const showUpload = ref(false)            // Upload modal visibility
const showAddMenu = ref(false)           // Add item dropdown menu visibility
const showItemDetails = ref(false)       // Item details modal visibility
const selectedItem = ref(null)           // Currently selected item for details
const selectedItemIndex = ref(-1)        // Index of currently selected item in filteredItems
const selectedCategory = ref(null)      // Selected category filter
const selectedColor = ref(null)           // Selected color filter
const selectedBrand = ref(null)          // Selected brand filter
const selectedPrivacy = ref(null)        // Selected privacy filter
const showFavoritesOnly = ref(false)     // Favorites-only filter toggle
const searchTerm = ref('')               // Search input value
const filtersExpanded = ref(false)       // Filters expanded state (mobile only)

// Available clothing categories for filtering (computed from user's items)
/**
 * Available categories for dropdown filter
 */
const availableCategoriesForDropdown = computed(() => {
  const raw = new Set(
    (items.value || [])
      .map(i => (i.category || '').toLowerCase())
      .filter(Boolean)
  )
  // Preserve a sensible order
  const order = ['top', 'bottom', 'outerwear', 'shoes', 'accessory']
  const ordered = order.filter(cat => raw.has(cat))
  // Include any unexpected categories at the end
  const extras = Array.from(raw).filter(cat => !order.includes(cat))
  
  const allCategories = [...ordered, ...extras]
  
  return allCategories.map(cat => {
    const labels = {
      'top': 'Tops',
      'bottom': 'Bottoms',
      'outerwear': 'Outerwear',
      'shoes': 'Shoes',
      'accessory': 'Accessories'
    }
    return {
      value: cat,
      label: labels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)
    }
  })
})

/**
 * Available colors for dropdown filter
 */
const availableColors = computed(() => {
  const colors = new Set(
    (items.value || [])
      .map(i => i.primary_color || i.color) // Support both primary_color (from DB) and color (fallback)
      .filter(Boolean)
  )
  return Array.from(colors).sort()
})

/**
 * Available brands for dropdown filter
 */
const availableBrands = computed(() => {
  const brands = new Set(
    (items.value || [])
      .map(i => i.brand)
      .filter(Boolean)
  )
  return Array.from(brands).sort()
})

/**
 * Available privacy levels for dropdown filter
 */
const availablePrivacys = computed(() => {
  const privacys = new Set(
    (items.value || [])
      .map(i => i.privacy)
      .filter(Boolean)
  )
  // Map privacy values to labels
  const privacyLabels = {
    'private': 'Private',
    'friends': 'Visible to Friends',
    'public': 'Public'
  }
  return Array.from(privacys).map(p => ({
    value: p,
    label: privacyLabels[p] || p.charAt(0).toUpperCase() + p.slice(1)
  })).sort((a, b) => {
    // Sort in a logical order: private, friends, public
    const order = { 'private': 1, 'friends': 2, 'public': 3 }
    return (order[a.value] || 99) - (order[b.value] || 99)
  })
})

/**
 * Check if any filters are active
 */
const hasActiveFilters = computed(() => {
  return selectedCategory.value !== null || 
         selectedColor.value !== null || 
         selectedBrand.value !== null || 
         selectedPrivacy.value !== null ||
         (searchTerm.value && searchTerm.value.trim().length > 0) ||
         showFavoritesOnly.value
})

/**
 * Clear all filters
 */
const clearFilters = () => {
  selectedCategory.value = null
  selectedColor.value = null
  selectedBrand.value = null
  selectedPrivacy.value = null
  searchTerm.value = ''
  showFavoritesOnly.value = false
}

// Navigation functions for add item routes
/**
 * Navigates to manual item upload page
 * Closes the add menu dropdown before navigation
 */
const navigateToManual = () => {
  showAddMenu.value = false
  router.push('/closet/add/manual')
}

/**
 * Navigates to catalogue browsing page
 * Closes the add menu dropdown before navigation
 */
const navigateToCatalogue = () => {
  showAddMenu.value = false
  router.push('/closet/add/catalogue')
}

/**
 * Computed property that filters items based on search term, category, color, brand, and favorites
 * 
 * Applies multiple filters in sequence:
 * 1. Category filter
 * 2. Color filter
 * 3. Brand filter
 * 4. Search filter across name, brand, color, and category
 * 5. Favorites filter (if enabled)
 * 
 * @returns {Array} Filtered array of clothing items
 */
const filteredItems = computed(() => {
  let filtered = items.value

  // Apply category filter
  if (selectedCategory.value !== null) {
    filtered = filtered.filter(item => item.category?.toLowerCase() === selectedCategory.value)
  }

  // Apply color filter
  if (selectedColor.value !== null) {
    filtered = filtered.filter(item => {
      const itemColor = (item.primary_color || item.color)?.toLowerCase()
      return itemColor === selectedColor.value.toLowerCase()
    })
  }

  // Apply brand filter
  if (selectedBrand.value !== null) {
    filtered = filtered.filter(item => item.brand?.toLowerCase() === selectedBrand.value.toLowerCase())
  }

  // Apply privacy filter
  if (selectedPrivacy.value !== null) {
    filtered = filtered.filter(item => item.privacy === selectedPrivacy.value)
  }

  // Apply search filter across multiple fields
  if (searchTerm.value && searchTerm.value.trim()) {
    const query = searchTerm.value.toLowerCase().trim()
    filtered = filtered.filter(item => 
        item.name?.toLowerCase().includes(query) ||
        item.brand?.toLowerCase().includes(query) ||
        item.type?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        (item.primary_color || item.color)?.toLowerCase().includes(query) ||
        item.material?.toLowerCase().includes(query) ||
        item.pattern?.toLowerCase().includes(query) ||
        item.style?.toLowerCase().includes(query) ||
        item.season?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query) ||
        (Array.isArray(item.tags) ? item.tags.some(tag => tag?.toLowerCase().includes(query)) : false)
    )
  }

  // Apply favorites filter
  if (showFavoritesOnly.value) {
    filtered = filtered.filter(item => item.is_favorite)
  }

  return filtered
})

const loadItems = async () => {
  try {
    console.log('Cabinet: Loading items for user:', currentUser.value?.id)
    console.log('Cabinet: Auth store state:', {
      isAuthenticated: authStore.isAuthenticated,
      user: authStore.user,
      profile: authStore.profile
    })
    
    if (currentUser.value?.id) {
      console.log('Cabinet: Calling clothesService.getClothes with owner_id:', currentUser.value.id)
      // Use the real Supabase service to fetch user's clothing items
      const result = await clothesService.getClothes({
        owner_id: currentUser.value.id,
        limit: 100 // Load up to 100 items
      })
      
      console.log('Cabinet: getClothes result:', result)
      
      if (result && result.success) {
        items.value = result.data || []
        console.log('Cabinet: Loaded items from Supabase:', items.value.length, 'items')
        console.log('Cabinet: Items data:', items.value)
      } else {
        console.error('Cabinet: Failed to load items:', result?.error || 'Unknown error')
        items.value = []
      }
    } else {
      console.log('Cabinet: No user ID found, cannot load items')
      console.log('Cabinet: currentUser.value:', currentUser.value)
      items.value = []
    }
  } catch (error) {
    console.error('Cabinet: Error loading items:', error)
    console.error('Cabinet: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    items.value = []
  } finally {
    loading.value = false
  }
}

const toggleFavorite = async (item) => {
  try {
    // Find the button element and ensure press state is reset
    const card = document.querySelector(`[data-item-id="${item.id}"]`)
    const favoriteBtn = card?.querySelector('.liquid-favorite-btn')
    
    if (favoriteBtn) {
      try {
        favoritePressOut(favoriteBtn)
      } catch (e) {
        // Reset transform manually if pressOut fails
        favoriteBtn.style.transform = ''
        favoriteBtn.style.filter = ''
      }
    }
    
    // Also ensure card transform is reset
    if (card) {
      card.style.transform = ''
      card.style.transition = ''
    }
    
    // Add pulse animation to heart
    const event = window.event
    if (event && event.target) {
      const heartIcon = event.target.closest('button')?.querySelector('svg')
      if (heartIcon) {
        heartIcon.classList.add('heart-pulse')
        setTimeout(() => heartIcon.classList.remove('heart-pulse'), 300)
      }
    }
    
    // Optimistic UI update - update immediately for instant feedback
    const previousValue = item.is_favorite
    item.is_favorite = !item.is_favorite
    
    // Sync with backend asynchronously
    const result = await clothesService.toggleFavorite(item.id)
    
    if (result.success) {
      // Ensure UI matches server response (in case of any mismatch)
      item.is_favorite = result.data.is_favorite
      console.log('Cabinet: Toggled favorite for item:', item.name, 'New status:', item.is_favorite)
      
      // Ensure press state is fully reset after favorite action
      setTimeout(() => {
        if (favoriteBtn) {
          try {
            favoritePressOut(favoriteBtn)
          } catch (e) {
            favoriteBtn.style.transform = ''
            favoriteBtn.style.filter = ''
          }
        }
        if (card) {
          card.style.transform = ''
        }
      }, 100)
    } else {
      // Revert optimistic update on failure
      item.is_favorite = previousValue
      console.error('Cabinet: Failed to toggle favorite:', result.error)
    }
  } catch (error) {
    // Revert optimistic update on error
    item.is_favorite = previousValue
    console.error('Cabinet: Error toggling favorite:', error)
  }
}


// Handle item added from modal
const handleItemAdded = async () => {
  console.log('Cabinet: Item added, refreshing list...')
  await loadItems()
  showUpload.value = false
}

// Item details modal functions
const openItemDetails = (item) => {
  try {
    if (!item) {
      console.warn('Cabinet: Cannot open item details - item is null/undefined')
      return
    }
    selectedItem.value = item
    // Find the index of the item in filteredItems
    const index = filteredItems.value.findIndex(i => i.id === item.id)
    selectedItemIndex.value = index >= 0 ? index : -1
    showItemDetails.value = true
  } catch (error) {
    console.error('Cabinet: Error opening item details:', error)
  }
}

const closeItemDetails = () => {
  showItemDetails.value = false
  selectedItem.value = null
  selectedItemIndex.value = -1
}

const handleNavigateToItem = (index) => {
  if (index >= 0 && index < filteredItems.value.length) {
    selectedItem.value = filteredItems.value[index]
    selectedItemIndex.value = index
  }
}

const handleItemRemoved = async (itemId) => {
  console.log('Cabinet: Item removed, refreshing list...')
  await loadItems()
}

const handleItemUpdated = async () => {
  console.log('Cabinet: Item updated, refreshing list...')
  await loadItems()
}

// Handle window resize to re-register search input when switching desktop/mobile
let resizeTimeout = null
const handleResize = () => {
  // Debounce resize events
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(() => {
    registerVisibleSearchInput()
  }, 150)
}

onMounted(async () => {
  console.log('Cabinet: Component mounted, initializing...')
  
  // Detect Mac OS
  isMac.value = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
  
  // Register search input for keyboard shortcuts after DOM is rendered
  // Simple approach like Outfits.vue and Friends.vue
  await nextTick()
  registerVisibleSearchInput()
  
  // Add resize listener to re-register when switching between desktop/mobile
  window.addEventListener('resize', handleResize)
  
  // Ensure auth store is initialized
  if (!authStore.isAuthenticated) {
    console.log('Cabinet: Auth not initialized, initializing...')
    await authStore.initializeAuth()
  }
  
  console.log('Cabinet: Current user state:', {
    isAuthenticated: authStore.isAuthenticated,
    userId: authStore.user?.id,
    userEmail: authStore.user?.email,
    profile: authStore.profile
  })
  
  // Only load items if user is authenticated
  if (authStore.isAuthenticated && authStore.user?.id) {
    console.log('Cabinet: User is authenticated, loading items...')
    await loadItems()
    
    // Fetch profile in background (non-blocking)
    if (!authStore.profile) {
      console.log('Cabinet: Fetching user profile in background...')
      // Don't await this - let it run in background
      authStore.fetchUserProfile().catch(error => {
        console.warn('Cabinet: Background profile fetch failed:', error)
      })
    }
  } else {
    console.log('Cabinet: User not authenticated, skipping item loading')
    loading.value = false
  }
})

onUnmounted(() => {
  // Clean up resize listener
  window.removeEventListener('resize', handleResize)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})


const handleFavoritePress = (event, item) => {
  try {
    const target = event.target.closest('button') || event.target
    if (target) {
      favoritePressIn(target)
    }
  } catch (error) {
    console.warn('Error in handleFavoritePress:', error)
  }
}

const handleFavoriteRelease = (event, item) => {
  try {
    const target = event.target.closest('button') || event.target
    if (target) {
      favoritePressOut(target)
      // Add heart pulse animation
      const heartIcon = target.querySelector('svg')
      if (heartIcon) {
        heartIcon.classList.add('heart-pulse')
        setTimeout(() => {
          heartIcon.classList.remove('heart-pulse')
        }, 300)
      }
    }
  } catch (error) {
    console.warn('Error in handleFavoriteRelease:', error)
  }
}

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

// Handle card clicks - prevents favorite button clicks from opening modal
const handleCardClick = (item, event) => {
  // Don't open modal if clicking on favorite button
  const favoriteButton = event.target.closest('.liquid-favorite-btn')
  if (!favoriteButton) {
    openItemDetails(item)
  }
}

  // Format item created/added date for card display
  const formatItemDate = (item) => {
    const dateString = item?.created_at || item?.inserted_at || item?.addedAt
    if (!dateString) return ''
    const date = new Date(dateString)
    const day = date.getDate()
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }
</script>
