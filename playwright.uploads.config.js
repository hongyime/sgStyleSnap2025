import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser-uploads', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4479',
    channel: process.env.STYLESNAP_USE_SYSTEM_CHROME ? 'chrome' : undefined,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4479 --strictPort',
    url: 'http://127.0.0.1:4479/tests/browser-uploads/fixture.html', reuseExistingServer: false,
    env: { VITE_PRIVATE_MEDIA_ENABLED: 'true', VITE_PRIVATE_UPLOADS_ENABLED: 'true',
      VITE_PRIVATE_CATALOG_POLICY: 'opt_in', VITE_SUPABASE_URL: 'https://nztqjmknblelnzpeatyx.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'synthetic-publishable-key', VITE_CLOUDINARY_CLOUD_NAME: '',
      VITE_CLOUDINARY_UPLOAD_PRESET: '' },
  },
})
