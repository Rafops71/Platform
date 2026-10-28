// The picture check: the public pages, photographed and compared with
// approved reference pictures (tests/visual/screenshots/). Asked for on
// 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"): a button that
// vanishes, text that overflows, a style that breaks - things no click test
// notices - change the picture, and the run fails.
//
//   npx playwright test -c playwright.visual.config.js
//   npx playwright test -c playwright.visual.config.js --update-snapshots
//
// The second form re-takes the references; do it only after looking at the
// new pictures and deciding the change was meant. Run in security-grid.yml,
// on the same Ubuntu runner every time, so fonts render alike.

'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = 8124;

module.exports = defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{projectName}{ext}',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: {
    // 0.1% of the pixels may differ (about 900 on a desktop screen): enough
    // for anti-aliasing, too little for a missing button (a small one is
    // about 3,500). 1% was too loose for that, so it is not used.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // PW_EXECUTABLE: a browser already on the machine, for running this outside CI.
    ...(process.env.PW_EXECUTABLE ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node scripts/serve.js`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    env: { PORT: String(PORT), HOST: '127.0.0.1' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
