// The Operator reads listings (owner, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 1).
//
//   Item89  The Operator can read every listing field a member sees in Browse, and translate the free text
//
// Two tests, because "the Operator can read it" has two halves:
//   1. A PARITY test with no database: it reads js/app.js (what Browse shows a member) and js/operator.js (what the
//      Operator's Read panel shows) and FAILS if Browse shows a listing field the Operator's code never touches.
//      Add a field to Browse and forget the Operator's panel, and this goes red.
//   2. Browser tests: the Operator opens All Listings, presses Read on a listing that has every field filled, and
//      sees each one. There is ONE Translate control for the offer, under the free text (owner, 21 Nov: not one in the
//      middle of each field); one press translates every field that holds words and shows one labelled block per field
//      below it (operator-translate is stubbed here: this proves the screen, not the translation); the original is never
//      replaced; a field that fails shows the unavailable sentence and the others stay; a listing whose only text is a
//      bare price has no control at all.
// What Operator RLS allows was read, not assumed: listings_select is "owner or Operator" and document_checklist_select
// is "Operator or the listing's owner" (sql/rls_policies.sql, sql/002), so no migration is needed.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The source of one named function: from its first line to the first line that is just a closing brace. */
function fn(src, name) {
  const m = src.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`));
  expect(m, `function ${name} not found`).not.toBeNull();
  return m[0];
}
/** Source without its comments (block comments, whole-line comments and trailing comments), so a field named only in a
 *  comment is not counted as read. */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(?<![:"'`\\])\/\/.*$/gm, '');
/** Every property of a listing row `l` that a piece of source reads: l.something (in code, never in a comment) */
const fieldsRead = (code) => new Set([...stripComments(code).matchAll(/\bl\.([a-z_]+)/g)].map((m) => m[1]));

test.describe('parity: what Browse shows and what the Operator can read', () => {

  test('Item89 every listing field Browse shows a member is read somewhere in the Operator\'s All Listings and Read panel', () => {
    const app = read('js/app.js'), op = read('js/operator.js');
    const browse = new Set([
      ...fieldsRead(fn(app, 'loadBrowseListings')), ...fieldsRead(fn(app, 'priceLine')),
      ...fieldsRead(fn(app, 'statementsLine')), ...fieldsRead(fn(app, 'statementsDateLine')),
    ]);
    // Sanity: the scan found the fields it should (if Browse is rewritten and this finds nothing, say so).
    for (const known of ['reference_number', 'commodity', 'specification', 'price_conditions', 'notes', 'region', 'has_documents', 'created_at']) {
      expect(browse.has(known), `the scan of Browse no longer finds "${known}"`).toBe(true);
    }
    const operator = new Set([
      ...fieldsRead(fn(op, 'loadListings')), ...fieldsRead(fn(op, 'listingReadHtml')),
      ...fieldsRead(fn(op, 'operatorPriceLine')), ...fieldsRead(fn(op, 'posterDetail')),
    ]);
    // Browse's "region" is origin for a sell offer and destination for a buy request (get_public_listings).
    // "id" is only the row's own key. The fields below are not content a member reads.
    const covers = { region: ['origin', 'destination'] };
    const ignored = new Set(['id']);
    const missing = [...browse].filter((f) => !ignored.has(f)
      && !(covers[f] ? covers[f].every((c) => operator.has(c)) : operator.has(f)));
    expect(missing, `Browse shows these listing fields to members but the Operator's panel never reads them: ${missing.join(', ')}`).toEqual([]);
  });

  test('Item89 a field named only in a comment does not count as read (the scan ignores comments)', () => {
    const code = "// l.notes is shown elsewhere\n/* l.specification */\nconst a = l.price_conditions; // l.docs_seen\nconst b = l.created_at;//l.origin\nconst u = 'https://x.example/' + l.currency;\n";
    expect([...fieldsRead(code)].sort()).toEqual(['created_at', 'currency', 'price_conditions']);
  });

  test('Item89 the Read panel builds the price the way Browse does, and offers Translate on text that has words and not on a bare number', () => {
    const op = read('js/operator.js');
    const price = fn(op, 'operatorPriceLine');
    expect(price).toContain('formatNumber(l.price_conditions)');
    expect(price).toContain('l.currency');
    expect(price).toContain('l.price_unit');
    expect(fn(op, 'readHasWords')).toContain('\\p{L}');
    const html = fn(op, 'listingReadHtml');
    expect((html.match(/translateControlHtml\(\)/g) || []).length, 'one Translate control per listing, not one per field').toBe(1);
    // It sits after the free text (Notes) and before the poster lines, as Browse puts its one button under the text.
    expect(html.indexOf("field('notes'")).toBeGreaterThan(-1);
    expect(html.indexOf('data-read-translate')).toBeGreaterThan(html.indexOf("field('notes'"));
    expect(html.indexOf('data-read-translate')).toBeLessThan(html.indexOf('Poster:'));
  });
});

