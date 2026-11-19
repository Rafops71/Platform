// The Operator reads listings (owner, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 1).
//
//   Item89  The Operator can read every listing field a member sees in Browse, and translate the free text
//
// Two tests, because "the Operator can read it" has two halves:
//   1. A PARITY test with no database: it reads js/app.js (what Browse shows a member) and js/operator.js (what the
//      Operator's Read panel shows) and FAILS if Browse shows a listing field the Operator's code never touches.
//      Add a field to Browse and forget the Operator's panel, and this goes red.
//   2. A browser test: the Operator opens All Listings, presses Read on a listing that has every field filled, and
//      sees each one; the Translate control sends the field's own text to operator-translate (stubbed here: this
//      proves the screen, not the translation) and the original is never replaced.
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
/** Every property of a listing row `l` that a piece of source reads: l.something */
const fieldsRead = (code) => new Set([...code.matchAll(/\bl\.([a-z_]+)/g)].map((m) => m[1]));

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

  test('Item89 the Read panel builds the price the way Browse does, and offers Translate on text that has words and not on a bare number', () => {
    const op = read('js/operator.js');
    const price = fn(op, 'operatorPriceLine');
    expect(price).toContain('formatNumber(l.price_conditions)');
    expect(price).toContain('l.currency');
    expect(price).toContain('l.price_unit');
    expect(fn(op, 'readHasWords')).toContain('\\p{L}');
    expect(fn(op, 'listingReadHtml')).toContain('readHasWords(raw) ? translateControlHtml()');
  });
});

test.describe('the screen', () => {
  test.describe.configure({ mode: 'serial' });
  let operator, poster, listingId;
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
       returning id`, [poster.profileId, SPEC, NOTES]);
    listingId = rows[0].id;
    await query(`insert into public.document_checklist (listing_id, doc_type, indicated) values ($1, 'Certificate of Origin', true)`, [listingId]);
  });
  test.afterAll(async () => { await cleanup(); });

  test('Item89 the Operator presses Read on a listing and sees every field a member sees, translates a text field, and the original stays', async ({ page }) => {
    await page.route('**/functions/v1/operator-translate', (route) => {
      const sent = route.request().postDataJSON();
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ translated_text: `[${sent.source_lang}>${sent.target_lang}] ${sent.text}` }) });
    });
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');
    const row = page.locator('#listings-table tbody tr', { hasText: 'Readme Metals' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-read-listing]').click();
    const panel = page.locator('#listings-table tr.listing-read');
    await expect(panel).toBeVisible();
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
    // The price is a bare number: no Translate control on it. The two text fields each have one.
    await expect(panel.locator('[data-read-field="price_conditions"] [data-translate-btn]')).toHaveCount(0);
    await expect(panel.locator('[data-read-field="specification"] [data-translate-btn]')).toHaveCount(1);
    await expect(panel.locator('[data-read-field="notes"] [data-translate-btn]')).toHaveCount(1);
    // Translate the notes: the translation appears, the original stays, and it can be hidden.
    const notes = panel.locator('[data-read-field="notes"]');
    await notes.locator('[data-translate-btn]').click();
    await expect(notes.locator('[data-translation]')).toHaveText(`[es>en] ${NOTES}`);
    await expect(notes).toContainText(`Notes: ${NOTES}`);
    await expect(notes.locator('[data-translate-btn]')).toHaveText('Hide translation');
    await notes.locator('[data-translate-btn]').click();
    await expect(notes.locator('[data-translation]')).toBeHidden();
    // The other direction.
    await notes.locator('[data-translate-to]').selectOption('es');
    await notes.locator('[data-translate-btn]').click();
    await expect(notes.locator('[data-translation]')).toContainText('[en>es]');
    // Read again closes the panel; nothing was changed in the database.
    await row.locator('[data-read-listing]').click();
    await expect(panel).toHaveCount(0);
    const { rows } = await query(`select specification, notes, price_conditions from public.listings where id = $1`, [listingId]);
    expect(rows[0]).toEqual({ specification: SPEC, notes: NOTES, price_conditions: '13850' });
  });
});
