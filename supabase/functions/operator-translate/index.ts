// Translate ONE message's text for an Operator (owner's decision, 19 Nov 2026,
// docs/AGREED-2026-11-19-translate.md; plan docs/PLAN-translate-2026-11-19.md sections 1 to 8).
//
// WHO MAY CALL IT: only an approved Operator. verify_jwt is on, and then the body looks up the caller's own
// profile, exactly as operator-recovery-link does: a signed-in member gets 403, and the same answer as "no
// profile", so probing learns nothing.
//
// WHAT IT TAKES: the text and two language codes. No name, no profile id, no message id. It reads only the
// caller's own profile (to check the role) and no listing or message table.
// WHAT IT KEEPS: nothing. The translation is returned to the Operator's page and exists nowhere else. The only
// state is a count of daily units (the Operator's share is what members do not use: 4,000 of 10,000).
// NO TEXT IS LOGGED: nothing here prints the text or its translation, only a status number.
// FAILS CLOSED: no Cloudflare secret, a spent allowance or any Cloudflare error = 503 {error:'unavailable'}.

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

const MAX_CHARS = 3000;
const OPERATOR_DAILY_UNITS = 4000;   // 10,000 free units a day, 6,000 of them reserved for members (owner)
const LANGS = ['en', 'es'];
const MODEL = '@cf/meta/m2m100-1.2b';

// An ESTIMATE of Cloudflare's units for one text: a conservative 2.5 characters per token in (Spanish and symbols
// cost more tokens than English prose), about 1.3 times that out, 31,050 units per million tokens (Cloudflare's
// pricing page, 19 Nov 2026). NOTE: a COPY of the one in translate-listing (an Edge Function is deployed as one
// file, so sharing would need a shared folder in every deploy); tests/e2e/translate.spec.js fails if they differ.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  try {
    return await handle(req);
  } catch {
    // Anything unexpected is a plain 503, never a stack trace and never the text.
    console.error('operator-translate: unexpected error');
    return reply(503, { error: 'unavailable' });
  }
});

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('operator-translate: the function environment is incomplete');
    return reply(503, { error: 'unavailable' });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(401, { error: 'Not signed in.' });

  const { data: profile } = await admin
    .from('profiles').select('id, role, status').eq('user_id', caller.user.id).maybeSingle();
  if (!profile || profile.role !== 'operator' || profile.status !== 'approved') {
    return reply(403, { error: 'Operators only.' });
  }

  // The checks come BEFORE any call to Cloudflare: a bad request never costs anything.
  const read = await readLimitedJson(req);
  if (read.status === 'too_big') return reply(413, { error: 'Request too large.' });
  if (read.status !== 'ok') return reply(400, { error: 'Bad request.' });
  const body = read.value as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Bad request.' });
  if (Object.keys(body).some((k) => k !== 'text' && k !== 'source_lang' && k !== 'target_lang')) {
    return reply(400, { error: 'Only a text and two languages can be sent.' });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const source = String(body.source_lang ?? '');
  const target = String(body.target_lang ?? '');
  if (!text || text.length > MAX_CHARS) return reply(400, { error: `The text must be 1 to ${MAX_CHARS} characters.` });
  if (!LANGS.includes(source) || !LANGS.includes(target) || source === target) {
    return reply(400, { error: 'Languages must be English and Spanish, one each way.' });
  }

  // Fail closed without the Cloudflare secrets.
  const account = Deno.env.get('CF_ACCOUNT_ID');
  const cfToken = Deno.env.get('CF_AI_TOKEN');
  if (!account || !cfToken) return reply(503, { error: 'unavailable' });

  // The glossary: approved trade terms are swapped for made-up words before the call and put back after.
  const plan = glossaryPrepare(text, source);
  if (plan === null) return reply(503, { error: 'unavailable' });

  const units = estimateUnits(text.length);
  const { data: reserved } = await admin.rpc('translate_reserve_budget', {
    p_kind: 'operator', p_units: units, p_cap: OPERATOR_DAILY_UNITS,
  });
  if (reserved !== true) return reply(503, { error: 'unavailable' });

  // From here the reserved units are given back on every path that does not end in a translation.
  let out: string | null = null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plan.text, source_lang: source, target_lang: target }),
    });
    if (res.ok) {
      const json = await res.json();
      const t = json?.result?.translated_text ?? json?.translated_text;
      if (typeof t === 'string' && t.length > 0) out = t;
    } else {
      console.error('translate upstream status', res.status);
    }
  } catch {
    console.error('translate upstream failed');
  } finally {
    if (out === null) {
      try { await admin.rpc('translate_release_budget', { p_kind: 'operator', p_units: units }); }
      catch { console.error('operator-translate: could not give back the reserved units'); }
    }
  }
  if (out === null) return reply(503, { error: 'unavailable' });
  // The call was made, so its units stay spent; but a damaged made-up word means nothing is shown (fail closed).
  const restored = glossaryRestore(out, plan, target);
  if (restored === null) { console.error('translate glossary: a made-up word was damaged'); return reply(503, { error: 'unavailable' }); }
  return reply(200, { translated_text: restored });
}
