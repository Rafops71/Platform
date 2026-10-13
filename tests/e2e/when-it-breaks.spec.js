// What a member sees when the platform cannot be reached.
//
// WHY THIS EXISTS
//
// Every other suite tests the platform working. This one tests it failing,
// which is the state a member is most likely to misread: a screen that says
// nothing, or says something in database language, reads as "this thing is
// broken and my data is gone" rather than "your train went into a tunnel".
//
// Supabase being unreachable is not hypothetical. A phone loses signal in a
// lift, an airport wifi portal swallows requests, a hosted service has an
// outage. On a platform where members are strangers to each other and the
// Operator is the only person they can ask, a confusing failure screen costs
// an Operator a phone call every time.
//
// HOW IT IS TESTED
//
// The browser's requests to Supabase are cut off at the network level with
// Playwright's routing, which is as close to "the service is down" as a test
// can get without an outage. Nothing is stubbed or faked inside the page: the
// application makes its real call, the call genuinely fails, and this suite
// reads whatever the member is then shown.
//
// The assertion is deliberately about WORDS, not about the absence of a crash.
// A page can survive an outage and still be useless.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');

// Anything in here means the database spoke to the member directly.
const DATABASE_LANGUAGE =
  /row-level security|relation "|constraint|JWT|PGRST|schema cache|null value in column|TypeError|undefined|\[object/i;

let member;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  assertConfigured();
  await cleanup();
  member = await createAccount({ label: 'breaks', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

test.describe('when the platform cannot be reached', () => {

  test('Item60 Browse says plainly that the Platform cannot be reached', async ({ page }) => {
    test.setTimeout(120_000);

    // Sign in FIRST, while the connection still works: the subject here is a
    // member already using the platform when it goes away, which is the
    // common case. A failure at the sign-in page is a different test.
    await signIn(page, member, 'app.html');

    // Now cut it off. Every request to Supabase fails from here.
    await page.route('**/*.supabase.co/**', route => route.abort('connectionfailed'));

    await openScreen(page, 'browse');

    const text = await page.locator('#browse-list').innerText();

    expect(text, 'the screen said nothing at all about the failure')
      .not.toMatch(/^\s*$/);
    expect(text, 'the member is still being told it is loading, with no end to it')
      .not.toMatch(/^\s*(loading|cargando)/i);
    expect(text, 'the member was shown the database\'s own words')
      .not.toMatch(DATABASE_LANGUAGE);
    expect(text.toLowerCase(), 'the message does not say the Platform could not be reached')
      .toMatch(/cannot be reached|connection|no se puede contactar|conexión/i);
  });

  test('Item60 the same is true in Spanish', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, member, 'app.html');
    await page.evaluate(() => { try { localStorage.setItem('jericho.language', 'es'); } catch (e) {} });
    await page.reload();

    await page.route('**/*.supabase.co/**', route => route.abort('connectionfailed'));
    await openScreen(page, 'browse');

    const text = (await page.locator('#browse-list').innerText()).toLowerCase();
    expect(text, 'the failure message is English on a Spanish screen')
      .toMatch(/no se puede contactar|conexión|plataforma/i);
  });

  test('Item60 a failed action does not leave its button dead', async ({ page }) => {
    test.setTimeout(120_000);
    // A button that stays disabled after a failure is worse than the failure:
    // the member cannot even try again once their signal comes back. This is
    // the half of withButtonBusy() that the double-press guard depends on.
    await signIn(page, member, 'app.html');
    await openScreen(page, 'browse');

    await page.route('**/*.supabase.co/**', route => route.abort('connectionfailed'));
    const save = page.locator('#browse-save-search-btn');
    await save.click();

    await expect(save, 'the button is still switched off after the failure, so nobody can retry')
      .toBeEnabled({ timeout: 15_000 });
  });
});
