// Item78: the Operator cannot edit a message. A message with contact details is
// shown with them in red, cannot be forwarded, and the member is asked to
// rewrite it; the original is never delivered and stays in the Operator-only
// log. A clean message is forwarded unchanged.
//
// Written in the same change as the feature. It has NOT been run against the
// live project yet: the browser suite needs .env. Until it passes, the checklist
// row stays unproven.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const OWNER = { first_name: 'Item78', last_name: 'Ownerson', company: 'Ownerson Metals', phone: '+32471578001' };
const BUYER = { first_name: 'Item78', last_name: 'Buyerly', company: 'Buyerly Trading', phone: '+32471578002' };

const ORIGINAL = 'E2E item78 enquiry: call me on +32 471 578 999 or write to buyer78@example.com about the copper.';
const CLEAN = 'E2E item78 clean enquiry: is the copper available for March delivery?';
const REWRITE = 'Your message could not be forwarded because it contains contact details. Please send it again without them. All communication stays within MyPlatform until an introduction is made.';

let operator, owner, buyer, listingRef;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'i78op', role: 'operator', status: 'approved' });
  owner    = await createAccount({ label: 'i78ow', role: 'participant', status: 'approved', meta: OWNER });
  buyer    = await createAccount({ label: 'i78by', role: 'participant', status: 'approved', meta: BUYER });

  const { rows } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', 'Copper Cathodes', 100, 'Metric tons', 'FOB', 'Chile', 'available',
             public.next_reference('sell'))
     returning reference_number`,
    [owner.profileId]
  );
  listingRef = rows[0].reference_number;
  for (const body of [ORIGINAL, CLEAN]) {
    await query(
      `insert into public.messages (sender_id, listing_id, body, status)
       values ($1, (select id from public.listings where reference_number = $2), $3, 'pending_review')`,
      [buyer.profileId, listingRef, body]
    );
  }
});

test.afterAll(async () => { await cleanup(); });

test('Item78 a message with contact details is red, cannot be forwarded, and the member is asked to rewrite it', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'mailbox');

  const row = page.locator('#operator-mailbox-list .list-row', { hasText: ORIGINAL });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();

  // The Operator cannot edit the message.
  await expect(page.locator('#forward-edit')).toHaveAttribute('readonly', '');

  // The contact details are shown in red; Forward is disabled; the rewrite button appears.
  await expect(page.locator('#forward-preview mark.contact-flag')).toHaveCount(2);
  await expect(page.locator('#forward-confirm-btn')).toBeDisabled();
  await expect(page.locator('#forward-rewrite-btn')).toBeVisible();

  await page.click('#forward-rewrite-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });

  // The member receives exactly the fixed text, as a reply to the original.
  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.messages m
         join public.message_forward_log mfl on mfl.message_id = m.id
        where m.body = $1 and mfl.to_user_id = $2
          and m.in_reply_to = (select id from public.messages where body = $3)`,
      [REWRITE, buyer.profileId, ORIGINAL]
    );
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);

  // The original was never delivered to anyone, and is marked so it stays out.
  const { rows: delivered } = await query(
    `select count(*)::int n from public.message_forward_log mfl
       join public.messages m on m.id = mfl.message_id
      where m.body = $1`,
    [ORIGINAL]
  );
  expect(delivered[0].n).toBe(0);
  const { rows: status } = await query(
    `select status from public.messages where body = $1`, [ORIGINAL]
  );
  expect(status[0].status).toBe('ignored');

  // The Operator-only log holds the original body.
  const { rows: logged } = await query(
    `select count(*)::int n from public.activity_log
      where action = 'message_rewrite_requested' and details->>'original_body' = $1`,
    [ORIGINAL]
  );
  expect(logged[0].n).toBe(1);
});

test('Item78 a clean message is forwarded unchanged to the owner', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'mailbox');

  const row = page.locator('#operator-mailbox-list .list-row', { hasText: CLEAN });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();

  await expect(page.locator('#forward-preview mark.contact-flag')).toHaveCount(0);
  await expect(page.locator('#forward-confirm-btn')).toBeEnabled();
  await expect(page.locator('#forward-rewrite-btn')).toBeHidden();
  await page.click('#forward-confirm-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });

  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.message_forward_log mfl
         join public.messages m on m.id = mfl.message_id
        where m.body = $1 and mfl.to_user_id = $2`,
      [CLEAN, owner.profileId]
    );
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);
});
