/**
 * StyleSnap - Main Application Entry Point
 * 
 * This file initializes the Vue 3 application with all necessary plugins,
 * routing configuration, and authentication guards.
 * 
 * @author StyleSnap Team
 * @version 1.0.0
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './index.css'
import { useTheme } from './composables/useTheme'
import { useThemeStore } from './stores/theme-store'
import { setupPageTransition, setupFocusManagement } from '@/composables/usePageTransition'
// import { displayConsoleArt } from '@/utils/console-art' // Disabled for cleaner console
import { sanitizeUrl, sanitizeEmail, safeLog, safeError, safeWarn } from '@/utils/log-sanitizer'

// Load each page after navigation guards allow entry. Shared sub-routes reuse
// the same loader and Vue Router caches a successfully loaded component.
const Landing = () => import('./pages/Landing.vue')
const Home = () => import('./pages/Home.vue')
const Cabinet = () => import('./pages/Cabinet.vue')
const Outfits = () => import('./pages/Outfits.vue')
const OutfitCreator = () => import('./pages/OutfitCreator.vue')
const Friends = () => import('./pages/Friends.vue')
const Profile = () => import('./pages/Profile.vue')
const FriendCabinet = () => import('./pages/FriendCabinet.vue')
const FriendProfile = () => import('./pages/FriendProfile.vue')
const Login = () => import('./pages/Login.vue')
const Logout = () => import('./pages/Logout.vue')
const OAuthCallback = () => import('./pages/OAuthCallback.vue')
const NotFound = () => import('./pages/NotFound.vue')

/**
 * Application Routes Configuration
 * 
 * Defines all available routes with their corresponding components
 * and authentication requirements.
 * 
 * @type {Array<Object>} Array of route objects
 */
const routes = [
  { path: '/', component: Landing, meta: { requiresAuth: false } },
  { path: '/home', component: Home, meta: { requiresAuth: true } },
  { path: '/closet', component: Cabinet, meta: { requiresAuth: true } },
  { path: '/outfits', component: Outfits, meta: { requiresAuth: true } },
  { path: '/outfits/suggested', component: Outfits, meta: { requiresAuth: true, subRoute: 'suggestions' } },
  { path: '/friends', component: Friends, meta: { requiresAuth: true, subRoute: 'friends' } },
  { path: '/friends/requests/received', component: Friends, meta: { requiresAuth: true, subRoute: 'requests' } },
  { path: '/friends/requests/sent', component: Friends, meta: { requiresAuth: true, subRoute: 'sent' } },
  { path: '/profile', component: Profile, meta: { requiresAuth: true } },
  { path: '/friend/:username/closet', component: FriendCabinet, meta: { requiresAuth: true } },
  { path: '/friend/:username/profile', component: FriendProfile, meta: { requiresAuth: true } },
  { path: '/logout', component: Logout, meta: { requiresAuth: false } }, // Logout page handles logout logic
  { path: '/login', component: Login, meta: { requiresAuth: false } },
  { path: '/auth/callback', component: OAuthCallback, meta: { requiresAuth: false } },
  
  // Outfit creation/editing routes (canvas interface)
  { path: '/outfits/add/personal', component: OutfitCreator, meta: { requiresAuth: true, subRoute: 'personal' } },
  { path: '/outfits/add/suggested', component: OutfitCreator, meta: { requiresAuth: true, subRoute: 'suggested' } },
  { path: '/outfits/add/friend', component: OutfitCreator, meta: { requiresAuth: true, subRoute: 'friend' } }, // Friend selection (without username)
  { path: '/outfits/add/friend/:username', component: OutfitCreator, meta: { requiresAuth: true, subRoute: 'friend' } }, // Friend's outfit creator
  { path: '/outfits/edit/:outfitId', component: OutfitCreator, meta: { requiresAuth: true, subRoute: 'edit' } },
  
  // Closet sub-routes (stay on closet page, content changes)
  { path: '/closet/add/manual', component: Cabinet, meta: { requiresAuth: true, subRoute: 'manual' } },
  { path: '/closet/add/catalogue', component: Cabinet, meta: { requiresAuth: true, subRoute: 'catalogue' } },
  
  // Catch-all route for undefined paths - show 404 page
  { path: '/:pathMatch(.*)*', component: NotFound, meta: { requiresAuth: false } }
]

