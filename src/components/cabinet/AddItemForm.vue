<!--
  Add Item Form - StyleSnap
  
  Simple form with exactly 4 fields: Name, Category, Brand, Image
  Matches the design from the provided image
  Integrates Hugging Face API for automatic item recognition
-->

<template>
  <div class="add-item-form">
    <!-- Header -->
    <div class="form-header relative">
      <h2 class="header-title">Add New Item</h2>
      <!-- Close Button -->
      <div class="absolute top-0 right-0 z-50 flex items-center gap-2">
        <!-- ESC Key Hint (Desktop only) -->
        <div v-if="isDesktop" class="keyboard-hint-modal">
          <span class="keyboard-hint-key">ESC</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 rounded-lg transition-all bg-white/90 shadow-lg hover:bg-stone-100 text-stone-500 hover:text-black dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="form-content">
      <!-- Item Name -->
      <div class="form-section">
        <label class="form-label">Item Name</label>
        <input
          v-model="formData.name"
          type="text"
          placeholder="Enter item name"
          class="form-input"
          required
        />
      </div>

      <!-- Category -->
      <div class="form-section">
        <label class="form-label">Category</label>
        <input
          list="category-suggestions"
          class="form-input"
          required
          placeholder="Type or select category"
          @input="(e) => formData.category = e.target.value.toLowerCase()"
          :value="capitalize(formData.category)"
        />
        <datalist id="category-suggestions">
          <option v-for="cat in uniqueCategories" :key="cat" :value="capitalize(cat)">
            {{ capitalize(cat) }}
          </option>
        </datalist>
      </div>

      <!-- Brand -->
      <div class="form-section">
        <label class="form-label">Brand</label>
        <BrandAutocomplete
          v-model="formData.brand"
          placeholder="Enter brand (optional)"
        />
      </div>

      <!-- Image -->
      <div class="form-section">
        <label class="form-label">Image</label>
        <div class="image-upload">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            @change="handleFileUpload"
            :disabled="processingImage || uploading"
            class="file-input"
          />
          <button type="button" @click="$refs.fileInput.click()" class="file-button">
            Choose file
          </button>
          <span class="file-name">{{ selectedFileName || 'No file chosen' }}</span>
        </div>
      </div>

      <!-- AI Recognition Status -->
      <div v-if="aiRecognitionStatus" class="ai-status">
        <div class="status-content" :class="aiRecognitionStatus.type">
          <div class="status-icon">
            <Brain v-if="aiRecognitionStatus.type === 'success'" class="w-4 h-4" />
            <AlertCircle v-else class="w-4 h-4" />
          </div>
          <span class="status-text">{{ aiRecognitionStatus.message }}</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="form-actions">
        <button type="button" @click="$emit('close')" class="cancel-btn">
          Cancel
        </button>
        <button 
          type="submit" 
          :disabled="!canSubmit || uploading"
          class="submit-btn"
          :class="{ 'disabled': !canSubmit || uploading }"
        >
          <span v-if="uploading" class="ellipsis-animated">Adding</span>
          <span v-else>Add Item</span>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Brain, AlertCircle, X } from 'lucide-vue-next'
import { classifyClothingItem, validateImageForClassification } from '@/services/fashion-rnn-service'
import { ClothesService } from '@/services/clothesService'
import { removeBackground } from '@/utils/background-removal'
import BrandAutocomplete from '@/components/ui/BrandAutocomplete.vue'
// Added prop for owned categories
const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  ownedCategories: {
    type: Array,
    default: () => []
  }
});

// Emits
const emit = defineEmits(['close', 'itemAdded'])

// State
const uploading = ref(false)
const processingImage = ref(false)
let imageGeneration = 0
const selectedFileName = ref('')
const aiRecognitionStatus = ref(null)
const clothesService = new ClothesService()
const isDesktop = ref(false)

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

const handleEsc = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleEsc)
})

onUnmounted(() => {
  imageGeneration++
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleEsc)
})

// Form data
const formData = ref({
  name: '',
  category: '',
  brand: '',
  original_file: null,
  image_file: null
})

// Computed
const canSubmit = computed(() => {
  return !processingImage.value && formData.value.name &&
         formData.value.category && 
         formData.value.image_file
})

// Compute the unique categories to suggest to user (suggest owned, then common)
const commonCategories = ['top', 'bottom', 'outerwear', 'shoes', 'accessory']
const uniqueCategories = computed(() => {
  const owned = (props.ownedCategories || []).map(c => c.toLowerCase())
  const all = [...new Set([...owned, ...commonCategories])]
  return all
})

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)


