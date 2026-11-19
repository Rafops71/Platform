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

function estimateUnits(chars: number): number {
  const tokensIn = chars / 3.5;
  return Math.ceil((tokensIn + tokensIn * 1.3) * 0.03105 * 100) / 100;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* checked below */ }
  if (typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Bad request.' });
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

  const units = estimateUnits(text.length);
  const { data: reserved } = await admin.rpc('translate_reserve_budget', {
    p_kind: 'operator', p_units: units, p_cap: OPERATOR_DAILY_UNITS,
  });
  if (reserved !== true) return reply(503, { error: 'unavailable' });

  let out: string | null = null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: source, target_lang: target }),
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
  }
  if (out === null) {
    await admin.rpc('translate_release_budget', { p_kind: 'operator', p_units: units });
    return reply(503, { error: 'unavailable' });
  }
  return reply(200, { translated_text: out });
});
