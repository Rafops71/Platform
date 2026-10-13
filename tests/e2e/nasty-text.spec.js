// Text a member types is shown, never run.
//
// WHY THIS IS ITS OWN SUITE
//
// Every screen on this platform displays something somebody else typed: a
// commodity, a company name, a specification, the body of an enquiry. Almost
// all of it is built with innerHTML and a template string, which is the normal
// way to write this kind of interface and also the normal way to end up
// running a member's text as code.
//
// An audit on 2026-10-13 read every one of those templates and found them
// correctly escaped. Reading is not proof. This suite types the real thing
// into the real screens and checks what the browser does with it - the only
// evidence that counts, and the only kind that keeps counting after somebody
// adds a new row template next month.
//
// WHY IT MATTERS MORE HERE THAN ELSEWHERE
//
// The person most exposed is the OPERATOR. A member writes the text; the
// Operator's console is where it is read, and that console can see every
// member, every listing and every message on the platform. Script running
// there is not a defaced page - it is the whole platform's privacy, which is
// the product.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Each of these has been used to take over a page somewhere. They are here
// because they exercise different escaping mistakes, not for variety:
// a tag that executes without script tags, an attribute that breaks out of a
// quoted value, a javascript: URL, and a closing tag that ends the element
// early.
const PAYLOADS = [
  '<img src=x onerror="window.__jerichoPwned=1">',
  '" onmouseover="window.__jerichoPwned=1" x="',
  '<a href="javascript:window.__jerichoPwned=1">click</a>',
  '</td></tr><script>window.__jerichoPwned=1</script>',
];

// Fifty thousand characters in one field. Not an attack - just somebody
// pasting a contract into the notes box, which members do.
const VERY_LONG = 'A'.repeat(50_000);

let member;
let operator;
let listingId;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  assertConfigured();
  await cleanup();

  operator = await createAccount({ label: 'nasty-op', role: 'operator', status: 'approved' });
  member = await createAccount({
    label: 'nasty-member',
    role: 'participant',
    status: 'approved',
    // The company name is shown on the Operator's listing table, so it is a
    // route in that has nothing to do with listings.
    meta: { first_name: 'Nasty', last_name: 'Text', company: PAYLOADS[0] },
  });

  // Written over SQL rather than through the form on purpose: the form may
  // one day reject these characters, and that must not be what makes this
  // suite pass. The question is what the SCREENS do with text that is already
  // in the database, however it arrived.
  // reference_number has no default and no trigger fills it: the application
  // asks next_reference() for one. Checked against the live catalog rather
  // than assumed, because an insert that fails here would leave this suite
  // passing against a table with nothing nasty in it.
  const { rows } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin,
        specification, notes, status, reference_number)
     values ($1, 'sell', $2, 1000, 'Metric tons', 'CIF', $3, $4, $5, 'available', $6)
     returning id`,
    [member.profileId, PAYLOADS[1], PAYLOADS[2], PAYLOADS[3], VERY_LONG,
     `SELL-NASTY-${Date.now().toString().slice(-6)}`]
  );
  listingId = rows[0].id;
  expect(listingId, 'the nasty listing was not created, so this suite would prove nothing').toBeTruthy();
});

test.afterAll(async () => { await cleanup(); });

/** Did anything on this page manage to execute? */
async function wasPwned(page) {
  return page.evaluate(() => Boolean(window.__jerichoPwned));
}

/** Elements that only exist if markup was built out of somebody's text. */
async function injectedElements(page) {
  return page.evaluate(() => ({
    images: document.querySelectorAll('img[onerror]').length,
    scripts: document.querySelectorAll('script:not([src])').length > 2 ? 'extra' : 'expected',
    jsLinks: document.querySelectorAll('a[href^="javascript:"]').length,
  }));
}

test.describe('text a member types', () => {

  test('Item58 is never run as code on the Operator console', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, operator, 'operator.html');

    // Every screen that shows member-written text, in one pass. The payloads
    // are in a listing and in a profile, so both tables are covered.
    for (const screen of ['listings', 'users', 'overview', 'activity']) {
      await openScreen(page, screen);
      expect(await wasPwned(page), `member text executed on the Operator's ${screen} screen`).toBe(false);

      const found = await injectedElements(page);
      expect(found.images, `an <img onerror> was built from member text on ${screen}`).toBe(0);
      expect(found.jsLinks, `a javascript: link was built from member text on ${screen}`).toBe(0);
    }
  });

  test('Item58 is shown to the Operator as the characters that were typed', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');

    // The commodity carries the quote-breaking payload. It must appear as
    // text - proof that it was escaped rather than dropped, which would also
    // produce a page with no script on it and tell the Operator nothing.
    // #listings-table, not a bare tbody: the Operator page has two tables and
    // the bare selector matched both. The test was wrong, not the page - the
    // payloads themselves all came back inert on this same run.
    await expect(page.locator('#listings-table tbody'),
      'the text was not shown at all, so the Operator cannot see what was written')
      .toContainText('onmouseover');
  });

  test('Item58 does not run on a member screen either', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');

    for (const screen of ['browse', 'my-listings', 'mailbox']) {
      await openScreen(page, screen);
      expect(await wasPwned(page), `member text executed on the ${screen} screen`).toBe(false);
      const found = await injectedElements(page);
      expect(found.images, `an <img onerror> was built from member text on ${screen}`).toBe(0);
      expect(found.jsLinks, `a javascript: link was built from member text on ${screen}`).toBe(0);
    }
  });

  test('Item58 a 50,000-character field does not break the page sideways', async ({ page }) => {
    test.setTimeout(120_000);
    // Not an attack. Somebody pasting a contract into the notes box, which is
    // exactly what a trader does, and which would otherwise push the layout
    // wider than the screen and leave every control off to the right.
    await signIn(page, member, 'app.html');
    await openScreen(page, 'browse');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'a long note pushed the page sideways').toBeLessThanOrEqual(2);
  });
});
