// Item78 (the Operator's message tools) - "Please reconcile", the mirror of "Ask member to rewrite" (owner's idea 4,
// mockup approved 17 Nov 2026; sql/068; docs/AGREED-2026-11-17-reconcile.md). It has no checklist row of its own: these
// tests belong to Item 78.
//
// WHAT IS PROVEN HERE
//   * the button exists ONLY when the sender has an earlier dated statement (a readiness tick on their own listing);
//   * the Operator must pick one statement; the member then receives ONE fixed text built from the owner's sentence,
//     in the member's own language (English or Spanish), quoting the statement, its last-confirmed date, the
//     message and the message's date;
//   * the message is put ON HOLD, is NOT forwarded to anyone, and the member's account is untouched (nothing is
//     judged, nothing is flagged, no account is closed);
//   * the Operator can still forward the message by hand afterwards; nothing is automatic;
//   * the member sees the reply and their own message marked "On hold".
// It was written in the same change as the feature and has NOT been run before CI: the browser suite needs a real
// project. Until it passes, nothing here is proven.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const ROOT = path.join(__dirname, '..', '..');
const TICK_EN = 'Prepared to proceed; financing is secured and any agreed payment instrument can be issued when required.';
const TICK_ES = 'Listo para avanzar; la financiación está asegurada y puede emitirse cualquier instrumento de pago acordado cuando sea necesario.';
const STATED_AT = '2026-11-10T12:00:00Z';   // noon UTC: the same calendar day in any timezone the runner could use
const WRITTEN_AT = '2026-11-15T12:00:00Z';
const MESSAGE = 'give me 3 weeks to arrange financing';
const MESSAGE_ES = 'let me have 3 weeks to organise the financing';   // not a substring of MESSAGE, nor MESSAGE of it
const PLAIN = 'E2E reconcile: is the copper still available?';

const EXPECT_EN = `On 10 Nov you confirmed '${TICK_EN}'. Your message of 15 Nov says '${MESSAGE}'. Please tell the Operator which is correct, or change your statement.`;
const EXPECT_ES = `El 10 de nov. confirmó '${TICK_ES}'. Su mensaje del 15 de nov. dice '${MESSAGE_ES}'. Indique al Operador cuál es correcto, o cambie su declaración.`;

test.describe.configure({ mode: 'serial' });

let operator, owner, sender, senderEs, plain, listingRef;