/**
 * Vue Router Instance
 * 
 * Creates the router instance with HTML5 history mode
 * and the defined routes.
 */
const router = createRouter({
  history: createWebHistory(),
  routes
})

/**
 * Setup Page Transition System
 * 
 * Integrates the curtain-style page transition with Vue Router.
 * IMPORTANT: Must be called BEFORE the authentication guard below.
 * The transition system's beforeEach hook will run first to start
 * the exit animation, then the auth guard will handle navigation logic.
 * 
 * The transition works as follows:
 * 1. User clicks link → transition beforeEach starts curtain slide-down
 * 2. Auth guard checks permissions (while curtain covers screen)
 * 3. Navigation completes → transition afterEach triggers curtain slide-up
 * 4. New content is revealed smoothly
 */
setupPageTransition(router, {
  duration: 900,
  staggerDelay: 50,
  barCount: 10
})

// Setup focus management for accessibility
setupFocusManagement(router)

/**
 * Route Guard - Authentication Protection
 * 
 * Intercepts navigation to protected routes and redirects
 * unauthenticated users to the login page. Also redirects
 * authenticated users away from the login page.
 * 
 * @param {Object} to - Target route object
 * @param {Object} from - Source route object  
 * @param {Function} next - Navigation function
 */
router.beforeEach(async (to, from, next) => {
  try {
    console.log(`🧭 Router: Navigating from ${from.path} to ${to.path}`)
    
    // Import auth store
    const { useAuthStore } = await import('@/stores/auth-store')
    const authStore = useAuthStore()
    
    // Wait for auth initialization if it's still loading
    if (authStore.loading) {
      console.log('⏳ Router: Waiting for auth initialization...')
      const maxWait = 50 // 50 iterations = 5 seconds max
      let waited = 0
      while (authStore.loading && waited < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waited++
      }
      
      // If still loading after max wait, check if user has existing session
      if (authStore.loading) {
        safeWarn('⚠️ Router: Auth initialization timeout, checking for existing session...')
        
        // Check if we're navigating to login page (likely after logout)
        if (to.path === '/login') {
          console.log('🚪 Router: Navigating to login page, skipping auto sign-in')
          authStore.loading = false
          return
        }
        
        // Try to get user from Supabase directly
        try {
          // Import auth service to check for existing session
          const { authService } = await import('@/services/authService')
          const user = await authService.getCurrentUser()
          if (user) {
            safeLog('✅ Router: Found existing session, setting user:', sanitizeEmail(user.email))
            authStore.setUser(user)
            authStore.loading = false
          } else {
            safeLog('❌ Router: No existing session found')
            authStore.loading = false
          }
        } catch (error) {
          safeError('❌ Router: Error checking existing session:', error)
          authStore.loading = false
        }
      } else {
        console.log('✅ Router: Auth initialization complete')
      }
    }
    
    // Comprehensive authentication check
    const hasUser = authStore.user && authStore.user.id
    const isAuthenticated = authStore.isAuthenticated && hasUser && !authStore.loading
    
    console.log('🔍 Router: Auth state check:', {
      hasUser: !!hasUser,
      isAuthenticated: authStore.isAuthenticated,
      loading: authStore.loading,
      finalAuth: isAuthenticated
    })
    
    // Special handling for OAuth callback route - always allow
    if (to.path === '/auth/callback') {
      console.log('🔄 Router: OAuth callback route, allowing navigation')
      next()
      return
    }
    
    // Handle logout page - always allow access
    if (to.path === '/logout') {
      console.log('🚪 Router: Logout page, allowing navigation')
      next()
      return
    }
    
    // Handle login page - redirect authenticated users to home
    if (to.path === '/login') {
      if (isAuthenticated) {
        console.log('👤 Router: Already authenticated, redirecting to home')
        next('/home')
        return
      } else {
        console.log('🚪 Router: Not authenticated, allowing access to login page')
        next()
        return
      }
    }
    
    // Handle landing page - redirect authenticated users to home
    if (to.path === '/') {
      if (isAuthenticated) {
        console.log('👤 Router: Already authenticated, redirecting to home from landing page')
        next('/home')
        return
      } else {
        console.log('🏠 Router: Not authenticated, allowing access to landing page')
        next()
        return
      }
    }
    
    // Check if route requires authentication
    if (to.meta.requiresAuth) {
      if (!isAuthenticated) {
        console.log('🔒 Router: Protected route requires authentication, redirecting to login')
        console.log('🔒 Router: Route details:', {
          path: to.path,
          name: to.name,
          requiresAuth: to.meta.requiresAuth
        })
        next('/login')
        return
      } else {
        console.log('✅ Router: Authenticated user accessing protected route:', to.path)
      }
    }
    
    // Allow navigation to all other routes (public routes)
    console.log('✅ Router: Navigation allowed to:', to.path)
    next()
  } catch (error) {
    console.error('❌ Router: Navigation guard error:', error)
    // On any error, redirect to login for safety
    console.log('🔄 Router: Error occurred, redirecting to login for safety')
    next('/login')
  }
})

