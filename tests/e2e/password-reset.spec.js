// Forgetting a password, and getting back in.
//
// Before this flow existed there was no way back into an account at all. The
// owner lost his own password and it took somebody with a service key to let
// him in again - which is not a recovery path, it is a person. With email not
// yet sending and no second Operator to ask, that person would eventually not
// be available, and he would be locked out of his own platform.
//
// WHAT THIS PROVES, AND HOW, WITHOUT WORKING EMAIL
//
// The whole loop is tested, link included. The admin API's generate_link
// returns the real recovery URL instead of mailing it, so the browser can
// follow exactly the link a member would receive. Nothing is faked: it is the
// same token, the same redirect, the same page, and the test finishes by
// SIGNING IN with the new password. A reset that cannot be signed in with has
// not worked, whatever the screen said.
//
// Supabase Auth sends that email itself rather than through this project's
// outbox, which is why recovery works while LISTING_EMAIL_FROM and
// RESEND_API_KEY are still unset. Recovery must not depend on the part of the
// system that is broken.
//
// THE PROHIBITION
//
// The most important assertion here is not that the reset works. It is that
// the form says the SAME thing for an address with an account and an address
// without one. This platform's membership is private and invitation-only -
// that secrecy is the product - so a form that distinguishes the two lets
// anybody test whether a given company trades here, one guess at a time.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { query } = require('../../scripts/db');

const NEW_PASSWORD = 'Reset-Me-9f2kd-New';

/** Ask the Operator-only edge function for a recovery link, as whoever this
 *  access token belongs to. Called directly rather than through the button,
 *  because the prohibition is about WHO the server will answer - a browser
 *  that never renders the button proves nothing about the endpoint behind it. */
