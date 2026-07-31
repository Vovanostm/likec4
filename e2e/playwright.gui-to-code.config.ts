import { defineConfig, devices } from '@playwright/test'
import { isCI } from 'std-env'

export default defineConfig({
  testDir: 'tests/gui-to-code',
  timeout: 30 * 1000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['list'], ['html', { outputFolder: 'playwright-report/gui-to-code', open: 'never' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:62004',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @likec4/gui-to-code preview --host 127.0.0.1 --port 62004',
    cwd: '..',
    port: 62004,
    reuseExistingServer: !isCI,
    stdout: 'pipe',
    timeout: 60 * 1000,
  },
})
