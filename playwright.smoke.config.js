import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4477',
    channel: process.env.STYLESNAP_USE_SYSTEM_CHROME ? 'chrome' : undefined,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4477 --strictPort',
    url: 'http://127.0.0.1:4477',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
