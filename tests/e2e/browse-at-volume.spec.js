// The screens, with hundreds of listings on them.
//
// scripts/stress-test.js already proves the database holds up at volume, but
// it never opens a browser. That left a real gap: "Browse returns 2000 rows in
// 31ms" says nothing about whether the page renders them, filters them, or
// keeps them anonymous. This file is the part that uses the app.
//
// It matters here more than it would elsewhere, because of how Browse works.
// js/app.js calls get_public_listings() once, with no limit and no paging,
// filters the result IN THE BROWSER, and appends every matching row to the
// DOM. So the whole trading book travels to the client on every open and
// becomes that many elements. That is fine at ten listings and is exactly the
// shape that stops being fine at some number — and nobody knew what number,
// because nothing had ever looked.
//
// Two deliberate limits on what this does to the live project, since the
// browser suite has no local stand-in for Supabase Auth and must run there:
//
//   * A few hundred listings, not thousands. Enough to catch a page that
//     falls over; not enough to be a mess if a run dies halfway.
//   * Every listing is a sell offer, so the matcher finds no opposite-type
//     pair and generates nothing. Otherwise seeding would fire
//     generate_matches_for_listing() hundreds of times and leave tens of
//     thousands of notification rows on the owner's own database for a test
//     about rendering. Matching at volume is the stress test's job.
//
// Listings are also backdated. trg_limit_listing_rate counts a member's
// listings in the last hour and refuses the twenty-first, which is correct
// behaviour and would otherwise stop this file at twenty: rows dated weeks ago
// are outside the window, so the limit is respected rather than worked around.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query, connect } = require('../../scripts/db');

const VOLUME = Number(process.env.E2E_VOLUME_LISTINGS || 300);

// How long the page may take to put the rows on screen. Wide: a shared CI
// runner plus a round trip to eu-west-3 is nothing like a laptop. The number
// is printed on every run, so a regression is visible long before it fails.
const RENDER_BUDGET_MS = 25_000;

const SELLER = { first_name: 'Ingeborg', last_name: 'Thrushwaite', company: 'Thrushwaite Bulk NV', phone: '+32471557001' };
const WATCHER = { first_name: 'Teodoro',  last_name: 'Quillenbach', company: 'Quillenbach Trading', phone: '+32471557002' };

// The one commodity the filter narrows to, and roughly a fifth of the rows.
const FOCUS = 'Manganese Ore';

let operator, seller, watcher;

