<template>
  <!-- Modal Backdrop with Liquid Glass -->
  <Transition name="modal-backdrop">
    <div
      v-if="props.isOpen"
      class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto"
      @click.self="closeModal"
      @touchstart.self="handleBackdropTouch"
    >
      <!-- Modal Card -->
      <Transition name="modal" appear>
        <div
          v-if="props.isOpen"
          class="relative w-full max-w-2xl min-w-[320px] rounded-2xl shadow-2xl bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh] min-h-0 md:min-h-[600px]"
          @click.stop
        >
          <!-- Close Button with Liquid Press -->
          <div class="absolute top-4 right-4 z-50 flex items-center gap-2 flex-shrink-0">
            <!-- ESC Key Hint (Desktop only) -->
            <div v-if="isDesktop" class="keyboard-hint-modal">
              <span class="keyboard-hint-key">ESC</span>
            </div>
            <button
              @click="closeModal"
              @mousedown="handleClosePress"
              @mouseup="handleCloseRelease"
              @mouseleave="handleCloseRelease"
              class="liquid-close-btn p-2 rounded-lg bg-white/90 text-stone-700 hover:bg-stone-100 shadow-lg dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Content wrapper for proper flex layout -->
          <div class="flex flex-col md:flex-row flex-1 min-h-0 md:min-h-[600px] overflow-hidden">
            <!-- Image Section (Left - 1/2 width) -->
            <div class="w-full md:w-1/2 h-[200px] sm:h-[250px] md:h-[600px] relative overflow-hidden bg-stone-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center">
            <!-- Loading/Fallback State -->
            <div v-if="!item" class="flex flex-col items-center justify-center py-8">
              <Shirt class="w-16 h-16 text-stone-400 dark:text-zinc-600 mb-4" />
              <p class="text-stone-600 dark:text-zinc-400">Loading item details...</p>
            </div>
            <template v-else>
              <ClothingImage
                v-if="item?.image_url"
                :src="item.image_url"
                :alt="item.name"
                class="w-full h-full object-contain"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
              >
                <Shirt class="w-16 h-16 text-stone-400 dark:text-zinc-600" />
              </div>
            </template>
            </div>

            <!-- Details Section (Right - 1/2 width) -->
            <div class="w-full md:w-1/2 p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1 min-h-0 md:min-h-0">
            <template v-if="item">
              <!-- Item Name & Category -->
              <div>
                <h2 class="text-2xl font-bold mb-2 text-foreground">
                  {{ item.name || 'Untitled Item' }}
                </h2>
                <span v-if="item.category" class="inline-block px-3 py-1 text-base rounded-full bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {{ item.category.charAt(0).toUpperCase() + item.category.slice(1) }}
                </span>
              </div>

              <!-- Item Details -->
              <div class="space-y-3">
                <div v-if="item.brand">
                  <p class="text-base font-medium text-stone-700 dark:text-zinc-300">Brand</p>
                  <p class="text-base text-foreground">{{ item.brand }}</p>
                </div>

                <div v-if="item.primary_color || item.color">
                  <p class="text-base font-medium text-stone-700 dark:text-zinc-300">Color</p>
                  <p class="text-base text-foreground capitalize">{{ item.primary_color || item.color }}</p>
                </div>

                <div v-if="item.size">
                  <p class="text-base font-medium text-stone-700 dark:text-zinc-300">Size</p>
                  <p class="text-base text-foreground">{{ item.size }}</p>
                </div>

                <div v-if="item.season">
                  <p class="text-base font-medium text-stone-700 dark:text-zinc-300">Season</p>
                  <p class="text-base text-foreground">{{ item.season.charAt(0).toUpperCase() + item.season.slice(1) }}</p>
                </div>
              </div>

              <!-- Meta Info -->
              <div class="flex items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
                <div class="text-sm text-stone-600 dark:text-zinc-400">
                  Added {{ formatDateShort(item.created_at) }}
                </div>
                <button
                  v-if="item"
                  @click="toggleFavorite"
                  @touchstart.prevent="toggleFavorite"
                  :class="`p-2 rounded-full transition-all duration-200 ${item.is_favorite ? 'text-red-500 dark:text-red-400' : 'text-stone-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400'}`"
                  title="Favorite"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Heart :class="`w-5 h-5 ${item.is_favorite ? 'fill-current text-red-500 dark:text-red-400' : ''}`" />
                </button>
              </div>

              <!-- Privacy Setting -->
              <div class="mb-4 flex-shrink-0">
                <label class="block text-sm font-medium mb-2 text-stone-700 dark:text-zinc-300">
                  Privacy
                </label>
                <select
                  v-model="localPrivacy"
                  @change="handlePrivacyChange"
                  class="w-full px-4 py-2 text-base rounded-lg border transition-colors bg-white border-stone-300 text-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                >
                  <option value="private">Private (Only Me)</option>
                  <option value="friends">Friends</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <!-- Action Buttons -->
              <div class="space-y-2 flex-shrink-0">
                <button
                  @click="updateItem"
                  :disabled="isUpdating || !hasChanges"
                  class="hidden w-full px-4 py-3 text-base font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save class="w-5 h-5" />
                  <span v-if="isUpdating" class="ellipsis-animated">Updating</span>
                  <span v-else>Update Item</span>
                </button>
                <button
                  @click="removeItem"
                  :disabled="isRemoving"
                  class="w-full px-4 py-3 text-base font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 class="w-5 h-5" />
                  <span v-if="isRemoving" class="ellipsis-animated">Removing</span>
                  <span v-else>Remove Item</span>
                </button>
              </div>
            </template>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { usePopup } from '@/composables/usePopup'
