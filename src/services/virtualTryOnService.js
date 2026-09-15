/**
 * Virtual Try-On Service
 * 
 * Service for generating images of people wearing specified clothing items
 * using Google Gemini Imagen 4.0 API
 * 
 * Generates realistic images of people wearing specified clothing items
 * by taking garment images as input and generating a person wearing them.
 */

import { GoogleGenAI } from "@google/genai"
import { sanitizeUrl, safeLog, safeError, safeWarn } from '@/utils/log-sanitizer'
import { privateMediaEnabled } from '@/lib/media-runtime.js'
import { supabase } from '@/lib/supabase.js'
import { readPrivateMedia } from '@/lib/private-media.js'
import { mediaReference } from '@/lib/media-loader.js'
import { fetchTryOnImage, prepareTryOnImage } from '@/utils/tryon-image.js'

export class VirtualTryOnService {
  constructor() {
    // Use backend proxy API (which uses GEMINI_API_KEY from Vercel server-side)
    // This works with GEMINI_API_KEY (no VITE_ prefix) in Vercel environment variables
    this.useProxy = true
    this.proxyUrl = '/api/proxy-gemini'
    
    // Fallback: Try direct client initialization for local development
    const viteGeminiKey = import.meta.env.VITE_GEMINI_API_KEY
    this.apiKey = viteGeminiKey || ''
    this.client = null
    
    if (this.apiKey && !privateMediaEnabled) {
      // Local development: use direct client if VITE_GEMINI_API_KEY is available
      this.client = new GoogleGenAI(this.apiKey)
      this.useProxy = false
      safeLog('✅ VirtualTryOnService: Using direct API client (local development)')
    } else {
      // Production: use backend proxy (GEMINI_API_KEY from Vercel)
      safeLog('✅ VirtualTryOnService: Using backend proxy API (GEMINI_API_KEY from Vercel)')
    }
    
    // Model configuration
    this.model = 'imagen-4.0-generate-001'
  }

  /**
   * Generate virtual try-on image using Google Gemini Imagen 4.0
   * 
   * @param {Object} options - Try-on options
   * @param {string} options.topImageUrl - URL of the top/shirt image
   * @param {string} options.bottomImageUrl - URL of the bottom/pants image
   * @returns {Promise<Object>} Result with generated image
   */
  async generateTryOn({ topImageUrl, bottomImageUrl, topItem, bottomItem, signal: callerSignal }) {
    const controller = new AbortController()
    const signal = controller.signal
    const cancel = () => controller.abort()
    callerSignal?.addEventListener('abort', cancel, { once: true })
    if (callerSignal?.aborted) cancel()
    const deadline = setTimeout(cancel, 90_000)
    let authSubscription
    try {
      signal.throwIfAborted()
      if (privateMediaEnabled) {
        authSubscription = supabase.auth.onAuthStateChange(event => {
          if (event !== 'INITIAL_SESSION') cancel()
        }).data.subscription
        for (const [record, url] of [[topItem, topImageUrl], [bottomItem, bottomImageUrl]]) {
          if (url && !mediaReference('clothes', record, url)) throw new Error('Clothing image reference is unavailable')
        }
      }
      console.log('🎨 VirtualTryOnService: Starting try-on generation with Google Gemini Imagen...')
      safeLog('🎨 Top image:', sanitizeUrl(topImageUrl))
      safeLog('🎨 Bottom image:', sanitizeUrl(bottomImageUrl))

      // Validate inputs
      if (!topImageUrl && !bottomImageUrl) {
        throw new Error('At least one clothing item (top or bottom) is required')
      }

      // Convert image URLs to base64 for analysis
      let topImageBase64 = null
      let bottomImageBase64 = null

      if (topImageUrl) {
        topImageBase64 = await this.imageToBase64(topImageUrl, topItem, signal)
      }

      if (bottomImageUrl) {
        bottomImageBase64 = await this.imageToBase64(bottomImageUrl, bottomItem, signal)
      }

      // Use Gemini vision model to analyze the clothing images and create a detailed description
      signal.throwIfAborted()
      const clothingDescription = await this.analyzeClothingImages(topImageBase64, bottomImageBase64, signal)
      signal.throwIfAborted()
      
      // Create a descriptive prompt based on the analyzed images
      const prompt = this.createTryOnPrompt(clothingDescription, topImageBase64, bottomImageBase64)
      // Negative prompt is not supported in Gemini API
      // const negativePrompt = this.getNegativePrompt()

      safeLog('📤 Generating image with Imagen 4.0...')
      safeLog('📝 Prompt:', prompt.substring(0, 200) + '...')
      // safeLog('📝 Negative Prompt:', negativePrompt.substring(0, 100) + '...')

      let imageBytes
      
      if (this.useProxy) {
        // Use backend proxy API (uses GEMINI_API_KEY from Vercel server-side)
        // Send the actual clothing images so the API can reference them
        const response = await fetch(this.proxyUrl, {
          signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'generateImages',
            model: this.model,
            prompt: prompt,
            // Negative prompt is not supported in Gemini API
            // negativePrompt: negativePrompt,
            topImageBase64: topImageBase64, // Send actual clothing images
            bottomImageBase64: bottomImageBase64, // Send actual clothing images
            config: {
              numberOfImages: 1,
              aspectRatio: "3:4",
              personGeneration: "allow_adult",
            }
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || errorData.error || `Proxy returned ${response.status}`)
        }

        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || 'Failed to generate image')
        }

        imageBytes = result.imageBytes
        safeLog('✅ Received response from Imagen API via proxy')
      } else {
        // Direct API call (local development with VITE_GEMINI_API_KEY)
        if (!this.client) {
          throw new Error('Google Gemini API key is required. Please set the API key.')
        }

        // Prepare image parts for the API call
        let imageParts = []
        
        if (topImageBase64) {
          const topData = topImageBase64.includes(',') ? topImageBase64.split(',')[1] : topImageBase64
          const topMimeType = topImageBase64.startsWith('data:') 
            ? topImageBase64.split(';')[0].split(':')[1] || 'image/jpeg'
            : 'image/jpeg'
          imageParts.push({
            inlineData: {
              mimeType: topMimeType,
              data: topData
            }
          })
        }
        
        if (bottomImageBase64) {
          const bottomData = bottomImageBase64.includes(',') ? bottomImageBase64.split(',')[1] : bottomImageBase64
          const bottomMimeType = bottomImageBase64.startsWith('data:')
            ? bottomImageBase64.split(';')[0].split(':')[1] || 'image/jpeg'
            : 'image/jpeg'
          imageParts.push({
            inlineData: {
              mimeType: bottomMimeType,
              data: bottomData
            }
          })
        }

        // Build request config with images and ensure only 1 image is generated
        const requestConfig = {
          model: this.model,
          prompt: prompt,
          // Negative prompt is not supported in Gemini API
          // negativePrompt: negativePrompt,
          config: {
            numberOfImages: 1, // Always return only one image
            aspectRatio: "3:4",
            personGeneration: "allow_adult",
          },
        }

        // Include images if available
        if (imageParts.length > 0) {
          requestConfig.images = imageParts
          safeLog('📸 Including', imageParts.length, 'image(s) in direct API request')
        }

        safeLog('🖼️ numberOfImages set to:', requestConfig.config.numberOfImages)

        // Send clothing images along with the prompt for better accuracy
        const response = await this.client.models.generateImages(requestConfig)

        safeLog('✅ Received response from Imagen API')

        if (!response.generatedImages || response.generatedImages.length === 0) {
          throw new Error('No images generated in response')
        }

        // Ensure we only use the first image (should only be one anyway since numberOfImages=1)
        safeLog('✅ Generated', response.generatedImages.length, 'image(s), using first one')
        imageBytes = response.generatedImages[0].image.imageBytes
      }
      
