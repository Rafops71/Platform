// The platform on a phone-sized screen.
//
// Zero coverage before this file. Every other spec runs in a desktop window,
// and the owner asked the question that found it: more of his counterparties
// will open this on a phone than on a laptop, and nobody had ever looked.
//
// What a small screen actually breaks is not usually the logic. It is the
// layout: a table wider than the screen that scrolls the whole page sideways,
// a button pushed off the edge, a nav bar that hides the thing you came for,
// text at four-point. None of that fails any existing assertion, because every
// existing assertion asks "is the row there" and the row IS there - just
// three hundred pixels to the right of anything you can see.
//
// So this checks the things a person on a phone would notice first:
//
//   * nothing makes the page scroll sideways
//   * the screen you asked for is the screen you get
//   * the buttons you must press are on the screen and big enough to hit
//   * the privacy rule still holds, because a cramped layout is exactly where
//     a label might get dropped or a field spill out of its box
//
// 390x844 is a current mainstream phone in portrait, which is what this is
// most likely to be opened on. The desktop suite covers the other end, so the
// two together bracket what a real person uses.
//
// Deliberately NOT a visual-regression test. Screenshot comparison would fail
// on a font rendering difference between two CI runners and teach everyone to
// ignore it. These are structural questions with yes/no answers.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const PHONE = { width: 390, height: 844 };

// Apple's own guidance and Android's agree on roughly this: anything smaller
// than ~44 CSS pixels is hard to hit with a thumb. Used as a floor, not a
// target - a button at 43 is a nuisance, a button at 12 is unusable.
const MIN_TAP_PX = 32;

const SELLER   = { first_name: 'Rosalind', last_name: 'Achterberg', company: 'Achterberg Ores',  phone: '+32471559001' };
const BUYER    = { first_name: 'Casimir',  last_name: 'Nyborg',     company: 'Nyborg Commodity', phone: '+32471559002' };

let operator, seller, buyer, listingRef;

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  assertConfigured();
  await cleanup();

  operator = await createAccount({ label: 'phnop',  role: 'operator',    status: 'approved' });
  seller   = await createAccount({ label: 'phnsell', role: 'participant', status: 'approved', meta: SELLER });
  buyer    = await createAccount({ label: 'phnbuy',  role: 'participant', status: 'approved', meta: BUYER });

  // A handful of listings: enough that lists, tables and cards have something
  // to lay out, few enough that this file stays quick.
  const { rows } = await query(
    `insert into public.listings
       (user_id, reference_number, type, commodity, quantity, unit, incoterm, origin, status,
        specification, price_conditions, notes)
     select $1,
            public.next_reference('sell'),
            'sell',
            c.name,
            5000, 'Metric tons', 'FOB', 'Chile', 'available',
            'A specification long enough to need wrapping on a narrow screen, which is the point of it being here.',
            'Price on application, subject to final assay and vessel nomination.',
            'Notes that are also deliberately long, because a short string proves nothing about a layout.'
       from (select name from public.commodities order by name limit 6) c
     returning reference_number`,
    [seller.profileId],
  );
  listingRef = rows[0].reference_number;

  // An enquiry, so the Operator has something in the mailbox to lay out.
  await query(
    `insert into public.messages (sender_id, listing_id, body, status)
     values ($1, (select id from public.listings where reference_number = $2),
             'Enquiry sent from a phone-sized screen.', 'pending_review')`,
    [buyer.profileId, listingRef],
  );
});

test.afterAll(async () => { await cleanup(); });

/** Does the page scroll sideways? The single most common small-screen fault,
 *  and the one a desktop test can never see. A few pixels of slack absorbs
 *  sub-pixel rounding; a table escaping its container is tens or hundreds. */
async function sidewaysOverflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    return Math.max(0, d.scrollWidth - d.clientWidth);
  });
}

