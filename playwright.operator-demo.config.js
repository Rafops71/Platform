// Browser tests for the OPERATOR demo (dist-demo-operator/). Offline: no .env,
// no live database. The demo is the mock, so these tests prove that the
// Operator console never asks Supabase for anything and that every tab works.
//
//   npm run test:demo:operator
//
// The webServer block builds dist-demo-operator/ and serves it. The member demo
// has its own config (playwright.demo.config.js); the two never share a server.

'use strict';

const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.OPERATOR_DEMO_PORT || 8120);

// Same preinstalled-browser rule as playwright.demo.config.js.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(PREINSTALLED)
  ? { executablePath: PREINSTALLED, args: ['--no-sandbox'] }
  : {};

module.exports = defineConfig({
  testDir: './tests/operator-demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
  ],
  webServer: [
    {
      command: 'DEMO_KIND=operator node scripts/build-demo.js && SERVE_DIR=dist-demo-operator node scripts/serve-demo.js',
      url: `http://127.0.0.1:${PORT}/index.html`,
      env: { PORT: String(PORT), DEMO_KIND: 'operator', SERVE_DIR: 'dist-demo-operator' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
