// A forwarded message carries the Operator's translation below the original (owner, 19 Nov 2026;
// docs/AGREED-2026-11-19-batch2.md point 2).
//
//   Item27  An Operator can forward an enquiry to the listing owner
//   Item30  A member's mailbox shows only their own conversations
//
// What the owner decided: the receiving member gets the ORIGINAL and the TRANSLATION BELOW it, with no label and no
// marker line; the Operator presses Translate in the forward window, sees it, and it is sent when he confirms; he
// cannot edit it; members have no translate button on messages; the contact-detail check also runs on the
// translation. The translation service is stubbed here (operator-translate), because this proves the screens and
// the storage, not the quality of a translation. The database side is proved in sql/tests/44_forward_translation.sql.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen, restoreEnglish } = require('./helpers/session');
const { query } = require('../../scripts/db');

test.describe.configure({ mode: 'serial' });

const MSG = {
  shown:   'E2E fwdtr shown: podemos ofrecer cinco mil toneladas de cobre.',
  hidden:  'E2E fwdtr hidden: podemos ofrecer tres mil toneladas de cobre.',
  down:    'E2E fwdtr down: podemos ofrecer dos mil toneladas de cobre.',
  contact: 'E2E fwdtr contact: podemos ofrecer mil toneladas de cobre.',
  plain:   'E2E fwdtr plain: podemos ofrecer cien toneladas de cobre.',
};
const TRANSLATION = 'We can offer five thousand tons of copper.';
const WITH_EMAIL = 'We can offer one thousand tons; write to trader.fwdtr@example.com.';

let operator, owner, sender, third, listingRef;
const idOf = {};

const stub = (page, replyText) => page.route('**/functions/v1/operator-translate', (route) => replyText === null
  ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) })
  : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translated_text: replyText }) }));

async function openForward(page, body) {
  await signIn(page, operator, 'operator.html');
  await openScreen(page, 'mailbox');
  const row = page.locator('#operator-mailbox-list .list-row', { hasText: body });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();
  return row;
}
const forwardRow = async (body) => (await query(
  `select f.translation, f.translation_lang from public.message_forward_log f join public.messages m on m.id = f.message_id where m.body = $1`, [body])).rows;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'fwtop', role: 'operator', status: 'approved' });
  owner  = await createAccount({ label: 'fwtown', role: 'participant', status: 'approved', meta: { first_name: 'Fwdtr', last_name: 'Owner', company: 'Fwdtr Metals', phone: '+32471579001' } });
  sender = await createAccount({ label: 'fwtsnd', role: 'participant', status: 'approved', meta: { first_name: 'Fwdtr', last_name: 'Sender', company: 'Fwdtr Trading', phone: '+32471579002' } });
  third  = await createAccount({ label: 'fwtthr', role: 'participant', status: 'approved', meta: { first_name: 'Fwdtr', last_name: 'Third', company: 'Fwdtr Third', phone: '+32471579003' } });
  const { rows } = await query(
    `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', 'Copper Cathodes', 100, 'Metric tons', 'FOB', 'Chile', 'available', public.next_reference('sell'))
     returning reference_number`, [owner.profileId]);
  listingRef = rows[0].reference_number;
  for (const [k, body] of Object.entries(MSG)) {
    const r = await query(
      `insert into public.messages (sender_id, listing_id, body, status)
       values ($1, (select id from public.listings where reference_number = $2), $3, 'pending_review') returning id`,
      [sender.profileId, listingRef, body]);
    idOf[k] = r.rows[0].id;
  }
});
test.afterAll(async () => { await cleanup(); });