      // Convert base64 image to blob
      signal.throwIfAborted()
      const imageBlob = await this.base64ToBlob(imageBytes)
      signal.throwIfAborted()
      const imageUrl = URL.createObjectURL(imageBlob)

      console.log('✅ VirtualTryOnService: Try-on generated successfully')
      return {
        success: true,
        imageUrl: imageUrl,
        imageBlob: imageBlob
      }

    } catch (error) {
      safeError('❌ VirtualTryOnService: Error generating try-on:', error)
      return {
        success: false,
        error: signal.aborted ? 'Try-on cancelled or timed out. Please try again.' : error.message || 'Failed to generate virtual try-on'
      }
    } finally {
      clearTimeout(deadline)
      callerSignal?.removeEventListener('abort', cancel)
      authSubscription?.unsubscribe()
    }
  }

  /**
   * Analyze clothing images using Gemini vision model to get detailed descriptions
   * 
   * @param {string} topImageBase64 - Base64 encoded top image
   * @param {string} bottomImageBase64 - Base64 encoded bottom image
   * @returns {Promise<string>} Detailed description of the clothing items
   */
  async analyzeClothingImages(topImageBase64, bottomImageBase64, signal) {
    try {
      if (this.useProxy) {
        // Use backend proxy API (uses GEMINI_API_KEY from Vercel server-side)
        const response = await fetch(this.proxyUrl, {
          signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'analyzeClothingImages',
            topImageBase64: topImageBase64,
            bottomImageBase64: bottomImageBase64
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || errorData.error || 'Failed to analyze images')
        }

        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || 'Failed to analyze images')
        }

        const description = String(result.description || '').slice(0, 4000)
        safeLog('📝 Clothing analysis:', description.substring(0, 150) + '...')
        return description
      } else {
        // Direct API call (local development with VITE_GEMINI_API_KEY)
        if (!this.apiKey) {
          return null
        }

        // Use REST API directly to avoid SDK method issues
        const prompt = `Analyze the provided clothing images and produce a detailed description optimized for image generation.

Include:

1. Garment type (e.g., cropped denim jacket, pleated skirt)

2. Dominant colors with precise tone (approximate hex if clear)

3. Patterns or graphics (e.g., floral print, striped, solid)

4. Fit and silhouette (e.g., oversized, slim fit, A-line)

5. Material or texture (e.g., denim, satin, linen)

6. Distinct design features (e.g., front buttons, cuffs, collar, waistband)

Return a single concise paragraph written for text-to-image generation. Avoid subjective or emotional language; focus strictly on visual and structural details.`
        
        const parts = []
        
        if (topImageBase64) {
          const topData = topImageBase64.includes(',') ? topImageBase64.split(',')[1] : topImageBase64
          const topMimeType = topImageBase64.startsWith('data:') 
            ? topImageBase64.split(';')[0].split(':')[1] || 'image/jpeg'
            : 'image/jpeg'
          parts.push({
            inlineData: {
              mimeType: topMimeType,
              data: topData
            }
          })
        }
        
        if (bottomImageBase64) {
          const bottomData = bottomImageBase64.includes(',') ? bottomImageBase64.split(',')[1] : bottomImageBase64
          const bottomMimeType = bottomImageBase64.startsWith('data:')
            ? bottomImageBase64.split(';')[0].split(':')[1] || 'image/jpeg'
            : 'image/jpeg'
          parts.push({
            inlineData: {
              mimeType: bottomMimeType,
              data: bottomData
            }
          })
        }
        
        parts.push({ text: prompt })
        
        // Use REST API directly
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`
        
        const geminiResponse = await fetch(geminiApiUrl, {
          signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: parts
            }]
          })
        })

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text()
          throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`)
        }

        const geminiResult = await geminiResponse.json()
        
        if (!geminiResult.candidates || !geminiResult.candidates[0] || !geminiResult.candidates[0].content) {
          throw new Error('Invalid response from Gemini API')
        }
        
        const description = String(geminiResult.candidates[0].content.parts[0].text || '').slice(0, 4000)
        
        safeLog('📝 Clothing analysis:', description.substring(0, 150) + '...')
        return description
      }
    } catch (error) {
      signal?.throwIfAborted()
      safeWarn('⚠️ Failed to analyze clothing images with Gemini vision, using default description:', error.message)
      return null
    }
  }

  /**
   * Create a descriptive prompt for wearing the top and bottom
   * 
   * @param {string} clothingDescription - Detailed description from Gemini vision analysis
   * @param {string} topImageBase64 - Base64 encoded top image
   * @param {string} bottomImageBase64 - Base64 encoded bottom image
   * @returns {string} Descriptive prompt for Imagen
   */
  createTryOnPrompt(clothingDescription, topImageBase64, bottomImageBase64) {
    let prompt = `Full-body professional fashion photograph of a single model standing in a relaxed stance against a clean white studio background (3:4 portrait).

The model is wearing the following garments from the reference images: ${clothingDescription || 'the exact clothing items shown in the provided reference images'}.

Each garment must precisely match the reference — identical color, pattern, material texture, and fit.

Lighting style: softbox setup with even illumination and soft shadows.

Pose type: relaxed, natural stance with balanced posture.

Background: pure white, free of clutter or environmental elements.

Emphasize garment accuracy, stitching detail, and fabric realism.

Style: modern commercial lookbook, sharp focus, high resolution.

Expression: confident and neutral.

Camera: 50mm lens equivalent, straight-on framing, full outfit visible head-to-toe.

Jewelry is allowed if it complements the outfit naturally.

Do not modify or invent any clothing elements. Reproduce only what appears in the reference images.`

    return prompt
  }

  /**
   * Get the negative prompt for image generation
   * 
   * @returns {string} Negative prompt to avoid unwanted elements
   */
  getNegativePrompt() {
    return `cluttered background, furniture, props, reflections, duplicate people, outdoor scenery, distorted body parts, text overlays, watermarks, heavy shadows, random lighting changes, alternate colors or patterns, added logos, or visual artifacts.`
  }

  /**
   * Convert image URL to base64 data URL
   * 
   * @param {string} url - Image URL
   * @returns {Promise<string>} Base64 data URL
   */
  async imageToBase64(url, record, signal) {
    const blob = privateMediaEnabled
      ? (await readPrivateMedia(supabase, mediaReference('clothes', record, url), { signal })).blob
      : await fetchTryOnImage(url, { signal })
    const input = await prepareTryOnImage(blob, { signal })
    return this.blobToBase64(input, signal)
  }

  /**
   * Convert Blob to base64 data URL
   * 
   * @param {Blob} blob - Image blob
   * @returns {Promise<string>} Base64 data URL
   */
  async blobToBase64(blob, signal) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      const cancel = () => { reader.abort(); reject(new Error('Try-on cancelled')) }
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read the clothing image'))
      reader.onloadend = () => signal?.removeEventListener('abort', cancel)
      if (signal?.aborted) { cancel(); return }
      signal?.addEventListener('abort', cancel, { once: true })
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Convert base64 string to Blob
   * 
   * @param {string} base64 - Base64 encoded image string
   * @returns {Promise<Blob>} Image blob
   */
  async base64ToBlob(base64) {
    // Handle both raw base64 and data URL formats
    let base64Data = base64
    if (base64.includes(',')) {
      base64Data = base64.split(',')[1]
    }

    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'image/png' })
  }
}

export const virtualTryOnService = new VirtualTryOnService()