test.describe('the screen', () => {
  test.describe.configure({ mode: 'serial' });
  let operator, poster, listingId, refFull, refPriceOnly;
  const SPEC = 'Concentrado de cobre, 28% Cu mínimo';
  const NOTES = 'Embarque en marzo, puerto de Callao';

  test.beforeAll(async () => {
    assertConfigured();
    await cleanup();
    operator = await createAccount({ label: 'oprl', role: 'operator', status: 'approved' });
    poster = await createAccount({ label: 'oprlpost', role: 'participant', status: 'approved',
      meta: { first_name: 'Readme', last_name: 'Poster', company: 'Readme Metals', phone: '+32471559011' } });
    const { rows } = await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number,
         specification, price_conditions, currency, price_unit, notes, poster_role, principal_kind, docs_seen, truth_confirmed_at)
       values ($1, 'sell', 'Copper Concentrate', 100, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'),
         $2, '13850', 'USD', 'Metric tons', $3, 'principal', 'producer', 'yes', now())
       returning id, reference_number`, [poster.profileId, SPEC, NOTES]);
    listingId = rows[0].id; refFull = rows[0].reference_number;
    await query(`insert into public.document_checklist (listing_id, doc_type, indicated) values ($1, 'Certificate of Origin', true)`, [listingId]);
    // A listing whose only free text is a bare price: nothing to translate.
    const b = await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, price_conditions, currency, price_unit)
       values ($1, 'sell', 'Antimony', 5, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'), '9100', 'USD', 'Metric tons')
       returning reference_number`, [poster.profileId]);
    refPriceOnly = b.rows[0].reference_number;
  });
  test.afterAll(async () => { await cleanup(); });

  const stubEcho = (page) => page.route('**/functions/v1/operator-translate', (route) => {
    const sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ translated_text: `[${sent.source_lang}>${sent.target_lang}] ${sent.text}` }) });
  });
  const openRead = async (page, ref) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');
    const row = page.locator('#listings-table tbody tr', { hasText: ref });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-read-listing]').click();
    const panel = page.locator('#listings-table tr.listing-read');
    await expect(panel).toBeVisible();
    return { row, panel };
  };

  test('Item89 the Operator presses Read on a listing and sees every field a member sees, and the original stays', async ({ page }) => {
    await stubEcho(page);
    const { row, panel } = await openRead(page, refFull);
    // Every field, as Browse words it in English.
    await expect(panel).toContainText('Sell offer');
    await expect(panel).toContainText('100 Metric tons');
    await expect(panel).toContainText('FOB');
    await expect(panel).toContainText('Origin: Peru');
    await expect(panel).toContainText(`Specification / Grade: ${SPEC}`);
    await expect(panel).toContainText('Price: 13,850 USD per Metric tons');
    await expect(panel).toContainText(`Notes: ${NOTES}`);
    await expect(panel).toContainText('Documents indicated');
    await expect(panel).toContainText('Documents: Seen by the poster');
    // Read again closes the panel; nothing was changed in the database.
    await row.locator('[data-read-listing]').click();
    await expect(panel).toHaveCount(0);
    const { rows } = await query(`select specification, notes, price_conditions from public.listings where id = $1`, [listingId]);
    expect(rows[0]).toEqual({ specification: SPEC, notes: NOTES, price_conditions: '13850' });
  });

  test('Item89 there is ONE Translate control, under the free text; one press translates every field with words, one labelled block each, below the control', async ({ page }) => {
    await stubEcho(page);
    const { panel } = await openRead(page, refFull);
    // One control for the whole offer, not one per field, and none inside a field.
    await expect(panel.locator('[data-translate-btn]')).toHaveCount(1);
    await expect(panel.locator('[data-read-field] [data-translate-btn]')).toHaveCount(0);
    // It sits after Notes (the end of the free text) and before the poster lines.
    const order = await panel.evaluate((el) => {
      const text = (n) => el.innerText.indexOf(n);
      const btn = el.querySelector('[data-translate-btn]');
      const notes = el.querySelector('[data-read-field="notes"]');
      const poster = [...el.querySelectorAll('.list-row-meta')].find((d) => d.innerText.startsWith('Poster:'));
      const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { afterNotes: follows(notes, btn), beforePoster: follows(btn, poster), noteAt: text('Notes:') };
    });
    expect(order.afterNotes).toBe(true);
    expect(order.beforePoster).toBe(true);

    await panel.locator('[data-translate-btn]').click();
    const box = panel.locator('[data-translation]');
    await expect(box.locator('[data-read-translation="specification"]')).toHaveText(`Specification / Grade: [es>en] ${SPEC}`);
    await expect(box.locator('[data-read-translation="notes"]')).toHaveText(`Notes: [es>en] ${NOTES}`);
    await expect(box.locator('[data-read-translation]')).toHaveCount(2);       // the bare price has no block
    await expect(panel.locator('[data-translate-btn]')).toHaveText('Hide translation');
    // The translation is BELOW the control, and the originals above are still there.
    const below = await panel.evaluate((el) => {
      const btn = el.querySelector('[data-translate-btn]'); const box = el.querySelector('[data-translation]');
      return !!(btn.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(below).toBe(true);
    await expect(panel).toContainText(`Notes: ${NOTES}`);
    // Pressing again hides all of it.
    await panel.locator('[data-translate-btn]').click();
    await expect(box).toBeHidden();
    await expect(panel.locator('[data-translate-btn]')).toHaveText('Translate');
    // The other language, and changing the language hides what is shown.
    await panel.locator('[data-translate-to]').selectOption('es');
    await panel.locator('[data-translate-btn]').click();
    await expect(box.locator('[data-read-translation="notes"]')).toContainText('[en>es]');
    await panel.locator('[data-translate-to]').selectOption('en');
    await expect(box).toBeHidden();
  });

  test('Item89 a field that fails shows the console\'s unavailable sentence and the other fields stay', async ({ page }) => {
    await page.route('**/functions/v1/operator-translate', (route) => {
      const sent = route.request().postDataJSON();
      if (sent.text === NOTES) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translated_text: `[ok] ${sent.text}` }) });
    });
    const { panel } = await openRead(page, refFull);
    await panel.locator('[data-translate-btn]').click();
    const box = panel.locator('[data-translation]');
    await expect(box.locator('[data-read-translation="specification"]')).toHaveText(`Specification / Grade: [ok] ${SPEC}`);
    await expect(box.locator('[data-read-translation="notes"]')).toHaveText('Notes: Translation is not available right now. Please try again later.');
    await expect(panel.locator('[data-translate-btn]')).toHaveText('Hide translation');   // something was translated
  });

  test('Item89 when every field fails, only the unavailable sentences show and the control stays "Translate"', async ({ page }) => {
    await page.route('**/functions/v1/operator-translate', (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }));
    const { panel } = await openRead(page, refFull);
    await panel.locator('[data-translate-btn]').click();
    const box = panel.locator('[data-translation]');
    await expect(box.locator('[data-read-translation]')).toHaveCount(2);
    await expect(box).toContainText('Translation is not available right now. Please try again later.');
    await expect(panel.locator('[data-translate-btn]')).toHaveText('Translate');
  });

  test('Item89 a listing whose only text is a bare price has no Translate control at all', async ({ page }) => {
    await stubEcho(page);
    const { panel } = await openRead(page, refPriceOnly);
    await expect(panel).toContainText('Price: 9,100 USD per Metric tons');
    await expect(panel.locator('[data-translate-btn], [data-translate-to], [data-translation]')).toHaveCount(0);
  });
});
