import { defineConfig, devices } from '@playwright/test';

const PORT = 3103;

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // flaky tests get fixed, not retried (STANDARDS §6)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Serves the production build with the production headers (CSP included).
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: 'apps/web',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
