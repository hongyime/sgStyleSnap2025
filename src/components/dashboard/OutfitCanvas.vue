<!--
  StyleSnap - Outfit Canvas Component
  
  Interactive canvas component for creating and editing outfits by dragging
  and dropping clothing items. Provides visual feedback, item manipulation,
  and real-time updates.
  
  Features:
  - Drag and drop clothing items
  - Visual grid overlay
  - Item selection and manipulation
  - Z-index management (bring forward/backward)
  - Resize and rotation controls
  - Real-time position updates
  - Theme-aware styling
  
  @author StyleSnap Team
  @version 1.0.0
-->
<template>
  <!-- Main canvas container with drag-and-drop support -->
  <div class="relative w-full h-96 border-2 border-dashed rounded-xl overflow-hidden" :class="'border-stone-300 dark:border-zinc-700'">
    <!-- Canvas Background -->
    <div class="absolute inset-0 bg-gradient-to-br from-stone-50 to-stone-100 dark:from-zinc-800 dark:to-zinc-900">
      <!-- Grid Pattern -->
      <div v-if="showGrid" class="absolute inset-0 opacity-20 pointer-events-none" style="z-index: 1; background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: 20px 20px;" :class="'bg-stone-300 dark:bg-zinc-700'"></div>
    </div>

    <!-- Outfit Items -->
    <div
      v-for="item in items"
      :key="item.id"
      :class="`absolute cursor-move select-none transition-all duration-200 ${
        selectedItemId === item.id ? 'ring-2 ring-blue-500' : ''
      }`"
      :style="{
        left: `${item.x}px`,
        top: `${item.y}px`,
        zIndex: Math.max(2, item.z_index || 0),
        transform: isDragging && dragStart.itemId === item.id ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : 'none'
      }"
      @mousedown="startDrag(item.id, $event)"
      @touchstart.prevent="startDrag(item.id, $event)"
      @click="setSelectedItemId(item.id)"
    >
      <!-- Item Image -->
      <div class="w-24 h-24 rounded-lg overflow-hidden shadow-lg bg-white dark:bg-zinc-800">
        <ClothingImage
          v-if="item.image_url"
          :src="item.image_url"
          :alt="item.name"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-700"
        >
          <Shirt class="w-8 h-8 text-stone-500 dark:text-zinc-400" />
        </div>
      </div>

      <!-- Item Controls (shown when selected) -->
      <div
        v-if="selectedItemId === item.id"
        class="absolute -top-12 left-1/2 transform -translate-x-1/2 flex gap-1"
      >
        <button
          @click="bringForward(item.id)"
          :class="`p-1 rounded bg-white dark:bg-zinc-800 shadow-lg hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors`"
          title="Bring Forward"
        >
          <ArrowUp class="w-3 h-3" />
        </button>
        <button
          @click="sendBackward(item.id)"
          :class="`p-1 rounded bg-white dark:bg-zinc-800 shadow-lg hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors`"
          title="Send Backward"
        >
          <ArrowDown class="w-3 h-3" />
        </button>
        <button
          @click="removeItem(item.id)"
          :class="`p-1 rounded bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 transition-colors`"
          title="Remove Item"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>

      <!-- Item Label -->
      <div class="mt-1 text-center">
        <p class="text-xs font-medium text-stone-700 dark:text-zinc-300 truncate max-w-24">
          {{ item.name }}
        </p>
      </div>

      <div v-if="selectedItemId === item.id" class="absolute left-1/2 -translate-x-1/2 -top-16 flex flex-col items-center z-50 select-none">
        <Sparkles class="w-7 h-7 text-yellow-400 animate-bounce" />
        <div class="mt-1 px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-md bg-white/90 text-xs font-medium text-stone-700 border border-stone-200 dark:bg-zinc-800/90 dark:text-zinc-100 dark:border-zinc-700">
          Move, resize, or rotate
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="items.length === 0" class="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
      <div :class="`w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-stone-100 dark:bg-zinc-800`">
        <Layers :class="`w-8 h-8 text-stone-500 dark:text-zinc-400`" />
      </div>
      <h3 :class="`text-lg font-semibold mb-2 text-black dark:text-white`">
        Start Building Your Outfit
      </h3>
      <p class="text-sm text-stone-600 dark:text-zinc-400">
        Drag items from your wardrobe to create the perfect look
      </p>
    </div>

    <!-- Canvas Instructions -->
    <div v-if="items.length > 0" class="absolute bottom-4 left-4 text-xs text-stone-500 dark:text-zinc-500 flex items-center gap-2 select-none">
      <Sparkles class="w-5 h-5 text-yellow-400 animate-bounce" />
      <p>Click and drag to move items • Click to select • Use controls to layer items</p>
    </div>
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
/**
 * Outfit Canvas Component Script
 * 
 * Manages interactive outfit creation with drag-and-drop functionality,
 * item selection, and manipulation controls. Handles mouse events for
 * dragging, selection, and z-index management.
 */

import { ref, onMounted, onUnmounted, nextTick, defineExpose } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { Trash2, ArrowUp, ArrowDown, Shirt, Layers, Sparkles } from 'lucide-vue-next'

// Theme composable for styling
const { theme } = useTheme()

/**
 * Component Props
 * 
 * @typedef {Object} Props
 * @property {Array} items - Array of clothing items on the canvas
 * @property {string|null} selectedItemId - ID of currently selected item
 * @property {boolean} showGrid - Whether to show the grid overlay
 */
const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  selectedItemId: {
    type: String,
    default: null
  },
  showGrid: {
    type: Boolean,
    default: false
  }
})

/**
 * Component Events
 * 
 * Emits events for parent component communication:
 * - update:selectedItemId - When item selection changes
 * - updateItem - When item properties are updated
 * - removeItem - When an item should be removed
 */
const emit = defineEmits(['update:selectedItemId', 'updateItem', 'removeItem'])

// Drag and drop state management
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0, itemId: null })
const dragOffset = ref({ x: 0, y: 0 })

/**
 * Sets the selected item ID and emits update event
 * 
 * @param {string} id - ID of the item to select
 */
const setSelectedItemId = (id) => {
  emit('update:selectedItemId', id)
}

/**
 * Initiates drag operation for an item
 * 
 * Sets up drag state and event listeners for mouse movement and release.
 * Prevents default behavior to avoid text selection during drag.
 * 
 * @param {string} itemId - ID of the item being dragged
 * @param {MouseEvent} event - Mouse down event
 */
const startDrag = (itemId, event) => {
  event.preventDefault()
  
  // Handle both mouse and touch events
  const isTouch = event.touches && event.touches.length > 0
  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY
  
  const item = props.items.find(i => i.id === itemId)
  if (!item) return
  
  isDragging.value = true
  dragStart.value = {
    x: clientX,
    y: clientY,
    itemId
  }
  dragOffset.value = { x: 0, y: 0 }
  
  if (isTouch) {
    document.addEventListener('touchmove', handleDrag, { passive: false })
    document.addEventListener('touchend', stopDrag)
    document.addEventListener('touchcancel', stopDrag)
  } else {
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', stopDrag)
  }
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  
  // Handle both mouse and touch events
  const isTouch = event.touches && event.touches.length > 0
  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY
  
  const deltaX = clientX - dragStart.value.x
  const deltaY = clientY - dragStart.value.y
  
  dragOffset.value = { x: deltaX, y: deltaY }
  
  if (isTouch) {
    event.preventDefault() // Prevent scrolling while dragging
  }
}

const stopDrag = () => {
  if (!isDragging.value) return
  
  const item = props.items.find(i => i.id === dragStart.value.itemId)
  if (item) {
    const newX = Math.max(0, item.x + dragOffset.value.x)
    const newY = Math.max(0, item.y + dragOffset.value.y)
    
    emit('updateItem', dragStart.value.itemId, { x: newX, y: newY })
  }
  
  isDragging.value = false
  dragStart.value = { x: 0, y: 0, itemId: null }
  dragOffset.value = { x: 0, y: 0 }
  
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', handleDrag)
  document.removeEventListener('touchend', stopDrag)
  document.removeEventListener('touchcancel', stopDrag)
}

const removeItem = (itemId) => {
  emit('removeItem', itemId)
}

const bringForward = (itemId) => {
  const item = props.items.find(i => i.id === itemId)
  if (!item) return
  
  // Normalize all z_index values to ensure minimum of 2 (above grid)
  const normalizedItems = props.items.map(i => ({ ...i, normalizedZ: Math.max(2, i.z_index || 2) }))
  const maxZIndex = Math.max(...normalizedItems.map(i => i.normalizedZ), 2)
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  if (currentZIndex < maxZIndex) {
    // Find items above current
    const itemsAbove = normalizedItems.filter(i => i.id !== itemId && i.normalizedZ > currentZIndex)
    if (itemsAbove.length > 0) {
      // Swap with item immediately above
      const minAboveZIndex = Math.min(...itemsAbove.map(i => i.normalizedZ))
      const swapItem = props.items.find(i => i.id === itemsAbove.find(ai => ai.normalizedZ === minAboveZIndex)?.id)
      if (swapItem) {
        // Swap z-indexes
        const tempZ = Math.max(2, swapItem.z_index || 2)
        emit('updateItem', itemId, { z_index: tempZ })
        emit('updateItem', swapItem.id, { z_index: currentZIndex })
        return
      }
    }
    // No swap, move to front
    emit('updateItem', itemId, { z_index: maxZIndex + 1 })
  }
}

const sendBackward = (itemId) => {
  const item = props.items.find(i => i.id === itemId)
  if (!item) return
  
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  // Can't go below 2 (must stay above grid)
  if (currentZIndex > 2) {
    // Normalize all z_index values
    const normalizedItems = props.items.map(i => ({ ...i, normalizedZ: Math.max(2, i.z_index || 2) }))
    const newZIndex = Math.max(2, currentZIndex - 1)
    
    // Check for conflicts
    const conflictingItem = props.items.find(i => i.id !== itemId && Math.max(2, i.z_index || 2) === newZIndex)
    if (conflictingItem) {
      // Swap z-indexes
      const conflictZ = Math.max(2, conflictingItem.z_index || 2)
      emit('updateItem', itemId, { z_index: newZIndex })
      emit('updateItem', conflictingItem.id, { z_index: conflictZ })
    } else {
      // No conflict, just decrease (but ensure minimum of 2)
      emit('updateItem', itemId, { z_index: newZIndex })
    }
  }
}

// Helper: find first non-overlapping (x, y) for a new item
function findNonOverlappingPosition(existingItems, itemSize, canvasSize) {
  // Try up to 32 predefined slots in a spiral/grid around center
  const attempts = 32
  const centerX = canvasSize.width / 2 - itemSize.width / 2
  const centerY = canvasSize.height / 2 - itemSize.height / 2
  const radiusStep = Math.min(canvasSize.width, canvasSize.height) / 5
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Spiral: angle and radius
    const theta = (2 * Math.PI / 8) * (attempt % 8)
    const r = Math.floor(attempt / 8 + 1) * radiusStep
    const x = centerX + r * Math.cos(theta)
    const y = centerY + r * Math.sin(theta)
    const box = { x, y, width: itemSize.width, height: itemSize.height }
    let overlaps = false
    for (const other of existingItems) {
      const otherBox = {
        x: other.x,
        y: other.y,
        width: itemSize.width,
        height: itemSize.height
      }
      if (rectsOverlap(box, otherBox)) {
        overlaps = true
        break
      }
    }
    if (!overlaps &&
        x >= 0 && x + itemSize.width <= canvasSize.width &&
        y >= 0 && y + itemSize.height <= canvasSize.height) {
      return { x, y }
    }
  }
  // If all attempts overlap, just return center (let UI resolve)
  return { x: centerX, y: centerY }
}
// AABB overlap
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}
defineExpose({ findNonOverlappingPosition })

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', handleDrag)
  document.removeEventListener('touchend', stopDrag)
  document.removeEventListener('touchcancel', stopDrag)
})
</script>