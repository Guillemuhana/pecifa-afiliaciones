import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://pecifa-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key' },
  },
});