/** Every element that is meant to be tapped, and smaller than it should be. */
async function tooSmallToTap(page, minPx) {
  return page.evaluate((min) => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], select, input[type="submit"]')) {
      const r = el.getBoundingClientRect();
      // Hidden things are not targets; zero-size means not laid out at all.
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (r.height < min) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${Math.round(r.height)}px tall`);
      }
    }
    return out;
  }, minPx);
}

test.describe.serial('on a phone', () => {

  test('the sign-in page fits the screen', async ({ page }) => {
    await page.goto('/index.html');
    // #login-form by name, not 'any form': adding the forgotten-password panel
    // to this page gave it a second form, and a selector that matched "either"
    // became a selector that matched two things and failed. A test that names
    // what it means does not break when a page grows.
    await expect(page.locator('#login-form')).toBeVisible({ timeout: 15_000 });

    const overflow = await sidewaysOverflow(page);
    console.log(`  sign-in            sideways overflow ${overflow}px`);
    expect(overflow, `the sign-in page scrolls ${overflow}px sideways on a ${PHONE.width}px screen`)
      .toBeLessThanOrEqual(2);
  });

  test('a member can reach every screen, and none of them overflow', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, buyer, 'app.html');

    const screens = ['my-listings', 'browse', 'mailbox', 'notifications', 'doc-requests', 'profile'];
    const bad = [];

    for (const screen of screens) {
      await openScreen(page, screen);
      // Let the list settle before measuring: a half-rendered list is not the
      // layout anybody sees.
      await page.waitForTimeout(1200);
      const overflow = await sidewaysOverflow(page);
      console.log(`  member ${screen.padEnd(14)} sideways overflow ${overflow}px`);
      if (overflow > 2) bad.push(`${screen} (${overflow}px)`);
    }

    expect(bad, `these member screens scroll sideways on a phone: ${bad.join(', ')}`).toEqual([]);
  });

  test('Browse is readable and still names nobody', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, buyer, 'app.html');
    await openScreen(page, 'browse');

    await expect
      .poll(async () => page.locator('#browse-list .list-row').count(),
            { timeout: 25_000, message: 'Browse never filled on a phone' })
      .toBeGreaterThan(0);

    // The prohibition, re-checked here on purpose. A narrow layout is exactly
    // where a label gets dropped or a field spills out of the box it was
    // hidden behind, and item 19 has only ever been proven on a wide screen.
    const shown = await page.locator('#screen-browse').innerText();
    for (const naming of [SELLER.first_name, SELLER.last_name, SELLER.company]) {
      expect(shown, `Browse named the seller on a phone: ${naming}`).not.toContain(naming);
    }

    // The button that starts a conversation has to be reachable, since it is
    // the only way a deal ever begins.
    const contact = page.locator('#browse-list [data-contact]').first();
    await expect(contact).toBeVisible();
    const box = await contact.boundingBox();
    expect(box.x, 'the Contact button starts off the left of the screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'the Contact button runs off the right of the screen')
      .toBeLessThanOrEqual(PHONE.width + 2);
  });

  test('nothing a member must tap is too small to hit', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, buyer, 'app.html');
    await openScreen(page, 'browse');
    await page.waitForTimeout(1200);

    const small = await tooSmallToTap(page, MIN_TAP_PX);
    console.log(`  member browse      ${small.length} tap target(s) under ${MIN_TAP_PX}px`);
    expect(small, `too small to tap on a phone: ${small.join('; ')}`).toEqual([]);
  });

  test('the Operator can work from a phone', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, operator, 'operator.html');

    // The Operator screens are the table-heavy ones, which is where a layout
    // breaks first: a data table has a natural width and no opinion about
    // whether it fits.
    const screens = ['overview', 'approvals', 'listings', 'mailbox', 'matches', 'activity', 'users'];
    const bad = [];

    for (const screen of screens) {
      await openScreen(page, screen);
      await page.waitForTimeout(1200);
      const overflow = await sidewaysOverflow(page);
      console.log(`  operator ${screen.padEnd(12)} sideways overflow ${overflow}px`);
      if (overflow > 2) bad.push(`${screen} (${overflow}px)`);
    }

    expect(bad, `these Operator screens scroll sideways on a phone: ${bad.join(', ')}`).toEqual([]);
  });

  test('the Operator can act on an enquiry from a phone', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');

    await expect
      .poll(async () => page.locator('#operator-mailbox-list .list-row').count(),
            { timeout: 25_000, message: 'the Operator mailbox never filled on a phone' })
      .toBeGreaterThan(0);

    // Forwarding is the Operator's core act - the one thing the platform
    // exists to do. If that button cannot be reached on a phone, the Operator
    // cannot work from one, whatever else renders.
    const forward = page.locator('#operator-mailbox-list [data-forward]').first();
    await expect(forward, 'the Forward button is not visible on a phone').toBeVisible();
    const box = await forward.boundingBox();
    expect(box.x, 'the Forward button starts off the left of the screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'the Forward button runs off the right of the screen')
      .toBeLessThanOrEqual(PHONE.width + 2);
    expect(box.height, `the Forward button is only ${Math.round(box.height)}px tall`)
      .toBeGreaterThanOrEqual(MIN_TAP_PX);
  });
});
