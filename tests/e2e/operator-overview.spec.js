// The Operator's workload overview: five counts of work waiting, each a link
// to the screen where that work is done.
//
// The counts are asserted against the database rather than against fixed
// numbers, because this suite runs on the live project and the operator sees
// everything on it - a real pending registration would break a hardcoded 1.
// Each assertion therefore reads the tile and the equivalent SQL and requires
// them to agree, plus proves that the row this spec created is inside the
// count. A tile stuck at zero would satisfy neither.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn } = require('./helpers/session');
const { query } = require('../../scripts/db');

const STALE_DAYS = 30;

let operator, owner, enquirer;
let staleRef, freshRef, staleId, freshId;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();

  operator = await createAccount({ label: 'wlop', role: 'operator', status: 'approved' });
  owner = await createAccount({ label: 'wlowner', role: 'participant', status: 'approved' });
  enquirer = await createAccount({ label: 'wlenq', role: 'participant', status: 'approved' });
  // Never approved: this is the pending-registration the first tile counts.
  await createAccount({ label: 'wlpending', role: 'participant', status: 'pending' });

  // One listing untouched for longer than the stale window and one touched
  // today, so the stale count and its filtered table can be told apart.
  ({ id: staleId, reference_number: staleRef } = await insertListing(owner.profileId, 'E2E Workload Stale', 45, 40));
  ({ id: freshId, reference_number: freshRef } = await insertListing(owner.profileId, 'E2E Workload Fresh', 2, 0));

  await query(
    `insert into public.messages (sender_id, listing_id, subject, body, status)
     values ($1, $2, 'E2E workload enquiry', 'Is this still available?', 'pending_review')`,
    [enquirer.profileId, staleId]
  );
  await query(
    `insert into public.document_requests (listing_id, requester_id, participant_id, doc_type, status)
     values ($1, $2, $3, 'Certificate of Origin', 'requested')`,
    [staleId, operator.profileId, owner.profileId]
  );
  await query(
    `insert into public.matches (listing_a_id, listing_b_id, score, status)
     values ($1, $2, 'high', 'new')`,
    [staleId, freshId]
  );
});

test.afterAll(async () => { await cleanup(); });

/** A listing owned by `profileId`, created `createdDays` ago and last updated
 *  `updatedDays` ago. Inserted directly: the trigger that maintains
 *  updated_at fires on UPDATE only, so a backdated row stays backdated. */
async function insertListing(profileId, commodity, createdDays, updatedDays) {
  const { rows } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status,
        reference_number, created_at, updated_at)
     values ($1, 'sell', $2, 500, 'Metric tons', 'FOB', 'Chile', 'available',
             public.next_reference('sell'),
             now() - ($3 || ' days')::interval, now() - ($4 || ' days')::interval)
     returning id, reference_number`,
    [profileId, commodity, createdDays, updatedDays]
  );
  return rows[0];
}

/** The number showing on one tile, once it has stopped being a placeholder. */
async function tileValue(page, id) {
  const value = page.locator(`#stat-${id}-value`);
  await expect(value).not.toHaveText('—', { timeout: 15_000 });
  return Number(await value.innerText());
}

async function count(sql, params = []) {
  const { rows } = await query(sql, params);
  return Number(rows[0].n);
}

