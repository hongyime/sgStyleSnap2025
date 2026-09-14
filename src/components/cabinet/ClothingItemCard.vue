<template>
  <div class="group relative aspect-square rounded-3xl overflow-hidden transition-all duration-300 cursor-pointer hover:-translate-y-2 bg-white border border-stone-200 shadow-sm hover:shadow-md">
    <!-- Image -->
    <div class="w-full h-full p-4 flex items-center justify-center">
      <ClothingImage
        v-if="item.image_url"
        :src="item.image_url"
        :alt="item.name"
        class="max-w-full max-h-full object-contain"
      />
      <div class="w-full h-full flex items-center justify-center bg-stone-100">
        <Shirt class="w-12 h-12 text-stone-500" />
      </div>
    </div>

    <!-- Overlay -->
    <div class="absolute inset-0 transition-all duration-300 flex flex-col justify-end p-4 bg-white bg-opacity-0 group-hover:bg-opacity-90">
      <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <h3 class="font-semibold text-lg mb-1 text-black">
          {{ item.name }}
        </h3>
        <p class="text-sm mb-3 text-stone-600">
          {{ item.category }}
          {{ item.brand ? ` • ${item.brand}` : '' }}
        </p>
        
        <div class="flex gap-2">
          <button
            @click="$emit('toggleFavorite', item)"
            :class="`p-2 rounded-full transition-all duration-200 ${
              item.is_favorite
                ? 'bg-red-500 text-white'
                : 'bg-white text-stone-500 hover:bg-stone-100'
            }`"
          >
            <Heart :class="`w-4 h-4 ${item.is_favorite ? 'fill-current text-white' : ''}`" />
          </button>
          
          <button
            @click="$emit('delete', item)"
            class="p-2 rounded-full transition-all duration-200 bg-white text-stone-500 hover:bg-red-500 hover:text-white"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Always-visible Favorite Button (top-right) -->
  <button
    @click.stop="$emit('toggleFavorite', item)"
    :class="`absolute top-2 right-2 z-10 p-2 rounded-full shadow-sm transition-all duration-200 ${
      item.is_favorite
        ? 'bg-red-500 text-white hover:bg-red-600'
        : 'bg-white/90 text-stone-600 hover:bg-stone-100'
    }`"
    title="Favorite"
  >
    <Heart :class="`w-4 h-4 ${item.is_favorite ? 'fill-current text-white' : ''}`" />
  </button>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { useTheme } from '@/composables/useTheme'
import { Heart, Trash2, Shirt } from 'lucide-vue-next'

const { theme } = useTheme()

defineProps({
  item: {
    type: Object,
    required: true
  }
})

defineEmits(['toggleFavorite', 'delete'])
</script>
