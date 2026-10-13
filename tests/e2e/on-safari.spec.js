// The member's journey, on Safari, on an iPhone.
//
// WHY A SEPARATE FILE
//
// Every other suite here runs on Chromium. `on-a-phone.spec.js` already checks
// the layout at phone size - but on Chrome's engine, which is not the engine a
// client has. On iOS every browser is WebKit underneath, Chrome included, so
// "it works on a phone" has until now meant "it works on an engine no iPhone
// runs".
//
// WHAT ACTUALLY DIFFERS BETWEEN ENGINES
//
// Not the database and not the rules - those are the same wherever the browser
// is. What differs is the part this platform depends on most:
//
//   - storage. WebKit is stricter about localStorage, and the language choice,
//     the session and the "stay signed in" behaviour all rest on it.
//   - dates and numbers. Intl formatting and Date parsing have historically
//     differed; a listing's date showing as "Invalid Date" is a WebKit classic
//     and would never appear on Chromium.
//   - form controls and taps. Selects, date inputs and the on-screen keyboard
//     behave differently, and every control here is operated by a thumb.
//
// So this file is the member's real path, not a layout check: sign in, browse,
// stay anonymous, write to the Operator, switch language. If WebKit breaks any
// of it, a client sees it on the first screen and nobody else ever would.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

let member;
let other;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  assertConfigured();
  await cleanup();

  member = await createAccount({
    label: 'safari', role: 'participant', status: 'approved',
    meta: { first_name: 'Ingrid', last_name: 'Solberg', company: 'Solberg Metals' },
  });

  // Somebody else's listing, so anonymity is tested against a real other
  // member rather than against an empty screen.
  other = await createAccount({
    label: 'safari-other', role: 'participant', status: 'approved',
    meta: { first_name: 'Marco', last_name: 'Ferrari', company: 'Ferrari Commodities' },
  });

  await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin,
        specification, status, reference_number)
     values ($1, 'sell', 'Copper Cathode Grade A', 25000, 'Metric tons', 'CIF',
             'Chile', 'LME Grade A, 99.99% Cu', 'available', $2)`,
    [other.profileId, `SELL-SAFARI-${Date.now().toString().slice(-6)}`]
  );
});

test.afterAll(async () => { await cleanup(); });

test.describe('on Safari, on an iPhone', () => {

  test('a member can sign in and the session survives a reload', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');

    // The reload is the point. A session kept only in memory looks identical
    // to a working one until the member switches apps and comes back, which on
    // a phone is constantly.
    await page.reload();
    await expect(page.locator('#user-name'), 'the session did not survive a reload on WebKit')
      .toBeVisible({ timeout: 20_000 });
  });

  test('Browse shows the market and still names nobody', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');
    await openScreen(page, 'browse');

    const list = page.locator('#browse-list');
    await expect(list, 'Browse showed nothing at all on WebKit').toContainText('Copper Cathode', { timeout: 20_000 });

    // THE PROHIBITION, re-asked on the engine a client actually has. The rule
    // lives in the database and cannot differ per browser - but the SCREEN is
    // what a person reads, and this is the screen they will read.
    const text = await list.innerText();
    for (const secret of ['Marco', 'Ferrari', other.email]) {
      expect(text, `Browse named the poster (${secret}) on Safari`).not.toContain(secret);
    }
  });

  test('dates and numbers render, rather than reading Invalid Date or NaN', async ({ page }) => {
    test.setTimeout(120_000);
    // A WebKit classic, and invisible on Chromium: a date string the other
    // engine parses happily comes back as Invalid Date here, and a member sees
    // it on every row.
    await signIn(page, member, 'app.html');
    await openScreen(page, 'browse');
    const text = await page.locator('#browse-list').innerText();

    expect(text, 'a date failed to parse on WebKit').not.toMatch(/invalid date/i);
    expect(text, 'a number failed to format on WebKit').not.toMatch(/\bNaN\b/);
    expect(text, 'the quantity is missing from the row').toMatch(/25[.,]000|25000/);
  });

  test('the language choice is kept, which needs storage WebKit may refuse', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');

    await page.locator('.lang-btn', { hasText: 'ES' }).first().click();
    await expect(page.locator('body')).toContainText(/Explorar|Ofertas|Buzón/i, { timeout: 15_000 });

    // Reload: the choice must still be Spanish. This is the storage path, and
    // the reason it is tested here rather than only on Chromium.
    await page.reload();
    await expect(page.locator('body'), 'the language choice was forgotten after a reload on WebKit')
      .toContainText(/Explorar|Ofertas|Buzón/i, { timeout: 20_000 });
  });

  test('an enquiry can be written and sent with a thumb', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');
    await openScreen(page, 'browse');
    await expect(page.locator('#browse-list')).toContainText('Copper Cathode', { timeout: 20_000 });

    // tap(), not click(): this project is used on a phone, and a control that
    // responds to a mouse but not to a touch is broken for every real member.
    await page.locator('[data-contact]').first().tap();
    await expect(page.locator('#contact-modal')).toBeVisible({ timeout: 15_000 });

    await page.fill('#contact-body', 'Interested in this parcel. Please pass on my enquiry.');
    await page.locator('#contact-send-btn').tap();

    await expect(page.locator('#contact-modal'), 'the enquiry never closed its form, so it may not have sent')
      .toBeHidden({ timeout: 20_000 });

    // Proven in the database rather than by the screen: the message exists,
    // and it is addressed for Operator review - not to the other member.
    const { rows } = await query(
      `select status from public.messages where sender_id = $1 order by created_at desc limit 1`,
      [member.profileId]
    );
    expect(rows.length, 'no message reached the database from Safari').toBe(1);
    expect(rows[0].status, 'the enquiry did not go for Operator review').toBe('pending_review');
  });

  test('nothing runs off the side of the screen', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');

    for (const screen of ['browse', 'my-listings', 'mailbox', 'profile']) {
      await openScreen(page, screen);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `the ${screen} screen scrolls sideways on an iPhone`).toBeLessThanOrEqual(2);
    }
  });
});
