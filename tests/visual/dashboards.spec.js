// The member's and the Operator's dashboards, every tab, compared with their
// approved pictures (docs/AGREED-2026-10-25.md, review Block 4). Signed in
// on the staging project, with the grid's test world (scripts/security-grid.js).
//
// Everything that holds data - lists, tables, counts, names, filled-in
// boxes - is held at one size by steady.css and painted over (mask), so the
// pictures compare the page's frame: headings, tabs, buttons, forms, layout.
// Staging gaining a row changes nothing; a vanished button or broken layout
// does. Refuses the live project.

'use strict';

const path = require('path');
const { test, expect } = require('@playwright/test');
const { buildWorld, cleanup, guardNotLive } = require('../../scripts/security-grid');

const STAGING = `
const SUPABASE_URL = ${JSON.stringify(process.env.SUPABASE_URL)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(process.env.SUPABASE_ANON_KEY)};
const jericho = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
`;
const STEADY = path.join(__dirname, 'steady.css');
const DATA = '#user-name, input, textarea, select, .stat-value, .badge, [id$="-list"], [id$="-table"], [id$="-count"], [id$="-updated"], tbody, #doc-checklist, time';

let world;
test.beforeAll(async () => { guardNotLive(); world = await buildWorld(); });
test.afterAll(async () => { await cleanup(); });

const DASHBOARDS = [
  { who: 'operator', file: 'operator.html', tabs: ['overview', 'approvals', 'users', 'invitations', 'listings', 'matches', 'deals', 'mailbox', 'doc-requests', 'commodities', 'analytics', 'scorecard', 'activity'] },
  { who: 'A', file: 'app.html', tabs: ['browse', 'new-listing', 'my-listings', 'mailbox', 'notifications', 'doc-requests', 'profile'] },
];

for (const d of DASHBOARDS) {
  test(`${d.file}: every tab looks as approved`, async ({ page }) => {
    test.setTimeout(180_000);
    const who = world[d.who];
    await page.route('**/js/supabase-config.js', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STAGING }));
    await page.addInitScript(() => { try { localStorage.setItem('jericho.language', 'en'); } catch { /* none */ } });
    await page.goto('/index.html');
    await page.fill('#email', who.email);
    await page.fill('#password', who.password);
    await page.click('#login-btn');
    await page.waitForURL(`**/${d.file}`, { timeout: 20_000 });
    // Ready only once the signed-in name is shown: clicking a tab before
    // that is undone when the page finishes starting (first CI run).
    await page.waitForFunction(() => document.querySelector('#user-name')?.textContent.trim().length > 0, null, { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    for (const tab of d.tabs) {
      const btn = page.locator(`nav.tabs button[data-screen="${tab}"]`);
      if (await btn.isVisible()) await btn.click();
      else await page.evaluate((t) => document.querySelector(`nav.tabs button[data-screen="${t}"]`).click(), tab);
      await expect(page.locator(`#screen-${tab}`)).toHaveClass(/\bactive\b/);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await expect.soft(page).toHaveScreenshot(`${d.file.replace('.html', '')}-${tab}.png`, {
        stylePath: STEADY, mask: [page.locator(DATA)],
      });
    }
  });
}