// Theme system will be initialized after Pinia is set up

/**
 * Vue Application Instance
 * 
 * Creates the main Vue application instance and configures
 * all necessary plugins and middleware.
 */
const app = createApp(App)
const pinia = createPinia()

// Register plugins
app.use(pinia)  // State management
app.use(router) // Client-side routing

// Initialize stores after Pinia is set up
app.config.globalProperties.$authStore = null
app.provide('authStore', null)

// Initialize auth store
import { useAuthStore } from '@/stores/auth-store'
const authStore = useAuthStore()
app.config.globalProperties.$authStore = authStore
app.provide('authStore', authStore)

// Initialize theme store after Pinia is set up
const themeStore = useThemeStore()
const { loadUser } = useTheme()

// Note: Theme initialization is handled by initializeThemeSystem() function below
// to consolidate all theme logic in one place

app.config.globalProperties.$themeStore = themeStore
app.provide('themeStore', themeStore)

// Debug: Track navigation events (development only)
if (import.meta.env.DEV) {
  let navigationCount = 0
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function(...args) {
    navigationCount++
    console.log(`🧭 Navigation #${navigationCount}: pushState`, args[2])
    return originalPushState.apply(this, args)
  }

  history.replaceState = function(...args) {
    navigationCount++
    console.log(`🧭 Navigation #${navigationCount}: replaceState`, args[2])
    return originalReplaceState.apply(this, args)
  }

  // Track window location changes
  let lastLocation = window.location.href
  setInterval(() => {
    if (window.location.href !== lastLocation) {
      navigationCount++
      console.log(`🧭 Navigation #${navigationCount}: location changed to`, window.location.href)
      lastLocation = window.location.href
    }
  }, 100)
}

// Track route changes after navigation
router.afterEach((to, from) => {
  console.log('🧭 Router: Navigation completed from', from.path, 'to', to.path)
  console.log('🧭 Router: Current route:', router.currentRoute.value.path)
  console.log('🧭 Router: Route component:', to.component?.name || 'Unknown')
  
  // Display ASCII art on page navigation
  import('@/utils/console-art').then(({ displayPageNavigationArt }) => {
    displayPageNavigationArt(to.path)
  }).catch(() => {
    // Silent fail if import fails
  })
  
  // Ensure theme is applied on route changes
  themeStore.refreshTheme()
})