test.describe('the forward window', () => {

  test('Item27 the Operator translates, forwards, and the recipient reads the original with the translation below it, in English and in Spanish', async ({ page, browser }) => {
    await stub(page, TRANSLATION);
    await openForward(page, MSG.shown);
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText(TRANSLATION);
    await expect(page.locator('#forward-edit')).toHaveAttribute('readonly', '');   // the original cannot be edited, nor can the translation
    await expect(page.locator('#forward-confirm-btn')).toBeEnabled();
    await page.click('#forward-confirm-btn');
    await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
    // What was stored: the original untouched, the translation exactly as shown, in the language chosen.
    expect(await forwardRow(MSG.shown)).toEqual([{ translation: TRANSLATION, translation_lang: 'en' }]);
    const { rows } = await query(`select body from public.messages where id = $1`, [idOf.shown]);
    expect(rows[0].body).toBe(MSG.shown);

    // The recipient (the listing owner): the original, and the translation BELOW it, with no label of any kind.
    const ctx = await browser.newContext();
    const mp = await ctx.newPage();
    await signIn(mp, owner, 'app.html');
    await openScreen(mp, 'mailbox');
    const row = mp.locator('#mailbox-list .list-row', { hasText: MSG.shown });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.locator('[data-forward-translation]')).toHaveText(TRANSLATION);
    const order = await row.evaluate((el) => {
      const t = el.innerText; return [t.indexOf('E2E fwdtr shown'), t.indexOf('We can offer five thousand')];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBeGreaterThan(order[0]);
    await expect(row.locator('[data-translate-btn]'), 'members get no translate button on messages').toHaveCount(0);
    // And in Spanish: both blocks are still there.
    await mp.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(row.locator('[data-forward-translation]')).toHaveText(TRANSLATION);
    await expect(row).toContainText(MSG.shown);
    await restoreEnglish(mp, owner.profileId);   // the Spanish choice is saved on the profile; the owner signs in again in later tests
    await ctx.close();
  });

  test('Item27 hiding the translation forwards the original alone', async ({ page }) => {
    await stub(page, TRANSLATION);
    await openForward(page, MSG.hidden);
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText(TRANSLATION);
    await page.click('#forward-translate-btn');                                   // Hide translation
    await expect(page.locator('#forward-translation')).toBeHidden();
    await page.click('#forward-confirm-btn');
    await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
    expect(await forwardRow(MSG.hidden)).toEqual([{ translation: null, translation_lang: null }]);
  });

  test('Item27 the "not available" sentence is never sent as a translation', async ({ page }) => {
    await stub(page, null);
    await openForward(page, MSG.down);
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText('Translation is not available right now. Please try again later.');
    await page.click('#forward-confirm-btn');
    await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
    expect(await forwardRow(MSG.down)).toEqual([{ translation: null, translation_lang: null }]);
  });

  test('Item27 a translation that holds a contact detail cannot be forwarded; hiding it frees the original', async ({ page }) => {
    await stub(page, WITH_EMAIL);
    await openForward(page, MSG.contact);
    await expect(page.locator('#forward-confirm-btn')).toBeEnabled();
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText(WITH_EMAIL);
    await expect(page.locator('#forward-confirm-btn')).toBeDisabled();
    await expect(page.locator('#forward-flags')).toContainText('in the translation');
    await page.click('#forward-translate-btn');                                   // hide it
    await expect(page.locator('#forward-confirm-btn')).toBeEnabled();
    await expect(page.locator('#forward-flags')).toHaveText('');
    // Nothing was forwarded while it was blocked.
    expect(await forwardRow(MSG.contact)).toEqual([]);
  });

  test('Item27 a forward made without pressing Translate is exactly what it was before, and a translation does not carry over to the next message', async ({ page }) => {
    await stub(page, TRANSLATION);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    // Open the contact message (still unforwarded), translate, close without forwarding.
    const contactRow = page.locator('#operator-mailbox-list .list-row', { hasText: MSG.contact });
    await contactRow.locator('[data-forward]').click();
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText(TRANSLATION);
    await page.click('#forward-cancel-btn');
    // The next message opens clean.
    const plainRow = page.locator('#operator-mailbox-list .list-row', { hasText: MSG.plain });
    await plainRow.locator('[data-forward]').click();
    await expect(page.locator('#forward-translation')).toBeHidden();
    await page.click('#forward-confirm-btn');
    await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
    expect(await forwardRow(MSG.plain)).toEqual([{ translation: null, translation_lang: null }]);
  });
});

test.describe('who sees the translation', () => {

  test('Item30 the recipient of a plain forward sees no extra block, and the sender of a translated one does not see the translation', async ({ browser }) => {
    // The recipient of the plain forward.
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    await signIn(p1, owner, 'app.html');
    await openScreen(p1, 'mailbox');
    const plainRow = p1.locator('#mailbox-list .list-row', { hasText: MSG.plain });
    await expect(plainRow).toBeVisible({ timeout: 20_000 });
    await expect(plainRow.locator('[data-forward-translation]')).toHaveCount(0);
    await ctx1.close();

    // The sender of the translated message: their own message, no translation under it.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await signIn(p2, sender, 'app.html');
    await openScreen(p2, 'mailbox');
    const own = p2.locator('#mailbox-list .list-row', { hasText: MSG.shown });
    await expect(own).toBeVisible({ timeout: 20_000 });
    await expect(own.locator('[data-forward-translation]')).toHaveCount(0);
    await expect(own).not.toContainText(TRANSLATION);
    await ctx2.close();

    // A third member sees none of it.
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    await signIn(p3, third, 'app.html');
    await openScreen(p3, 'mailbox');
    await expect(p3.locator('#mailbox-list')).not.toContainText('E2E fwdtr');
    await expect(p3.locator('#mailbox-list')).not.toContainText(TRANSLATION);
    await ctx3.close();
  });
});
