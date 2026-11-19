// Translate (owner, 19 Nov 2026; docs/AGREED-2026-11-19-translate.md).
//
//   Item18  a member can browse other members' listings, and translate a listing's free text from the other language
//   Item50  members never see another member's private data: the translate path takes a listing and never a message
//   Item78  the Operator's messages: the Operator alone can translate a message, and nothing is stored
//
// WHAT THIS CAN PROVE WITHOUT A CLOUDFLARE TOKEN, AND WHAT IT CANNOT
// The Edge Functions check who is asking and what is asked BEFORE they ever call Cloudflare, so every refusal
// (401 / 403 / 404 / 400 / 429), the cache and the counters are proved here with no token at all. A request that
// passes every check ends in 503 while the secret is missing (the functions fail closed) and in 200 once it
// exists, so those are accepted as either and nothing is claimed about the translation itself: whether the
// translation is GOOD is the owner's judgement, and the call to Cloudflare is proved by a manual run once the
// token exists. Until then the success path is "written, not yet run".
//
// The two Edge Functions must be deployed to the project the suite runs against (staging for a pull request).

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');
const { query } = require('../../scripts/db');

const ROOT = path.join(__dirname, '..', '..');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || fs.readFileSync(path.join(ROOT, 'js', 'supabase-config.js'), 'utf8')
  .match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)[1];
const FN = (name) => `${process.env.SUPABASE_URL}/functions/v1/${name}`;

const NOTES_ES = 'Embarque en marzo, puerto de Callao';
const SPEC_ES = 'Concentrado de cobre, 28% Cu mínimo';
const MESSAGE_ES = 'Podemos ofrecer cinco mil toneladas, FOB Callao';
const SENTINEL = 'CACHED-TRANSLATION-SENTINEL';

test.describe.configure({ mode: 'serial' });

let operator, poster, viewer, pending, unsigned;
let listingId, archivedId, listingRef;

async function tokenFor(account) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`could not sign in as ${account.email}: ${res.status}`);
  return (await res.json()).access_token;
}

async function call(name, token, body) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(FN(name), { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const usage = async (profileId) => (await query(
  `select coalesce(sum(listings), 0)::int n from public.member_translate_usage where profile_id = $1`, [profileId])).rows[0].n;
const budget = async () => (await query(
  `select coalesce(sum(member_units), 0)::float m, coalesce(sum(operator_units), 0)::float o from public.translate_daily_budget`)).rows[0];

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'trop', role: 'operator', status: 'approved' });
  poster   = await createAccount({ label: 'trpost', role: 'participant', status: 'approved', meta: { first_name: 'Tradu', last_name: 'Poster', company: 'Poster Metals', phone: '+32471559001' } });
  viewer   = await createAccount({ label: 'trview', role: 'participant', status: 'approved', meta: { first_name: 'Tradu', last_name: 'Viewer', company: 'Viewer Trading', phone: '+32471559002' } });
  pending  = await createAccount({ label: 'trpend', role: 'participant', status: 'pending' });
  unsigned = await createAccount({ label: 'trunsig', role: 'participant', status: 'approved', meta: { first_name: 'Tradu', last_name: 'Unsigned', company: 'Unsigned SA', phone: '+32471559003' } });
  // The approved member who has NOT signed the current Terms: the signing the fixture made is removed.
  await query('delete from public.terms_acceptances where profile_id = $1', [unsigned.profileId]);

  const a = await query(
    `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, specification, price_conditions, notes)
     values ($1, 'sell', 'Copper Concentrate', 100, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'), $2, '13850', $3)
     returning id, reference_number`, [poster.profileId, SPEC_ES, NOTES_ES]);
  listingId = a.rows[0].id; listingRef = a.rows[0].reference_number;
  const b = await query(
    `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, notes)
     values ($1, 'sell', 'Zinc Ingots', 10, 'Metric tons', 'FOB', 'Peru', 'archived', public.next_reference('sell'), 'archived text')
     returning id`, [poster.profileId]);
  archivedId = b.rows[0].id;
  await query(
    `insert into public.messages (sender_id, listing_id, body, status) values ($1, $2, $3, 'pending_review')`,
    [viewer.profileId, listingId, MESSAGE_ES]);
});

test.afterAll(async () => { await cleanup(); });

