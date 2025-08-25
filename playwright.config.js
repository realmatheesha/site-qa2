// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 90_000,
  workers: 2, // lower = gentler on your site; raise to go faster
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    headless: true,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true
  },
  projects: [
    { name: 'desktop' },
    { name: 'mobile', use: devices['Pixel 7'] }
  ]
});