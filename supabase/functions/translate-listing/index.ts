// Translate the free text of ONE listing for a member (owner's decision, 19 Nov 2026,
// docs/AGREED-2026-11-19-translate.md; plan docs/PLAN-translate-2026-11-19.md section 10).
//
// WHAT IT TAKES: a listing id and a language, nothing else. It never takes text, and it can never be pointed at
// a message: a request with any other field is refused (400). So it cannot be used as a free translator.
//
// WHO MAY CALL IT: exactly the people who may read Browse. The text is read through get_listing_texts() with the
// CALLER'S OWN token, so the database applies the same gates as get_public_listings() (approved profile; for a
// member the current Terms signed; archived hidden unless it is the caller's own). Refused there = 403 here.
//
// WHAT IT KEEPS: one cached translation per listing, field and language (listing_translations), with a hash of
// the source text; an edit changes the hash, so a stale translation is never shown. A count of presses per member
// per hour (30) with no listing id in it, and a count of daily units (6,000 of Cloudflare's 10,000 free units a
// day are the members'). Nothing records which member translated which listing.
//
// FAILS CLOSED: no Cloudflare secret, a spent allowance or any Cloudflare error = 503 {error:'unavailable'}; the
// page shows the owner's sentence. Cached translations are still served (no Cloudflare call is made for them).
// A press in which SOME fields were translated and others failed returns what succeeded (200); the failed field
// simply shows nothing. The hourly press is given back only if no call to Cloudflare was made at all.
//
// NO TEXT IS LOGGED: nothing here prints the text or its translation, only a status number.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const FIELDS = ['specification', 'price_conditions', 'notes'] as const;
const MAX_CHARS = 2000;      // each text field is cut here (owner)
const HOURLY_LIMIT = 30;     // listings per member per hour (owner)
const MEMBER_DAILY_UNITS = 6000;   // of Cloudflare's 10,000 free units a day (owner)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS = ['en', 'es'];
const MODEL = '@cf/meta/m2m100-1.2b';

// An ESTIMATE of Cloudflare's units for one text: a conservative 2.5 characters per token in (Spanish and symbols
// cost more tokens than English prose), about 1.3 times that out, 31,050 units per million tokens (Cloudflare's
// pricing page, 19 Nov 2026). Reserved before the call, so the daily cap holds even if the estimate is a little
// low. NOTE: this function is a COPY of the one in operator-translate (an Edge Function is deployed as one file,
// so sharing would need a shared folder in every deploy); tests/e2e/translate.spec.js fails if the two differ.
function estimateUnits(chars: number): number {
  const tokensIn = chars / 2.5;
  return Math.ceil((tokensIn + tokensIn * 1.3) * 0.03105 * 100) / 100;
}

// ---- GLOSSARY-BEGIN ---- identical in translate-listing and operator-translate (a test fails if the two differ).
// THE TRADE GLOSSARY (owner's decision, docs/AGREED-2026-11-19-translate-glossary.md). The machine does not obey
// instructions, so each listed term is swapped for a made-up word BEFORE the text goes to Cloudflare, and the approved
// term is put in AFTER. If the machine changes, loses or doubles a made-up word, the field is NOT shown (fail closed).
// Only these terms and these exact forms; anything else is left to the machine. Nothing here ever logs a text.
const GLOSSARY_VERSION = 'glossary-2026-11-19-1';   // part of what a stored translation was made from
type GlossaryTerm = { en: string; es: string; g: 'm' | 'f'; plural: boolean; only?: 'en>es' | 'es>en' };
const GLOSSARY: GlossaryTerm[] = [
  { en: 'bill of lading', es: 'conocimiento de embarque', g: 'm', plural: false },
  { en: 'letter of credit', es: 'carta de crédito', g: 'f', plural: false },
  { en: 'irrevocable letter of credit', es: 'carta de crédito irrevocable', g: 'f', plural: false },
  { en: 'advance payment', es: 'pago anticipado', g: 'm', plural: false },
  { en: 'balance against copy of bill of lading', es: 'saldo contra copia del conocimiento de embarque', g: 'm', plural: false },
  { en: 'independent surveyor', es: 'inspector independiente', g: 'm', plural: false },
  { en: 'cargo survey', es: 'inspección de carga', g: 'f', plural: false },
  { en: 'ingots', es: 'lingotes', g: 'm', plural: true },
  { en: 'aluminium ingots', es: 'lingotes de aluminio', g: 'm', plural: true },
  { en: 'copper cathode, grade A', es: 'cátodos de cobre grado A', g: 'm', plural: true },
  { en: 'no advance payment', es: 'sin anticipo', g: 'm', plural: false },
  // The owner's two answers on points where the advisers differed, one way each:
  { en: 'granular urea', es: 'urea granulada', g: 'f', plural: false, only: 'en>es' },
  { en: 'surveyor', es: 'perito', g: 'm', plural: false, only: 'es>en' },
];
const GLOSSARY_WORD = 'Zorvex';   // the made-up word (tested on the real model, 19 Nov: kept exactly, and once)
type GlossaryHit = { token: string; to: string; g: 'm' | 'f'; plural: boolean; count: number };
type GlossaryPlan = { text: string; hits: GlossaryHit[] };

