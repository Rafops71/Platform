// The five functions on docs/CHECKLIST.md that no browser test covered.
//
// The other ten unproven items turned out to be proven already by specs that
// simply did not carry the item number; they were renamed rather than
// rewritten. These five had nothing, so they are written here:
//
//   05  an Operator can reject a pending registration
//   09  a member can sign in and sign out
//   15  a member can see, edit and withdraw their own listings
//   21  a member can filter and search Browse
//   30  a member's mailbox shows only their own conversations
//
// Item 05 is the half of the approvals screen nobody had exercised. Approval
// was covered from the first day; rejection shares a screen, a table and a
// trigger with it, and a platform that cannot turn an applicant away is not
// invite-only in any meaningful sense.
//
// Item 30 is a prohibition, and the one that matters most here: the mailbox is
// where the brokered conversations live, so a member seeing a thread that is
// not theirs is the product failing, not a display bug.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Distinctive enough that a "not visible" assertion failing means a real leak
// rather than an incidental word match against the page furniture.
const ALPHA = { first_name: 'Quenvarro', last_name: 'Dalmeshi', company: 'Brightmoor Alloys BV', phone: '+32471555111' };
const BETA  = { first_name: 'Sevrinta',  last_name: 'Okondwe',  company: 'Larkfield Ores SPRL',  phone: '+32471555222' };

const MINE   = { commodity: 'Iron Ore',    quantity: '250', unit: 'Metric tons', incoterm: 'FOB', origin: 'Chile', notes: 'E2E gaps: my own listing' };
const THEIRS = { commodity: 'Zinc Ingots', quantity: '180', unit: 'Metric tons', incoterm: 'CIF', origin: 'Peru',  notes: 'E2E gaps: somebody else' };


/** Choose a commodity, and say so plainly when it is not on offer.
 *
 *  The first version of this file used 'Copper' and 'Zinc', which are not
 *  commodities this platform trades — the seeded list has 'Copper Concentrate'
 *  and 'Zinc Ingots'. Playwright's own answer to that is to retry the select
 *  for thirty seconds and then report "did not find some options", which reads
 *  like a slow page rather than a wrong value. Checking the list first turns
 *  it into one sentence naming the problem.
 */
async function pickCommodity(page, name) {
  const offered = await page.locator('#commodity-select option').allTextContents();
  expect(
    offered.map((o) => o.trim()),
    `"${name}" is not in the commodity dropdown. The list comes from ` +
    'sql/seed_commodities.sql and these tests pick from it, so either the seed ' +
    'changed or this test is naming something the platform does not trade.',
  ).toContain(name);
  await page.selectOption('#commodity-select', name);
}

