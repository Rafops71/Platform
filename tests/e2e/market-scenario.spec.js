// A small market: two sellers, two buyers, one Operator, two conversations
// running at the same time.
//
// Why this exists when mailbox-flow.spec.js already walks one brokered
// conversation end to end: it walks ONE. Every privacy assertion in it compares
// two people, so nothing in the suite could tell the difference between a
// mailbox that shows "your own threads" and one that shows "the most recent
// thread", or between forwarding to the right owner and forwarding to the only
// owner there was. With four participants and two live threads, picking the
// wrong one is visible.
//
// So the question here is not "does the brokered mailbox work" — that is
// proven elsewhere. It is: when several deals are in flight, does each one
// stay in its own lane.
//
// The listings are seeded over SQL rather than typed into the form. The form is
// already proven by Item14 and Item15; retyping it four times here would add
// about a minute to the run to re-prove someone else's test. The enquiries, the
// forwarding and every mailbox view go through the real screens, because those
// are what this file is about.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Distinctive names, so a "not visible" assertion that fails means a real leak
// and not an accidental word match against the page furniture.
const SELLER_ONE = { first_name: 'Thandeka', last_name: 'Brixmoor', company: 'Brixmoor Metals NV', phone: '+32471556001' };
const SELLER_TWO = { first_name: 'Casimiro', last_name: 'Valdenhoek', company: 'Valdenhoek Ores SA', phone: '+32471556002' };
const BUYER_ONE  = { first_name: 'Ndidi',     last_name: 'Fairweather', company: 'Fairweather Trading BV', phone: '+32471556003' };
const BUYER_TWO  = { first_name: 'Orsolya',   last_name: 'Kettlewick',  company: 'Kettlewick Resources', phone: '+32471556004' };

const LISTING_ONE = { ref: 'SELL-MKT-0001', commodity: 'Iron Ore',    origin: 'Chile' };
const LISTING_TWO = { ref: 'SELL-MKT-0002', commodity: 'Zinc Ingots', origin: 'Peru'  };

// Each enquiry names its own deal, so a thread appearing in the wrong mailbox
// is unmistakable rather than a judgement call.
const ENQUIRY_ONE = 'E2E market: Fairweather asks Brixmoor about the iron ore, 5000 mt, March laycan.';
const ENQUIRY_TWO = 'E2E market: Kettlewick asks Valdenhoek about the zinc ingots, 800 mt, prompt.';
const REPLY_ONE   = 'E2E market: Brixmoor can hold 5000 mt until the 20th.';

