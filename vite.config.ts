import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup/vitest.setup.js'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    include: [
      'tests/unit/utils/**/*.test.js',
      'tests/unit/stores/**/*.test.js',
      'tests/unit/services/**/*.test.js',
    ],
    exclude: [
      'node_modules/**',
      'tests/integration/**',
      'tests/e2e/**',
      'tests/unit/utils/image-compression.test.js',
    ]
  },
  server: {
    port: 3000,
    host: false,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Only in dev mode
    minify: 'esbuild', // Faster than terser
    cssCodeSplit: true, // Enable CSS code splitting
    chunkSizeWarningLimit: 1000, // Warn on large chunks
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (['vue', 'vue-router', 'pinia'].some(p => id.includes(`/node_modules/${p}/`))) return 'vue-vendor'
            if (id.includes('/node_modules/three/')) return 'three-vendor'
            if (['lucide-vue-next', '@vueuse/core'].some(p => id.includes(`/node_modules/${p}/`))) return 'ui-vendor'
            if (['clsx', 'tailwind-merge', 'class-variance-authority'].some(p => id.includes(`/node_modules/${p}/`))) return 'utils-vendor'
          }
        },
        // Optimize chunk file names
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type
          if (assetInfo.name?.endsWith('.css')) {
            return 'css/[name]-[hash][extname]'
          }
          if (/\.(png|jpe?g|svg|gif|webp|avif)$/.test(assetInfo.name || '')) {
            return 'images/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    },
    // Optimize dependencies
    commonjsOptions: {
      include: [/node_modules/]
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia'],
    exclude: ['three'] // Three.js is loaded dynamically
  }
})