async function askForRecoveryLink(accessToken, email) {
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/operator-recovery-link`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY_FOR_TEST,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** A real access token for an account, the way the browser would hold one. */
async function tokenFor(email, password) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY_FOR_TEST, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`could not sign in as ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

/** The address the live project is allowed to redirect recovery links to.
 *
 *  WHY THE TEST DOES NOT JUST USE ITS OWN localhost ADDRESS
 *
 *  Supabase honours a redirect only if it is on the project's allow list, and
 *  falls back to the Site URL otherwise. On 2026-10-13 that allow list was
 *  filled in properly for the first time - one entry, the live site - and this
 *  test went red, because it had been asking for a localhost redirect that
 *  nothing had ever permitted. The honest fix is NOT to put localhost on a
 *  production allow list to make a test pass: this platform's whole product is
 *  controlled disclosure, and a permanent localhost entry on the live project
 *  is a standing invitation to send somebody's recovery token to a machine
 *  that is not theirs.
 *
 *  So the test asks for the real, allow-listed address, lets Supabase do the
 *  real verification and the real redirect, and then carries the resulting
 *  fragment - which is the session - back to the copy of the page being
 *  tested. What is exercised is unchanged: the same token, the same checks,
 *  the same redirect rules. Only the final hop is local, and it has to be:
 *  the live site serves whatever is on main, which is not what is under test.
 */
const LIVE_RESET_URL = process.env.SITE_RESET_URL ||
  'https://rafops71.github.io/Platform/reset.html';

/** Follow a recovery link the way a member would, and end up on the copy of
 *  reset.html that this suite is testing, carrying the real session. */
async function followRecoveryLink(page, link, baseURL) {
  // Do not let the LIVE reset page run. supabase-js reads the session out of
  // the fragment and then clears it (window.location.hash = '', checked in
  // supabase-js 2.112.4's _getSessionFromURL), so the loop below raced the
  // live page's script for the fragment: it won when it read first and lost
  // when the script did. That race is why this test failed now and then
  // (2026-10-27, twice in one day) while the app was fine - a member opens
  // the link once, on one page. An empty page at the live address keeps the
  // fragment exactly as Supabase sent it.
  const live = new URL(LIVE_RESET_URL);
  await page.route(`${live.origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>held</title>' }));
  await page.goto(link);

  // Supabase verifies the token and redirects to the allow-listed address with
  // the session in the fragment. That page is the live site and is not what is
  // under test; the fragment is what matters.
  // Tolerant on purpose. A GOOD link lands with a session in the fragment; a
  // spent one lands with an error there, or with nothing at all. All three are
  // states a caller may legitimately be testing, so this helper carries across
  // whatever arrived and lets the caller assert on what the page then does -
  // rather than failing here and hiding the result behind a helper's error.
  const deadline = Date.now() + 30_000;
  let fragment = '';
  while (Date.now() < deadline) {
    fragment = new URL(page.url()).hash;
    if (fragment) break;
    await page.waitForTimeout(250);
  }

  await page.unroute(`${live.origin}/**`);
  await page.goto(new URL('/reset.html', baseURL).href + fragment);
  return fragment;
}

const MEMBER = { first_name: 'Henrike', last_name: 'Baumgartner', company: 'Baumgartner Handel', phone: '+32471560001' };

let member;

/** The real recovery link, obtained the way the mail server would get it.
 *
 *  generate_link does everything the "send a reset email" path does except
 *  put it in an envelope, so the token, its expiry and its one-use nature are
 *  all genuine. Using it here is the difference between testing the flow and
 *  testing a mock of it. */
async function recoveryLinkFor(email, redirectTo) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', email, redirect_to: redirectTo }),
  });
  const body = await res.json();
  if (!res.ok || !body.action_link) {
    throw new Error(`could not generate a recovery link: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.action_link;
}

/** Can this email and password actually sign in? The only honest definition
 *  of "the reset worked". Asked of the API directly rather than through the
 *  UI, so a redirect or a cached session cannot make a failure look like a
 *  success. */
async function canSignIn(email, password) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY_FOR_TEST, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200) return true;

  // Anything that is not "wrong password" must NOT be reported as "wrong
  // password". The first version of this helper returned `status === 200`,
  // so a rate limit, an outage or a typo in the URL all came back as a
  // confident false - and the test then announced that a password did not
  // work when nothing of the sort had been established. A test that lies in
  // the quiet direction is worse than no test.
  const body = await res.text();
  const refused = res.status === 400 &&
    /invalid[_ ]login|invalid[_ ]credentials|invalid[_ ]grant/i.test(body);
  if (refused) return false;
  throw new Error(
    `sign-in could not be judged: Supabase answered ${res.status} ` +
    `${body.slice(0, 200)}. This is not evidence about the password.`);
}

// The publishable key is what a browser uses; read from the page's own config
// so this test cannot drift from what the site actually ships.
const SUPABASE_PUBLISHABLE_KEY_FOR_TEST = require('fs')
  .readFileSync(require('path').join(__dirname, '../../js/supabase-config.js'), 'utf8')
  .match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)[1];

test.beforeAll(async () => {
  test.setTimeout(120_000);
  assertConfigured();
  await cleanup();
  member = await createAccount({ label: 'reset', role: 'participant', status: 'approved', meta: MEMBER });
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial('forgetting a password', () => {

  test('Item54 the sign-in page offers a way back in', async ({ page }) => {
    await page.goto('/index.html');
    const link = page.locator('#forgot-link');
    await expect(link, 'there is no way to ask for a new password').toBeVisible({ timeout: 15_000 });

    await link.click();
    await expect(page.locator('#forgot-panel')).toBeVisible();
    await expect(page.locator('#forgot-email')).toBeVisible();
  });

  test('Item54 the address typed into sign-in is carried across', async ({ page }) => {
    // Small thing, and the reason people give up: somebody who has just failed
    // to sign in should not have to type their address again.
    await page.goto('/index.html');
    await page.fill('#email', member.email);
    await page.click('#forgot-link');
    await expect(page.locator('#forgot-email')).toHaveValue(member.email);
  });

  test('Item55 the answer is the same for an address with an account and one without', async ({ page }) => {
    // THE PROHIBITION. Two requests, one real address and one invented, and
    // the words on screen must be identical. Anything that differs - the text,
    // a delay long enough to notice, an error - turns this form into a way of
    // asking "does this company trade here?".
    await page.goto('/index.html');
    await page.click('#forgot-link');
    await page.fill('#forgot-email', member.email);
    await page.click('#forgot-send-btn');
    await expect(page.locator('#forgot-done')).toBeVisible({ timeout: 20_000 });
    const known = (await page.locator('#forgot-done').innerText()).trim();

    await page.goto('/index.html');
    await page.click('#forgot-link');
    await page.fill('#forgot-email', 'nobody-at-all-9f2kd@example.invalid');
    await page.click('#forgot-send-btn');
    await expect(page.locator('#forgot-done')).toBeVisible({ timeout: 20_000 });
    const unknown = (await page.locator('#forgot-done').innerText()).trim();

    expect(unknown, 'the reply differs for a known and an unknown address, which leaks who is a member')
      .toBe(known);
    expect(known.length, 'the confirmation says nothing at all').toBeGreaterThan(10);
  });

  test('Item54 a bad link is refused, and says so instead of showing a form', async ({ page }) => {
    // Opening the page with no recovery session at all: an expired link, a
    // used one, or somebody who simply navigated here. Showing the password
    // form in that state would invite a person to type a new password into
    // something that was never going to save it.
    await page.goto('/reset.html');

    // js/reset.js polls for a recovery session for up to eight seconds before
    // giving up, so the status line reads "Checking the link…" for a while
    // first. The original version of this test read that line immediately and
    // failed on the word "Checking" - a test measuring a moment that was never
    // the moment being tested. Poll for the settled text instead.
    await expect
      .poll(async () => (await page.locator('#reset-status').innerText()).toLowerCase(),
            { timeout: 25_000, message: 'the page never settled on a verdict about the link' })
      .toMatch(/expired|used|not valid|no es válido|caducado/);
    await expect(page.locator('#reset-form')).toBeHidden();
  });

  test('Item54 a real link sets a new password, and the old one stops working', async ({ page, baseURL }) => {
    test.setTimeout(120_000);

    // Proof that the starting state is the one being changed.
    // member.password, NOT testPassword(): testPassword() MINTS A NEW RANDOM
    // PASSWORD on every call. Asking whether the account can sign in with a
    // freshly invented string was always going to say no, and it did - twice
    // in CI, reported as "the fixture cannot sign in with its own password".
    // The password the account was actually created with is the one the
    // fixture handed back.
    expect(await canSignIn(member.email, member.password),
      'the fixture cannot sign in with its own password, so this test proves nothing')
      .toBe(true);

    const link = await recoveryLinkFor(member.email, LIVE_RESET_URL);
    await followRecoveryLink(page, link, baseURL);
    // Supabase verified the token; the page now holds the real session.
    await expect(page.locator('#reset-form'), 'the recovery link did not open the password form')
      .toBeVisible({ timeout: 30_000 });

    await page.fill('#new-password', NEW_PASSWORD);
    await page.fill('#confirm-password', NEW_PASSWORD);
    await page.click('#reset-btn');

    // It signs out and returns to sign-in on purpose: a recovery link must not
    // double as a way in, and the person may not be on their own machine.
    await expect(page.locator('#notice')).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/index\.html\?reset=1/);

    // The only honest definition of success.
    expect(await canSignIn(member.email, NEW_PASSWORD),
      'the new password does not work, whatever the screen said')
      .toBe(true);
    expect(await canSignIn(member.email, member.password),
      'the OLD password still works after a reset')
      .toBe(false);
  });

  test('Item54 the same link cannot be used twice', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    // A recovery link sits in an inbox, possibly for years. One use only is
    // what stops an old email being a permanent key to the account.
    const link = await recoveryLinkFor(member.email, LIVE_RESET_URL);
    await followRecoveryLink(page, link, baseURL);
    await expect(page.locator('#reset-form')).toBeVisible({ timeout: 30_000 });
    await page.fill('#new-password', NEW_PASSWORD + 'A');
    await page.fill('#confirm-password', NEW_PASSWORD + 'A');
    await page.click('#reset-btn');
    await expect(page).toHaveURL(/index\.html\?reset=1/, { timeout: 25_000 });

    // Same link again, in a clean context so no session is carried over.
    const second = await page.context().browser().newContext();
    const fresh = await second.newPage();
    await followRecoveryLink(fresh, link, baseURL);
    await expect(fresh.locator('#reset-form'),
      'a used recovery link still opens the password form').toBeHidden({ timeout: 30_000 });
    await second.close();
  });

  test('Item54 the whole flow is there in Spanish too', async ({ page }) => {
    // A Spanish-speaking member is the one most likely to need this and least
    // able to guess their way through an English page.
    await page.goto('/index.html');
    await page.evaluate(() => { try { localStorage.setItem('jericho.language', 'es'); } catch (e) {} });
    await page.reload();
    await page.click('#forgot-link');
    const panel = await page.locator('#forgot-panel').innerText();
    expect(panel, 'the recovery panel is still English when the interface is Spanish')
      .toMatch(/contraseña|enlace/i);
  });
});

// Deliberately OUTSIDE the serial group above. In a describe.serial, one
// failing test SKIPS every test after it - so when Item 54 went red on
// 2026-10-13, this prohibition was reported as "skipped / blocked" and proved
// nothing, which is exactly as bad as failing. A prohibition that only runs
// when everything else is already working is not a check.
test.describe('an Operator can hand over a recovery link', () => {
  test('Item57 an Operator can make a recovery link, and nobody else can', async () => {
    test.setTimeout(120_000);

    // A second member, so the prohibition is tested against somebody who is a
    // perfectly legitimate signed-in user - not against a stranger, which the
    // JWT check alone would already stop.
    const other = await createAccount({ label: 'reset-other', role: 'participant', status: 'approved' });
    const operator = await createAccount({ label: 'reset-op', role: 'operator', status: 'approved' });

    // THE PROHIBITION. An ordinary member asking for a link to ANOTHER
    // member's account must be refused. A recovery link is a key: if any
    // member can mint one for any address, the sign-in page is decoration.
    const memberToken = await tokenFor(other.email, other.password);
    const refused = await askForRecoveryLink(memberToken, member.email);
    expect(refused.status,
      'a member was able to ask for a recovery link to another account')
      .toBe(403);
    expect(refused.body.link, 'a member was handed a recovery link').toBeUndefined();

    // And a member asking for a link to their OWN account is refused too.
    // This endpoint is not the self-service path - that is the button on the
    // sign-in page, which proves the person holds the inbox. Allowing it here
    // would let a stolen SESSION mint a permanent way back in.
    const own = await askForRecoveryLink(memberToken, other.email);
    expect(own.status, 'a member could mint a recovery link for themselves').toBe(403);

    // The Operator can, and what comes back is a real, working link.
    const operatorToken = await tokenFor(operator.email, operator.password);
    const made = await askForRecoveryLink(operatorToken, member.email);
    expect(made.status, made.body.error || 'the Operator was refused').toBe(200);
    expect(made.body.link, 'no link came back').toBeTruthy();
    expect(made.body.link, 'the link does not point at the reset page')
      .toContain('reset.html');

    // An address nobody here holds gets nothing - generate_link would
    // otherwise CREATE that account, which is the hole sql/024 closed.
    const nobody = await askForRecoveryLink(operatorToken, 'no-such-member-9f2kd@example.invalid');
    expect(nobody.status, 'a link was made for an address with no member').toBe(404);
  });
});