// Router error handler for refresh token and other errors
router.onError((error) => {
  console.error('❌ Router error:', error)
  
  const errorMessage = error?.message || String(error || '')
  
  // Check if it's a refresh token error
  if (errorMessage.toLowerCase().includes('refresh token') ||
      errorMessage.toLowerCase().includes('refresh_token')) {
    console.error('❌ Refresh token error in router, clearing session...')
    
    // Clear the invalid session and redirect to login
    import('./lib/supabase').then(({ clearSupabaseSession }) => {
      clearSupabaseSession()
    })
  }
})

/**
 * Initialize theme system
 * 
 * Consolidates all theme initialization logic into a single function
 * to avoid redundancy and ensure consistent theme application.
 */
function initializeThemeSystem() {
  console.log('🎨 Main: Initializing theme system...')
  
  // Initialize theme store with user preferences or system defaults
  themeStore.initializeTheme()
  
  // Apply theme immediately if DOM is already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('🎨 Main: Applying theme on DOMContentLoaded')
      themeStore.refreshTheme()
    })
  } else {
    console.log('🎨 Main: Applying theme immediately (DOM already loaded)')
    themeStore.refreshTheme()
  }
}

// Initialize theme system once
initializeThemeSystem()

// Display console art and messages (disabled for cleaner console)
// displayConsoleArt()

/**
 * Log API Configuration Status
 * 
 * Safely logs which APIs are configured and connected without exposing sensitive keys
 */
async function logApiConfiguration() {
  console.log('%c🔌 API Configuration Status', 'font-weight: bold; font-size: 14px; color: #4CAF50;')
  console.log('━'.repeat(50))
  
  // Supabase Configuration
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)
  
  console.log(`📦 Supabase:`)
  console.log(`   URL: ${supabaseUrl ? sanitizeUrl(supabaseUrl) : '❌ Not set'}`)
  console.log(`   Anon Key: ${supabaseAnonKey ? `✅ Set (length: ${supabaseAnonKey.length})` : '❌ Not set'}`)
  console.log(`   Status: ${isSupabaseConfigured ? '✅ Configured' : '❌ Not configured'}`)
  
  // Check if Supabase client is initialized
  try {
    const { supabase, isSupabaseConfigured: supabaseConfig } = await import('@/lib/supabase')
    console.log(`   Client: ${supabase && supabaseConfig ? '✅ Initialized' : '❌ Not initialized'}`)
  } catch (e) {
    console.log(`   Client: ⚠️  Could not check initialization`)
  }
  console.log('')
  
  // Cloudinary Configuration
  const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const cloudinaryUploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const isCloudinaryConfigured = !!(cloudinaryCloudName && cloudinaryUploadPreset)
  
  console.log(`☁️  Cloudinary:`)
  console.log(`   Cloud Name: ${cloudinaryCloudName || '❌ Not set'}`)
  console.log(`   Upload Preset: ${cloudinaryUploadPreset ? `✅ Set (${cloudinaryUploadPreset})` : '❌ Not set'}`)
  console.log(`   Status: ${isCloudinaryConfigured ? '✅ Configured' : '❌ Not configured'}`)
  
  // Check if Cloudinary service is initialized
  try {
    const { CloudinaryService } = await import('@/lib/cloudinary')
    const cloudinaryService = new CloudinaryService()
    console.log(`   Service: ${cloudinaryService.cloudName ? '✅ Initialized' : '❌ Not initialized'}`)
  } catch (e) {
    console.log(`   Service: ⚠️  Could not check initialization`)
  }
  console.log('')
  
  // Google Gemini Configuration
  const viteGeminiKey = import.meta.env.VITE_GEMINI_API_KEY
  const isGeminiConfigured = !!viteGeminiKey
  
  console.log(`🌟 Google Gemini:`)
  if (viteGeminiKey) {
    console.log(`   Local API Key: ✅ Set (length: ${viteGeminiKey.length})`)
    console.log(`   Mode: Direct API client (local development)`)
  } else {
    console.log(`   Local API Key: ⚠️  Not set (will use backend proxy)`)
    console.log(`   Mode: Backend proxy (uses GEMINI_API_KEY from Vercel server-side)`)
  }
  console.log(`   Status: ${isGeminiConfigured ? '✅ Configured (local)' : '✅ Configured (via proxy)'}`)
  
  // Check if Google Gemini services are initialized
  try {
    const { virtualTryOnService } = await import('@/services/virtualTryOnService')
    const serviceStatus = virtualTryOnService.useProxy 
      ? '✅ Using backend proxy'
      : (virtualTryOnService.client ? '✅ Initialized (direct)' : '❌ Not initialized')
    console.log(`   Virtual Try-On Service: ${serviceStatus}`)
  } catch (e) {
    console.log(`   Virtual Try-On Service: ⚠️  Could not check initialization`)
  }
  console.log('')
  
  // Optional APIs
  const openWeatherKey = import.meta.env.VITE_OPENWEATHER_API_KEY
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const supabaseSyncFunction = import.meta.env.VITE_SUPABASE_SYNC_FUNCTION_URL
  
  console.log('📋 Optional APIs:')
  console.log(`   OpenWeather API: ${openWeatherKey ? `✅ Set (length: ${openWeatherKey.length})` : '⚠️  Not set (optional)'}`)
  console.log(`   Google OAuth Client ID: ${googleClientId ? `✅ Set (${googleClientId.substring(0, 30)}...)` : '⚠️  Not set (optional)'}`)
  console.log(`   Supabase Sync Function: ${supabaseSyncFunction ? `✅ Set` : '⚠️  Not set (optional)'}`)
  
  console.log('━'.repeat(50))
  
  // Summary
  const totalConfigured = [
    isSupabaseConfigured,
    isCloudinaryConfigured,
    isHuggingFaceConfigured,
    isGeminiConfigured
  ].filter(Boolean).length
  
  console.log(`📊 Summary: ${totalConfigured}/4 core APIs configured`)
  console.log('')
}

