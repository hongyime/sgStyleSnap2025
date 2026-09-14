export const CLOTHING_PLACEHOLDER_URL = '/images/clothing-placeholder.svg'

// Keep persisted source URLs intact. Only these known missing legacy defaults
// are resolved locally before requesting an image.
const missingLegacyDefaults = new Set([
  'https://res.cloudinary.com/sgstylesnap/image/upload/f_webp,q_auto:good/v1/defaults/default-clothing-item.webp',
  'https://res.cloudinary.com/sgstylesnap/image/upload/f_webp,q_auto:good,w_400,h_400,c_fill/v1/defaults/default-clothing-item.webp',
])

export function clothingImageUrl(source) {
  return !source || missingLegacyDefaults.has(source) ? CLOTHING_PLACEHOLDER_URL : source
}
