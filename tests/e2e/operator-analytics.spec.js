// The Operator's Analytics tab: counts over time.
//
// Two things are worth testing here and the rest is a table. First, that the
// numbers on screen are the database's numbers - a dashboard that quietly
// computes its own totals is a second source of truth. Second, that a
// participant cannot get at them: these are platform-wide counts, which is the
// one figure nobody outside the Operators should be able to derive.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

let operator, participant;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'anaop', role: 'operator', status: 'approved' });
  participant = await createAccount({ label: 'anapart', role: 'participant', status: 'approved' });

  const { rows: listing } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', 'Analytics E2E Copper', 100, 'Metric tons', 'FOB', 'Chile',
             'available', public.next_reference('sell'))
     returning id`,
    [participant.profileId]
  );
  const { rows: message } = await query(
    `insert into public.messages (sender_id, listing_id, body, status)
     values ($1, $2, 'E2E analytics enquiry', 'pending_review') returning id`,
    [participant.profileId, listing[0].id]
  );
  // Reviewed and forwarded: one of each, so two of the five columns have
  // something this run put there.
  await query("update public.messages set status = 'forwarded' where id = $1", [message[0].id]);
  await query(
    `insert into public.message_forward_log (message_id, operator_id, to_user_id)
     values ($1, $2, $3)`,
    [message[0].id, operator.profileId, participant.profileId]
  );
});

test.afterAll(async () => { await cleanup(); });

async function openAnalytics(page) {
  await openScreen(page, 'analytics');
  await expect(page.locator('#analytics-table tbody tr').first())
    .not.toContainText('Loading', { timeout: 15_000 });
}

/** The totals row, as five numbers. */
async function shownTotals(page) {
  const cells = await page.locator('#analytics-table tfoot th').allInnerTexts();
  return cells.slice(1).map(Number);
}

test.describe.serial('operator analytics', () => {

  test('the tab shows one row per period, including quiet ones', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openAnalytics(page);

    await expect(page.locator('#analytics-table tbody tr')).toHaveCount(12);
    // A week with no activity is still a row: a gap would read as missing data
    // rather than as a quiet week.
    expect(await page.locator('#analytics-table tbody tr.row-quiet').count()).toBeGreaterThan(0);
  });

  test('the totals are the database totals', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openAnalytics(page);

    const [registrations, listings, reviewed, introductions, matches] = await shownTotals(page);
    const { rows } = await query(
      `select
         (select count(*)::int from public.profiles
           where created_at >= date_trunc('week', now()) - interval '11 weeks') as registrations,
         (select count(*)::int from public.listings
           where created_at >= date_trunc('week', now()) - interval '11 weeks') as listings,
         (select count(*)::int from public.messages
           where reviewed_at >= date_trunc('week', now()) - interval '11 weeks') as reviewed,
         (select count(*)::int from public.message_forward_log
           where sent_at >= date_trunc('week', now()) - interval '11 weeks') as introductions,
         (select count(*)::int from public.matches
           where reviewed_at >= date_trunc('week', now()) - interval '11 weeks') as matches`
    );
    expect(registrations).toBe(rows[0].registrations);
    expect(listings).toBe(rows[0].listings);
    expect(reviewed).toBe(rows[0].reviewed);
    expect(introductions).toBe(rows[0].introductions);
    expect(matches).toBe(rows[0].matches);

    // And this run actually put something in two of those columns, so the
    // agreement above is not two zeroes agreeing with each other.
    expect(reviewed).toBeGreaterThanOrEqual(1);
    expect(introductions).toBeGreaterThanOrEqual(1);
  });

  test('the period and bucket can be changed', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openAnalytics(page);

    await page.selectOption('#analytics-periods', '26');
    await expect(page.locator('#analytics-table tbody tr')).toHaveCount(26, { timeout: 15_000 });

    await page.selectOption('#analytics-bucket', 'month');
    await page.selectOption('#analytics-periods', '8');
    await expect(page.locator('#analytics-table tbody tr')).toHaveCount(8, { timeout: 15_000 });
    // Months are labelled as months rather than as a date, since a row covering
    // August is not an event on the 1st.
    await expect(page.locator('#analytics-table tbody tr').first()).toContainText(/[A-Za-z]{3,}/);
  });

  test('a participant cannot read the platform-wide counts', async ({ page }) => {
    await signIn(page, participant, 'app.html');

    // Asked directly, the way a tampered page would: the refusal has to be the
    // database's, since the participant dashboard simply has no such tab.
    const result = await page.evaluate(async () => {
      const { data, error } = await jericho.rpc('operator_analytics', { p_bucket: 'week', p_periods: 4 });
      return error ? `error: ${error.message}` : `rows: ${(data || []).length}`;
    });
    expect(result).toContain('Operators only');
  });

  test('the analytics tab writes nothing', async ({ page }) => {
    const before = await query('select count(*)::int n from public.activity_log');
    await signIn(page, operator, 'operator.html');
    await openAnalytics(page);
    await page.selectOption('#analytics-bucket', 'day');
    await expect(page.locator('#analytics-table tbody tr').first())
      .not.toContainText('Loading', { timeout: 15_000 });

    const after = await query('select count(*)::int n from public.activity_log');
    // Signing in logs one row; the tab itself is read-only.
    expect(after.rows[0].n - before.rows[0].n).toBeLessThanOrEqual(1);
  });
});
