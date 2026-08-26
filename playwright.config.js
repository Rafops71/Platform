// Playwright drives the browser for the end-to-end flow. It ships its own
// Chromium, so nothing needs to be installed on the machine running it —
// which is the point: this project is developed on a machine with no Chrome.
//
//   npx playwright test              # headless
//   npx playwright test --headed     # watch it happen
//   npx playwright test --ui         # interactive runner
//
// The suite talks to the LIVE Supabase project, because Supabase Auth is
// cloud-hosted and there is no local stand-in for it. Every account, listing
// and message it creates is prefixed and torn down again — see
// tests/e2e/helpers/fixtures.js. Never point this at a database whose
// contents matter without reading that teardown first.

'use strict';

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  // The flow is one long causal chain — an invitation must exist before it can
  // be redeemed, a listing before it can be contacted. Parallelism would not
  // just be useless here, it would have several workers racing on the same
  // shared live database.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
