// Items 82-86: a member recommends a candidate; only the Operator sees it; a
// member never has more than five open; a member never sees another member's
// recommendation; the Operator invites from one (the invitation names the
// referrer); declining tells nobody.
//
// Written in the same change as the feature. It has NOT been run: the browser
// suite needs .env and the live Supabase project. Until it passes, the rows
// stay unproven in docs/CHECKLIST.md. The database half of each item is proven
// by sql/tests/27_candidate_recommendations.sql.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured, testEmail } = require('./helpers/fixtures');
const { signIn, signOut, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const REFERRER = { first_name: 'Item82', last_name: 'Referrerson', company: 'Referrer Metals', phone: '+32471581001' };
const OTHER    = { first_name: 'Item84', last_name: 'Otherly', company: 'Other Trading', phone: '+32471583001' };

let operator, referrer, other;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'i82op', role: 'operator', status: 'approved' });
  referrer = await createAccount({ label: 'i82rf', role: 'participant', status: 'approved', meta: REFERRER });
  other    = await createAccount({ label: 'i84ot', role: 'participant', status: 'approved', meta: OTHER });
});

/** Fills the Recommend a candidate page and sends it. */
async function recommend(page, name, email) {
  await openScreen(page, 'profile');
  await page.click('#recommend-open-btn');
  await expect(page.locator('#screen-recommend')).toBeVisible();
  await page.fill('#r_name', name);
  await page.fill('#r_company', 'Candidate Co');
  await page.fill('#r_email', email);
  await page.fill('#r_how', 'We traded together in 2025.');
  await page.fill('#r_commodities', 'Copper');
  await page.check('input[name="r_agreed"][value="yes"]');
  await page.fill('#r_experience', 'Good payer.');
  await page.click('#recommend-btn');
}

test('Item82 a member recommends a candidate from Profile, and only the Operator sees it', async ({ page }) => {
  const candidate = `Item82 Candidate ${Date.now()}`;
  const email = testEmail('i82cand');
  await signIn(page, referrer, 'app.html');
  await recommend(page, candidate, email);
  await expect(page.locator('.toast-success')).toContainText('Message sent to Operators.');

  // The member cannot read it back: no list anywhere on the page.
  await openScreen(page, 'profile');
  await expect(page.locator('body')).not.toContainText(candidate);

  // The member's session is still in the browser: sign out first, or the
  // sign-in page bounces to app.html (see signOut() in helpers/session.js).
  await signOut(page);
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'invitations');
  await expect(page.locator('#recommendations-body')).toContainText(candidate, { timeout: 15_000 });
  await expect(page.locator('#recommendations-body')).toContainText('Item82 Referrerson');
});

test('Item83 a member with five open recommendations is refused a sixth', async ({ page }) => {
  // A member of their own, so the five below are the only open ones.
  const full = await createAccount({ label: 'i83rf', role: 'participant', status: 'approved', meta: REFERRER });
  // Five are filed straight into the database, as five earlier sends would be.
  for (let i = 1; i <= 5; i++) {
    await query(
      `insert into public.candidate_recommendations
         (referrer_id, candidate_name, candidate_company, candidate_email, how_known,
          commodities, agreed_contact, own_experience)
       select p.id, $2, 'Co', $3, 'known', 'Copper', true, 'exp'
         from public.profiles p where p.user_id = $1`,
      [full.userId, `Item83 Filler ${i}`, testEmail(`i84f${i}`)]
    );
  }
  await signIn(page, full, 'app.html');
  await recommend(page, 'Item83 Sixth', testEmail('i83six'));
  await expect(page.locator('.toast-error')).toContainText('You can have up to 5 open recommendations at a time.');
});

test('Item84 a member never sees another member\'s recommendation', async ({ page }) => {
  await signIn(page, other, 'app.html');
  await openScreen(page, 'profile');
  await expect(page.locator('body')).not.toContainText('Item82 Candidate');
  await expect(page.locator('body')).not.toContainText('Item83 Filler');
  await page.click('#recommend-open-btn');
  await expect(page.locator('body')).not.toContainText('Item82 Candidate');
});

test('Item85 the Operator invites from a recommendation, and the invitation names the referrer', async ({ page }) => {
  const candidate = `Item85 Invitee ${Date.now()}`;
  const email = testEmail('i85inv');
  const sender = await createAccount({ label: 'i85rf', role: 'participant', status: 'approved', meta: REFERRER });
  await signIn(page, sender, 'app.html');
  await recommend(page, candidate, email);
  await expect(page.locator('.toast-success')).toContainText('Message sent to Operators.');

  // The member's session is still in the browser: sign out first, or the
  // sign-in page bounces to app.html (see signOut() in helpers/session.js).
  await signOut(page);
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'invitations');
  const row = page.locator('#recommendations-body tr', { hasText: candidate });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-rec-invite]').click();
  await expect(page.locator('#invite-from-rec-card')).toBeVisible();
  await expect(page.locator('#ir-candidate-email')).toHaveValue(email);
  await expect(page.locator('#ir-preview')).toContainText('Item82 Referrerson has recommended you');
  await page.click('#ir-send-btn');
  await expect(page.locator('.toast-success')).toContainText('Invitation email queued to');
  await expect(row).toHaveCount(0);

  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.email_outbox
        where to_email = $1 and body_text like '%Item82 Referrerson has recommended you%'`,
      [email]
    );
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);
});

test('Item86 declining a recommendation tells the referrer nothing', async ({ page }) => {
  const candidate = `Item86 Declined ${Date.now()}`;
  const sender = await createAccount({ label: 'i86rf', role: 'participant', status: 'approved', meta: REFERRER });
  await signIn(page, sender, 'app.html');
  await recommend(page, candidate, testEmail('i86dec'));
  await expect(page.locator('.toast-success')).toContainText('Message sent to Operators.');

  const before = await query(
    `select count(*)::int n from public.email_outbox where to_email = $1`, [sender.email]
  );

  // The member's session is still in the browser: sign out first, or the
  // sign-in page bounces to app.html (see signOut() in helpers/session.js).
  await signOut(page);
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'invitations');
  const row = page.locator('#recommendations-body tr', { hasText: candidate });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-rec-decline]').click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  const after = await query(
    `select count(*)::int n from public.email_outbox where to_email = $1`, [sender.email]
  );
  expect(after.rows[0].n).toBe(before.rows[0].n);
});
