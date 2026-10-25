// Deal files in the Operator console (sql/035). The database half - who can
// see, what cannot be deleted, how history is kept - is sql/tests/21.

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Item74 reads what Item70 recorded, so the two run in order.
test.describe.configure({ mode: 'serial' });

let operator, owner, buyer, listingRef;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'dealop', role: 'operator', status: 'approved' });
  owner    = await createAccount({ label: 'dealowner', role: 'participant', status: 'approved' });
  buyer    = await createAccount({ label: 'dealbuyer', role: 'participant', status: 'approved' });

  // A listing, an enquiry about it, and the Operator's forward - the step
  // that opens the file. Written directly: the forwarding screen is covered
  // by Item27, and this test is about what happens after.
  listingRef = `SELL-E2E-DEAL-${Date.now()}`;
  const { rows: [l] } = await query(
    `insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
     values ($1, 'sell', 'Iron Ore', 'FOB', 'Chile', $2) returning id`, [owner.profileId, listingRef]);
  const { rows: [m] } = await query(
    `insert into public.messages (sender_id, listing_id, subject, body)
     values ($1, $2, 'Price?', 'E2E deal enquiry') returning id`, [buyer.profileId, l.id]);
  await query(
    `insert into public.message_forward_log (message_id, operator_id, to_user_id) values ($1, $2, $3)`,
    [m.id, operator.profileId, owner.profileId]);
});

test.afterAll(async () => { await cleanup(); });

test('Item70 a forwarded negotiation appears as a deal file the Operator can move on and record', async ({ page }) => {
  const { rows: [deal] } = await query('select id, stage from public.deals where listing_ref = $1', [listingRef]);
  expect(deal, 'forwarding the enquiry opened no deal file').toBeTruthy();
  expect(deal.stage).toBe('negotiating');

  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'deals');
  const row = page.locator(`[data-deal-row="${deal.id}"]`);
  await expect(row).toContainText(listingRef, { timeout: 15_000 });

  await row.locator('select[data-deal-field="stage"]').selectOption('agreed');
  await row.locator('select[data-deal-field="docs_match"]').selectOption('never_arrived');
  await row.locator('textarea[data-deal-field="note"]').fill('B/L promised, not sent');
  await row.locator('[data-save-deal]').click();

  await expect.poll(async () => {
    const { rows: [d] } = await query('select stage, agreed_at, docs_match, note from public.deals where id = $1', [deal.id]);
    return d && d.stage === 'agreed' && d.agreed_at !== null && d.docs_match === 'never_arrived' && d.note === 'B/L promised, not sent';
  }, { timeout: 20_000 }).toBe(true);

  const fresh = page.locator(`[data-deal-row="${deal.id}"]`);
  await fresh.locator('[data-deal-history]').click();
  await expect(page.locator(`[data-history-for="${deal.id}"]`)).toContainText('docs_match — → never_arrived');
});

test('Item74 the scorecard shows the counts recorded in the deal file, by side', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'scorecard');
  // The Item70 test above recorded one file with Owner as poster and
  // "never arrived" for its documents.
  const row = page.locator(`[data-scorecard-for="${owner.profileId}"]`);
  await expect(row.locator('[data-label="Deals"]')).toHaveText('1 / 0', { timeout: 15_000 });
  await expect(row.locator('[data-label="Docs"]')).toHaveText('0 / 0 / 1');
});

test('Item75 Analytics counts deal files by stage, beside the message counts', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'analytics');
  // The Item70 test moved this run's file to "agreed".
  const agreed = page.locator('#deal-analytics-table [data-deal-total="agreed"]');
  await expect(agreed).not.toHaveText('0', { timeout: 15_000 });
  await expect(page.locator('#analytics-table thead')).toContainText('Messages forwarded');
});