import { useLiquidPress, useLiquidReveal } from '@/composables/useLiquidGlass'
import { ClothesService } from '@/services/clothesService'
import { X, Trash2, Shirt, Heart, Save } from 'lucide-vue-next'

const { theme } = useTheme()
const { showError, showSuccess, showConfirm } = usePopup()
const clothesService = new ClothesService()

// Liquid glass composables
const { elementRef: closeButtonRef, pressIn: closePressIn, pressOut: closePressOut } = useLiquidPress()
const { elementRef: modalContentRef, reveal: modalContentReveal } = useLiquidReveal()

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  item: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'item-removed', 'item-updated'])

// Computed property for template reactivity - ensures proper reactivity
const item = computed(() => props.item)

const localPrivacy = ref(props.item?.privacy || 'friends')
const originalPrivacy = ref(props.item?.privacy || 'friends')

// Watch for item changes to update local privacy when item changes
watch(() => props.item, (newItem) => {
  if (newItem) {
    localPrivacy.value = newItem.privacy || 'friends'
    originalPrivacy.value = newItem.privacy || 'friends'
  } else {
    localPrivacy.value = 'friends'
    originalPrivacy.value = 'friends'
  }
}, { immediate: true })
const isRemoving = ref(false)
const isUpdating = ref(false)
const isDesktop = ref(false)

// Check if desktop/laptop (not mobile)
const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

// Add ESC key listener
const handleEsc = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    closeModal()
  }
}

onMounted(() => {
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleEsc)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleEsc)
})

// Watch for isOpen changes to handle ESC when modal opens/closes
watch(() => props.isOpen, (newValue) => {
  if (newValue && modalContentRef.value) {
    setTimeout(() => {
      modalContentReveal()
    }, 100)
  }
})


// Check if there are changes to save
const hasChanges = computed(() => {
  return localPrivacy.value !== originalPrivacy.value
})

// Auto-save privacy when changed
const handlePrivacyChange = async () => {
  if (!props.item || !hasChanges.value) return
  await updateItem()
}

const closeModal = () => {
  emit('close')
}

const handleBackdropTouch = (event) => {
  // Close modal on backdrop touch (mobile)
  if (event.target === event.currentTarget) {
    closeModal()
  }
}

const updateItem = async () => {
  if (!props.item || !hasChanges.value) return

  isUpdating.value = true
  try {
    await clothesService.updateClothes(props.item.id, {
      privacy: localPrivacy.value
    })
    
    console.log('✅ Item updated, privacy set to:', localPrivacy.value)
    originalPrivacy.value = localPrivacy.value
    showSuccess('Item updated successfully!')
    emit('item-updated')
  } catch (error) {
    console.error('❌ Error updating item:', error)
    showError('Failed to update item')
    // Revert to original value
    localPrivacy.value = originalPrivacy.value
  } finally {
    isUpdating.value = false
  }
}

