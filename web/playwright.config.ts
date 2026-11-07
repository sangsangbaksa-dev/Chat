import { defineConfig, devices } from '@playwright/test'

const exe = { executablePath: '/opt/pw-browsers/chromium' }

// 실제 Supabase(.env.local)에 붙어 빌드한 앱을 띄워서 검사한다.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173', trace: 'off', launchOptions: exe },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: exe } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
