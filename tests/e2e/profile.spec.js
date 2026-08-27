// The participant's own account page: the details they maintain, the language
// they read in, and the two credentials that are not the profile's to change.
//
// Email and password are the reason this spec exists. Both live in Supabase
// Auth, both are gated on the current password, and both have a failure mode
// that looks like success from the browser - an email written to profiles but
// not to Auth would leave someone signing in as one address and receiving mail
// at another. So every assertion here reads the database afterwards rather than
// trusting the toast, and the password tests finish by actually signing in with
// the password they expect to be in force.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured, testEmail } = require('./helpers/fixtures');
const { query } = require('../../scripts/db');

// GoTrue validates the address the account CURRENTLY holds when it processes
// an email change, and rejects any domain without real MX records - which the
// suite's usual .invalid addresses do not have, so an account created with one
// cannot change its address at all. resend.dev is the sending domain's own test
// domain: it resolves, it accepts nothing for delivery, and no mail is sent
// here in any case (email confirmations are off, and the outbox is only ever
// flushed by a script this suite does not run).
const EMAIL_DOMAIN = 'resend.dev';

let account;          // { email, password, profileId, userId }
let currentEmail;     // what the account signs in with right now
let currentPassword;  // ditto - both move during this spec

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  account = await createAccount({
    label: 'profile', role: 'participant', status: 'approved', domain: EMAIL_DOMAIN,
    meta: { first_name: 'Prue', last_name: 'File', company: 'Old Company', country: 'Belgium' },
  });
  currentEmail = account.email;
  currentPassword = account.password;
});

test.afterAll(async () => { await cleanup(); });

async function signIn(page) {
  await page.goto('/index.html');
  await page.fill('#email', currentEmail);
  await page.fill('#password', currentPassword);
  await page.click('#login-btn');
  await page.waitForURL('**/app.html', { timeout: 20_000 });
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 20_000 });
}

async function openProfile(page) {
  await page.click('button[data-screen="profile"]');
  await expect(page.locator('#screen-profile')).toBeVisible({ timeout: 15_000 });
}

async function profileRow() {
  const { rows } = await query('select * from public.profiles where id = $1', [account.profileId]);
  return rows[0];
}

async function authEmail() {
  const { rows } = await query('select email from auth.users where id = $1', [account.userId]);
  return rows[0].email;
}

/** The address Auth is holding but has not applied, because this project
 *  requires an email change to be confirmed from the new address. */
async function pendingAuthEmail() {
  const { rows } = await query('select email_change from auth.users where id = $1', [account.userId]);
  return rows[0].email_change || null;
}

/** Whether these credentials are the ones actually in force, asked of Auth
 *  rather than inferred from what the UI said. */
async function canSignIn(email, password) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