const removeItem = async () => {
  if (!props.item) return

  showConfirm(
    `Are you sure you want to remove "${props.item.name}" from your closet?`,
    'Remove Item',
    async () => {
      isRemoving.value = true
      try {
        const result = await clothesService.deleteClothes(props.item.id)
        
        if (result && result.success) {
          console.log('✅ Item removed successfully')
          showSuccess('Item removed successfully!')
          emit('item-removed', props.item.id)
          closeModal()
        } else {
          console.error('❌ Delete returned unsuccessful result:', result)
          showError('Failed to remove item. Please try again.')
        }
      } catch (error) {
        console.error('❌ Error removing item:', error)
        const errorMessage = error?.message || 'Failed to remove item'
        showError(errorMessage)
      } finally {
        isRemoving.value = false
      }
    }
  )
}

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now - date) / 1000)
  
  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`
  
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

const formatDateShort = (dateString) => {
  if (!dateString) return 'Unknown'
  
  const date = new Date(dateString)
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// Liquid glass event handlers
const handleClosePress = (event) => {
  closePressIn(event.target)
}

const handleCloseRelease = (event) => {
  closePressOut(event.target)
}

const toggleFavorite = async () => {
  if (!props.item) return
  try {
    // Add simple animation feedback
    const heartBtn = document.querySelector('.liquid-favorite-btn')
    if (heartBtn) {
      heartBtn.classList.add('heart-pulse')
      setTimeout(() => heartBtn.classList.remove('heart-pulse'), 300)
    }
    
    // Optimistic UI update - update immediately for instant feedback
    const previousValue = props.item.is_favorite
    props.item.is_favorite = !props.item.is_favorite
    
    // Sync with backend asynchronously
    const result = await clothesService.toggleFavorite(props.item.id)
    
    if (result.success) {
      // Ensure UI matches server response (in case of any mismatch)
      props.item.is_favorite = result.data.is_favorite
      console.log('Toggled favorite for item:', props.item.name, 'New status:', props.item.is_favorite)
      emit('item-updated')
    } else {
      // Revert optimistic update on failure
      props.item.is_favorite = previousValue
      showError('Failed to update favorite status')
    }
  } catch (error) {
    // Revert optimistic update on error
    props.item.is_favorite = previousValue
    showError('An error occurred while updating favorite status')
    console.error('Error toggling favorite:', error)
  }
}

// Color palette mapping (RGB values)
const COLOR_PALETTE = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  beige: [245, 245, 220],
  brown: [139, 69, 19],
  red: [255, 0, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  green: [0, 128, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  gold: [255, 215, 0],
  silver: [192, 192, 192],
  charcoal: [54, 69, 79],
  burgundy: [128, 0, 32],
  coral: [255, 127, 80],
  peach: [255, 218, 185],
  salmon: [250, 128, 114],
  turquoise: [64, 224, 208],
  mint: [189, 252, 201],
  lavender: [230, 230, 250],
  indigo: [75, 0, 130]
}

// Convert RGB array to hex color
const rgbToHex = (rgb) => {
  if (!rgb || !Array.isArray(rgb)) return '#808080' // Default gray
  const [r, g, b] = rgb
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

// Get hex color code from color name
const getColorHex = (colorName) => {
  if (!colorName) return '#808080' // Default gray
  const normalizedName = colorName.toLowerCase().trim()
  const rgb = COLOR_PALETTE[normalizedName]
  if (rgb) {
    return rgbToHex(rgb)
  }
  // If color name is not found, try to match partial names
  for (const [name, rgbValue] of Object.entries(COLOR_PALETTE)) {
    if (name.includes(normalizedName) || normalizedName.includes(name)) {
      return rgbToHex(rgbValue)
    }
  }
  return '#808080' // Default gray fallback
}

// Format color name to proper case
const formatColorName = (colorName) => {
  if (!colorName) return ''
  return colorName.charAt(0).toUpperCase() + colorName.slice(1).toLowerCase()
}

// Determine appropriate text color based on background color brightness
const getTextColor = (colorName) => {
  if (!colorName) return '#ffffff'
  const normalizedName = colorName.toLowerCase().trim()
  const rgb = COLOR_PALETTE[normalizedName]
  
  if (!rgb) {
    // Try to find matching color
    for (const [name, rgbValue] of Object.entries(COLOR_PALETTE)) {
      if (name.includes(normalizedName) || normalizedName.includes(name)) {
        const [r, g, b] = rgbValue
        // Calculate brightness using relative luminance formula
        const brightness = (r * 299 + g * 587 + b * 114) / 1000
        return brightness > 128 ? '#000000' : '#ffffff'
      }
    }
    return '#ffffff'
  }
  
  const [r, g, b] = rgb
  // Calculate brightness using relative luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}
</script>

