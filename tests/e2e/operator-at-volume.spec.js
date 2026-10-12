// The OPERATOR's screens, with hundreds of rows on them.
//
// The missing half. tests/e2e/browse-at-volume.spec.js opens a browser at
// volume but signs in to app.html every time - the member's side. No test had
// ever opened operator.html with more than a handful of rows on it, and the
// owner was the one who noticed: "so you are stresstesting it all from
// operator side as well client side?" No. Only one side, and the side with
// less data on it.
//
// That gap is where the worst thing found on 2026-10-12 was living. His
// Notifications feed held 4,776 rows and nothing had ever rendered it.
//
// It matters more here than on the member's side, because the Operator screens
// are the ones that load everything. loadOperatorMailbox() carries a comment
// saying so: every message, no limit, no paging. loadUsers() and
// loadMatches() are the same shape. loadActivityLog() at least caps itself at
// 200. At ten rows all four are instant; at a thousand nobody knew, because
// nobody had looked.
//
// What this measures is what an Operator would actually experience: does the
// screen render at all, does it hold the rows the database holds, and how long
// does it take. Every timing is printed, so a regression shows up long before
// it crosses a budget.
//
// Three deliberate limits on what this does to the live project:
//
//   * Hundreds, not thousands. Enough to catch a page that falls over; small
//     enough to be a tolerable mess if a run dies halfway.
//   * Every listing is a sell offer, so generate_matches_for_listing() finds
//     no opposite-type pair and writes nothing. Matches are seeded directly
//     instead, in a known quantity.
//   * The notifications this seeds are addressed to the TEST operator, never
//     to a real one. That is the whole reason the owner's feed filled up:
//     notifications cascade from the profile they are addressed TO, so a row
//     aimed at a real Operator outlives the fixture that caused it. Aimed at
//     the test operator, it leaves with them.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query, connect } = require('../../scripts/db');

const LISTINGS = Number(process.env.E2E_OP_LISTINGS || 300);
const MESSAGES = Number(process.env.E2E_OP_MESSAGES || 250);
const FEED = Number(process.env.E2E_OP_FEED || 400);

// Wide on purpose: a shared CI runner plus a round trip to eu-west-3 is
// nothing like a laptop. The point is to catch a screen that never finishes,
// not to police milliseconds. Every number is printed either way.
const RENDER_BUDGET_MS = 30_000;

const OPERATOR = { first_name: 'Hedda',   last_name: 'Vossbrink',  company: 'Jericho Desk',        phone: '+32471558001' };
const SELLER   = { first_name: 'Anselm',  last_name: 'Krogsgaard', company: 'Krogsgaard Minerals', phone: '+32471558002' };
const BUYER    = { first_name: 'Marisol', last_name: 'Etcheverry', company: 'Etcheverry SA',       phone: '+32471558003' };

let operator, seller, buyer;

/** Run a screen open and report how long the rows took to appear. */
async function timeScreen(page, screen, rowSelector, atLeast) {
  const started = Date.now();
  await openScreen(page, screen);
  await expect
    .poll(async () => page.locator(rowSelector).count(), {
      timeout: RENDER_BUDGET_MS,
      message: `${screen}: expected at least ${atLeast} rows on screen`,
    })
    .toBeGreaterThanOrEqual(atLeast);
  const ms = Date.now() - started;
  const shown = await page.locator(rowSelector).count();
  console.log(`  ${String(ms).padStart(6)}ms  ${screen.padEnd(14)} ${shown} rows`);
  return { ms, shown };
}

