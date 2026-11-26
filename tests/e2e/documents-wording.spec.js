// The documents question is asked by role, in the owner's approved words (23 Nov 2026;
// docs/AGREED-2026-11-23-documents-wording.md).
//
//   Item94  A Sell offer asks a broker or mandated intermediary whether it has sighted supporting documentation, and a
//           principal whether it holds it; the answer is stored
//   Item95  Browse shows the line in the words of the listing member's role, and never a principal's older yes or no
//   Item96  The Operator's Read panel shows the same words as Browse
//   Item97  Existing answers are never deleted, mapped or rewritten (MUST NOT)
//   Item98  The words never say or imply that a document was verified (MUST NOT)
//
// The parity tests need no database; the screen tests do (written, not run from the author's session).

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** { en: {key: value}, es: {...} } read from js/i18n.js without running the browser. */
function strings() {
  const out = { en: {}, es: {} };
  let lang = null;
  for (const line of read('js/i18n.js').split('\n')) {
    if (/^  en: \{/.test(line)) lang = 'en'; else if (/^  es: \{/.test(line)) lang = 'es'; else if (/^  \},?\s*$/.test(line)) lang = null;
    const m = lang && /^\s+'([^']+)':\s*(['"])(.*)\2,?\s*$/.exec(line);
    if (m) out[lang][m[1]] = m[3].replace(/\\'/g, "'");
  }
  return out;
}

const APPROVED = {
  'stmt.browse.role': 'Listing member',
  'stmt.browse.docs': 'Supporting documentation status',
  'stmt.browse.docsPrincipal': 'Supporting documentation',
  'stmt.browse.docs.yes': 'Documents sighted',
  'stmt.browse.docs.no': 'Documents not sighted',
  'stmt.browse.docs.source_says': 'Documents not sighted; availability advised by source',
  'stmt.browse.docs.held': 'Documentation held and available',
  'stmt.browse.docs.not_held': 'Documentation not currently held',
  'stmt.browse.stated': 'Stated by the listing member on {date}',
  'stmt.browse.docsLine': 'Document exchange: after the introduction, subject to agreement between the parties.',
  'stmt.docsSeen.q': 'Have you sighted supporting documentation for this offer?',
  'stmt.docsHeld.q': 'Do you hold the supporting documentation for this offer?',
  'stmt.docsSeen.yes': 'Documents sighted',
  'stmt.docsSeen.no': 'Documents not sighted',
  'stmt.docsSeen.source_says': 'Documents not sighted; availability advised by source',
  'stmt.docsHeld.held': 'Documentation held and available',
  'stmt.docsHeld.not_held': 'Documentation not currently held',
};