let operator, sellerOne, sellerTwo, buyerOne, buyerTwo;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();

  operator  = await createAccount({ label: 'mktop',  role: 'operator',    status: 'approved' });
  sellerOne = await createAccount({ label: 'mkts1',  role: 'participant', status: 'approved', meta: SELLER_ONE });
  sellerTwo = await createAccount({ label: 'mkts2',  role: 'participant', status: 'approved', meta: SELLER_TWO });
  buyerOne  = await createAccount({ label: 'mktb1',  role: 'participant', status: 'approved', meta: BUYER_ONE });
  buyerTwo  = await createAccount({ label: 'mktb2',  role: 'participant', status: 'approved', meta: BUYER_TWO });

  for (const [seller, listing] of [[sellerOne, LISTING_ONE], [sellerTwo, LISTING_TWO]]) {
    await query(
      `insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number, quantity, unit)
       values ($1, 'sell', $2, 'FOB', $3, $4, 5000, 'Metric tons')`,
      [seller.profileId, listing.commodity, listing.origin, listing.ref],
    );
  }
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial('a market with two deals in flight at once', () => {

  test('both listings are on Browse, and neither carries a name', async ({ page }) => {
    await signIn(page, buyerOne, 'app.html');
    await openScreen(page, 'browse');

    const results = page.locator('#browse-list');
    await expect(results).toContainText(LISTING_ONE.ref, { timeout: 15_000 });
    await expect(results).toContainText(LISTING_TWO.ref);

    // Four people are in this market now, so this is the version of the
    // anonymity check that could actually catch a leak: not "the one other
    // member is hidden" but "none of them appears".
    const shown = await results.innerText();
    for (const who of [SELLER_ONE, SELLER_TWO, BUYER_TWO]) {
      expect(shown).not.toContain(who.last_name);
      expect(shown).not.toContain(who.company);
    }
  });

  test('buyer one enquires about seller one, through the Operator', async ({ page }) => {
    await signIn(page, buyerOne, 'app.html');
    await openScreen(page, 'browse');

    await page.locator('#browse-list .list-row', { hasText: LISTING_ONE.ref })
      .locator('[data-contact]').click();
    await expect(page.locator('#contact-modal')).toBeVisible();
    await page.fill('#contact-body', ENQUIRY_ONE);
    await page.click('#contact-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [ENQUIRY_ONE]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
  });

  test('buyer two enquires about seller two, at the same time', async ({ page }) => {
    await signIn(page, buyerTwo, 'app.html');
    await openScreen(page, 'browse');

    await page.locator('#browse-list .list-row', { hasText: LISTING_TWO.ref })
      .locator('[data-contact]').click();
    await expect(page.locator('#contact-modal')).toBeVisible();
    await page.fill('#contact-body', ENQUIRY_TWO);
    await page.click('#contact-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [ENQUIRY_TWO]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
  });

  test('Item26 neither seller has been told anything yet', async ({ page }) => {
    // Two enquiries exist and two sellers are waiting. Until an Operator acts,
    // both mailboxes must be empty — this is the prohibition that makes the
    // platform brokered rather than a marketplace, and with two pending deals
    // a "forward to everyone" bug would show up here.
    for (const seller of [sellerOne, sellerTwo]) {
      await signIn(page, seller, 'app.html');
      await openScreen(page, 'mailbox');
      const mailbox = page.locator('#mailbox-list');
      await expect(mailbox).not.toContainText(ENQUIRY_ONE);
      await expect(mailbox).not.toContainText(ENQUIRY_TWO);
      await signOut(page);
    }
  });

  test('Item27 the Operator forwards only the first deal, to its own owner', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');

    const row = page.locator('#operator-mailbox-list .list-row', { hasText: ENQUIRY_ONE });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // The forward button carries the owner it would reach. With two owners in
    // play this is worth asserting before the click rather than after: it is
    // the difference between forwarding to the right seller and forwarding to
    // whichever seller happened to be last.
    expect(await row.locator('[data-forward]').getAttribute('data-owner')).toBe(sellerOne.profileId);

    await row.locator('[data-forward]').click();
    await expect(page.locator('#forward-modal')).toBeVisible();
    await page.click('#forward-confirm-btn');

    await expect.poll(async () => {
      const r = await query(
        `select count(*)::int n from public.message_forward_log mfl
          join public.messages m on m.id = mfl.message_id
         where m.body = $1 and mfl.to_user_id = $2`,
        [ENQUIRY_ONE, sellerOne.profileId],
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
  });

  test('Item30 seller one sees their own deal and nothing of the other', async ({ page }) => {
    await signIn(page, sellerOne, 'app.html');
    await openScreen(page, 'mailbox');

    const mailbox = page.locator('#mailbox-list');
    await expect(mailbox).toContainText(ENQUIRY_ONE, { timeout: 15_000 });
    await expect(mailbox).not.toContainText(ENQUIRY_TWO);
  });

  test('Item29 and seller one is told nothing about who is asking', async ({ page }) => {
    await signIn(page, sellerOne, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).toContainText(ENQUIRY_ONE, { timeout: 15_000 });

    // The whole page, not just the row: a leak in a header, a tooltip or a
    // debug line counts.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(BUYER_ONE.last_name);
    expect(body).not.toContain(BUYER_ONE.company);
    expect(body).not.toContain(BUYER_ONE.phone);
    expect(body).not.toContain(buyerOne.email);
  });

  test('Item30 seller two still has an empty mailbox', async ({ page }) => {
    // The second deal was never forwarded. Seller two must see neither their
    // own pending enquiry nor anybody else's.
    await signIn(page, sellerTwo, 'app.html');
    await openScreen(page, 'mailbox');

    const mailbox = page.locator('#mailbox-list');
    await expect(mailbox).not.toContainText(ENQUIRY_ONE);
    await expect(mailbox).not.toContainText(ENQUIRY_TWO);
  });

  test('Item30 buyer two cannot see the deal buyer one is doing', async ({ page }) => {
    await signIn(page, buyerTwo, 'app.html');
    await openScreen(page, 'mailbox');

    const mailbox = page.locator('#mailbox-list');
    await expect(mailbox).toContainText(ENQUIRY_TWO, { timeout: 15_000 });
    await expect(mailbox).not.toContainText(ENQUIRY_ONE);
    await expect(mailbox).not.toContainText(REPLY_ONE);
  });

  test('the reply comes back through the Operator, to the right buyer only', async ({ page }) => {
    await signIn(page, sellerOne, 'app.html');
    await openScreen(page, 'mailbox');
    await page.locator('#mailbox-list .list-row', { hasText: ENQUIRY_ONE })
      .locator('[data-reply]').click();
    await expect(page.locator('#contact-modal')).toBeVisible();
    await page.fill('#contact-body', REPLY_ONE);
    await page.click('#contact-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [REPLY_ONE]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    await signOut(page);

    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: REPLY_ONE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await row.locator('[data-forward]').getAttribute('data-owner')).toBe(buyerOne.profileId);
    await row.locator('[data-forward]').click();
    await expect(page.locator('#forward-modal')).toBeVisible();
    await page.click('#forward-confirm-btn');

    await expect.poll(async () => {
      const r = await query(
        `select count(*)::int n from public.message_forward_log mfl
          join public.messages m on m.id = mfl.message_id
         where m.body = $1 and mfl.to_user_id = $2`,
        [REPLY_ONE, buyerOne.profileId],
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
  });

  test('Item29 buyer one gets the reply and still does not learn the seller', async ({ page }) => {
    await signIn(page, buyerOne, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).toContainText(REPLY_ONE, { timeout: 15_000 });

    const body = await page.locator('body').innerText();
    expect(body).not.toContain(SELLER_ONE.last_name);
    expect(body).not.toContain(SELLER_ONE.company);
    expect(body).not.toContain(SELLER_ONE.phone);
    expect(body).not.toContain(sellerOne.email);

    // And nothing of the other market at all.
    expect(body).not.toContain(ENQUIRY_TWO);
    expect(body).not.toContain(SELLER_TWO.company);
    expect(body).not.toContain(BUYER_TWO.company);
  });

  test('Item45 no introduction was made that an Operator did not make', async () => {
    // Four participants, two deals, one of them never forwarded. Exactly two
    // forwards happened and both were the ones clicked above; the second
    // enquiry reached nobody. A matcher that introduced people on its own, or
    // a forward that fanned out, fails here.
    const { rows } = await query(
      `select count(*)::int n from public.message_forward_log mfl
        join public.messages m on m.id = mfl.message_id
       where m.body in ($1, $2, $3)`,
      [ENQUIRY_ONE, ENQUIRY_TWO, REPLY_ONE],
    );
    expect(rows[0].n).toBe(2);

    const { rows: unforwarded } = await query(
      `select count(*)::int n from public.message_forward_log mfl
        join public.messages m on m.id = mfl.message_id
       where m.body = $1`,
      [ENQUIRY_TWO],
    );
    expect(unforwarded[0].n).toBe(0);

    // Matches may be suggested; none may be acted on without an Operator.
    const { rows: matches } = await query(
      `select count(*)::int n from public.matches
        where status <> 'new' and (listing_a_id in (select id from public.listings where reference_number = any($1))
                                or listing_b_id in (select id from public.listings where reference_number = any($1)))`,
      [[LISTING_ONE.ref, LISTING_TWO.ref]],
    );
    expect(matches[0].n).toBe(0);
  });

  test('teardown removes the whole market, and the count is zero', async () => {
    await cleanup();

    const { rows } = await query(
      `select
         (select count(*)::int from public.messages where body in ($1, $2, $3)) messages,
         (select count(*)::int from public.listings where reference_number = any($4)) listings,
         (select count(*)::int from public.message_forward_log mfl
            where not exists (select 1 from public.messages m where m.id = mfl.message_id)) orphan_forwards`,
      [ENQUIRY_ONE, ENQUIRY_TWO, REPLY_ONE, [LISTING_ONE.ref, LISTING_TWO.ref]],
    );
    expect(rows[0]).toMatchObject({ messages: 0, listings: 0, orphan_forwards: 0 });
  });
});
