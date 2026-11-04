// Item78: an Operator may edit a message before forwarding it. Contact details
// are highlighted in red and block the forward until removed. The owner gets
// only the edited text; the original stays in the Operator-only activity log.
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
const EDITED = 'E2E item78 enquiry: interested in the copper, please reply through the Operator.';

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
  await query(
    `insert into public.messages (sender_id, listing_id, body, status)
     values ($1, (select id from public.listings where reference_number = $2), $3, 'pending_review')`,
    [buyer.profileId, listingRef, ORIGINAL]
  );
});

test('Item78 an edited forward reaches the owner as the edited text only, and the original is logged', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'mailbox');

  const row = page.locator('#operator-mailbox-list .list-row', { hasText: ORIGINAL });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();

  // The contact details are shown in red, and the forward is refused while they remain.
  await expect(page.locator('#forward-preview mark.contact-flag')).toHaveCount(2);
  await page.click('#forward-confirm-btn');
  await expect(page.locator('.toast-error')).toContainText('Remove the highlighted contact details');
  await expect(page.locator('#forward-modal')).toBeVisible();

  // Remove them, then forward.
  await page.fill('#forward-edit', EDITED);
  await expect(page.locator('#forward-preview mark.contact-flag')).toHaveCount(0);
  await page.click('#forward-confirm-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });

  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.message_forward_log mfl
         join public.messages m on m.id = mfl.message_id
        where m.body = $1 and mfl.to_user_id = $2`,
      [EDITED, owner.profileId]
    );
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);

  // The original text went to no one: it is in no forward log row to the owner.
  const { rows: leaked } = await query(
    `select count(*)::int n from public.message_forward_log mfl
       join public.messages m on m.id = mfl.message_id
      where m.body = $1 and mfl.to_user_id = $2`,
    [ORIGINAL, owner.profileId]
  );
  expect(leaked[0].n).toBe(0);

  // The Operator-only log holds the original.
  const { rows: logged } = await query(
    `select count(*)::int n from public.activity_log
      where action = 'message_forward_edited' and details->>'original_body' = $1`,
    [ORIGINAL]
  );
  expect(logged[0].n).toBe(1);
});