// Diagnostic imports should not load provider SDKs on production landing pages.
if (import.meta.env.DEV) {
  logApiConfiguration().catch(err => {
    console.warn('⚠️ Could not log API configuration:', err)
  })
}

const authInitPromise = authStore.initializeAuth().then(async () => {
  console.log('✅ Auth store initialized successfully')
  
  // Load user theme preferences after auth is ready
  await themeStore.loadUser()
  
  // Note: Frontend Edge Function health check is skipped because:
  // 1. Database triggers automatically call the Edge Function when users sign up
  // 2. If Edge Function fails, triggers fall back to direct insert
  // 3. The sync happens server-side, so frontend health checks aren't needed
  // The Edge Function IS still being used by database triggers (if configured)
  console.log('ℹ️ Frontend Edge Function health check skipped (sync handled by database triggers with fallback)')
}).catch(error => {
  console.error('❌ Failed to initialize auth store:', error)
})

// Mount the app with a timeout to prevent blank pages
Promise.race([
  authInitPromise,
  new Promise(resolve => setTimeout(resolve, 3000)) // 3 second timeout
]).finally(() => {
  // Mount the application to the DOM
  try {
    app.mount('#app')
    console.log('✅ App mounted successfully')
  } catch (error) {
    console.error('❌ Failed to mount app:', error)
    // Fallback: try to mount anyway
    setTimeout(() => {
      try {
        app.mount('#app')
        console.log('✅ App mounted via fallback')
      } catch (e) {
        console.error('❌ Fallback mount failed:', e)
        // Last resort: force reload if mounting fails
        setTimeout(() => {
          console.log('🔄 Forcing page reload due to mount failure')
          window.location.reload()
        }, 2000)
      }
    }, 1000)
  }
})

