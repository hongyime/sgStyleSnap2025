<template>
  <div class="w-full dark:bg-transparent">
    <UploadRecovery ref="recoveryPanel" :disabled="isSubmitting || uploading" @busy="recoveryBusy = $event" @recovered="handleRecovered" />
    <!-- Upload Form -->
    <div :class="`rounded-2xl border p-6 lg:p-8 bg-white border-stone-200 dark:bg-zinc-900 dark:border-zinc-800 shadow-sm dark:shadow-none`">
      <div class="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <!-- Image Upload - Left Side (smaller) -->
        <div class="w-full lg:w-2/5 flex-shrink-0">
          <div class="flex items-center justify-between mb-3">
            <label :class="`text-base text-stone-700 dark:text-zinc-300`">
              Item Image <span class="text-red-500">*</span>
            </label>
            <button
              v-if="previewUrl"
              @click="clearImage"
              :disabled="isSubmitting"
              aria-label="Remove selected image"
              :class="`p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors flex-shrink-0`"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
          <p v-if="hasError('image')" class="mb-2 text-sm text-red-500">
            {{ fieldErrors.image }}
          </p>
          
          <div v-if="previewUrl" class="relative">
            <img
              :src="previewUrl"
              alt="Preview"
              :class="`w-full h-56 lg:h-64 object-contain rounded-2xl bg-stone-100 dark:bg-zinc-800`"
            />
          </div>
          <label
            v-else
            :class="`flex flex-col items-center justify-center w-full h-56 lg:h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 
            ${
              hasError('image')
                ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-900/20'
                : 'border-stone-300 hover:border-stone-400 bg-stone-50 hover:bg-stone-100 dark:border-zinc-700 dark:hover:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-750'
            }`"
          >
            <div v-if="uploading" class="spinner-modern" />
            <template v-else>
              <Upload :class="`w-16 h-16 mb-4 text-stone-400 dark:text-zinc-500`"/>
              <p :class="`text-xl font-medium text-stone-600 dark:text-zinc-400 text-center`">
                Click to upload or drag and drop
              </p>
              <p :class="`text-sm mt-2 text-stone-500 dark:text-zinc-500 text-center`">
                PNG, JPG or JPEG (max 10MB)
              </p>
            </template>
            <input
              type="file"
              accept="image/*"
              @change="handleFileUpload"
              class="hidden"
              :disabled="uploading || isSubmitting"
            />
          </label>
        </div>

        <!-- Form Fields - Right Side (larger with padding) -->
        <div class="w-full lg:w-3/5 flex-shrink-0 space-y-6 pr-0 lg:pr-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label for="manual-upload-name" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Item Name <span class="text-red-500">*</span>
            </label>
            <input
              id="manual-upload-name"
              v-model="formData.name"
              placeholder="e.g., Black T-Shirt"
              maxlength="50"
              :class="`w-full h-12 px-4 rounded-xl transition-colors bg-stone-50 border text-black
                dark:bg-zinc-800 dark:text-white 
                focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  hasError('name')
                    ? 'border-red-500 focus:ring-red-500 dark:border-red-500 dark:focus:ring-red-500'
                    : 'border-stone-200 focus:ring-black dark:border-zinc-700 dark:focus:ring-white'
                }`"
              @blur="formData.name = sanitizeText(formData.name)"
            />
            <p v-if="hasError('name')" class="mt-1 text-sm text-red-500">
              {{ fieldErrors.name }}
            </p>
          </div>

          <div>
            <label for="manual-upload-category" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Category <span class="text-red-500">*</span>
            </label>
            <select
              id="manual-upload-category"
              v-model="formData.category"
              @change="onCategoryChange"
              :class="`w-full h-12 px-4 rounded-xl transition-colors bg-stone-50 border text-black
                dark:bg-zinc-800 dark:text-white 
                focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  hasError('category')
                    ? 'border-red-500 focus:ring-red-500 dark:border-red-500 dark:focus:ring-red-500'
                    : 'border-stone-200 focus:ring-black dark:border-zinc-700 dark:focus:ring-white'
                }`"
            >
              <option value="">Select category</option>
              <option value="top">Tops</option>
              <option value="bottom">Bottoms</option>
              <option value="shoes">Shoes</option>
              <option value="outerwear">Outerwear</option>
              <option value="accessory">Accessories</option>
            </select>
            <p v-if="hasError('category')" class="mt-1 text-sm text-red-500">
              {{ fieldErrors.category }}
            </p>
          </div>

          <div>
            <label for="manual-upload-color" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Color <span class="text-red-500">*</span>
            </label>
            <select
              id="manual-upload-color"
              v-model="formData.color"
              :class="`w-full h-12 px-4 rounded-xl transition-colors bg-stone-50 border text-black
              dark:bg-zinc-800 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                hasError('color')
                  ? 'border-red-500 focus:ring-red-500 dark:border-red-500 dark:focus:ring-red-500'
                  : 'border-stone-200 focus:ring-black dark:border-zinc-700 dark:focus:ring-white'
              }`"
            >
              <option value="">Select color</option>
              <option 
                v-for="color in availableColors" 
                :key="color.value" 
                :value="color.value"
              >
                {{ color.label }}
              </option>
            </select>
            <p v-if="hasError('color')" class="mt-1 text-sm text-red-500">
              {{ fieldErrors.color }}
            </p>
          </div>

          <div>
            <label for="manual-upload-brand" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Brand
            </label>
            <BrandAutocomplete
              id="manual-upload-brand"
              v-model="formData.brand"
              placeholder="e.g., Nike"
              maxlength="50"
            />
          </div>

          <div>
            <label for="manual-upload-type" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Type <span class="text-red-500">*</span>
            </label>
            <select
              id="manual-upload-type"
              v-model="formData.type"
              :disabled="!formData.category"
              :class="[
                'w-full h-12 px-4 rounded-xl transition-colors bg-stone-50 border text-black focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-zinc-800 dark:text-white',
                !formData.category ? 'opacity-50 cursor-not-allowed' : '',
                hasError('type')
                  ? 'border-red-500 focus:ring-red-500 dark:border-red-500 dark:focus:ring-red-500'
                  : 'border-stone-200 focus:ring-black dark:border-zinc-700 dark:focus:ring-white'
              ]"
            >
              <option value="">Select type</option>
              <option 
                v-for="type in availableTypes" 
                :key="type" 
                :value="type"
              >
                {{ type }}
              </option>
            </select>
            <p v-if="hasError('type')" class="mt-1 text-sm text-red-500">
              {{ fieldErrors.type }}
            </p>
          </div>

          <div>
            <label for="manual-upload-privacy" :class="`text-base mb-2 block text-stone-700 dark:text-zinc-300`">
              Privacy <span class="text-red-500">*</span>
            </label>
            <select
              id="manual-upload-privacy"
              v-model="formData.privacy"
              :class="`w-full h-12 px-4 rounded-xl transition-colors bg-stone-50 border text-black
              dark:bg-zinc-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                hasError('privacy')
                  ? 'border-red-500 focus:ring-red-500 dark:border-red-500 dark:focus:ring-red-500'
                  : 'border-stone-200 focus:ring-black dark:border-zinc-700 dark:focus:ring-white'
              }`"
            >
              <option value="private">Private (Only Me)</option>
              <option value="friends">Friends</option>
            </select>
            <p v-if="hasError('privacy')" class="mt-1 text-sm text-red-500">
              {{ fieldErrors.privacy }}
            </p>
          </div>
          </div>

          <CatalogContribution v-model="formData.catalog_consent" :disabled="isSubmitting || recoveryBusy" />
          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
          <button
            @click="$router.push('/closet')"
            :class="`flex-1 h-12 rounded-xl font-medium transition-colors bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200
              dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700`"
          >
            Cancel
          </button>
          <button
            @click="handleSubmit"
            :disabled="!canSubmit || isSubmitting"
            :class="`flex-1 h-12 rounded-xl font-medium transition-all ${
              canSubmit && !isSubmitting
                ? 'bg-black text-white hover:bg-stone-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100'
                : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`"
          >
            {{ isSubmitting ? 'Adding Item...' : 'Add to Closet' }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import CatalogContribution from './CatalogContribution.vue'
import UploadRecovery from './UploadRecovery.vue'
import { getPrivateUploader, privateUploadsEnabled } from '@/lib/private-upload-runtime.js'
import { useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useSanitize } from '@/composables/useSanitize'
import { usePopup } from '@/composables/usePopup'
import { ClothesService } from '@/services/clothesService'
import { cloudinary } from '@/lib/cloudinary'
import { Upload, X } from 'lucide-vue-next'
import BrandAutocomplete from '@/components/ui/BrandAutocomplete.vue'

const { theme } = useTheme()
const { sanitizeText } = useSanitize()
const router = useRouter()
const { showError, showSuccess } = usePopup()
const clothesService = new ClothesService()

const emit = defineEmits(['item-added'])

// Category to clothing type mapping
const categoryTypeMapping = {
  top: ['Blouse', 'Body', 'Dress', 'Hoodie', 'Longsleeve', 'Polo', 'Shirt', 'T-Shirt', 'Top', 'Undershirt'],
  bottom: ['Pants'],
  outerwear: ['Blazer', 'Outwear'],
  shoes: ['Shoes'],
  accessory: ['Hat']
}

const uploading = ref(false)
const isSubmitting = ref(false)
const recoveryPanel = ref(null), recoveryBusy = ref(false)
async function handleRecovered() {
  showSuccess('Item added successfully!')
  emit('item-added')
  await router.push('/closet')
}
const hasAttemptedSubmit = ref(false)
const previewUrl = ref('')
let imageGeneration = 0
let failurePreviewUrl = ''

const createFailurePreview = (file) => {
  if (failurePreviewUrl) URL.revokeObjectURL(failurePreviewUrl)
  failurePreviewUrl = URL.createObjectURL(file)
  return failurePreviewUrl
}
const formData = ref({
  name: '',
  category: '',
  type: '',
  color: '',
  brand: '',
  privacy: 'friends', // Default to friends
  image_url: '',
  original_file: null,
  catalog_consent: false,
  image_file: null, // Store the actual file for upload
})

// Colors from color-detector.js COLOR_PALETTE
const colorDetectorColors = [
  'black', 'white', 'gray', 'grey', 'beige', 'brown',
  'red', 'blue', 'yellow',
  'green', 'orange', 'purple', 'pink',
  'navy', 'teal', 'maroon', 'olive', 'gold', 'silver',
  'charcoal', 'burgundy', 'coral', 'peach', 'salmon', 'turquoise', 'mint', 'lavender', 'indigo'
]

// Colors valid in database constraint
const databaseValidColors = [
  'black', 'white', 'gray', 'beige', 'brown',
  'red', 'blue', 'yellow',
  'green', 'orange', 'purple', 'pink',
  'navy', 'teal', 'maroon', 'olive', 'gold', 'silver'
]

// Combine both lists and remove duplicates
// Only include colors that are in database or in color-detector
const allValidColors = [...new Set([...databaseValidColors, ...colorDetectorColors])]

// Normalize color: convert grey to gray, handle case
const normalizeColorValue = (color) => {
  if (!color) return null
  const colorLower = color.toLowerCase().trim()
  // Normalize grey to gray
  if (colorLower === 'grey') return 'gray'
  return colorLower
}

// Check if color is valid (in combined list or can be normalized)
const isValidColor = (color) => {
  if (!color) return false
  const normalized = normalizeColorValue(color)
  return allValidColors.includes(normalized)
}

// Available colors for dropdown (sorted, with grey normalized to gray)
const availableColors = computed(() => {
  const colors = allValidColors
    .map(color => {
      // Normalize grey to gray for display
      const normalized = normalizeColorValue(color)
      return {
        value: normalized,
        label: normalized.charAt(0).toUpperCase() + normalized.slice(1)
      }
    })
    .filter((color, index, self) => 
      // Remove duplicates (grey will be normalized to gray)
      index === self.findIndex(c => c.value === color.value)
    )
    .sort((a, b) => a.label.localeCompare(b.label))
  
  return colors
})

// Computed property for available types based on selected category
const availableTypes = computed(() => {
  if (!formData.value.category) return []
  return categoryTypeMapping[formData.value.category] || []
})

const canSubmit = computed(() => {
  if (recoveryBusy.value) return false
  return !uploading.value && formData.value.name &&
         formData.value.category && 
         formData.value.type && 
         formData.value.color && 
         formData.value.privacy && 
         formData.value.image_file
})

// Validation states for each field
const fieldErrors = computed(() => {
  return {
    name: !formData.value.name ? 'Please enter an item name' : null,
    category: !formData.value.category ? 'Please select a category' : null,
    type: !formData.value.type ? 'Please select a type' : null,
    color: !formData.value.color ? 'Please select a color' : null,
    privacy: !formData.value.privacy ? 'Please select privacy setting' : null,
    image: !formData.value.image_file ? 'Please upload an image' : null
  }
})

// Check if field has error (only show errors after user attempts to submit)
const hasError = (field) => {
  return hasAttemptedSubmit.value && !!fieldErrors.value[field]
}

// Handle category change - reset type when category changes
const onCategoryChange = () => {
  formData.value.type = '' // Reset type when category changes
}

const handleFileUpload = async (e) => {
  const file = e.target.files?.[0]
  if (!file || uploading.value || isSubmitting.value) return
  const generation = ++imageGeneration

  uploading.value = true
  try {
    console.log('📸 ManualUploadForm: Starting file upload...', {
      fileName: file.name,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
      fileType: file.type
    })

    // 1) Basic validation (type/size)
    const { validateImageForClassification, classifyClothingItem } = await import('@/services/fashion-rnn-service')
    if (generation !== imageGeneration) return
    const validation = validateImageForClassification(file)
    if (!validation.isValid) {
      showError(validation.errors.join(', '))
      return
    }

    // 2) Background removal (best-effort)
    let processedFile = file
    try {
      const { removeBackground } = await import('@/utils/background-removal')
      const blob = await removeBackground(file)
      processedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-nobg.png', { type: 'image/png' })
    } catch (bgErr) {
      console.warn('modern-rembg background removal failed, proceeding with original image:', bgErr)
      processedFile = file
    }
    if (generation !== imageGeneration) return

    // 3) AI classification (must pass to continue)
    try {
      const classification = await classifyClothingItem(processedFile)
      if (generation !== imageGeneration) return
      if (!classification || !classification.success) {
        // Show the processed image (background removed) in error popup
        const processedImageUrl = createFailurePreview(processedFile)
        showError(
          classification?.error || 'AI recognition failed. Please try another image.',
          'AI Recognition Failed',
          processedImageUrl
        )
        return
      }
      // Enforce minimum confidence threshold (70%)
      const confidence = typeof classification.confidence === 'number' ? classification.confidence : 0
      if (confidence < 0.7) {
        const pct = Math.round(confidence * 100)
        // Create blob URL for the processed image (background removed) to show in error popup
        const processedImageUrl = createFailurePreview(processedFile)
        showError(
          `AI confidence is ${pct}%. Minimum required is 70%. Please upload a clearer, single-item image on a plain background.`,
          'Low Confidence',
          processedImageUrl
        )
        // The popup releases it on close; replacement/unmount also release it.
        return
      }
      // Auto-fill category if available
      if (classification.styleSnapCategory) {
        formData.value.category = classification.styleSnapCategory
      }
      
      // 4) Color detection
      try {
        const { detectColors } = await import('@/utils/color-detector')
        const colors = await detectColors(processedFile)
        if (generation !== imageGeneration) return
        if (colors && colors.primary) {
          // Normalize detected color (grey -> gray)
          const normalizedColor = normalizeColorValue(colors.primary)
          if (isValidColor(normalizedColor)) {
            formData.value.color = normalizedColor
            console.log('🎨 ManualUploadForm: Detected color:', colors.primary, '-> normalized to:', normalizedColor, 'Secondary:', colors.secondary)
          } else {
            console.warn('⚠️ ManualUploadForm: Detected color', colors.primary, 'is not in valid colors list')
          }
        }
      } catch (colorErr) {
        console.warn('⚠️ ManualUploadForm: Color detection failed:', colorErr)
        // Don't block upload if color detection fails, just log warning
      }
      
      if (generation !== imageGeneration) return
      // Retain the selected original alongside the processed presentation file.
      formData.value.original_file = file
      formData.value.catalog_consent = false
      formData.value.image_file = processedFile
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
      const previewBlob = URL.createObjectURL(processedFile)
      formData.value.image_url = previewBlob
      previewUrl.value = previewBlob
      console.log('📸 ManualUploadForm: File stored after AI checks, preview created')
    } catch (aiErr) {
      if (generation !== imageGeneration) return
      console.error('❌ ManualUploadForm: AI classification error:', aiErr)
      showError('AI service unavailable. Please try again later or use a different image.')
      return
    }
  } catch (error) {
    if (generation !== imageGeneration) return
    console.error('❌ ManualUploadForm: Error processing file:', error)
    showError('Failed to process image file. Please try again.')
  } finally {
    if (generation === imageGeneration) uploading.value = false
  }
}

const clearImage = () => {
  if (isSubmitting.value) return
  imageGeneration++
  uploading.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  formData.value.image_url = ''
  formData.value.image_file = null
  formData.value.original_file = null
  formData.value.color = ''
}

onBeforeUnmount(() => {
  imageGeneration++
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (failurePreviewUrl) URL.revokeObjectURL(failurePreviewUrl)
  failurePreviewUrl = ''
})

const handleSubmit = async () => {
  // Mark that user has attempted to submit - this will show validation errors
  hasAttemptedSubmit.value = true
  
  console.log('📝 ManualUploadForm: ========== Form Submission Started ==========')
  console.log('📝 ManualUploadForm: Form validation:', {
    canSubmit: canSubmit.value,
    isSubmitting: isSubmitting.value,
    formData: {
      name: formData.value.name,
      category: formData.value.category,
      type: formData.value.type,
      color: formData.value.color,
      brand: formData.value.brand,
      privacy: formData.value.privacy,
      hasImage: !!formData.value.image_file,
      imageFile: formData.value.image_file?.name || 'No file'
    }
  })

  if (!canSubmit.value || isSubmitting.value) {
    console.log('📝 ManualUploadForm: Form submission blocked:', {
      canSubmit: canSubmit.value,
      isSubmitting: isSubmitting.value
    })
    return
  }

  isSubmitting.value = true
  console.log('📝 ManualUploadForm: Form submission in progress...')
  
  try {
    // Map clothing type to database format (capitalized, matching database constraint)
    const clothingTypeMap = {
      'blouse': 'Blouse',
      'body': 'Body',
      'hoodie': 'Hoodie',
      'longsleeve': 'Longsleeve',
      'polo': 'Polo',
      'shirt': 'Shirt',
      't-shirt': 'T-Shirt',
      'top': 'Top',
      'undershirt': 'Undershirt',
      'pants': 'Pants',
      'dress': 'Dress',
      'blazer': 'Blazer',
      'outwear': 'Outwear',
      'shoes': 'Shoes',
      'hat': 'Hat',
      'other': 'Other'
    }
    
    const clothingType = formData.value.type 
      ? (clothingTypeMap[formData.value.type.toLowerCase()] || formData.value.type)
      : null
    
    // Validate and normalize color value
    // Use combined list from color-detector and database valid colors
    // Normalize grey to gray, and map color-detector colors to closest database color
    let normalizedColor = null
    if (formData.value.color) {
      const normalized = normalizeColorValue(formData.value.color)
      
      // Check if color is valid (in database constraint)
      if (databaseValidColors.includes(normalized)) {
        normalizedColor = normalized
      } else if (isValidColor(normalized)) {
        // Color is from color-detector but not in database - map to closest database color
        const colorMapping = {
          'grey': 'gray', // Already normalized, but just in case
          'charcoal': 'black',
          'burgundy': 'maroon',
          'coral': 'orange',
          'peach': 'orange',
          'salmon': 'pink',
          'turquoise': 'teal',
          'mint': 'green',
          'lavender': 'purple',
          'indigo': 'navy'
        }
        
        // Try to find a mapping
        if (colorMapping[normalized]) {
          normalizedColor = colorMapping[normalized]
          console.log('🎨 ManualUploadForm: Mapped color-detector color', normalized, 'to database color', normalizedColor)
        } else {
          // If no mapping found, set to null (database constraint)
          console.warn('⚠️ ManualUploadForm: Color', normalized, 'is from color-detector but cannot be mapped to database color - will be set to null')
          normalizedColor = null
        }
      } else {
        console.warn('⚠️ ManualUploadForm: Invalid color value detected:', formData.value.color, '- will be set to null')
        normalizedColor = null
      }
    }
    
    const serviceData = {
      name: formData.value.name,
      category: formData.value.category,
      clothing_type: clothingType,
      color: normalizedColor,
      brand: formData.value.brand || null,
      privacy: formData.value.privacy,
      original_file: formData.value.original_file,
      catalog_consent: formData.value.catalog_consent,
      image_file: formData.value.image_file,
    }

    console.log('📝 ManualUploadForm: Calling clothesService.addClothes with data:', serviceData)

    const result = await clothesService.addClothes(serviceData)

    console.log('📝 ManualUploadForm: Service call result:', {
      success: result.success,
      hasData: !!result.data,
      hasError: !!result.error
    })

    if (result.success) {
      console.log('✅ ManualUploadForm: Item created successfully!', {
        itemId: result.data?.id,
        itemName: result.data?.name,
        category: result.data?.category
      })
      showSuccess('Item added successfully!')
      emit('item-added')
      console.log('📝 ManualUploadForm: Navigating to /closet')
      await router.push('/closet')
      if (result.upload_receipt) await getPrivateUploader().acknowledge(result.upload_receipt).catch(() => {})
    } else {
      console.error('❌ ManualUploadForm: Failed to create item:', result.error)
      showError('Failed to add item. Please try again.')
    }
  } catch (error) {
    console.error('❌ ManualUploadForm: Error creating item:', error)
    console.error('❌ ManualUploadForm: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    showError(privateUploadsEnabled ? error.message : 'An error occurred. Please try again.')
    await recoveryPanel.value?.refresh()
  } finally {
    isSubmitting.value = false
    console.log('📝 ManualUploadForm: Form submission completed')
  }
}
</script>
