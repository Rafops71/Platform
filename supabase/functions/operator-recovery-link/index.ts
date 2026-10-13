// Make a password recovery link for a member, on an Operator's say-so.
//
// WHY THIS EXISTS
//
// "Forgotten your password?" on the sign-in page is finished and tested, but
// it depends on an email actually arriving. Supabase's built-in mail only
// delivers to the project team's own addresses, two an hour, with no delivery
// guarantee - read from their documentation on 2026-10-13, not assumed. Until
// a real sending domain is configured, a member who forgets their password
// gets nothing, and the Operator has no way to help them that does not
// involve somebody with a service key.
//
// This is that way: the Operator presses a button, gets a link, and sends it
// to the member however they already talk to them. When email works, the
// self-service button takes over and this stays as the fallback for the
// member whose mail bounces.
//
// WHY IT IS A SERVER FUNCTION AND NOT A BUTTON IN THE PAGE
//
// Minting a recovery link needs the service role key. That key bypasses every
// Row Level Security policy in the database, so it can never be shipped to a
// browser - not even an Operator's browser, where anybody looking at the page
// source would have it. It lives here, where only Supabase can read it.
//
// WHO MAY CALL IT
//
// verify_jwt is on, so Supabase rejects a request with no valid token before
// this code runs. That is not enough on its own: ANY signed-in member has a
// valid token. So the first thing the body does is look up the caller's own
// profile and refuse anybody who is not an approved Operator. A member must
// not be able to mint a recovery link for another member's account - that
// would be a way into somebody else's account, which is the opposite of what
// this is for.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE_RESET_URL = Deno.env.get('SITE_RESET_URL') ??
  'https://rafops71.github.io/Platform/reset.html';

// The Operator console is served from GitHub Pages, a different origin to
// Supabase, so the browser will not send the request at all without these.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // WHO IS ASKING. The token is read with getUser() rather than decoded here:
  // decoding trusts whatever was sent, asking verifies the signature.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(401, { error: 'Not signed in.' });

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('user_id', caller.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'operator' || profile.status !== 'approved') {
    // Deliberately the same answer for "not an Operator" and "no profile":
    // a signed-in member probing this endpoint learns nothing from it.
    return reply(403, { error: 'Operators only.' });
  }

  let email = '';
  try {
    email = String(((await req.json()) ?? {}).email ?? '').trim().toLowerCase();
  } catch { /* handled by the check below */ }
  if (!email) return reply(400, { error: 'Which member? No email address was sent.' });

  // The member must already exist. generate_link would otherwise CREATE an
  // account for an address nobody invited, which is exactly the hole sql/024
  // was written to close.
  const { data: target } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();
  if (!target) return reply(404, { error: 'No member here has that address.' });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: SITE_RESET_URL },
  });
  if (linkError || !link?.properties?.action_link) {
    return reply(502, { error: `Supabase would not make a link: ${linkError?.message ?? 'no link returned'}` });
  }

  // Recorded against the OPERATOR, because the Operator is who acted. A
  // recovery link is a key to somebody's account; who made one, for whom and
  // when is exactly the kind of thing the activity log exists for.
  // The argument is named p_user_id and takes the PROFILE id - checked
  // against the live catalog rather than guessed from the name.
  await admin.rpc('log_activity', {
    p_user_id: profile.id,
    p_action: 'operator_made_recovery_link',
    p_details: { for_profile: target.id },
  });

  return reply(200, { link: link.properties.action_link });
});
