<!--
  StyleSnap - Outfit Canvas Miniature Component
  
  A non-interactive miniature version of the outfit canvas for displaying
  outfit previews in cards and thumbnails.
  
  Features:
  - Displays outfit items in their saved positions
  - Scales proportionally to fit container
  - No interaction (view-only)
  - Theme-aware styling
  
  @author StyleSnap Team
  @version 1.0.0
-->
<template>
  <div ref="containerRef" class="relative w-full h-full rounded-lg overflow-hidden bg-stone-50 dark:bg-zinc-800">
    <!-- Canvas Background with subtle grid -->
    <div class="absolute inset-0 bg-gradient-to-br from-stone-50/50 to-stone-100/50 dark:from-zinc-800/50 dark:to-zinc-900/50">
      <div 
        class="absolute inset-0 opacity-10" 
        :class="'bg-stone-300 dark:bg-zinc-700'" 
        style="background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: 15px 15px;"
      />
    </div>

    <!-- Empty State -->
    <div 
      v-if="!items || items.length === 0"
      class="absolute inset-0 flex items-center justify-center"
    >
      <Shirt class="w-8 h-8 text-stone-400 dark:text-zinc-600" />
    </div>

    <!-- Outfit Items (scaled down) -->
    <div
      v-for="item in items"
      :key="item.id"
      class="absolute pointer-events-none select-none"
      :style="{
        left: `${scalePositionX(item.x_position || item.x || 0)}px`,
        top: `${scalePositionY(item.y_position || item.y || 0)}px`,
        zIndex: item.z_index || 0,
        transform: `rotate(${item.rotation || 0}deg) scale(${(item.scale || 1) * scaleFactor})`
      }"
    >
      <!-- Item Image (miniature) -->
      <div class="w-16 h-16 rounded-md overflow-hidden shadow-md bg-white dark:bg-zinc-700">
        <ClothingImage
          v-if="item.clothing_item?.image_url || item.image_url"
          :record="item" table="clothes" :src="item.clothing_item?.image_url || item.image_url"
          :alt="item.clothing_item?.name || item.name || 'Item'"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-600"
        >
          <Shirt class="w-5 h-5 text-stone-400 dark:text-zinc-400" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { Shirt } from 'lucide-vue-next'

const { theme } = useTheme()

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  // Scale factor to make items smaller for miniature view
  scaleFactor: {
    type: Number,
    default: 0.5
  }
})

// Reference canvas dimensions (same as OutfitCreator)
const REFERENCE_CANVAS_WIDTH = 800
const REFERENCE_CANVAS_HEIGHT = 600

// Container ref to get actual dimensions
const containerRef = ref(null)
const containerWidth = ref(0)
const containerHeight = ref(0)

// Calculate scale factors based on container size
// Use the minimum scale to maintain aspect ratio and ensure everything fits
const scale = computed(() => {
  if (containerWidth.value === 0 || containerHeight.value === 0) return props.scaleFactor
  const scaleX = containerWidth.value / REFERENCE_CANVAS_WIDTH
  const scaleY = containerHeight.value / REFERENCE_CANVAS_HEIGHT
  // Use minimum scale to maintain aspect ratio
  const minScale = Math.min(scaleX, scaleY)
  return minScale * props.scaleFactor
})

const scaleX = computed(() => scale.value)
const scaleY = computed(() => scale.value)

// Update container dimensions
const updateDimensions = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerWidth.value = rect.width
    containerHeight.value = rect.height
  }
}

// Scale positions proportionally for miniature view
// Positions are already in reference canvas coordinates (0-800 for x, 0-600 for y)
const scalePositionX = (position) => {
  // Positions are already normalized to reference canvas size
  // Just scale them to fit the container
  return position * scaleX.value
}

const scalePositionY = (position) => {
  // Positions are already normalized to reference canvas size
  // Just scale them to fit the container
  return position * scaleY.value
}

let resizeObserver = null

onMounted(async () => {
  // Use nextTick to ensure the ref is available
  await nextTick()
  updateDimensions()
  // Use ResizeObserver to update dimensions when container size changes
  if (containerRef.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.value)
  }
  // Fallback: also update on window resize
  window.addEventListener('resize', updateDimensions)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('resize', updateDimensions)
})
</script>

