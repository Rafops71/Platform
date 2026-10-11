// Playwright drives the browser for the end-to-end flow. It ships its own
// Chromium, so nothing needs to be installed on the machine running it —
// which is the point: this project is developed on a machine with no Chrome.
//
//   npm run e2e                      # headless
//   npm run e2e:headed               # watch it happen
//   npm run e2e:ui                   # interactive runner
//
// Nothing has to be started by hand first. The `webServer` block below launches
// scripts/serve.js, waits for it to answer, and stops it again afterwards. Set
// E2E_BASE_URL to point the suite at an already-running server instead.
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

  // Start the site ourselves rather than assuming someone already did. Before
  // this existed the suite silently required a separate terminal running a
  // static server on port 8000; forgetting it produced a wall of timeouts that
  // looked like application failures. Skipped entirely when E2E_BASE_URL is
  // set, so pointing the suite at a deployed environment still works.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve.js',
        url: BASE_URL,
        // Locally, reuse a server that is already up — re-running the suite in
        // a loop should not fight over the port. In CI there is never one to
        // reuse, and a port that unexpectedly answers means something is wrong.
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