test.beforeAll(async () => {
  // Seeding fires the audit, feed and email triggers on every row. That work
  // IS the cost of the thing being measured, so it has to fit in the hook.
  test.setTimeout(420_000);

  assertConfigured();
  await cleanup();

  operator = await createAccount({ label: 'opvol', role: 'operator',    status: 'approved', meta: OPERATOR });
  seller   = await createAccount({ label: 'opsell', role: 'participant', status: 'approved', meta: SELLER });
  buyer    = await createAccount({ label: 'opbuy',  role: 'participant', status: 'approved', meta: BUYER });

  // One transaction, for the same reason browse-at-volume uses one: these
  // triggers queue mail to every approved member of the LIVE project, and
  // send-emails.yml flushes that queue on a schedule. Inside a transaction
  // those rows never exist to anything outside it, whenever the sender runs.
  // The sweep is a separate statement because AFTER triggers fire at the end
  // of the statement that caused them - a data-modifying CTE would try to
  // delete rows that had not been written yet.
  const seeder = await connect();
  try {
    await seeder.query('begin');

    await seeder.query(
      `with c as (select name, row_number() over (order by name) rn from public.commodities),
            n as (select count(*)::int total from public.commodities)
       insert into public.listings
         (user_id, type, commodity, incoterm, origin, quantity, unit,
          reference_number, status, created_at, updated_at)
       select $1, 'sell',
              c.name,
              (array['FOB','CIF','CFR','DAP'])[1 + g % 4],
              (array['Chile','Peru','Brazil','Belgium','Spain'])[1 + g % 5],
              100 + (g % 900), 'Metric tons',
              'OPV-' || lpad(g::text, 5, '0'),
              'available',
              now() - ((g % 60) + 2) * interval '1 day',
              now() - ((g % 60) + 2) * interval '1 day'
         from generate_series(1, $2) g
         cross join n
         join c on c.rn = 1 + (g % n.total)`,
      [seller.profileId, LISTINGS],
    );

    // The Operator mailbox is the unbounded one: every message, no paging.
    // Enquiries from the buyer, awaiting review, which is what the screen is
    // for. The rate limit counts the last hour, so these are backdated for the
    // same reason the listings are - respected, not bypassed.
    await seeder.query(
      `insert into public.messages (sender_id, listing_id, body, status, created_at)
       select $1,
              (select id from public.listings
                where reference_number = 'OPV-' || lpad((1 + (g % $3))::text, 5, '0')),
              'Volume enquiry ' || g || ' — please pass this to the seller.',
              'pending_review',
              now() - ((g % 48) + 2) * interval '1 hour'
         from generate_series(1, $2) g`,
      [buyer.profileId, MESSAGES, LISTINGS],
    );

    // Matches, seeded directly rather than provoked: every listing above is a
    // sell offer, so the matcher finds no opposite-type pair and writes
    // nothing of its own. A known quantity beats an emergent one.
    //
    // score is NOT NULL with no default and a check constraint of
    // high/medium/low - read from the live catalog rather than assumed, after
    // the first draft of this file left it out and would have failed on its
    // first run.
    await seeder.query(
      `insert into public.matches (listing_a_id, listing_b_id, score, status, created_at)
       select a.id, b.id,
              (array['high','medium','low'])[1 + g % 3],
              'new', now() - (g % 30) * interval '1 day'
         from generate_series(1, 120) g
         join public.listings a on a.reference_number = 'OPV-' || lpad(g::text, 5, '0')
         join public.listings b on b.reference_number = 'OPV-' || lpad((g + 120)::text, 5, '0')`
    );

    // The feed, addressed to the TEST operator. This is the screen nobody had
    // ever rendered at size, and the rows leave with the account they are
    // addressed to.
    await seeder.query(
      `insert into public.notifications (user_id, type, message, related_id, created_at)
       select $1, 'new_listing',
              'Volume feed entry ' || g,
              (select id from public.listings
                where reference_number = 'OPV-' || lpad((1 + (g % $3))::text, 5, '0')),
              now() - (g % 72) * interval '1 hour'
         from generate_series(1, $2) g`,
      [operator.profileId, FEED, LISTINGS],
    );

    // Everything the triggers queued or fed while the above ran.
    await seeder.query(
      `delete from public.email_outbox
        where related_listing_id in (
          select id from public.listings where reference_number like 'OPV-%')`
    );
    await seeder.query(
      `delete from public.notifications
        where related_id in (
          select id from public.listings where reference_number like 'OPV-%')
          and user_id <> $1`,
      [operator.profileId]
    );
    await seeder.query('commit');
  } catch (err) {
    await seeder.query('rollback');
    throw err;
  } finally {
    await seeder.end();
  }

  // Proven, not assumed: this fixture has queued mail to nobody, and has put
  // nothing in any real Operator's feed.
  const { rows: [leak] } = await query(
    `select
       (select count(*)::int from public.email_outbox
          where related_listing_id in (select id from public.listings where reference_number like 'OPV-%')) outbox,
       (select count(*)::int from public.notifications n
          join public.profiles p on p.id = n.user_id
         where n.related_id in (select id from public.listings where reference_number like 'OPV-%')
           and p.email not like 'jericho-e2e-%') real_feeds`
  );
  expect(leak.outbox, 'the fixture must queue mail to nobody').toBe(0);
  expect(leak.real_feeds, 'the fixture must not reach a real Operator feed').toBe(0);

  console.log(`\n  seeded ${LISTINGS} listings, ${MESSAGES} messages, 120 matches, ${FEED} feed rows\n`);
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial('the Operator screens at volume', () => {

  test('every screen renders its rows, and says how long it took', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, operator, 'operator.html');

    console.log('\n  Operator screens:');

    // Listings: loads every listing the Operator can see, then filters in the
    // browser. The same shape as member Browse, with no limit.
    const listings = await timeScreen(page, 'listings', '#listings-table tbody tr', LISTINGS);

    // The mailbox is the unbounded one, and the one its own comment warns
    // about. Each row also resolves a reference number and an owner, batched.
    const mailbox = await timeScreen(page, 'mailbox', '#operator-mailbox-list .list-row', MESSAGES);

    // Matches: two listing lookups per row, batched.
    const matches = await timeScreen(page, 'matches', '#matches-list .list-row', 120);

    // The activity log caps itself at 200, so this proves the cap holds rather
    // than that everything renders.
    const activity = await timeScreen(page, 'activity', '#activity-list .list-row', 1);
    expect(activity.shown, 'the activity log must honour its own 200-row cap').toBeLessThanOrEqual(200);

    // Users and approvals are small here by nature; opening them proves they
    // survive a database this size rather than measuring a long list.
    await timeScreen(page, 'users', '#users-list .list-row', 3);

    for (const [name, r] of [['listings', listings], ['mailbox', mailbox], ['matches', matches]]) {
      expect(r.ms, `${name} took ${r.ms}ms, over the ${RENDER_BUDGET_MS}ms budget`)
        .toBeLessThan(RENDER_BUDGET_MS);
    }
  });

  test('the listings screen holds every listing the database holds', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');

    const { rows: [db] } = await query(
      `select count(*)::int n from public.listings where reference_number like 'OPV-%'`
    );
    await expect
      .poll(async () => page.locator('#listings-table tbody tr').count(),
            { timeout: RENDER_BUDGET_MS, message: 'the listings table never filled' })
      .toBeGreaterThanOrEqual(db.n);
  });

  test('the overview counts agree with the database at this size', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'overview');

    // The tile the Operator acts on: messages waiting to be reviewed.
    const { rows: [db] } = await query(
      `select count(*)::int n from public.messages where status = 'pending_review'`
    );
    await expect
      .poll(async () => {
        const text = await page.locator('#stat-messages-value').textContent();
        return Number((text || '').trim());
      }, { timeout: RENDER_BUDGET_MS, message: 'the messages tile never settled' })
      .toBe(db.n);
  });

  test('no member is named on a screen that should not name them', async ({ page }) => {
    test.setTimeout(180_000);
    // The Operator may see everybody by design, so the prohibition is checked
    // where it applies: the BUYER's own screens, with the same volume behind
    // them. Hundreds of rows is exactly where a leak would hide.
    await signIn(page, buyer, 'app.html');
    await openScreen(page, 'browse');
    await expect
      .poll(async () => page.locator('#browse-list .list-row').count(),
            { timeout: RENDER_BUDGET_MS, message: 'Browse never filled' })
      .toBeGreaterThan(50);

    const screen = await page.locator('#screen-browse').innerText();
    for (const naming of [SELLER.first_name, SELLER.last_name, SELLER.company]) {
      expect(screen, `Browse named the seller: ${naming}`).not.toContain(naming);
    }
  });
});