test.describe.serial('participant profile', () => {

  test('the page shows the account as it stands', async ({ page }) => {
    await signIn(page);
    await openProfile(page);

    await expect(page.locator('#p_first_name')).toHaveValue('Prue');
    await expect(page.locator('#p_last_name')).toHaveValue('File');
    await expect(page.locator('#p_company')).toHaveValue('Old Company');
    await expect(page.locator('#p_email')).toHaveValue(currentEmail);
    await expect(page.locator('#p_email')).toBeDisabled();
    await expect(page.locator('#p_job_title')).toHaveValue('');

    // Country is the shared dropdown, not a free-text box, so what gets stored
    // is one of the canonical names the rest of the platform filters on.
    await expect(page.locator('#p_country')).toHaveValue('Belgium');
    expect(await page.locator('#p_country option').count()).toBeGreaterThan(150);

    // Role and status are shown so a participant can see what their account is,
    // and are not form controls: there is nothing here to submit them with.
    await expect(page.locator('#p_role_value')).toHaveText('Participant');
    await expect(page.locator('#p_status_value')).toHaveText('Approved');
    expect(await page.locator('#profile-form select, #profile-form input')
      .evaluateAll(els => els.map(e => e.id))).not.toContain('p_role_value');
  });

  test('saving the details writes every field, including the new job title', async ({ page }) => {
    await signIn(page);
    await openProfile(page);

    await page.fill('#p_first_name', 'Prudence');
    await page.fill('#p_last_name', 'Filed');
    await page.fill('#p_company', 'New Company');
    await page.fill('#p_job_title', 'Head of Trading');
    await page.selectOption('#p_country', 'Chile');
    await page.fill('#p_phone', '+3212345678');
    await page.click('#profile-form button[type="submit"]');

    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await profileRow()).job_title, { timeout: 15_000 })
      .toBe('Head of Trading');
    const row = await profileRow();
    expect(row.first_name).toBe('Prudence');
    expect(row.last_name).toBe('Filed');
    expect(row.company).toBe('New Company');
    expect(row.country).toBe('Chile');
    expect(row.phone).toBe('+3212345678');

    // The header carries the name too, and a stale one there is the sort of
    // thing nobody notices until they wonder whose account they are in.
    await expect(page.locator('#user-name')).toHaveText('Prudence Filed');
  });

  test('the edit is in the activity log, by field name and not by value', async () => {
    const { rows } = await query(
      `select details from public.activity_log
        where user_id = $1 and action = 'profile_updated'
        order by created_at desc limit 1`,
      [account.profileId]
    );
    expect(rows).toHaveLength(1);
    const fields = rows[0].details.fields;
    expect(fields).toEqual(expect.arrayContaining(['first_name', 'company', 'job_title', 'country', 'phone']));
    // An audit trail answers which field moved; the value is in the profile,
    // and a second copy of somebody's phone number earns nothing.
    expect(JSON.stringify(rows[0].details)).not.toContain('+3212345678');
  });

  test('a participant cannot change their own role or status', async ({ page }) => {
    await signIn(page);
    // Sent the way a tampered page would send it, since the point is that the
    // database refuses it and not that the form omits the fields.
    const result = await page.evaluate(async () => {
      const { error } = await jericho.from('profiles')
        .update({ role: 'operator', status: 'suspended' })
        .eq('id', CURRENT_PROFILE.id);
      return error ? error.message : 'no error';
    });
    expect(result).toBe('no error');  // silently reverted, not rejected

    const row = await profileRow();
    expect(row.role).toBe('participant');
    expect(row.status).toBe('approved');
  });

  test('the language preference switches the interface and is stored', async ({ page }) => {
    await signIn(page);
    await openProfile(page);

    await page.selectOption('#p_language', 'es');

    // Immediately, without a save and without a reload.
    await expect(page.locator('#screen-profile h2')).toHaveText('Perfil', { timeout: 10_000 });
    await expect(page.locator('label[for="p_job_title"]')).toHaveText('Cargo o puesto');
    await expect(page.locator('#p_status_value')).toHaveText('Aprobado');
    // The country dropdown is relabelled but keeps the selection underneath.
    await expect(page.locator('#p_country')).toHaveValue('Chile');
    await expect(page.locator('#p_country option[value="Chile"]')).toHaveText('Chile');
    await expect(page.locator('#p_country option[value="Belgium"]')).toHaveText('Bélgica');

    // And it reaches the profile, because notification emails are composed in
    // the database from this column and cannot see localStorage.
    await expect.poll(async () => (await profileRow()).language, { timeout: 15_000 }).toBe('es');

    await page.selectOption('#p_language', 'en');
    await expect(page.locator('#screen-profile h2')).toHaveText('Profile', { timeout: 10_000 });
    await expect.poll(async () => (await profileRow()).language, { timeout: 15_000 }).toBe('en');
  });

  test('an email change is refused without the current password', async ({ page }) => {
    await signIn(page);
    await openProfile(page);

    await page.fill('#p_new_email', testEmail('profile-nope', EMAIL_DOMAIN));
    await page.fill('#p_email_password', 'not-the-password');
    await page.click('#email-form button[type="submit"]');

    await expect(page.locator('.toast-error')).toBeVisible({ timeout: 15_000 });
    expect(await authEmail()).toBe(currentEmail);
    expect((await profileRow()).email).toBe(currentEmail);
  });

  test('with the current password it is accepted, and held pending confirmation', async ({ page }) => {
    const newEmail = testEmail('profile-moved', EMAIL_DOMAIN);
    await signIn(page);
    await openProfile(page);

    await page.fill('#p_new_email', newEmail);
    await page.fill('#p_email_password', currentPassword);
    await page.click('#email-form button[type="submit"]');
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    // This project requires the new address to confirm the change, so Auth
    // holds it rather than applying it. Everything else must stay exactly as it
    // was until then - including the page, which still shows the address that
    // signs in. A page claiming the address had changed is how someone locks
    // themselves out of an account.
    await expect.poll(pendingAuthEmail, { timeout: 15_000 }).toBe(newEmail);
    expect(await authEmail()).toBe(currentEmail);
    expect((await profileRow()).email).toBe(currentEmail);
    await expect(page.locator('#p_email')).toHaveValue(currentEmail);
    expect(await canSignIn(currentEmail, currentPassword)).toBe(true);
  });

  test('when the change is confirmed, the profile and the log follow', async () => {
    const { rows: pending } = await query(
      'select email_change from auth.users where id = $1', [account.userId]);
    const newEmail = pending[0].email_change;
    expect(newEmail).toBeTruthy();

    // Standing in for the participant following the link in their inbox, which
    // no test can click: confirmation is Auth writing the pending address onto
    // the account. What is under test here is what this project does *after*
    // that - the mirror onto public.profiles and the audit entry, neither of
    // which the browser is trusted to write.
    await query(
      `update auth.users set email = email_change, email_change = '',
                             email_change_confirm_status = 0
        where id = $1`, [account.userId]);

    await expect.poll(async () => (await profileRow()).email, { timeout: 15_000 }).toBe(newEmail);

    const { rows } = await query(
      `select details from public.activity_log
        where user_id = $1 and action = 'email_changed' order by created_at desc limit 1`,
      [account.profileId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].details.from).toBe(currentEmail);
    expect(rows[0].details.to).toBe(newEmail);

    // And the new address is the one that opens the account from now on.
    expect(await canSignIn(newEmail, currentPassword)).toBe(true);
    expect(await canSignIn(currentEmail, currentPassword)).toBe(false);
    currentEmail = newEmail;
  });

  test('a password change is refused without the current password', async ({ page }) => {
    await signIn(page);
    await openProfile(page);

    await page.fill('#current_password', 'not-the-password');
    await page.fill('#new_password', 'Rejected-12345');
    await page.click('#password-form button[type="submit"]');

    await expect(page.locator('.toast-error')).toBeVisible({ timeout: 15_000 });
    expect(await canSignIn(currentEmail, currentPassword)).toBe(true);
    expect(await canSignIn(currentEmail, 'Rejected-12345')).toBe(false);
  });

  test('with the current password it is changed, and logged', async ({ page }) => {
    const newPassword = `Pw-changed-${Date.now()}`;
    await signIn(page);
    await openProfile(page);

    await page.fill('#current_password', currentPassword);
    await page.fill('#new_password', newPassword);
    await page.click('#password-form button[type="submit"]');
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => canSignIn(currentEmail, newPassword), { timeout: 20_000 }).toBe(true);
    expect(await canSignIn(currentEmail, currentPassword)).toBe(false);
    currentPassword = newPassword;

    const { rows } = await query(
      `select details from public.activity_log
        where user_id = $1 and action = 'password_changed'`,
      [account.profileId]
    );
    expect(rows).toHaveLength(1);
    // The log records that it happened. Nothing about the password itself
    // should be anywhere near it.
    expect(JSON.stringify(rows[0].details)).not.toContain(newPassword);
  });

  test('the changed credentials are what the participant signs in with', async ({ page }) => {
    // The whole point, asserted through the front door: the address and the
    // password the page reported are the ones that now open the account.
    await signIn(page);
    await openProfile(page);
    await expect(page.locator('#p_email')).toHaveValue(currentEmail);
  });
});
