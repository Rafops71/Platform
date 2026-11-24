// Operator screen gaps (supervisor's brief of 23 Nov 2026; docs/AGREED-2026-11-23-operator-screen-gaps.md).
//
//   Item90  The Operator can read both listings of a match suggestion, and translate their free text with one control
//   Item91  The Operator can read the listing a deal file is about, and translate its free text
//   Item92  Pending approvals and the member list show each member's job title, signing capacity and language
//   Item93  The Operator's approvals and member list never show a member's postal address   (MUST NOT)
//
// Each has a PARITY test with no database (the code reads the fields, one Translate control, no address field anywhere in
// the member rows) and a browser test (the screen). The Operator console is English only; operator-translate is stubbed
// here: this proves the screens, not the translation.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fn(src, name) {
  const m = src.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`));
  expect(m, `function ${name} not found`).not.toBeNull();
  return m[0];
}
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(?<![:"'`\\])\/\/.*$/gm, '');

test.describe('parity: the new panels are built from the same pieces as All Listings', () => {

  test('Item90 a match panel shows every listing through the All Listings panel and has exactly one Translate control', () => {
    const op = read('js/operator.js');
    const panel = stripComments(fn(op, 'matchReadHtml'));
    expect(panel).toContain('listingReadHtml(l, false)');          // each side: the same fields as All Listings, no control of its own
    expect((panel.match(/translateControlHtml\(\)/g) || []).length, 'one Translate control for the whole match panel').toBe(1);
    const load = stripComments(fn(op, 'loadMatches'));
    expect(stripComments(fn(op, 'buildMatchRead'))).toContain(".from('listings').select('*').in('id', [a.id, b.id])");   // whole listings, so every field Browse shows is there
    expect(stripComments(fn(op, 'buildMatchRead'))).toContain('matchReadHtml(sides)');
    expect(load).toContain('buildMatchRead(a, b)');
    expect(load).toContain('data-read-match');
  });

  test('Item91 a deal panel is the All Listings panel of the deal\'s listing', () => {
    const load = stripComments(fn(read('js/operator.js'), 'loadDeals'));
    expect(load).toContain('data-read-deal');
    expect(load).toContain("select('*').eq('id', d.listing_id)");
    expect(load).toContain('listingReadHtml(l)');
  });

  test('Item92 the member rows read job title, signing capacity and language', () => {
    const op = read('js/operator.js');
    const facts = stripComments(fn(op, 'memberFactsLine'));
    for (const f of ['job_title', 'signing_capacity', 'language']) expect(facts, `memberFactsLine no longer reads ${f}`).toContain(`p.${f}`);
    for (const screen of ['loadApprovals', 'loadUsers']) {
      expect(stripComments(fn(op, screen)), `${screen} does not show the facts line`).toContain('memberFactsLine(p)');
    }
  });

  test('Item93 no address field is read by the approvals list, the member list or the facts line', () => {
    const op = read('js/operator.js');
    for (const name of ['loadApprovals', 'loadUsers', 'memberFactsLine']) {
      const code = stripComments(fn(op, name));
      for (const f of ['address_line1', 'address_line2', 'city', 'postal_code', 'address']) {
        expect(code, `${name} reads ${f}`).not.toMatch(new RegExp(`\\bp\\.${f}\\b`));
      }
    }
  });
});