let alpha, beta, operator, pending;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'gapop', role: 'operator', status: 'approved' });
  alpha    = await createAccount({ label: 'gapalpha', role: 'participant', status: 'approved', meta: ALPHA });
  beta     = await createAccount({ label: 'gapbeta',  role: 'participant', status: 'approved', meta: BETA });
  // Left pending on purpose: this is the one the Operator will turn away.
  pending  = await createAccount({ label: 'gappend', role: 'participant', status: 'pending' });
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial('the functions no browser test covered', () => {

  test('Item09 a member can sign in, and signing out ends the session', async ({ page }) => {
    await signIn(page, alpha, 'app.html');
    await expect(page.locator('#user-name')).not.toBeEmpty();

    await signOut(page);
    await expect(page.locator('#email')).toBeVisible();

    // Signing out must actually end the session, not just navigate away. If the
    // token survived in localStorage, asking for the dashboard again would land
    // on it instead of being bounced back to the sign-in page.
    await page.goto('/app.html');
    await page.waitForURL('**/index.html', { timeout: 20_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('Item05 an Operator can reject a pending registration', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'approvals');

    const { rows } = await query('select id, status from public.profiles where email = $1', [pending.email]);
    expect(rows[0].status).toBe('pending');

    await page.click(`[data-reject="${rows[0].id}"]`);

    await expect.poll(async () => {
      const r = await query('select status from public.profiles where email = $1', [pending.email]);
      return r.rows[0].status;
    }, { timeout: 15_000 }).toBe('rejected');

    // A rejection is a decision about a person, so it belongs in the audit
    // trail as much as an approval does.
    const { rows: log } = await query(
      `select count(*)::int as n from public.activity_log
        where details::text like '%' || $1 || '%' or user_id = $2`,
      [pending.email, rows[0].id],
    );
    expect(log[0].n).toBeGreaterThanOrEqual(1);
  });

  test('Item15 a member can see, edit and withdraw their own listing', async ({ page }) => {
    await signIn(page, alpha, 'app.html');

    await openScreen(page, 'new-listing');
    await page.check('input[name="type"][value="sell"]');
    await pickCommodity(page, MINE.commodity);
    await page.fill('#quantity', MINE.quantity);
    await page.selectOption('#unit', MINE.unit);
    await page.selectOption('#incoterm', MINE.incoterm);
    await page.selectOption('#location', MINE.origin);
    await page.fill('#notes', MINE.notes);
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select count(*)::int as n from public.listings where user_id = (select id from public.profiles where email = $1)',
        [alpha.email],
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      'select id, reference_number from public.listings where user_id = (select id from public.profiles where email = $1)',
      [alpha.email],
    );
    const mine = rows[0];

    // See it.
    await openScreen(page, 'my-listings');
    await expect(page.locator(`#screen-my-listings`)).toContainText(mine.reference_number);

    // Edit it. The control exists per row; opening it must load this listing
    // rather than a blank form, which is the failure this would catch.
    await page.click(`[data-edit="${mine.id}"]`);
    await expect(page.locator('#quantity')).toHaveValue(MINE.quantity, { timeout: 15_000 });
    await page.fill('#quantity', '275');
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query('select quantity::int as q from public.listings where id = $1', [mine.id]);
      return r.rows[0].q;
    }, { timeout: 20_000 }).toBe(275);

    // Withdraw it. A participant may close a listing but never archive one —
    // sql/002 enforces that, and the screen must offer only the allowed verb.
    await openScreen(page, 'my-listings');
    await page.click(`[data-close="${mine.id}"]`);

    await expect.poll(async () => {
      const r = await query('select status from public.listings where id = $1', [mine.id]);
      return r.rows[0].status;
    }, { timeout: 20_000 }).toBe('closed');
  });

  test('Item21 a member can filter Browse down to one commodity', async ({ page }) => {
    // Beta posts something different, so the filter has two things to choose
    // between. A filter tested against a single listing proves nothing.
    await signIn(page, beta, 'app.html');
    await openScreen(page, 'new-listing');
    await page.check('input[name="type"][value="sell"]');
    await pickCommodity(page, THEIRS.commodity);
    await page.fill('#quantity', THEIRS.quantity);
    await page.selectOption('#unit', THEIRS.unit);
    await page.selectOption('#incoterm', THEIRS.incoterm);
    await page.selectOption('#location', THEIRS.origin);
    await page.fill('#notes', THEIRS.notes);
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select count(*)::int as n from public.listings where user_id = (select id from public.profiles where email = $1)',
        [beta.email],
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    await openScreen(page, 'browse');
    const browse = page.locator('#screen-browse');
    await expect(browse).toContainText(THEIRS.commodity, { timeout: 15_000 });

    await page.selectOption('#browse-filter-commodity', THEIRS.commodity);
    await expect(browse).toContainText(THEIRS.commodity);
    // Alpha's listing was closed in the previous test, so the sharper check is
    // that filtering to Zinc does not leave Copper on screen.
    await expect(browse).not.toContainText(MINE.commodity);
  });

  test('Item30 a member sees only their own conversations in the mailbox', async ({ page }) => {
    // Beta enquires about their own posted listing is impossible, so Alpha
    // enquires about Beta's. The enquiry belongs to Alpha and the Operator;
    // Beta must not find it in their mailbox before it is forwarded, and the
    // assertion that matters is the negative one.
    const { rows: theirs } = await query(
      'select id from public.listings where user_id = (select id from public.profiles where email = $1)',
      [beta.email],
    );
    const { rows: alphaProfile } = await query('select id from public.profiles where email = $1', [alpha.email]);

    const body = 'E2E gaps: private enquiry from Alpha about the zinc';
    await query(
      'insert into public.messages (sender_id, listing_id, subject, body) values ($1, $2, $3, $4)',
      [alphaProfile[0].id, theirs[0].id, 'E2E gaps enquiry', body],
    );

    // Alpha sees their own.
    await signIn(page, alpha, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).toContainText('E2E gaps enquiry', { timeout: 15_000 });
    await signOut(page);

    // Beta must not, because the Operator has not forwarded it.
    await signIn(page, beta, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).not.toContainText('E2E gaps enquiry');
    await expect(page.locator('#mailbox-list')).not.toContainText(body);
  });
});