// Methods
const handleFileUpload = async (event) => {
  const file = event.target.files?.[0];
  if (!file || processingImage.value || uploading.value) return;
  const generation = ++imageGeneration;
  processingImage.value = true;

  aiRecognitionStatus.value = { type: 'loading', message: 'Analyzing image with AI...' };

  try {
    const validation = validateImageForClassification(file);
    if (!validation.isValid) {
      aiRecognitionStatus.value = { type: 'error', message: validation.errors.join(', ') };
      return;
    }
    // Use modern-rembg
    let fileForDetection = file;
    try {
      const blob = await removeBackground(file);
      fileForDetection = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-nobg.png', { type: 'image/png' });
    } catch (bgErr) {
      // Fallback
      console.warn('modern-rembg background removal failed, proceeding with original image:', bgErr);
      fileForDetection = file;
    }
    if (generation !== imageGeneration) return;
    selectedFileName.value = file.name;
    formData.value.original_file = file;
    formData.value.image_file = fileForDetection;
    // Try AI classification
    try {
      const classification = await classifyClothingItem(fileForDetection);
      if (generation !== imageGeneration) return;
      if (classification.success) {
        formData.value.category = classification.styleSnapCategory || formData.value.category;
        await nextTick();
        if (generation !== imageGeneration) return;
        aiRecognitionStatus.value = {
          type: 'success',
          message: `AI detected: ${classification.topPrediction} - Category set to ${classification.styleSnapCategory} (${Math.round(classification.confidence * 100)}% confidence)`
        };
      } else {
        aiRecognitionStatus.value = {
          type: 'warning',
          message: 'AI recognition unavailable, please fill manually'
        };
      }
    } catch (aiError) {
      if (generation !== imageGeneration) return;
      aiRecognitionStatus.value = {
        type: 'warning',
        message: 'AI service temporarily unavailable, please fill manually'
      };
    }
  } catch (error) {
    if (generation !== imageGeneration) return;
    console.error('Error processing image:', error);
    aiRecognitionStatus.value = { type: 'error', message: 'Failed to process image. Please try again.' };
  } finally {
    if (generation === imageGeneration) processingImage.value = false;
  }
};


const handleSubmit = async () => {
  if (!canSubmit.value || uploading.value) return

  uploading.value = true
  try {
    // Prepare data for Supabase
    const itemData = {
      name: formData.value.name,
      category: formData.value.category,
      brand: formData.value.brand || null,
      privacy: 'private',
      is_favorite: false,
      style_tags: [],
      original_file: formData.value.original_file,
      image_file: formData.value.image_file
    }

    console.log('Submitting item data:', itemData)

    // Use the existing ClothesService
    const result = await clothesService.addClothes(itemData)
    
    if (result.success) {
      console.log('Item added successfully:', result.data)
      emit('itemAdded')
      resetForm()
      emit('close')
    } else {
      console.error('Failed to add item:', result.error)
      throw new Error(result.error || 'Failed to add item')
    }
  } catch (error) {
    console.error('Error creating item:', error)
    
    // Check if it's a Cloudinary upload error
    if (error.message?.includes('Failed to upload image') || error.message?.includes('Cloudinary')) {
      aiRecognitionStatus.value = {
        type: 'error',
        message: 'Image upload failed. Please try a different image or check your connection.'
      }
    } else {
      aiRecognitionStatus.value = {
        type: 'error',
        message: 'Failed to add item. Please try again.'
      }
    }
  } finally {
    uploading.value = false
  }
}

const resetForm = () => {
  imageGeneration++
  processingImage.value = false
  formData.value = {
    name: '',
    category: '',
    brand: '',
    original_file: null,
    image_file: null
  }
  selectedFileName.value = ''
  aiRecognitionStatus.value = null
}


// Watch for dialog open/close to reset form
watch(() => props.isOpen, (isOpen) => {
  imageGeneration++
  processingImage.value = false
  if (isOpen) {
    resetForm()
  }
})
</script>

<style scoped>
.add-item-form {
  max-width: 400px;
  width: 400px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 24px;
  color: #333;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.form-header {
  margin-bottom: 24px;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: #333;
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.image-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-input {
  display: none;
}

.file-button {
  padding: 8px 16px;
  background: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.file-button:hover {
  background: #e9e9e9;
}

.file-name {
  font-size: 14px;
  color: #666;
}

.form-input,
.form-select {
  width: 100%;
  padding: 12px 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  color: #333;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #667eea;
}

.form-input::placeholder {
  color: #999;
}


.ai-status {
  margin-top: 12px;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.status-content.success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-content.warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.status-content.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.status-content.loading {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.cancel-btn,
.submit-btn {
  flex: 1;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.cancel-btn:hover {
  background: #e9e9e9;
}

.submit-btn {
  background: #667eea;
  color: white;
}

.submit-btn:hover:not(.disabled) {
  background: #5a67d8;
}

.submit-btn.disabled {
  background: #4a4a5e;
  color: #999;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .add-item-form {
    margin: 0;
    border-radius: 0;
    padding: 16px;
  }
}
</style>
