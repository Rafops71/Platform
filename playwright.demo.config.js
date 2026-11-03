// Browser tests for the DEMO build (dist-demo/). They need no .env and no
// live database: the demo is the mock, so these tests run offline and prove
// that the demo never asks Supabase for anything.
//
//   npm run test:demo
//
// The webServer block builds dist-demo/ and serves it. The real site's suite
// is playwright.config.js; this file is separate on purpose.

'use strict';

const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.DEMO_PORT || 8100);

// Some cloud containers ship one Chromium build at a fixed path and no copy of
// the build this Playwright version expects. Use that build when it is there;
// everywhere else (CI installs its own) the default browser is used.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(PREINSTALLED)
  ? { executablePath: PREINSTALLED, args: ['--no-sandbox'] }
  : {};

module.exports = defineConfig({
  testDir: './tests/demo',
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
  webServer: {
    command: 'node scripts/build-demo.js && node scripts/serve-demo.js',
    url: `http://127.0.0.1:${PORT}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
