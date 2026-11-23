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
// The suite talks to a REAL Supabase project - STAGING for a pull request, LIVE for a push to main
// (.github/workflows/ci.yml, TARGET_*; scripts/check-ci-targets.js guards the rule) - because Supabase Auth is
// cloud-hosted and there is no local stand-in for it. Every account, listing
// and message it creates is prefixed and torn down again — see
// tests/e2e/helpers/fixtures.js. Never point this at a database whose
// contents matter without reading that teardown first.

'use strict';

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8000';

// How many spec files run at the same moment. 1 (the default) is the suite exactly as it has always run. Above 1, the files
// in tests/e2e/exclusive-specs.js move to their own project and run alone, after the others (see that file). Every account
// a worker makes carries that worker's own tag (tests/e2e/helpers/fixtures.js), so one worker's teardown never deletes another's.
const WORKERS = Math.max(1, Math.floor(Number(process.env.E2E_WORKERS || 1)) || 1);
const EXCLUSIVE = require('./tests/e2e/exclusive-specs.js').map((f) => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));

module.exports = defineConfig({
  testDir: './tests/e2e',
  // The flow is one long causal chain — an invitation must exist before it can
  // be redeemed, a listing before it can be contacted, so the tests INSIDE a spec file always run in order, on one
  // worker. Workers share nothing but the database: with E2E_WORKERS above 1, different spec FILES run at the same
  // moment (see WORKERS above, tests/e2e/exclusive-specs.js and tests/e2e/helpers/fixtures.js).
  fullyParallel: false,
  workers: WORKERS,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  // Playwright, on CI, runs `git fetch` for commit info with a 3 s limit. When
  // GitHub is slow that times out and the error is printed into the JSON
  // report on stdout, so the checklist cannot read it (PR 78 and PR 60,
  // 2026-11-03). The report does not use git info, so do not capture it.
  captureGitInfo: { commit: false, diff: false },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    // Everything except the Safari file, which would otherwise run twice.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/on-safari\.spec\.js/, ...(WORKERS > 1 ? EXCLUSIVE : [])],
    },

    // The files that must run alone (tests/e2e/exclusive-specs.js). Used only when E2E_WORKERS is above 1, and then run
    // by scripts/checklist-report.js as a second step on ONE worker (--workers=1) after the parallel project is done.
    // Never part of "--project=chromium"; with one worker those files stay inside the chromium project as before.
    {
      name: 'chromium-exclusive',
      use: { ...devices['Desktop Chrome'] },
      testMatch: EXCLUSIVE,
    },

    // Safari, on an iPhone, which is what a client will actually open.
    //
    // Every other suite runs on Chromium, so until now "it works on a phone"
    // meant "it works on Chrome's engine at phone size". That is not the same
    // claim: WebKit is a different engine with its own behaviour around dates,
    // storage in private windows, and form controls, and it is the only engine
    // allowed on iOS - Chrome on an iPhone is WebKit underneath too.
    //
    // Deliberately ONE file rather than the whole suite. Running everything
    // twice would double a thirteen-minute run and double the churn on the
    // live database for very little: the risk is not that the application
    // logic differs per engine, it is that the INTERFACE does. So this covers
    // the journey a member actually takes, on the engine they actually have.
    {
      name: 'safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /on-safari\.spec\.js/,
    },
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