function glossaryNorm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

// Swaps the glossary terms in `text` (written in `source`) for made-up words. Null = refuse this text (it already
// holds our made-up word, so the two could not be told apart): the caller shows the unavailable sentence.
function glossaryPrepare(text: string, source: string): GlossaryPlan | null {
  if (/zorvex/i.test(text)) return null;
  const way = source === 'en' ? 'en>es' : 'es>en';
  const list = GLOSSARY
    .filter((t) => !t.only || t.only === way)
    .map((t) => ({ t, from: source === 'en' ? t.en : t.es, to: source === 'en' ? t.es : t.en }))
    .sort((a, b) => b.from.length - a.from.length);          // longest first: "no advance payment" beats "advance payment"
  const byForm = new Map<string, (typeof list)[number]>(list.map((e) => [glossaryNorm(e.from), e] as [string, (typeof list)[number]]));
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\// The request body is read with a ceiling');
  const pattern = list
    .map((e) => escape(e.from).replace(/,\s+/g, ',\\s*').replace(/ +/g, '\\s+'))
    .join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');
  const hits: GlossaryHit[] = [];
  const swapped = text.replace(re, (m) => {
    const e = byForm.get(glossaryNorm(m));
    if (!e) return m;
    let hit = hits.find((h) => h.to === e.to);
    if (!hit) {
      hit = { token: `${GLOSSARY_WORD}${hits.length + 1}`, to: e.to, g: e.t.g, plural: e.t.plural, count: 0 };
      hits.push(hit);
    }
    hit.count++;
    return hit.token;
  });
  return { text: swapped, hits };
}