// Blank page recovery monitor (development only — in production, trust the framework)
if (import.meta.env.DEV) {
  let blankPageCheckInterval = null
  let lastActivityTime = Date.now()

  const startBlankPageMonitor = () => {
    blankPageCheckInterval = setInterval(() => {
      const now = Date.now()
      const timeSinceLastActivity = now - lastActivityTime
      if (timeSinceLastActivity > 10000) {
        const appElement = document.getElementById('app')
        if (appElement && (!appElement.innerHTML || appElement.innerHTML.trim() === '')) {
          console.log('🚨 Blank page detected, attempting recovery...')
          try {
            if (!app._instance) {
              app.mount('#app')
              console.log('✅ App re-mounted successfully')
            }
          } catch (error) {
            console.error('❌ Re-mount failed:', error)
            window.location.reload()
          }
        }
      }
    }, 5000)
  }

  document.addEventListener('click', () => { lastActivityTime = Date.now() })
  document.addEventListener('keydown', () => { lastActivityTime = Date.now() })
  document.addEventListener('scroll', () => { lastActivityTime = Date.now() })
  setTimeout(startBlankPageMonitor, 5000)
}

/**
 * Helper function to detect browser extension errors
 * 
 * Checks if an error message is related to browser extensions
 * (e.g., Chrome extension errors that shouldn't break the app)
 * 
 * @param {string|Object} messageOrObj - Error message or error object
 * @returns {boolean} True if this is a browser extension error
 */
function isBrowserExtensionError(messageOrObj) {
  const message = typeof messageOrObj === 'string' 
    ? messageOrObj 
    : (messageOrObj?.message || String(messageOrObj || ''))
  
  // Common browser extension error patterns — kept narrow to avoid suppressing real errors
  const extensionErrorPatterns = [
    'No tab with id',
    'runtime.lastError',
    'Extension context',
    'message channel closed',
    'chrome-extension://',
    'moz-extension://',
    'ERR_FILE_NOT_FOUND'
  ]
  
  return message && extensionErrorPatterns.some(pattern => 
    message.includes(pattern)
  )
}

// Additional aggressive error suppression for runtime.lastError (development only)
if (import.meta.env.DEV) {
  const originalOnError = window.onerror
  window.onerror = function(message, source, lineno, colno, error) {
    if (isBrowserExtensionError(message) || 
        isBrowserExtensionError(source) ||
        isBrowserExtensionError(error?.message)) {
      return true
    }
    if (originalOnError) {
      return originalOnError.call(this, message, source, lineno, colno, error)
    }
    return false
  }
}

// Note: Network errors (like ERR_FILE_NOT_FOUND) from browser extensions
// cannot be suppressed via JavaScript as they're resource loading failures.
// These errors appear in the Network tab and console but don't affect app functionality.
// They're safe to ignore - they're caused by browser extensions trying to load missing files.

// Note: CSS MIME type errors (e.g., "Refused to apply style from '...css' because its MIME type ('text/html')")
// are typically deployment/build issues:
// 1. Vercel may be serving a 404 HTML page instead of the CSS file
// 2. Build output path may be incorrect
// 3. Asset path configuration may need adjustment
// Solution: Check Vercel build logs, verify CSS files are in dist/assets/, and ensure proper Content-Type headers

// Note: loadUser() is already called inside authInitPromise (line ~355)
// No need to call it again here to avoid duplicate API requests

// Note: Theme initialization is already handled by initializeThemeSystem() (line ~350)
// and refreshTheme() is called on route changes (router.afterEach)
// No need for additional setTimeout calls

// Global error handler for browser extension errors and auth errors
window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = event.reason?.message || String(event.reason || '')
  
  // Check if it's a refresh token error
  if (errorMessage.toLowerCase().includes('refresh token') ||
      errorMessage.toLowerCase().includes('refresh_token')) {
    console.error('❌ Refresh token error detected:', errorMessage)
    event.preventDefault()
    
    // Clear the invalid session and redirect to login
    import('./lib/supabase').then(({ clearSupabaseSession }) => {
      clearSupabaseSession()
    })
    return
  }
  
  // Check if it's a browser extension error
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('message channel closed') ||
       event.reason.message.includes('listener indicated an asynchronous response'))) {
    console.warn('⚠️ Browser extension error detected, ignoring...')
    event.preventDefault() // Prevent the error from showing in console
    return
  }
  
  // For other errors, log them but don't crash the app
  console.error('❌ Unhandled promise rejection:', event.reason)
  event.preventDefault()
})
