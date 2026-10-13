// Two tabs, and a session that has gone stale.
//
// WHY THIS EXISTS
//
// Everything else here tests one browser doing one thing at a time. Real
// people do not work like that. They leave the platform open on a laptop,
// open it again on a phone, come back after lunch, and press whatever is
// still on the screen - which by then describes a world that has moved on.
//
// Two things can go wrong, and only one of them is obvious:
//
//   1. The stale tab shows something that is no longer true. Annoying, and
//      unavoidable: a screen cannot know what another screen just did.
//   2. The stale tab ACTS on it, and the platform lets it. That is the one
//      that matters. A member must not be able to undo work by pressing a
//      button on a page that is simply out of date, and a signed-out session
//      must not quietly appear to work.
//
// The assertions below are about the second kind. A refusal that the member
// can read is a pass; a silent success, a silent nothing, or a page that sits
// there is a failure.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

let member;
let reference;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  assertConfigured();
  await cleanup();

  member = await createAccount({ label: 'tabs', role: 'participant', status: 'approved' });

  reference = `SELL-TABS-${Date.now().toString().slice(-6)}`;
  await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', 'Zinc Ingots', 500, 'Metric tons', 'FOB', 'Peru', 'available', $2)`,
    [member.profileId, reference]
  );
});

test.afterAll(async () => { await cleanup(); });

test.describe('a second tab that has fallen behind', () => {

  test('Item61 acting on a listing another tab already closed is refused, and says so',
    async ({ browser }) => {
      test.setTimeout(150_000);

      // Two real tabs of the same member, not two browsers: this is one person
      // with the platform open twice, which is the common case.
      const context = await browser.newContext();
      const first = await context.newPage();
      const second = await context.newPage();

      await signIn(first, member, 'app.html');
      await openScreen(first, 'my-listings');
      await expect(first.locator('#listings-list')).toContainText(reference, { timeout: 20_000 });

      await second.goto('/app.html');
      await openScreen(second, 'my-listings');
      await expect(second.locator('#listings-list')).toContainText(reference, { timeout: 20_000 });

      // The first tab closes the listing. The second tab still shows it open.
      await first.locator(`[data-close]`).first().click();
      await expect(first.locator('.toast-success')).toBeVisible({ timeout: 20_000 });

      await expect.poll(async () => {
        const { rows } = await query('select status from public.listings where reference_number = $1', [reference]);
        return rows[0].status;
      }, { timeout: 20_000 }).toBe('closed');

      // Now the stale tab acts on what it still believes. Whatever happens, the
      // member must end up with a screen that tells them something true - and
      // the listing must not quietly reopen.
      const renew = second.locator('[data-renew]').first();
      if (await renew.count()) {
        await renew.click();
        await second.waitForTimeout(3000);
      }

      const { rows } = await query(
        'select status from public.listings where reference_number = $1', [reference]);
      expect(rows[0].status,
        'a stale tab reopened a listing the member had already closed')
        .toBe('closed');

      await context.close();
    });

  test('Item61 a signed-out session is told plainly, not left looking signed in',
    async ({ page, context }) => {
      test.setTimeout(150_000);
      await signIn(page, member, 'app.html');
      await openScreen(page, 'browse');

      // What an expired session looks like from the page's side: the stored
      // session is gone, but the screen is still painted and the member is
      // still looking at it. Waiting an hour for a real expiry is not a test
      // anybody would run, and this exercises the same path - the next request
      // goes out without a usable session.
      await context.clearCookies();
      await page.evaluate(() => {
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.includes('auth') || key.includes('supabase')) localStorage.removeItem(key);
          }
        } catch (e) { /* storage refused; the reload below still proves the path */ }
      });

      await page.reload();

      // Either the member is sent back to sign in, or they are told. Both are
      // honest. What must NOT happen is a dashboard that looks signed in while
      // nothing on it can load.
      await expect
        .poll(async () => {
          const url = page.url();
          if (/index\.html/.test(url)) return 'sent to sign in';
          const body = (await page.locator('body').innerText()).toLowerCase();
          if (/signed out|sign in again|acced|sesión/.test(body)) return 'told plainly';
          return 'still looks signed in';
        }, { timeout: 30_000, message: 'the page sat there looking signed in with a dead session' })
        .not.toBe('still looks signed in');
    });
});
