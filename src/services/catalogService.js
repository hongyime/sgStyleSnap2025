import { supabase } from '@/lib/supabase'
import { privateMediaEnabled } from '@/lib/media-runtime.js'
import { getPrivateCatalogClient } from '@/lib/private-catalog-runtime.js'

/**
 * Catalog Service
 * 
 * Handles catalog browsing and adding catalog items to user closet.
 * Uses the catalog_items table and associated Postgres functions.
 */
export class CatalogService {
  /**
   * Get public catalog items (no authentication required)
   * Directly queries catalog_items table - perfect for landing page
   * 
   * @param {Object} options - Filter options
   * @param {string} options.category - Filter by category (e.g., 'top', 'bottom', etc.)
   * @param {string} options.color - Filter by color
   * @param {string} options.brand - Filter by brand
   * @param {string} options.season - Filter by season
   * @param {number} options.limit - Number of items per page (default: 20)
   * @param {number} options.offset - Pagination offset (default: 0)
   * @returns {Promise<Array>} Array of catalog items
   */
  async getPublicCatalogItems(options = {}) {
    try {
      const {
        category = null,
        color = null,
        brand = null,
        season = null,
        limit = 20,
        offset = 0
      } = options

      console.log('CatalogService: Fetching public catalog items (no auth required)')

      // Build query directly on catalog_items table (RLS allows public read)
      let query = supabase
        .from('catalog_items')
        .select('*')
        .eq('is_active', true)
        .eq('privacy', 'public')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Apply filters
      if (category) {
        query = query.eq('category', category)
      }
      if (color) {
        query = query.eq('primary_color', color)
      }
      if (brand) {
        query = query.eq('brand', brand)
      }
      if (season) {
        query = query.eq('season', season)
      }

      const { data, error } = await query

      if (error) {
        console.error('CatalogService: Error fetching public catalog items:', error)
        throw error
      }

      console.log('CatalogService: Fetched', data?.length || 0, 'public catalog items')
      return data || []

    } catch (error) {
      console.error('CatalogService: Error in getPublicCatalogItems:', error)
      throw error
    }
  }

  /**
   * Get catalog items excluding items the user already owns
   * Uses the get_catalog_excluding_owned Postgres function
   * 
   * @param {Object} options - Filter options
   * @param {string} options.category - Filter by category (e.g., 'top', 'bottom', etc.)
   * @param {string} options.color - Filter by color
   * @param {string} options.brand - Filter by brand
   * @param {string} options.season - Filter by season
   * @param {number} options.limit - Number of items per page (default: 20)
   * @param {number} options.offset - Pagination offset (default: 0)
   * @returns {Promise<Array>} Array of catalog items
   */
  async getCatalogItems(options = {}) {
    try {
      const {
        category = null,
        color = null,
        brand = null,
        season = null,
        limit = 20,
        offset = 0
      } = options

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      console.log('CatalogService: Fetching catalog items for user:', user.id)

      // Call the Postgres function to get catalog items excluding owned
      const { data, error } = await supabase
        .rpc('get_catalog_excluding_owned', {
          user_id_param: user.id,
          category_filter: category,
          color_filter: color,
          brand_filter: brand,
          season_filter: season,
          page_limit: limit,
          page_offset: offset
        })

      if (error) {
        console.error('CatalogService: Error fetching catalog items:', error)
        throw error
      }

      console.log('CatalogService: Fetched', data?.length || 0, 'catalog items')
      return data || []

    } catch (error) {
      console.error('CatalogService: Error in getCatalogItems:', error)
      throw error
    }
  }

  /**
   * Search catalog items using full-text search
   * Uses the search_catalog Postgres function
   * 
   * @param {string} query - Search query text
   * @param {Object} filters - Optional filter options
   * @param {string} filters.category - Filter by category
   * @param {string} filters.color - Filter by color
   * @param {string} filters.brand - Filter by brand
   * @param {string} filters.season - Filter by season
   * @param {number} filters.limit - Number of items per page (default: 20)
   * @param {number} filters.offset - Pagination offset (default: 0)
   * @returns {Promise<Array>} Array of catalog items with search rank
   */
  async searchCatalog(query, filters = {}) {
    try {
      const {
        category = null,
        color = null,
        brand = null,
        season = null,
        limit = 20,
        offset = 0
      } = filters

      console.log('CatalogService: Searching catalog with query:', query)

      // Call the Postgres function for full-text search
      const { data, error } = await supabase
        .rpc('search_catalog', {
          search_query: query,
          filter_category: category,
          filter_color: color,
          filter_brand: brand,
          filter_season: season,
          page_limit: limit,
          page_offset: offset
        })

      if (error) {
        console.error('CatalogService: Error searching catalog:', error)
        throw error
      }

      console.log('CatalogService: Found', data?.length || 0, 'catalog items')
      return data || []

    } catch (error) {
      console.error('CatalogService: Error in searchCatalog:', error)
      throw error
    }
  }