async function member(label, meta) { return createAccount({ label, role: 'participant', status: 'approved', meta }); }

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'i78rop', role: 'operator', status: 'approved' });
  owner    = await member('i78rowner', { first_name: 'Item78r', last_name: 'Ownerson', company: 'Ownerson Metals', phone: '+32471578101' });
  sender   = await member('i78rsend', { first_name: 'Item78r', last_name: 'Sender', company: 'Sender Trading', phone: '+32471578102' });
  senderEs = await member('i78rsendes', { first_name: 'Item78r', last_name: 'Remitente', company: 'Remitente SA', phone: '+32471578103' });
  plain    = await member('i78rplain', { first_name: 'Item78r', last_name: 'Plain', company: 'Plain Trading', phone: '+32471578104' });
  await query(`update public.profiles set language = 'es' where id = $1`, [senderEs.profileId]);

  const { rows } = await query(
    `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', 'Copper Cathodes', 100, 'Metric tons', 'FOB', 'Chile', 'available', public.next_reference('sell'))
     returning reference_number`, [owner.profileId]);
  listingRef = rows[0].reference_number;

  // Each of the two senders has an earlier dated statement: a buy request of their own with one readiness tick,
  // confirmed on 10 Nov. (Written by the server, as the suite's fixtures are, so the date is the one set here.)
  for (const who of [sender, senderEs]) {
    await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination, status, reference_number,
                                    poster_role, readiness, truth_confirmed_at)
       values ($1, 'buy', 'Copper Cathodes', 50, 'Metric tons', 'CIF', 'Belgium', 'available', public.next_reference('buy'),
               'principal', array['buy_ready'], $2)`, [who.profileId, STATED_AT]);
  }
  const post = (who, body) => query(
    `insert into public.messages (sender_id, listing_id, body, status, created_at)
     values ($1, (select id from public.listings where reference_number = $2), $3, 'pending_review', $4)`,
    [who.profileId, listingRef, body, WRITTEN_AT]);
  await post(sender, MESSAGE);
  await post(senderEs, MESSAGE_ES);
  await post(plain, PLAIN);
});

test.afterAll(async () => { await cleanup(); });

async function openForward(page, text) {
  await openScreen(page, 'mailbox');
  const row = page.locator('#operator-mailbox-list .list-row', { hasText: text });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();
  return row;
}

test('Item78 reconcile: the button is offered only when the sender has an earlier statement, and the Operator must pick one', async ({ page }) => {
  await signIn(page, operator, 'operator.html');

  // A sender with no earlier statement: no button, no statements box.
  await openForward(page, PLAIN);
  await expect(page.locator('#forward-confirm-btn')).toBeEnabled();
  await expect(page.locator('#forward-reconcile-btn')).toBeHidden();
  await expect(page.locator('#reconcile-box')).toBeHidden();
  await page.click('#forward-cancel-btn');

  // A sender who has one: the box and the button appear; the button waits for a choice.
  await openForward(page, MESSAGE);
  await expect(page.locator('#reconcile-box')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#reconcile-box')).toContainText('What this member stated earlier, on their own listing');
  await expect(page.locator('#reconcile-options label')).toHaveCount(1);
  // Owner decision 7: the Operator sees the sender's real name in the box.
  await expect(page.locator('#reconcile-box')).toContainText('Item78r Sender');
  await expect(page.locator('#reconcile-options')).toContainText('10/11/2026');
  await expect(page.locator('#reconcile-options')).toContainText(TICK_EN);
  await expect(page.locator('#forward-reconcile-btn')).toBeVisible();
  await expect(page.locator('#forward-reconcile-btn')).toBeDisabled();
  await page.check('#reconcile-options input[type="radio"]');
  await expect(page.locator('#forward-reconcile-btn')).toBeEnabled();
});

test('Item78 reconcile: the member gets the owner\'s sentence, the message is on hold, nobody is judged, and the Operator can still forward it', async ({ page }) => {
  const { rows: profileBefore } = await query(`select row_to_json(p) j from public.profiles p where id = $1`, [sender.profileId]);

  await signIn(page, operator, 'operator.html');
  await openForward(page, MESSAGE);
  await expect(page.locator('#reconcile-box')).toBeVisible({ timeout: 15_000 });
  await page.check('#reconcile-options input[type="radio"]');
  await page.click('#forward-reconcile-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });

  // ONE reply, exactly the fixed sentence, forwarded to the sender and to nobody else.
  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.messages m
         join public.message_forward_log mfl on mfl.message_id = m.id
        where m.body = $1 and mfl.to_user_id = $2
          and m.in_reply_to = (select id from public.messages where body = $3)`,
      [EXPECT_EN, sender.profileId, MESSAGE]);
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);

  // The original is ON HOLD and was not delivered to anyone.
  const { rows: st } = await query(`select status from public.messages where body = $1`, [MESSAGE]);
  expect(st[0].status).toBe('on_hold');
  const { rows: delivered } = await query(
    `select count(*)::int n from public.message_forward_log mfl join public.messages m on m.id = mfl.message_id where m.body = $1`, [MESSAGE]);
  expect(delivered[0].n).toBe(0);

  // PROHIBITION: nothing was judged and no account was touched. The sender's profile is identical.
  const { rows: profileAfter } = await query(`select row_to_json(p) j from public.profiles p where id = $1`, [sender.profileId]);
  expect(profileAfter[0].j, 'the member\'s profile changed').toEqual(profileBefore[0].j);
  expect(profileAfter[0].j.status).toBe('approved');

  // The Operator-only log keeps the original and the text that was sent.
  const { rows: logged } = await query(
    `select details from public.activity_log where action = 'message_reconcile_requested' and details->>'original_body' = $1`, [MESSAGE]);
  expect(logged.length).toBe(1);
  expect(logged[0].details.sent_text).toBe(EXPECT_EN);
  // PROHIBITION (decision 7): the real name is Operator-only. It is not in the text sent to the member.
  expect(logged[0].details.sent_text).not.toContain('Sender');
  const { rows: sentRows } = await query(`select body from public.messages where in_reply_to = (select id from public.messages where body = $1)`, [MESSAGE]);
  expect(sentRows.length).toBe(1);
  expect(sentRows[0].body).not.toMatch(/Item78r|Sender/);

  // The Operator's Mailbox: "On hold", with the buttons still there (nothing is automatic).
  await page.reload();
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 20_000 });
  await openScreen(page, 'mailbox');
  const held = page.locator('#operator-mailbox-list .list-row', { hasText: MESSAGE }).filter({ hasNot: page.locator('text=Please tell the Operator') });
  await expect(held.first().locator('.badge')).toHaveText('On hold', { timeout: 15_000 });
  await expect(held.first().locator('[data-forward]')).toHaveCount(1);

  // By hand: Forward. "Please reconcile" is not offered again for a message already on hold.
  await held.first().locator('[data-forward]').click();
  await expect(page.locator('#forward-modal')).toBeVisible();
  await expect(page.locator('#forward-reconcile-btn')).toBeHidden();
  await page.click('#forward-confirm-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.message_forward_log mfl join public.messages m on m.id = mfl.message_id
        where m.body = $1 and mfl.to_user_id = $2`, [MESSAGE, owner.profileId]);
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);
});

test('Item78 reconcile: a Spanish-speaking member gets the Spanish text, and the Spanish sentences are the site\'s own', async ({ page }) => {
  // The Spanish ticks in the Operator console must be the same sentences as the site's Spanish (js/i18n.js).
  const operatorJs = fs.readFileSync(path.join(ROOT, 'js', 'operator.js'), 'utf8');
  const i18nJs = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
  for (const [key, en, es] of [
    ['own_available', 'Own production: goods available.', 'Producción propia: mercancía disponible.'],
    ['own_scheduled', 'Own production: available on a production schedule.', 'Producción propia: disponible según un calendario de producción.'],
    ['ex_stock', 'Ex-stock: goods available, title held.', 'Ex-stock: mercancía disponible, titularidad en mi poder.'],
    ['back_to_back', 'Back-to-back: supply contract in place.', 'Back-to-back: contrato de suministro vigente.'],
    ['buy_ready', TICK_EN, TICK_ES],
  ]) {
    expect(i18nJs, `i18n.js lost the Spanish sentence for ${key}`).toContain(`'stmt.ready.${key}': '${es}'`);
    expect(i18nJs, `i18n.js lost the English sentence for ${key}`).toContain(`'stmt.ready.${key}': '${en}'`);
    expect(operatorJs, `operator.js drifted from i18n.js for ${key} (Spanish)`).toContain(es);
    expect(operatorJs, `operator.js drifted from i18n.js for ${key} (English)`).toContain(en);
  }

  await signIn(page, operator, 'operator.html');
  await openForward(page, MESSAGE_ES);
  await expect(page.locator('#reconcile-box')).toBeVisible({ timeout: 15_000 });
  await page.check('#reconcile-options input[type="radio"]');
  await page.click('#forward-reconcile-btn');
  await expect(page.locator('#forward-modal')).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => {
    const r = await query(
      `select count(*)::int n from public.messages m join public.message_forward_log mfl on mfl.message_id = m.id
        where m.body = $1 and mfl.to_user_id = $2`, [EXPECT_ES, senderEs.profileId]);
    return r.rows[0].n;
  }, { timeout: 20_000 }).toBe(1);
});

test('Item78 reconcile: the member sees the Operator\'s reply and their own message marked On hold', async ({ page }) => {
  // The Spanish-speaking sender's message is still on hold (the earlier test forwarded the other one by hand).
  await signIn(page, senderEs, 'app.html');
  await openScreen(page, 'mailbox');
  await expect(page.locator('#mailbox-list')).toContainText(EXPECT_ES, { timeout: 15_000 });
  const mine = page.locator('#mailbox-list .list-row', { hasText: MESSAGE_ES }).filter({ hasNot: page.locator('text=Indique al Operador') });
  // "On hold" in English, "En espera" in Spanish: the page shows the member's own language.
  await expect(mine.first().locator('.badge')).toHaveText(/^(On hold|En espera)$/);
  // Decision 7: nothing a member can load carries the Operator box for the sender's name.
  for (const f of ['app.html', 'js/app.js']) {
    expect(fs.readFileSync(path.join(ROOT, f), 'utf8'), f).not.toContain('reconcile-sender');
  }
});