// Puts the approved terms into the machine's answer. Null = the machine damaged a made-up word: show nothing.
function glossaryRestore(out: string, plan: GlossaryPlan, target: string): string | null {
  if (plan.hits.length === 0) return out;
  const any = out.match(/zorvex\d*/gi) ?? [];
  if (any.length !== plan.hits.reduce((n, h) => n + h.count, 0)) return null;
  for (const h of plan.hits) {
    const exact = out.match(new RegExp(`(?<![\\p{L}\\p{N}])${h.token}(?![\\p{L}\\p{N}])`, 'gu')) ?? [];
    if (exact.length !== h.count) return null;
  }
  const byToken = new Map<string, GlossaryHit>(plan.hits.map((h) => [h.token, h] as [string, GlossaryHit]));
  const word = new RegExp(`(?<![\\p{L}\\p{N}])(${GLOSSARY_WORD}\\d+)(?![\\p{L}\\p{N}])`, 'gu');
  let text = out;

  // The machine picks the little word in front without knowing the term's gender or number: set it right.
  const cap = (from: string, to: string) => (/^\p{Lu}/u.test(from) ? to.charAt(0).toUpperCase() + to.slice(1) : to);
  if (target === 'es') {
    const front = new RegExp(
      `(?<![\\p{L}\\p{N}])(de las|de los|de la|a las|a los|a la|unas|unos|una|las|los|del|el|la|un|al)(\\s+)(${GLOSSARY_WORD}\\d+)(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(front, (m, art: string, space: string, tok: string) => {
      const h = byToken.get(tok);
      if (!h) return m;
      const k = (h.g === 'm' ? 'm' : 'f') + (h.plural ? 'p' : 's');
      const def = ({ ms: 'el', fs: 'la', mp: 'los', fp: 'las' } as Record<string, string>)[k];
      const indef = ({ ms: 'un', fs: 'una', mp: 'unos', fp: 'unas' } as Record<string, string>)[k];
      const a = art.toLowerCase();
      let fixed: string;
      if (['un', 'una', 'unos', 'unas'].includes(a)) fixed = indef;
      else if (a === 'del' || a.startsWith('de ')) fixed = k === 'ms' ? 'del' : `de ${def}`;
      else if (a === 'al' || a.startsWith('a ')) fixed = k === 'ms' ? 'al' : `a ${def}`;
      else fixed = def;
      return cap(art, fixed) + space + tok;
    });
  } else {
    const front = new RegExp(`(?<![\\p{L}\\p{N}])(an|a)(\\s+)(${GLOSSARY_WORD}\\d+)(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(front, (m, art: string, space: string, tok: string) => {
      const h = byToken.get(tok);
      if (!h) return m;
      return cap(art, /^[aeiou]/i.test(h.to) ? 'an' : 'a') + space + tok;
    });
  }

  // The approved term goes in; it starts with a capital where a sentence starts.
  return text.replace(word, (m: string, tok: string, offset: number, whole: string) => {
    const h = byToken.get(tok);
    if (!h) return m;
    const startsSentence = /(^|[.!?¿¡]\s*|\n\s*)$/.test(whole.slice(0, offset));
    return startsSentence ? h.to.charAt(0).toUpperCase() + h.to.slice(1) : h.to;
  });
}
// ---- GLOSSARY-END ----

// The request body is read with a ceiling, so a huge body is refused before it is parsed or held in memory.
const MAX_BODY_BYTES = 16 * 1024;
async function readLimitedJson(req: Request): Promise<{ status: 'ok'; value: unknown } | { status: 'too_big' | 'bad' }> {
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { status: 'too_big' };
  if (!req.body) return { status: 'bad' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); return { status: 'too_big' }; }
      chunks.push(value);
    }
  } catch {
    return { status: 'bad' };
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  try { return { status: 'ok', value: JSON.parse(new TextDecoder().decode(merged)) }; } catch { return { status: 'bad' }; }
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cloudflareTranslate(
  text: string, source: string, target: string, account: string, token: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: source, target_lang: target }),
    });
    if (!res.ok) { console.error('translate upstream status', res.status); return null; }
    const json = await res.json();
    const out = json?.result?.translated_text ?? json?.translated_text;
    return typeof out === 'string' && out.length > 0 ? out : null;
  } catch {
    console.error('translate upstream failed');
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  try {
    return await handle(req);
  } catch {
    // Anything unexpected is a plain 503, never a stack trace and never the text.
    console.error('translate-listing: unexpected error');
    return reply(503, { error: 'unavailable' });
  }
});

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  // Fail closed if this function's own environment is incomplete (Supabase lists the anon key as a legacy key).
  if (!url || !serviceKey || !anonKey) {
    console.error('translate-listing: the function environment is incomplete');
    return reply(503, { error: 'unavailable' });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // WHO IS ASKING (verified, not decoded).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(401, { error: 'Not signed in.' });

  // WHAT THEY ASK: a listing and a language, and nothing else.
  const read = await readLimitedJson(req);
  if (read.status === 'too_big') return reply(413, { error: 'Request too large.' });
  if (read.status !== 'ok') return reply(400, { error: 'Bad request.' });
  const body = read.value as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Bad request.' });
  const keys = Object.keys(body);
  if (keys.some((k) => k !== 'listing_id' && k !== 'target_lang')) {
    return reply(400, { error: 'Only a listing and a language can be sent.' });
  }
  const listingId = String(body.listing_id ?? '');
  const target = String(body.target_lang ?? '');
  if (!UUID.test(listingId) || !LANGS.includes(target)) return reply(400, { error: 'Bad request.' });
  const source = target === 'en' ? 'es' : 'en';

  // THE TEXT, through the database's own gates, with the caller's own token.
  const asCaller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: texts, error: textError } = await asCaller.rpc('get_listing_texts', { p_listing_id: listingId });
  if (textError) {
    // 42501 is the database refusing this caller (not approved, Terms not signed). Same answer for all of them.
    if (textError.code === '42501') return reply(403, { error: 'Not allowed.' });
    return reply(502, { error: 'Could not read the listing.' });
  }
  const row = Array.isArray(texts) ? texts[0] : texts;
  if (!row) return reply(404, { error: 'No such listing.' });

  // Which fields have text; each is cut at 2,000 characters.
  const wanted: { field: typeof FIELDS[number]; text: string; hash: string }[] = [];
  for (const field of FIELDS) {
    const raw = typeof row[field] === 'string' ? row[field].trim() : '';
    if (!raw || !/\p{L}/u.test(raw)) continue;   // only text that holds words: a price such as 13850 is not sent
    const text = raw.slice(0, MAX_CHARS);
    // The glossary version is part of what a stored translation was made from: a new glossary makes old ones stale.
    wanted.push({ field, text, hash: await sha256(`${GLOSSARY_VERSION}\n${text}`) });
  }
  if (wanted.length === 0) return reply(200, { target_lang: target, translations: {} });

  // THE CACHE: a stored translation is used only if it was made from exactly this text.
  const translations: Record<string, string> = {};
  const { data: cached } = await admin.from('listing_translations')
    .select('field, source_hash, translated_text')
    .eq('listing_id', listingId).eq('target_lang', target);
  for (const w of wanted) {
    const hit = (cached ?? []).find((c: { field: string; source_hash: string }) => c.field === w.field && c.source_hash === w.hash);
    if (hit) translations[w.field] = hit.translated_text;
  }
  const missing = wanted.filter((w) => !(w.field in translations));
  if (missing.length === 0) return reply(200, { target_lang: target, translations });

  // THE HOURLY LIMIT: 30 listings per member per hour; counted only when Cloudflare is actually asked.
  const { data: profile } = await admin.from('profiles').select('id').eq('user_id', caller.user.id).maybeSingle();
  if (!profile) return reply(403, { error: 'Not allowed.' });
  const { data: slotHour } = await admin.rpc('translate_take_slot', { p_profile: profile.id, p_limit: HOURLY_LIMIT });
  if (!slotHour) return reply(429, { error: 'unavailable' });

  // From here every path ends in the finally block, which gives back what was not used. THE PRESS is given back
  // only if NO call to Cloudflare was made (a refusal before any call); once a call has gone out the press stays
  // counted, even if the call failed, so a field that always fails cannot be used to make unlimited calls.
  let callsMade = 0;
  let reservedUnits = 0;
  let spentUnits = 0;
  try {
    // FAIL CLOSED without the Cloudflare secrets.
    const account = Deno.env.get('CF_ACCOUNT_ID');
    const cfToken = Deno.env.get('CF_AI_TOKEN');
    if (!account || !cfToken) return reply(503, { error: 'unavailable' });

    // THE DAILY UNITS: reserved before the call, so the members' share cannot be passed.
    const perField = missing.map((m) => estimateUnits(m.text.length));
    const total = perField.reduce((a, b) => a + b, 0);
    const { data: reserved } = await admin.rpc('translate_reserve_budget', {
      p_kind: 'member', p_units: total, p_cap: MEMBER_DAILY_UNITS,
    });
    if (reserved !== true) return reply(503, { error: 'unavailable' });
    reservedUnits = total;

    const stored: { listing_id: string; field: string; target_lang: string; source_hash: string; translated_text: string }[] = [];
    for (let i = 0; i < missing.length; i++) {
      const plan = glossaryPrepare(missing[i].text, source);
      if (plan === null) continue;           // refused before any call: this field shows nothing
      callsMade++;
      const raw = await cloudflareTranslate(plan.text, source, target, account, cfToken);
      if (raw === null) continue;            // this field shows nothing; the others may still succeed
      spentUnits += perField[i];             // the call was made, so these units are spent even if the answer is refused
      const out = glossaryRestore(raw, plan, target);
      if (out === null) { console.error('translate glossary: a made-up word was damaged'); continue; }   // fail closed
      translations[missing[i].field] = out;
      stored.push({ listing_id: listingId, field: missing[i].field, target_lang: target, source_hash: missing[i].hash, translated_text: out });
    }
    if (stored.length > 0) {
      const { error: cacheError } = await admin.from('listing_translations')
        .upsert(stored, { onConflict: 'listing_id,field,target_lang' });
      // The member still gets what was paid for; only the saving failed. Logged as a code, never the text.
      if (cacheError) console.error('translate cache write failed', cacheError.code ?? '');
    }
    // Nothing succeeded: the unavailable answer. Something did: it is returned, the page shows what it got.
    if (stored.length === 0) return reply(503, { error: 'unavailable' });
    return reply(200, { target_lang: target, translations });
  } finally {
    try {
      if (reservedUnits - spentUnits > 0) {
        await admin.rpc('translate_release_budget', { p_kind: 'member', p_units: reservedUnits - spentUnits });
      }
      if (callsMade === 0) await admin.rpc('translate_release_slot', { p_profile: profile.id, p_hour: slotHour });
    } catch {
      console.error('translate-listing: could not give back what was not used');
    }
  }
}
