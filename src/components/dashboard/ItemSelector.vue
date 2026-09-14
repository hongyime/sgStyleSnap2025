<template>
  <div :class="`rounded-3xl p-6 bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800`">
    <h3 :class="`text-xl font-bold mb-4 text-black dark:text-white`">
      Your Items
    </h3>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-2 mb-4">
      <button
        v-for="category in categories"
        :key="category"
        @click="filter = category"
        :class="`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
          filter === category
            ? 'bg-black text-white dark:bg-white dark:text-black bg-stone-100 text-stone-600 hover:text-black'
            : 'bg-stone-100 text-stone-600 hover:text-black dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white'
        }`"
      >
        {{ category }}
      </button>
    </div>

    <!-- Items List -->
    <div class="space-y-3 max-h-[600px] overflow-y-auto">
      <div v-if="filteredItems.length === 0" :class="`text-center py-8 text-stone-400 dark:text-zinc-500`">
        No items in this category
      </div>
      
      <div
        v-for="item in filteredItems"
        :key="item.id"
        @click="$emit('selectItem', item)"
        :class="`group relative p-3 rounded-xl cursor-pointer transition-all duration-300 hover:scale-105 bg-stone-100 hover:bg-stone-200
          dark:bg-zinc-800 dark:hover:bg-zinc-700`"
      >
        <div class="flex items-center gap-3">
          <div :class="`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white dark:bg-zinc-900`">
            <ClothingImage
              v-if="item.image_url"
              :record="item" table="clothes" :src="item.image_url"
              :alt="item.name"
              class="w-full h-full object-contain"
            />
            <div
              v-else
              :class="`w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800`"
            >
              <Shirt :class="`w-8 h-8 text-stone-500 dark:text-zinc-400`" />
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h4 :class="`font-medium truncate text-black dark:text-white`">
              {{ item.name }}
            </h4>
            <p :class="`text-sm truncate text-stone-600 dark:text-zinc-400`">
              {{ item.category }}
            </p>
          </div>
          <Plus :class="`w-5 h-5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-600 dark:text-zinc-400`" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { Plus, Shirt } from 'lucide-vue-next'

// Props
const props = defineProps({
  items: {
    type: Array,
    default: () => []
  }
})

// Emits
defineEmits(['selectItem'])

// Theme
const { theme } = useTheme()

// State
const filter = ref('all')
const categories = ['all', 'tops', 'bottoms', 'shoes', 'accessories', 'outerwear']

// Computed
const filteredItems = computed(() => {
  if (filter.value === 'all') {
    return props.items
  }
  return props.items.filter(item => item.category === filter.value)
})
</script>