test.describe('parity: the approved words, and the same words in the Operator\'s panel', () => {

  test('Item94 and Item95 every approved English line is in js/i18n.js exactly as the owner approved it', () => {
    const en = strings().en;
    for (const [key, text] of Object.entries(APPROVED)) expect(en[key], key).toBe(text);
  });

  test('Item96 the Operator\'s Read panel uses the same words as Browse, for the member and for every answer', () => {
    const en = strings().en;
    const op = read('js/operator.js');
    const labels = op.match(/const READ_DOCS_LABELS = \{([\s\S]*?)\};/)[1];
    for (const answer of ['yes', 'no', 'source_says', 'held', 'not_held']) {
      const m = new RegExp(`\\b${answer}: '([^']+)'`).exec(labels);
      expect(m, `the Operator's panel has no label for ${answer}`).not.toBeNull();
      expect(m[1], answer).toBe(en[`stmt.browse.docs.${answer}`]);
    }
    expect(op).toContain(`Listing member: \${escapeHtml(posterDetail(l))}`);
    expect(en['stmt.browse.role']).toBe('Listing member');
    expect(op).toContain("'Supporting documentation' : 'Supporting documentation status'");
    expect(op).not.toMatch(/Poster: \$\{|Documents seen by poster|Seen by the poster/);
  });

  test('Item98 no word of the documentation fields says or implies verification, in English or Spanish', () => {
    const all = strings();
    const op = read('js/operator.js').match(/const READ_DOCS_LABELS = \{([\s\S]*?)\};/)[1];
    const bad = /verif|certif|authentic|genuine|valid|confirm|checked|inspect|guarantee|verific|certific|autentic|genuin|compro|garant|inspecc/i;
    for (const lang of ['en', 'es']) {
      for (const [key, text] of Object.entries(all[lang])) {
        if (!/^stmt\.(docsSeen|docsHeld|browse\.docs)/.test(key) && key !== 'stmt.browse.role' && key !== 'stmt.browse.stated') continue;
        expect(text, `${lang} ${key}`).not.toMatch(bad);
      }
    }
    expect(op).not.toMatch(bad);
  });

  test('Item97 the form reads the answer of the question the role was asked, and an older answer with no option is left empty, not mapped', () => {
    const app = read('js/app.js');
    expect(app).toContain("document.getElementById(role === 'principal' ? 'docs_held' : 'docs_seen').value");
    expect(app).toContain("['held', 'not_held'].includes(listing.docs_seen) ? listing.docs_seen : ''");
    expect(app).toContain("['yes', 'source_says', 'no'].includes(listing.docs_seen) ? listing.docs_seen : ''");
    expect(app).not.toMatch(/yes.*->.*held|=== 'yes' \? 'held'/);
  });
});

test.describe('the screens', () => {
  test.describe.configure({ mode: 'serial' });
  let member, reader, operator, refHeld, refBroker, refLegacy, idLegacy;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    assertConfigured();
    await cleanup();
    operator = await createAccount({ label: 'dwop', role: 'operator', status: 'approved' });
    member = await createAccount({ label: 'dwmem', role: 'participant', status: 'approved',
      meta: { first_name: 'Dorian', last_name: 'Wordmere', company: 'Wordmere Metals', phone: '+32471559031' } });
    reader = await createAccount({ label: 'dwread', role: 'participant', status: 'approved',
      meta: { first_name: 'Rhea', last_name: 'Readfield', company: 'Readfield Trading', phone: '+32471559032' } });
    const mk = async (commodity, role, kind, answer, extra = '') => (await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number,
         poster_role, principal_kind, broker_via, docs_seen, truth_confirmed_at)
       values ($1, 'sell', $2, 10, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'), $3, $4, $5, $6, now())
       returning id, reference_number`,
      [member.profileId, commodity, role, kind, role === 'broker' ? 'principal' : null, answer])).rows[0];
    const a = await mk('Copper Concentrate', 'principal', 'producer', 'held');
    const b = await mk('Zinc Ingots', 'broker', null, 'source_says');
    const c = await mk('Antimony', 'principal', 'trader', 'yes');       // an OLDER principal answer
    refHeld = a.reference_number; refBroker = b.reference_number; refLegacy = c.reference_number; idLegacy = c.id;
  });
  test.afterAll(async () => { await cleanup(); });

  test('Item94 the form asks a principal "Do you hold ...", a broker or mandated intermediary "Have you sighted ...", and a Buy request nothing', async ({ page }) => {
    await signIn(page, member, 'app.html');
    await openScreen(page, 'new-listing');
    await page.check('input[name="type"][value="sell"]');
    await expect(page.locator('#docs-seen-row'), 'no question before a role is chosen').toBeHidden();
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#docs-held-block')).toBeVisible();
    await expect(page.locator('#docs-sighted-block')).toBeHidden();
    await expect(page.locator('label[for="docs_held"]')).toContainText('Do you hold the supporting documentation for this offer?');
    expect(await page.locator('#docs_held option').allTextContents()).toEqual(['Choose…', 'Documentation held and available', 'Documentation not currently held']);
    await page.selectOption('#poster_role', 'broker');
    await expect(page.locator('#docs-sighted-block')).toBeVisible();
    await expect(page.locator('#docs-held-block')).toBeHidden();
    await expect(page.locator('label[for="docs_seen"]')).toContainText('Have you sighted supporting documentation for this offer?');
    expect(await page.locator('#docs_seen option').allTextContents())
      .toEqual(['Choose…', 'Documents sighted', 'Documents not sighted', 'Documents not sighted; availability advised by source']);
    await page.selectOption('#poster_role', 'mandated');
    await expect(page.locator('#docs-sighted-block')).toBeVisible();
    await page.check('input[name="type"][value="buy"]');
    await expect(page.locator('#docs-seen-row'), 'a Buy request is asked nothing').toBeHidden();
  });

  test('Item95 Browse shows each role\'s words, and nothing at all for a principal\'s older answer', async ({ page }) => {
    await signIn(page, reader, 'app.html');
    await openScreen(page, 'browse');
    const line = (ref) => page.locator('.list-row', { hasText: ref }).locator('[data-statements]');
    await expect(line(refHeld)).toHaveText('Listing member: Principal (Producer) · Supporting documentation: Documentation held and available', { timeout: 15_000 });
    await expect(line(refBroker)).toHaveText('Listing member: Broker · Supporting documentation status: Documents not sighted; availability advised by source');
    await expect(line(refLegacy)).toHaveText('Listing member: Principal (Trader)');
    await expect(page.locator('.list-row', { hasText: refHeld }).locator('[data-statements-date]')).toContainText('Stated by the listing member on');
    await expect(page.locator('.list-row', { hasText: refHeld }).locator('[data-docs-line]'))
      .toHaveText('Document exchange: after the introduction, subject to agreement between the parties.');
  });

  test('Item96 the Operator\'s Read panel shows the same words as Browse', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');
    const read = async (ref) => {
      const row = page.locator('#listings-table tbody tr', { hasText: ref });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.locator('[data-read-listing]').click();
      return page.locator('#listings-table tr.listing-read');
    };
    let panel = await read(refHeld);
    await expect(panel).toContainText('Listing member: Principal (Producer)');
    await expect(panel).toContainText('Supporting documentation: Documentation held and available');
    await page.locator('#listings-table tbody tr', { hasText: refHeld }).locator('[data-read-listing]').click();
    panel = await read(refBroker);
    await expect(panel).toContainText('Supporting documentation status: Documents not sighted; availability advised by source');
    await page.locator('#listings-table tbody tr', { hasText: refBroker }).locator('[data-read-listing]').click();
    panel = await read(refLegacy);
    await expect(panel).toContainText('Listing member:');
    await expect(panel).not.toContainText('Supporting documentation');
  });

  test('Item97 an older principal answer stays stored; editing that listing asks the new question again and stores nothing until it is answered', async ({ page }) => {
    await signIn(page, member, 'app.html');
    await openScreen(page, 'my-listings');
    await page.locator('.list-row', { hasText: refLegacy }).locator('[data-edit]').click();
    await expect(page.locator('#docs-held-block')).toBeVisible();
    expect(await page.inputValue('#docs_held'), 'an older answer must not be mapped').toBe('');
    const { rows } = await query('select docs_seen from public.listings where id = $1', [idLegacy]);
    expect(rows[0].docs_seen, 'the older answer is still stored').toBe('yes');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');
    await expect(page.locator('.toast-error').last()).toContainText('Please answer the question about documents.');
    const again = await query('select docs_seen from public.listings where id = $1', [idLegacy]);
    expect(again.rows[0].docs_seen).toBe('yes');
  });
});
