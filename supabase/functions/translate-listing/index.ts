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

// An ESTIMATE of Cloudflare's units for one text: about 3.5 characters per token in, about 1.3 times that out,
// 31,050 units per million tokens (Cloudflare's pricing page, 19 Nov 2026). Reserved before the call, so the
// daily cap holds even if the estimate is a little low.
function estimateUnits(chars: number): number {
  const tokensIn = chars / 3.5;
  return Math.ceil((tokensIn + tokensIn * 1.3) * 0.03105 * 100) / 100;
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

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // WHO IS ASKING (verified, not decoded).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(401, { error: 'Not signed in.' });

  // WHAT THEY ASK: a listing and a language, and nothing else.
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* checked below */ }
  if (typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Bad request.' });
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
    wanted.push({ field, text, hash: await sha256(text) });
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
  const { data: took } = await admin.rpc('translate_take_member_slot', { p_profile: profile.id, p_limit: HOURLY_LIMIT });
  if (took !== true) return reply(429, { error: 'unavailable' });
  const releaseSlot = () => admin.rpc('translate_release_member_slot', { p_profile: profile.id });

  // FAIL CLOSED without the Cloudflare secrets.
  const account = Deno.env.get('CF_ACCOUNT_ID');
  const cfToken = Deno.env.get('CF_AI_TOKEN');
  if (!account || !cfToken) { await releaseSlot(); return reply(503, { error: 'unavailable' }); }

  // THE DAILY UNITS: reserved before the call, so the members' share cannot be passed.
  const perField = missing.map((m) => estimateUnits(m.text.length));
  const total = perField.reduce((a, b) => a + b, 0);
  const { data: reserved } = await admin.rpc('translate_reserve_budget', {
    p_kind: 'member', p_units: total, p_cap: MEMBER_DAILY_UNITS,
  });
  if (reserved !== true) { await releaseSlot(); return reply(503, { error: 'unavailable' }); }

  let failedUnits = 0;
  const stored: { listing_id: string; field: string; target_lang: string; source_hash: string; translated_text: string }[] = [];
  for (let i = 0; i < missing.length; i++) {
    const out = await cloudflareTranslate(missing[i].text, source, target, account, cfToken);
    if (out === null) { failedUnits += perField[i]; continue; }
    translations[missing[i].field] = out;
    stored.push({ listing_id: listingId, field: missing[i].field, target_lang: target, source_hash: missing[i].hash, translated_text: out });
  }
  if (stored.length > 0) {
    await admin.from('listing_translations').upsert(stored, { onConflict: 'listing_id,field,target_lang' });
  }
  if (failedUnits > 0) {
    await admin.rpc('translate_release_budget', { p_kind: 'member', p_units: failedUnits });
    await releaseSlot();
    return reply(503, { error: 'unavailable' });
  }
  return reply(200, { target_lang: target, translations });
});