test.describe('the screens', () => {
  test.describe.configure({ mode: 'serial' });
  let operator, seller, buyer, pending, refSell, refBuy, matchId, dealId;
  const SELL_SPEC = 'Concentrado de cobre, 28% Cu mínimo';
  const BUY_NOTES = 'Necesitamos embarque en abril';
  const STREET = 'Secretstraat 99';

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    assertConfigured();
    await cleanup();
    operator = await createAccount({ label: 'opgap', role: 'operator', status: 'approved' });
    seller = await createAccount({ label: 'opgapsell', role: 'participant', status: 'approved',
      meta: { first_name: 'Selwyn', last_name: 'Gapfield', company: 'Gapfield Metals', phone: '+32471559021' } });
    buyer = await createAccount({ label: 'opgapbuy', role: 'participant', status: 'approved',
      meta: { first_name: 'Brenna', last_name: 'Gapmere', company: 'Gapmere Trading', phone: '+32471559022' } });
    pending = await createAccount({ label: 'opgappend', role: 'participant', status: 'pending',
      meta: { first_name: 'Pendrick', last_name: 'Gapstone', company: 'Gapstone BV', phone: '+32471559023' } });
    await query(
      `update public.profiles set job_title = 'Head of Trading', signing_capacity = 'company', language = 'es',
              address_line1 = $2, city = 'Antwerpgap', postal_code = '9999ZZ'
        where id = $1`, [pending.profileId, STREET]);
    const s = await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number,
         specification, price_conditions, currency, price_unit, poster_role, principal_kind, truth_confirmed_at)
       values ($1, 'sell', 'Copper Concentrate', 100, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'),
         $2, '13850', 'USD', 'Metric tons', 'principal', 'producer', now())
       returning id, reference_number`, [seller.profileId, SELL_SPEC]);
    const b = await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination, status, reference_number,
         notes, price_conditions, currency, price_unit, poster_role, truth_confirmed_at)
       values ($1, 'buy', 'Copper Concentrate', 80, 'Metric tons', 'CIF', 'Belgium', 'available', public.next_reference('buy'),
         $2, '14000', 'USD', 'Metric tons', 'broker', now())
       returning id, reference_number`, [buyer.profileId, BUY_NOTES]);
    refSell = s.rows[0].reference_number; refBuy = b.rows[0].reference_number;
    const m = await query(
      `insert into public.matches (listing_a_id, listing_b_id, score) values ($1, $2, 'high')
       on conflict (listing_a_id, listing_b_id) do update set status = 'new' returning id`, [s.rows[0].id, b.rows[0].id]);
    matchId = m.rows[0].id;
    const d = await query(
      `insert into public.deals (listing_id, listing_ref, owner_id, counterparty_id) values ($1, $2, $3, $4) returning id`,
      [s.rows[0].id, refSell, seller.profileId, buyer.profileId]);
    dealId = d.rows[0].id;
  });
  test.afterAll(async () => { await cleanup(); });

  const stubEcho = (page) => page.route('**/functions/v1/operator-translate', (route) => {
    const sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ translated_text: `[${sent.source_lang}>${sent.target_lang}] ${sent.text}` }) });
  });

  test('Item90 Read on a match suggestion shows both listings in full, with ONE Translate control at the bottom', async ({ page }) => {
    await stubEcho(page);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'matches');
    const row = page.locator('#matches-list .list-row', { hasText: refSell });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-read-match]').click();
    const panel = row.locator('[data-match-read]');
    await expect(panel).toBeVisible();
    await expect(panel.locator(`[data-read-block="${refSell}"]`)).toBeVisible();
    await expect(panel.locator(`[data-read-block="${refBuy}"]`)).toBeVisible();
    await expect(panel).toContainText(`Specification / Grade: ${SELL_SPEC}`);
    await expect(panel).toContainText(`Notes: ${BUY_NOTES}`);
    await expect(panel).toContainText('Sell offer');
    await expect(panel).toContainText('Buy request');
    await expect(panel).toContainText('13,850 USD per Metric tons');
    await expect(panel.locator('[data-translate-btn]')).toHaveCount(1);
    // At the very bottom: after the last listing's Posted line.
    const bottom = await panel.evaluate((el) => {
      const btn = el.querySelector('[data-translate-btn]');
      const metas = [...el.querySelectorAll('.list-row-meta')];
      return metas.every((m) => !!(m.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(bottom).toBe(true);
    await panel.locator('[data-translate-btn]').click();
    const box = panel.locator('[data-translation]');
    await expect(box.locator(`[data-read-translation="specification"][data-read-translation-listing="${refSell}"]`))
      .toContainText(`[es>en] ${SELL_SPEC}`);
    await expect(box.locator(`[data-read-translation="notes"][data-read-translation-listing="${refBuy}"]`))
      .toContainText(`[es>en] ${BUY_NOTES}`);
    await expect(panel).toContainText(`Notes: ${BUY_NOTES}`);                     // the original stays
    // Hide closes the panel.
    await row.locator('[data-read-match]').click();
    await expect(panel).toHaveCount(0);
    expect(matchId).toBeTruthy();
  });

  test('Item91 Read on a deal file shows the listing it is about, with the same single Translate control', async ({ page }) => {
    await stubEcho(page);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'deals');
    const row = page.locator(`[data-deal-row="${dealId}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-read-deal]').click();
    const panel = row.locator('[data-deal-read]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`Specification / Grade: ${SELL_SPEC}`);
    await expect(panel).toContainText('13,850 USD per Metric tons');
    await expect(panel.locator('[data-translate-btn]')).toHaveCount(1);
    await panel.locator('[data-translate-btn]').click();
    await expect(panel.locator('[data-read-translation="specification"]')).toHaveText(`Specification / Grade: [es>en] ${SELL_SPEC}`);
  });

  test('Item91 a deal whose listing has gone says so and offers nothing to translate', async ({ page }) => {
    const d = await query(
      `insert into public.deals (listing_id, listing_ref, owner_id, counterparty_id) values (null, 'SELL-GONE-001', $1, $2) returning id`,
      [seller.profileId, buyer.profileId]);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'deals');
    const row = page.locator(`[data-deal-row="${d.rows[0].id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-read-deal]').click();
    await expect(row.locator('[data-read-gone]')).toContainText('SELL-GONE-001');
    await expect(row.locator('[data-translate-btn]')).toHaveCount(0);
  });

  test('Item92 and Item93 a pending member row shows job title, signing capacity and language, and no address', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'approvals');
    const row = page.locator('#approvals-list .list-row', { hasText: 'Gapstone' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('[data-member-facts]')).toHaveText('Job title: Head of Trading · Signing as: Company · Language: Spanish');
    const text = await row.innerText();
    for (const secret of [STREET, 'Antwerpgap', '9999ZZ']) expect(text, `the row shows ${secret}`).not.toContain(secret);
  });

  test('Item92 and Item93 the member list shows the same facts, and no address', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'users');
    const row = page.locator('#users-list .list-row', { hasText: 'Gapstone' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('[data-member-facts]')).toHaveText('Job title: Head of Trading · Signing as: Company · Language: Spanish');
    const text = await row.innerText();
    for (const secret of [STREET, 'Antwerpgap', '9999ZZ']) expect(text, `the row shows ${secret}`).not.toContain(secret);
    // A member who has not filled these in shows "Not stated", not a blank.
    const other = page.locator('#users-list .list-row', { hasText: 'Gapfield' });
    await expect(other.locator('[data-member-facts]')).toContainText('Job title: Not stated');
  });
});