test.describe.serial('operator workload overview', () => {

  test('the overview is the screen an operator lands on', async ({ page }) => {
    await signIn(page, operator, 'operator.html');

    await expect(page.locator('#screen-overview')).toBeVisible();
    await expect(page.locator('nav.tabs button[data-screen="overview"]')).toHaveClass(/active/);
    await expect(page.locator('.stat-tile')).toHaveCount(5);
    await expect(page.locator('#overview-updated')).toContainText('Updated');
  });

  test('every count agrees with the database and includes this run', async ({ page }) => {
    await signIn(page, operator, 'operator.html');

    const pending = await count(
      "select count(*)::int n from public.profiles where status = 'pending'");
    expect(await tileValue(page, 'approvals')).toBe(pending);
    expect(pending).toBeGreaterThanOrEqual(1);

    const messages = await count(
      "select count(*)::int n from public.messages where status = 'pending_review'");
    expect(await tileValue(page, 'messages')).toBe(messages);
    expect(messages).toBeGreaterThanOrEqual(1);

    const docs = await count(
      "select count(*)::int n from public.document_requests where status = 'requested'");
    expect(await tileValue(page, 'doc-requests')).toBe(docs);
    expect(docs).toBeGreaterThanOrEqual(1);

    const matches = await count(
      "select count(*)::int n from public.matches where status = 'new'");
    expect(await tileValue(page, 'matches')).toBe(matches);
    expect(matches).toBeGreaterThanOrEqual(1);

    const stale = await count(
      `select count(*)::int n from public.listings
        where status = 'available' and updated_at < now() - ($1 || ' days')::interval`,
      [STALE_DAYS]
    );
    expect(await tileValue(page, 'stale')).toBe(stale);
    expect(stale).toBeGreaterThanOrEqual(1);
  });

  test('the pending-registration count also drives the Approvals tab dot', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    // A pending registration exists, so the dot is showing before the
    // Approvals tab has ever been opened - which is the point of setting it
    // from the overview rather than from loadApprovals().
    await expect(page.locator('#approvals-dot')).toBeVisible({ timeout: 15_000 });
  });

  test('each tile opens the screen where that work is done', async ({ page }) => {
    await signIn(page, operator, 'operator.html');

    for (const [tile, screen] of [
      ['approvals', 'approvals'],
      ['messages', 'mailbox'],
      ['doc-requests', 'doc-requests'],
      ['matches', 'matches'],
      ['stale', 'listings'],
    ]) {
      await page.click(`#stat-${tile}`);
      await expect(page.locator(`#screen-${screen}`)).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(`nav.tabs button[data-screen="${screen}"]`)).toHaveClass(/active/);
      await page.click('nav.tabs button[data-screen="overview"]');
      await expect(page.locator('#screen-overview')).toBeVisible();
    }
  });

  test('the stale tile shows the listings it counted, and nothing fresher', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await page.click('#stat-stale');

    const table = page.locator('#listings-table');
    await expect(page.locator('#listing-stale-note')).toBeVisible();
    await expect(table).toContainText(staleRef, { timeout: 15_000 });
    // The count promised listings not updated in 30 days. A listing updated
    // today appearing here would mean the table and the number disagree.
    await expect(table).not.toContainText(freshRef);

    // "Show all" drops the filter rather than merely hiding the note.
    await page.click('#listing-stale-clear');
    await expect(page.locator('#listing-stale-note')).toBeHidden();
    await expect(table).toContainText(freshRef, { timeout: 15_000 });
  });

  test('searching by hand drops the stale filter', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await page.click('#stat-stale');
    await expect(page.locator('#listing-stale-note')).toBeVisible();

    // The operator filtering the screen themselves overrides where they came
    // from; leaving the tile's hidden predicate in place would silently
    // subtract rows from every search they then run.
    await page.click('#listing-search-btn');
    await expect(page.locator('#listing-stale-note')).toBeHidden();
    await expect(page.locator('#listings-table')).toContainText(freshRef, { timeout: 15_000 });
  });

  test('the overview writes nothing', async ({ page }) => {
    const before = await count('select count(*)::int n from public.activity_log');
    await signIn(page, operator, 'operator.html');
    await tileValue(page, 'approvals');
    await page.click('#overview-refresh-btn');
    await tileValue(page, 'approvals');

    // Signing in logs one row. Beyond that the overview is read-only, so
    // rendering and refreshing it must add nothing of its own.
    const after = await count('select count(*)::int n from public.activity_log');
    expect(after - before).toBeLessThanOrEqual(1);
  });
});