  /**
   * Add a catalog item to user's closet
   * Uses the add_catalog_item_to_closet Postgres function
   * 
   * @param {string} catalogItemId - UUID of the catalog item to add
   * @param {string} privacy - Privacy setting ('public', 'friends', 'private') - default: 'friends'
   * @returns {Promise<string>} UUID of the newly created clothing item
   */
  async addToCloset(catalogItemId, privacy = 'friends') {
    if (privateMediaEnabled) return getPrivateCatalogClient().add(catalogItemId, privacy)
    try {
      console.log('📦 CatalogService: ========== Adding Catalog Item to Closet ==========')
      console.log('📦 CatalogService: Catalog item ID:', catalogItemId)
      console.log('📦 CatalogService: Privacy setting:', privacy)
      console.log('📦 CatalogService: Supabase configured:', !!supabase)
      
      if (!supabase) {
        console.error('❌ CatalogService: Supabase not configured')
        throw new Error('Supabase not configured')
      }

      // Get current user
      console.log('📦 CatalogService: Getting current user...')
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!user) {
        console.error('❌ CatalogService: User not authenticated:', userError)
        throw new Error('User not authenticated')
      }
      
      console.log('✅ CatalogService: User authenticated:', {
        user_id: user.id,
        user_email: user.email,
        user_name: user.user_metadata?.name || 'Unknown'
      })

      console.log('📦 CatalogService: Calling Postgres function add_catalog_item_to_closet...')
      console.log('📦 CatalogService: Function parameters:', {
        user_id_param: user.id,
        catalog_item_id_param: catalogItemId,
        privacy_param: privacy
      })

      // Call the Postgres function to add item to closet
      const { data, error } = await supabase
        .rpc('add_catalog_item_to_closet', {
          user_id_param: user.id,
          catalog_item_id_param: catalogItemId,
          privacy_param: privacy
        })

      console.log('📦 CatalogService: Function call result:', {
        hasData: !!data,
        hasError: !!error,
        errorMessage: error?.message,
        errorCode: error?.code,
        newItemId: data
      })

      if (error) {
        console.error('❌ CatalogService: Error adding to closet:', error)
        
        // Handle specific errors
        if (error.message?.includes('already in closet')) {
          console.warn('⚠️ CatalogService: Item already in closet')
          throw new Error('This item is already in your closet')
        } else if (error.message?.includes('not found or inactive')) {
          console.warn('⚠️ CatalogService: Catalog item not found or inactive')
          throw new Error('Catalog item not found or no longer available')
        }
        
        throw error
      }

      console.log('✅ CatalogService: Successfully added item to closet!', {
        catalog_item_id: catalogItemId,
        new_clothing_item_id: data,
        privacy: privacy,
        user_id: user.id
      })
      
      return data

    } catch (error) {
      console.error('❌ CatalogService: Error in addToCloset:', error)
      throw error
    }
  }

  /**
   * Check if a catalog item is already owned by the current user
   * 
   * @param {string} catalogItemId - UUID of the catalog item to check
   * @returns {Promise<boolean>} True if user already owns this item (or similar item)
   */
  async isItemOwned(catalogItemId) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      console.log('CatalogService: Checking if item is owned:', catalogItemId)

      // Call the Postgres function to check ownership
      const { data, error } = await supabase
        .rpc('is_catalog_item_owned', {
          user_id_param: user.id,
          catalog_item_id_param: catalogItemId
        })

      if (error) {
        console.error('CatalogService: Error checking item ownership:', error)
        throw error
      }

      console.log('CatalogService: Item ownership check result:', data)
      return data || false

    } catch (error) {
      console.error('CatalogService: Error in isItemOwned:', error)
      throw error
    }
  }

  /**
   * Get available categories from catalog
   * @returns {Promise<Array>} Array of category objects with counts
   */
  async getCategories() {
    try {
      const allCategories = []
      let offset = 0
      const limit = 1000 // Supabase default limit
      let hasMore = true

      // Fetch all categories using pagination to handle large catalogs
      while (hasMore) {
        const { data, error } = await supabase
          .from('catalog_items')
          .select('category')
          .eq('is_active', true)
          .range(offset, offset + limit - 1)

        if (error) throw error

        if (data && data.length > 0) {
          // Extract categories from this batch
          allCategories.push(...data)
          
          // If we got fewer items than requested, we've reached the end
          hasMore = data.length === limit
          offset += limit
        } else {
          hasMore = false
        }
      }

      // Count items per category
      const categoryCounts = {}
      allCategories.forEach(item => {
        if (item.category) {
          categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1
        }
      })

      return Object.entries(categoryCounts).map(([category, count]) => ({
        value: category,
        label: category.charAt(0).toUpperCase() + category.slice(1),
        count
      }))

    } catch (error) {
      console.error('CatalogService: Error getting categories:', error)
      throw error
    }
  }

  /**
   * Get available colors from catalog
   * @returns {Promise<Array>} Array of unique colors
   */
  async getColors() {
    try {
      const allColors = []
      let offset = 0
      const limit = 1000 // Supabase default limit
      let hasMore = true

      // Fetch all colors using pagination to handle large catalogs
      while (hasMore) {
        const { data, error } = await supabase
          .from('catalog_items')
          .select('primary_color')
          .eq('is_active', true)
          .not('primary_color', 'is', null)
          .range(offset, offset + limit - 1)

        if (error) throw error

        if (data && data.length > 0) {
          // Extract colors from this batch
          const batchColors = data.map(item => item.primary_color).filter(Boolean)
          allColors.push(...batchColors)
          
          // If we got fewer items than requested, we've reached the end
          hasMore = data.length === limit
          offset += limit
        } else {
          hasMore = false
        }
      }

      // Get unique colors
      const uniqueColors = [...new Set(allColors)]
      return uniqueColors.sort()

    } catch (error) {
      console.error('CatalogService: Error getting colors:', error)
      throw error
    }
  }

  /**
   * Get available brands from catalog
   * @returns {Promise<Array>} Array of unique brands
   */
  async getBrands() {
    try {
      const allBrands = []
      let offset = 0
      const limit = 1000 // Supabase default limit
      let hasMore = true

      // Fetch all brands using pagination to handle large catalogs
      while (hasMore) {
        const { data, error } = await supabase
          .from('catalog_items')
          .select('brand')
          .eq('is_active', true)
          .not('brand', 'is', null)
          .range(offset, offset + limit - 1)

        if (error) throw error

        if (data && data.length > 0) {
          // Extract brands from this batch
          const batchBrands = data.map(item => item.brand).filter(Boolean)
          allBrands.push(...batchBrands)
          
          // If we got fewer items than requested, we've reached the end
          hasMore = data.length === limit
          offset += limit
        } else {
          hasMore = false
        }
      }

      // Get unique brands
      const uniqueBrands = [...new Set(allBrands)]
      return uniqueBrands.sort()

    } catch (error) {
      console.error('CatalogService: Error getting brands:', error)
      throw error
    }
  }

  /**
   * Get available seasons from catalog
   * @returns {Promise<Array>} Array of unique seasons
   */
  async getSeasons() {
    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('season')
        .eq('is_active', true)
        .not('season', 'is', null)

      if (error) throw error

      // Get unique seasons
      const uniqueSeasons = [...new Set(data.map(item => item.season).filter(Boolean))]
      
      // Sort in logical order: spring, summer, fall, winter, all-season
      const seasonOrder = ['spring', 'summer', 'fall', 'winter', 'all-season']
      return uniqueSeasons.sort((a, b) => {
        const aIndex = seasonOrder.indexOf(a)
        const bIndex = seasonOrder.indexOf(b)
        return aIndex - bIndex
      })

    } catch (error) {
      console.error('CatalogService: Error getting seasons:', error)
      throw error
    }
  }
}

// Export a singleton instance
export const catalogService = new CatalogService()