test.beforeAll(async () => {
  // Five minutes, not the file's sixty seconds. Seeding a few hundred listings
  // is not slow because anything is wrong: each one fires the audit trigger,
  // the Operator feed trigger and the email trigger, and that last one renders
  // a message per approved member. The work is the point - it is what a member
  // posting a listing actually costs - and it has to fit in the hook.
  test.setTimeout(300_000);

  assertConfigured();
  await cleanup();

  operator = await createAccount({ label: 'volop', role: 'operator', status: 'approved' });
  seller   = await createAccount({ label: 'volsell', role: 'participant', status: 'approved', meta: SELLER });
  watcher  = await createAccount({ label: 'volwatch', role: 'participant', status: 'approved', meta: WATCHER });

  // Seeded and swept in ONE transaction, deliberately.
  //
  // trg_queue_listing_emails puts a row in email_outbox for EVERY approved
  // member on EVERY new listing, and trg_notify_new_listing adds a row to
  // every Operator's feed. Seeding a few hundred listings therefore queues
  // well over a thousand emails addressed to real members of this live
  // project, and .github/workflows/send-emails.yml flushes that queue on a
  // schedule. A test must not be one unlucky overlap away from mailing the
  // owner fifteen hundred times.
  //
  // Doing both inside a transaction means those rows never exist to anything
  // outside it: the sender can never see them, whenever it happens to run.
  // The sweep has to be its own statement rather than a CTE, because these are
  // AFTER triggers and fire at the end of the statement that caused them - a
  // data-modifying CTE would delete rows that had not been written yet.
  const seeder = await connect();
  try {
    await seeder.query('begin');
    await seeder.query(
      `with c as (select name, row_number() over (order by name) rn from public.commodities),
            n as (select count(*)::int total from public.commodities)
       insert into public.listings
         (user_id, type, commodity, incoterm, origin, quantity, unit,
          reference_number, status, created_at, updated_at)
       select $1,
              'sell',
              case when g % 5 = 0 then $3 else c.name end,
              (array['FOB','CIF','CFR','DAP'])[1 + g % 4],
              (array['Chile','Peru','Brazil','Belgium','Spain'])[1 + g % 5],
              100 + (g % 900),
              'Metric tons',
              'VOL-' || lpad(g::text, 5, '0'),
              'available',
              now() - ((g % 60) + 2) * interval '1 day',
              now() - ((g % 60) + 2) * interval '1 day'
         from generate_series(1, $2) g
         cross join n
         join c on c.rn = 1 + (g % n.total)`,
      [seller.profileId, VOLUME, FOCUS],
    );

    await seeder.query(
      `delete from public.email_outbox
        where related_listing_id in (
          select id from public.listings where reference_number like 'VOL-%')`
    );
    await seeder.query(
      `delete from public.notifications
        where related_id in (
          select id from public.listings where reference_number like 'VOL-%')`
    );
    await seeder.query('commit');
  } catch (err) {
    await seeder.query('rollback');
    throw err;
  } finally {
    await seeder.end();
  }

  // Proven, not assumed: nothing is queued to anybody because of this fixture.
  const { rows: [queued] } = await query(
    `select
       (select count(*)::int from public.email_outbox
          where related_listing_id in (select id from public.listings where reference_number like 'VOL-%')) outbox,
       (select count(*)::int from public.notifications
          where related_id in (select id from public.listings where reference_number like 'VOL-%')) feed`
  );
  if (queued.outbox !== 0 || queued.feed !== 0) {
    throw new Error(
      `The volume fixture left ${queued.outbox} queued email(s) and ${queued.feed} ` +
      'feed notification(s) behind. It must leave none: the email queue is flushed ' +
      'on a schedule and these would be sent to real members.'
    );
  }
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial(`Browse with ${VOLUME} listings on it`, () => {

  test('the whole book renders, and the page shows what the database holds', async ({ page }) => {
    await signIn(page, watcher, 'app.html');

    const began = Date.now();
    await openScreen(page, 'browse');
    const rows = page.locator('#browse-list .list-row');
    await expect(rows.first()).toBeVisible({ timeout: RENDER_BUDGET_MS });

    // Every row, not just the first. Browse appends them all in one pass, so
    // waiting for the count to settle is waiting for the render to finish.
    const { rows: [{ n: expected }] } = await query(
      `select count(*)::int n from public.listings where status <> 'archived'`
    );
    await expect
      .poll(() => rows.count(), {
        timeout: RENDER_BUDGET_MS,
        message:
          `Browse never finished rendering. The database holds ${expected} ` +
          'non-archived listings and the page should show every one of them, ' +
          'because get_public_listings() has no limit and js/app.js appends ' +
          'all of them.',
      })
      .toBe(expected);
    const renderedIn = Date.now() - began;

    console.log(`\n    Browse: ${expected} listings on screen in ${renderedIn}ms\n`);
    expect(renderedIn, `Browse took ${renderedIn}ms to show ${expected} listings`)
      .toBeLessThan(RENDER_BUDGET_MS);
  });

  test('Item19 with hundreds of rows on screen, nobody is named', async ({ page }) => {
    // The prohibition that matters, asked where it is hardest to hold: one
    // leaked field in one row out of several hundred is still a leak, and
    // reading the whole page is the only way to find it.
    await signIn(page, watcher, 'app.html');
    await openScreen(page, 'browse');
    await expect(page.locator('#browse-list .list-row').first()).toBeVisible({ timeout: RENDER_BUDGET_MS });

    const body = await page.locator('body').innerText();
    for (const field of [SELLER.first_name, SELLER.last_name, SELLER.company, SELLER.phone, seller.email]) {
      expect(body, `Browse named the poster: "${field}" appeared on the page`).not.toContain(field);
    }
  });

  test('Item21 filtering to one commodity leaves exactly the right rows', async ({ page }) => {
    await signIn(page, watcher, 'app.html');
    await openScreen(page, 'browse');
    const rows = page.locator('#browse-list .list-row');
    await expect(rows.first()).toBeVisible({ timeout: RENDER_BUDGET_MS });

    const { rows: [{ n: expected }] } = await query(
      `select count(*)::int n from public.listings
        where status <> 'archived' and lower(commodity) = lower($1)`,
      [FOCUS]
    );
    expect(expected, `the fixture should have left several ${FOCUS} listings to filter to`)
      .toBeGreaterThan(5);

    const began = Date.now();
    await page.selectOption('#browse-filter-commodity', FOCUS);
    await page.click('#browse-refresh-btn');

    // The filter runs in the browser over every row fetched, so this is also
    // a measurement of that: narrowing should be quick even when the set it
    // narrows from is large.
    await expect
      .poll(() => rows.count(), {
        timeout: RENDER_BUDGET_MS,
        message: `filtering to ${FOCUS} should leave exactly the ${expected} listings the database has`,
      })
      .toBe(expected);
    console.log(`    Filter to ${FOCUS}: ${expected} of ${VOLUME}+ rows in ${Date.now() - began}ms`);

    // And the rows left really are that commodity — a filter that returns the
    // right NUMBER of wrong rows would otherwise pass.
    const titles = await page.locator('#browse-list .list-row-title').allTextContents();
    expect(titles.length).toBe(expected);
    for (const title of titles) expect(title).toContain(FOCUS);
  });

  test('a member with hundreds of their own listings can still read them', async ({ page }) => {
    // My Listings also renders every row, and additionally counts declared
    // documents per listing in chunks. This is the screen the seller lives on.
    await signIn(page, seller, 'app.html');

    const began = Date.now();
    await openScreen(page, 'my-listings');
    const rows = page.locator('#screen-my-listings .list-row');
    await expect(rows.first()).toBeVisible({ timeout: RENDER_BUDGET_MS });

    const { rows: [{ n: own }] } = await query(
      'select count(*)::int n from public.listings where user_id = $1', [seller.profileId]
    );
    await expect
      .poll(() => rows.count(), { timeout: RENDER_BUDGET_MS, message: 'My Listings never finished rendering' })
      .toBe(own);
    console.log(`    My Listings: ${own} of their own in ${Date.now() - began}ms`);
  });

  test('teardown removes every listing this file created', async () => {
    await cleanup();
    const { rows: [{ n }] } = await query(
      `select count(*)::int n from public.listings where reference_number like 'VOL-%'`
    );
    expect(n, 'the volume fixture must leave nothing behind on the live project').toBe(0);
  });
});