test.describe('translate-listing: who may ask, and what may be asked', () => {

  test('Item18 a stranger gets 401, and a pending member and a member who has not signed the Terms get 403', async () => {
    expect((await call('translate-listing', null, { listing_id: listingId, target_lang: 'en' })).status).toBe(401);
    expect((await call('translate-listing', await tokenFor(pending), { listing_id: listingId, target_lang: 'en' })).status).toBe(403);
    expect((await call('translate-listing', await tokenFor(unsigned), { listing_id: listingId, target_lang: 'en' })).status).toBe(403);
    // Refused before anything is counted or reserved.
    expect(await usage(pending.profileId)).toBe(0);
    expect(await usage(unsigned.profileId)).toBe(0);
  });

  test('Item18 an unknown listing and another member\'s archived listing are 404; the owner can still ask about their own archived one', async () => {
    const token = await tokenFor(viewer);
    expect((await call('translate-listing', token, { listing_id: '00000000-0000-4000-8000-000000000000', target_lang: 'en' })).status).toBe(404);
    expect((await call('translate-listing', token, { listing_id: archivedId, target_lang: 'en' })).status).toBe(404);
    const own = await call('translate-listing', await tokenFor(poster), { listing_id: archivedId, target_lang: 'en' });
    expect([200, 503]).toContain(own.status);   // passed every check; 503 while the Cloudflare secret is missing
  });

  test('Item50 the member path takes a listing and a language and NOTHING else: no text, no message id, no other language', async () => {
    const token = await tokenFor(viewer);
    const before = { usage: await usage(viewer.profileId), budget: await budget() };
    for (const bad of [
      { listing_id: listingId, target_lang: 'en', text: 'Hello, please translate this for me' },
      { listing_id: listingId, target_lang: 'en', message_id: '00000000-0000-4000-8000-000000000001' },
      { text: MESSAGE_ES, target_lang: 'en' },
      { listing_id: listingId, target_lang: 'fr' },
      { listing_id: 'not-a-uuid', target_lang: 'en' },
      { listing_id: listingId },
      {},
    ]) {
      const r = await call('translate-listing', token, bad);
      expect(r.status, JSON.stringify(Object.keys(bad))).toBe(400);
    }
    // Nothing was counted, reserved or stored by any of them.
    expect(await usage(viewer.profileId)).toBe(before.usage);
    expect(await budget()).toEqual(before.budget);
    expect((await query('select count(*)::int n from public.listing_translations')).rows[0].n).toBe(0);
  });

  test('Item50 a huge request body is refused with 413 before it is parsed, and costs nothing', async () => {
    const before = { usage: await usage(viewer.profileId), budget: await budget() };
    const r = await call('translate-listing', await tokenFor(viewer), { listing_id: listingId, target_lang: 'en', pad: 'x'.repeat(40_000) });
    expect(r.status).toBe(413);
    expect(await usage(viewer.profileId)).toBe(before.usage);
    expect(await budget()).toEqual(before.budget);
  });

  test('Item18 an approved member who may read the listing passes every check (503 while the Cloudflare secret is missing, 200 once it exists)', async () => {
    const r = await call('translate-listing', await tokenFor(viewer), { listing_id: listingId, target_lang: 'en' });
    expect([200, 503]).toContain(r.status);
    if (r.status === 503) expect(r.body.error).toBe('unavailable');
    // A refusal costs the member nothing: with the secret missing the press is given back.
    if (r.status === 503) expect(await usage(viewer.profileId)).toBe(0);
  });

  test('Item18 the 31st listing in an hour is refused with 429, and costs nothing', async () => {
    await query(
      `insert into public.member_translate_usage (profile_id, hour_start, listings) values ($1, date_trunc('hour', now()), 30)
       on conflict (profile_id, hour_start) do update set listings = 30`, [viewer.profileId]);
    const before = await budget();
    const r = await call('translate-listing', await tokenFor(viewer), { listing_id: listingId, target_lang: 'en' });
    expect(r.status).toBe(429);
    expect(await usage(viewer.profileId)).toBe(30);
    expect(await budget()).toEqual(before);
    await query('delete from public.member_translate_usage where profile_id = $1', [viewer.profileId]);
  });

  test('Item18 a stored translation is served without a press being counted, and an edit makes it stale', async () => {
    // A stored translation records the text AND the glossary version it was made from (glossary job, 19 Nov).
    const version = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'translate-listing', 'index.ts'), 'utf8')
      .match(/const GLOSSARY_VERSION = '([^']+)'/)[1];
    const hash = (s) => crypto.createHash('sha256').update(`${version}\n${s}`).digest('hex');
    // Only the notes field is cached, and it is the only field with words that is not cached: the specification
    // is also words, so cache that too and the whole answer comes from the cache. (The price is a number: never sent.)
    await query(
      `insert into public.listing_translations (listing_id, field, target_lang, source_hash, translated_text) values
         ($1, 'notes', 'en', $2, $4), ($1, 'specification', 'en', $3, $5)`,
      [listingId, hash(NOTES_ES), hash(SPEC_ES), SENTINEL + ' notes', SENTINEL + ' spec']);
    const before = { usage: await usage(viewer.profileId), budget: await budget() };
    const r = await call('translate-listing', await tokenFor(viewer), { listing_id: listingId, target_lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.translations.notes).toBe(SENTINEL + ' notes');
    expect(r.body.translations.specification).toBe(SENTINEL + ' spec');
    expect(r.body.translations.price_conditions, 'a bare number is never sent for translation').toBeUndefined();
    expect(await usage(viewer.profileId)).toBe(before.usage);        // no press counted
    expect(await budget()).toEqual(before.budget);                   // no units reserved

    // The poster edits the notes: the old translation was made from different text and must not be served.
    await query(`update public.listings set notes = 'Embarque en abril, puerto de Callao' where id = $1`, [listingId]);
    const stale = await call('translate-listing', await tokenFor(viewer), { listing_id: listingId, target_lang: 'en' });
    expect([200, 503]).toContain(stale.status);
    if (stale.status === 200) expect(stale.body.translations.notes).not.toBe(SENTINEL + ' notes');
    else expect(stale.body.translations).toBeUndefined();
    await query(`update public.listings set notes = $2 where id = $1`, [listingId, NOTES_ES]);
  });

  test('Item50 nobody but the service role can read or change the cache, the counts or the units', async () => {
    const token = await tokenFor(viewer);
    for (const table of ['listing_translations', 'member_translate_usage', 'translate_daily_budget']) {
      const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => []);
      expect(res.status === 200 ? body.length : 0, `a member read rows of ${table}`).toBe(0);
    }
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/translate_reserve_budget`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: 'member', p_units: 1, p_cap: 6000 }),
    });
    expect(res.ok, 'a member called a counter').toBe(false);
  });

  test('Item18 deleting a listing deletes its cached translations', async () => {
    expect((await query('select count(*)::int n from public.listing_translations where listing_id = $1', [listingId])).rows[0].n).toBeGreaterThan(0);
    await query('delete from public.listings where id = $1', [archivedId]);   // another listing: its (no) rows are untouched
    await query(`delete from public.messages where listing_id = $1`, [listingId]);
    await query('delete from public.listings where id = $1', [listingId]);
    expect((await query('select count(*)::int n from public.listing_translations where listing_id = $1', [listingId])).rows[0].n).toBe(0);
  });
});

test.describe('operator-translate: Operators only, and nothing kept', () => {

  test('Item78 a stranger gets 401, and a member and a pending member get 403 (the same answer as for no profile)', async () => {
    const ok = { text: MESSAGE_ES, source_lang: 'es', target_lang: 'en' };
    expect((await call('operator-translate', null, ok)).status).toBe(401);
    const m = await call('operator-translate', await tokenFor(viewer), ok);
    expect(m.status).toBe(403);
    const p = await call('operator-translate', await tokenFor(pending), ok);
    expect(p.status).toBe(403);
    expect(p.body).toEqual(m.body);
  });

  test('Item78 a bad request is refused with 400 before anything is reserved or sent', async () => {
    const token = await tokenFor(operator);
    const before = await budget();
    for (const bad of [
      { text: '', source_lang: 'es', target_lang: 'en' },
      { text: 'x'.repeat(3001), source_lang: 'es', target_lang: 'en' },
      { text: 'Hola', source_lang: 'fr', target_lang: 'en' },
      { text: 'Hola', source_lang: 'es', target_lang: 'es' },
      { text: 'Hola', source_lang: 'es', target_lang: 'en', message_id: '00000000-0000-4000-8000-000000000001' },
      { text: 'Hola', source_lang: 'es', target_lang: 'en', profile_id: poster.profileId },
    ]) {
      const r = await call('operator-translate', token, bad);
      expect(r.status, JSON.stringify(Object.keys(bad))).toBe(400);
    }
    expect(await budget()).toEqual(before);
  });

  test('Item78 a huge request body from an Operator is refused with 413 before it is parsed, and costs nothing', async () => {
    const before = await budget();
    const r = await call('operator-translate', await tokenFor(operator), { text: 'x'.repeat(40_000), source_lang: 'es', target_lang: 'en' });
    expect(r.status).toBe(413);
    expect(await budget()).toEqual(before);
  });

  test('Item78 the two functions are copies in four places (unit estimate, body ceiling, body reader, glossary); a difference is a drift and fails here', async () => {
    const read = (n) => fs.readFileSync(path.join(ROOT, 'supabase', 'functions', n, 'index.ts'), 'utf8');
    const a = read('translate-listing'), b = read('operator-translate');
    const grab = (src, re) => { const m = src.match(re); expect(m, `${re} not found`).not.toBeNull(); return m[0]; };
    for (const re of [/function estimateUnits[\s\S]*?\n}\n/, /const MAX_BODY_BYTES[^\n]*\n/, /async function readLimitedJson[\s\S]*?\n}\n/,
      /\/\/ ---- GLOSSARY-BEGIN[\s\S]*?\/\/ ---- GLOSSARY-END ----\n/]) {
      expect(grab(a, re), String(re)).toBe(grab(b, re));
    }
    // The conservative estimate: 2.5 characters per token (Spanish and symbols cost more than English prose).
    expect(grab(a, /function estimateUnits[\s\S]*?\n}\n/)).toContain('chars / 2.5');
  });

  test('Item78 a good request from an Operator passes every check (503 while the Cloudflare secret is missing, 200 once it exists), and keeps nothing', async () => {
    const tables = ['messages', 'message_forward_log', 'activity_log', 'listing_translations', 'notifications'];
    const counts = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, (await query(`select count(*)::int n from public.${t}`)).rows[0].n])));
    const before = await counts();
    const r = await call('operator-translate', await tokenFor(operator), { text: MESSAGE_ES, source_lang: 'es', target_lang: 'en' });
    expect([200, 503]).toContain(r.status);
    if (r.status === 503) expect(r.body.error).toBe('unavailable');
    expect(await counts(), 'a translation left a row behind').toEqual(before);
    // The original message is untouched and no row anywhere holds the translation.
    if (r.status === 200) {
      const { rows } = await query(`select count(*)::int n from public.messages where body = $1`, [r.body.translated_text]);
      expect(rows[0].n).toBe(0);
    }
  });
});

test.describe('the screens', () => {

  test('Item18 Browse: a member sees Translate on a listing with words, presses it, sees the translation BENEATH the original, and can hide it', async ({ page }) => {
    // A listing for this part, since the one above was deleted with its cache.
    const { rows } = await query(
      `insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, specification, price_conditions, notes)
       values ($1, 'sell', 'Copper Concentrate', 100, 'Metric tons', 'FOB', 'Peru', 'available', public.next_reference('sell'), $2, '13850', $3)
       returning id, reference_number`, [poster.profileId, SPEC_ES, NOTES_ES]);
    listingId = rows[0].id; listingRef = rows[0].reference_number;
    // The viewer's message about it, for the Operator's screens further down.
    await query(`insert into public.messages (sender_id, listing_id, body, status) values ($1, $2, $3, 'pending_review')`,
      [viewer.profileId, listingId, MESSAGE_ES]);

    await page.route('**/functions/v1/translate-listing', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ target_lang: 'en', translations: { specification: 'Copper concentrate, 28% Cu minimum', notes: 'Shipment in March, port of Callao' } }),
    }));
    await signIn(page, viewer, 'app.html');
    await openScreen(page, 'browse');
    const row = page.locator('#browse-list .list-row', { hasText: listingRef });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const button = row.locator('[data-translate-btn]');
    await expect(button).toHaveText('Translate');
    await expect(row).toContainText(NOTES_ES);

    await button.click();
    await expect(row.locator('[data-translation]')).toContainText('Shipment in March, port of Callao');
    await expect(row.locator('[data-translation]')).toContainText('Copper concentrate, 28% Cu minimum');
    await expect(button).toHaveText('Hide translation');
    await expect(row).toContainText(NOTES_ES);   // the original stays on screen

    await button.click();
    await expect(row.locator('[data-translation]')).toBeHidden();
    await expect(button).toHaveText('Translate');
    await expect(row).toContainText(NOTES_ES);
  });

  test('Item18 Browse: when translation is not available the member sees the owner\'s sentence and the original is untouched', async ({ page }) => {
    await page.route('**/functions/v1/translate-listing', (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }),
    }));
    await signIn(page, viewer, 'app.html');
    await openScreen(page, 'browse');
    const row = page.locator('#browse-list .list-row', { hasText: listingRef });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.locator('[data-translate-btn]').click();
    await expect(row.locator('[data-translation]')).toHaveText('Translation is not available right now. Please try again later.');
    await expect(row.locator('[data-translate-btn]')).toHaveText('Translate');
    await expect(row).toContainText(NOTES_ES);
  });

  test('Item18 Browse: the button and the sentences are in Spanish for a Spanish-speaking member', async ({ page }) => {
    await page.route('**/functions/v1/translate-listing', (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }),
    }));
    await signIn(page, viewer, 'app.html');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await openScreen(page, 'browse');
    const row = page.locator('#browse-list .list-row', { hasText: listingRef });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.locator('[data-translate-btn]')).toHaveText('Traducir');
    await row.locator('[data-translate-btn]').click();
    await expect(row.locator('[data-translation]')).toHaveText('La traducción no está disponible en este momento. Inténtelo de nuevo más tarde.');
  });

  test('Item78 the Operator\'s Mailbox: a message can be translated and the translation hidden, and the original is never replaced', async ({ page }) => {
    await page.route('**/functions/v1/operator-translate', (route) => {
      const sent = route.request().postDataJSON();
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ translated_text: `[${sent.source_lang}>${sent.target_lang}] We can offer five thousand tons, FOB Callao` }),
      });
    });
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: MESSAGE_ES });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-translate-btn]').click();
    await expect(row.locator('[data-translation]')).toHaveText('[es>en] We can offer five thousand tons, FOB Callao');
    await expect(row).toContainText(MESSAGE_ES);                       // the original is still there
    await expect(row.locator('[data-translate-btn]')).toHaveText('Hide translation');
    await row.locator('[data-translate-btn]').click();
    await expect(row.locator('[data-translation]')).toBeHidden();
    // The other direction.
    await row.locator('[data-translate-to]').selectOption('es');
    await row.locator('[data-translate-btn]').click();
    await expect(row.locator('[data-translation]')).toContainText('[en>es]');
    // The message itself is unchanged in the database.
    const { rows } = await query(`select body from public.messages where body = $1`, [MESSAGE_ES]);
    expect(rows.length).toBe(1);
  });

  test('Item78 the Forward window carries the same control and the message in it is not replaced', async ({ page }) => {
    await page.route('**/functions/v1/operator-translate', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ translated_text: 'We can offer five thousand tons, FOB Callao' }),
    }));
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: MESSAGE_ES });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-forward]').click();
    await expect(page.locator('#forward-modal')).toBeVisible();
    await page.click('#forward-translate-btn');
    await expect(page.locator('#forward-translation')).toHaveText('We can offer five thousand tons, FOB Callao');
    await expect(page.locator('#forward-edit')).toHaveValue(MESSAGE_ES);
  });

  test('Item50 no member screen can translate a message: the member page never calls the Operator function, and the member sees no translation control outside Browse', async ({ page }) => {
    const appJs = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const appHtml = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
    expect(appJs).not.toContain('operator-translate');
    expect(appHtml).not.toContain('operator-translate');
    expect(appHtml).not.toContain('forward-translate');
    await signIn(page, viewer, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#screen-mailbox')).not.toContainText('Translate');
    await expect(page.locator('#screen-mailbox [data-translate-btn]')).toHaveCount(0);
    await expect(page.locator('#screen-my-listings [data-translate-btn]')).toHaveCount(0);
  });
});
