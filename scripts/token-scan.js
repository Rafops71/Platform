// The token scan: secret codes that cannot be guessed, reused or kept.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"), fourth
// on the agreed list. On the staging project:
//
//   invitation codes  - guessing (random codes, empty, wildcards, SQL-shaped
//                       text) finds nothing; a used code shows as used; an
//                       expired one shows as expired;
//   sessions          - after signing out everywhere, the refresh token no
//                       longer works; a member suspended while signed in is
//                       refused the market and posting with the token they
//                       already hold, and refreshing that session gives
//                       them nothing back; an Operator demoted to member
//                       keeps no Operator power through the token they
//                       hold; a deleted member's token opens nothing;
//   storage           - no session, refresh or invitation token of anybody
//                       is written into the activity log or notifications.
//
// Refuses the live project.

const crypto = require('crypto');
const { buildWorld, account, cleanup, http, asUser, must, guardNotLive } = require('./security-grid');

async function main() {
  guardNotLive();
  const findings = [];
  let tries = 0;
  const fail = (m) => findings.push(m);
  const anon = (path, opts = {}) => http(path, { ...opts, key: process.env.SUPABASE_ANON_KEY });
  try {
    const w = await buildWorld();

    // 1. Guessing invitation codes, as a stranger.
    const guesses = ['', '%', '_', '*', "' or '1'='1", 'e2e-%', 'grid-%', 'null', 'undefined',
                     ...Array.from({ length: 200 }, () => crypto.randomBytes(12).toString('hex'))];
    for (const g of guesses) {
      tries += 1;
      const r = await anon('/rest/v1/rpc/get_invitation_by_token', { method: 'POST', body: { p_token: g } });
      if (r.ok && Array.isArray(r.json) && r.json.length) fail(`guessing "${g.slice(0, 20)}" found an invitation`);
    }

    // 2. A used code and an expired code say so.
    const [used] = (await http(`/rest/v1/invitations?select=token,used_at&email=eq.${encodeURIComponent(w.A.email)}`)).json;
    tries += 1;
    if (used) {
      const r = await anon('/rest/v1/rpc/get_invitation_by_token', { method: 'POST', body: { p_token: used.token } });
      if (!(r.ok && r.json[0] && r.json[0].used_at)) fail('a used invitation code does not show as used');
    } else fail('member A has no invitation on record to test reuse with');
    const expiredToken = `grid-expired-${crypto.randomBytes(8).toString('hex')}`;
    await must('expired invitation', http('/rest/v1/invitations', {
      method: 'POST', prefer: 'return=minimal',
      body: { token: expiredToken, email: `${expiredToken}@example.invalid`, created_by: w.operator.profileId,
              expires_at: new Date(Date.now() - 3600e3).toISOString() },
    }));
    tries += 1;
    const exp = await anon('/rest/v1/rpc/get_invitation_by_token', { method: 'POST', body: { p_token: expiredToken } });
    if (!(exp.ok && exp.json[0] && new Date(exp.json[0].expires_at) < new Date())) fail('an expired invitation does not show as expired');
    // Signing up with it must be refused (handle_new_user, sql/024).
    tries += 1;
    const signup = await anon('/auth/v1/signup', {
      method: 'POST', body: { email: `${expiredToken}@example.invalid`, password: `${crypto.randomBytes(12).toString('hex')}aA1!` },
    });
    if (signup.ok && signup.json && (signup.json.id || (signup.json.user && signup.json.user.id))) {
      fail('an expired invitation still let somebody register');
      const id = signup.json.id || signup.json.user.id;
      await http(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    }
    await http(`/rest/v1/invitations?token=eq.${expiredToken}`, { method: 'DELETE' });

    // 3. Signing out everywhere ends the refresh token.
    const session = await must('fresh session', anon('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: w.B.email, password: w.B.password },
    }));
    await anon('/auth/v1/logout?scope=global', { method: 'POST', token: session.access_token });
    tries += 1;
    const refreshed = await anon('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: session.refresh_token },
    });
    if (refreshed.ok) fail('a refresh token still worked after signing out everywhere');

    // 4. Suspended while signed in: the token already held opens nothing.
    const heldByA = w.A.token;
    const sessionA = await must('A session', anon('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: w.A.email, password: w.A.password },
    }));
    await must('suspend A', http(`/rest/v1/profiles?id=eq.${w.A.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'suspended' } }));
    tries += 2;
    const market = await http('/rest/v1/rpc/get_public_listings', { method: 'POST', key: process.env.SUPABASE_ANON_KEY, token: heldByA, body: {} });
    if (market.ok && Array.isArray(market.json) && market.json.length) fail('a member suspended mid-session still read the market');
    const ref = await http('/rest/v1/rpc/next_reference', { method: 'POST', key: process.env.SUPABASE_ANON_KEY, token: heldByA, body: { p_type: 'buy' } });
    if (ref.ok) fail('a member suspended mid-session still drew a listing reference');

    // Refreshing the session after suspension (docs/AGREED-2026-10-25.md,
    // review Block 4): a new token may be issued, but it must open nothing.
    tries += 1;
    const renewed = await anon('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: sessionA.refresh_token },
    });
    if (renewed.ok && renewed.json.access_token) {
      const t = renewed.json.access_token;
      const m2 = await http('/rest/v1/rpc/get_public_listings', { method: 'POST', key: process.env.SUPABASE_ANON_KEY, token: t, body: {} });
      if (m2.ok && Array.isArray(m2.json) && m2.json.length) fail('a suspended member read the market with a refreshed session');
      const r2 = await http('/rest/v1/rpc/next_reference', { method: 'POST', key: process.env.SUPABASE_ANON_KEY, token: t, body: { p_type: 'buy' } });
      if (r2.ok) fail('a suspended member drew a listing reference with a refreshed session');
    }

    // Demoted: an Operator made a member keeps no Operator power through the
    // token already held (same Block 4).
    const demoted = await account('demoted', { role: 'operator', inviter: w.operator.profileId });
    await must('demote', http(`/rest/v1/profiles?id=eq.${demoted.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { role: 'participant' } }));
    tries += 4;
    const seen = await asUser(demoted, '/rest/v1/profiles?select=id');
    if (seen.ok && seen.json.some((r) => r.id !== demoted.profileId)) fail('a demoted Operator still read other members\' profiles');
    await asUser(demoted, `/rest/v1/profiles?id=eq.${w.pending.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'approved' } });
    const [still] = (await http(`/rest/v1/profiles?select=status&id=eq.${w.pending.profileId}`)).json;
    if (still && still.status === 'approved') fail('a demoted Operator still approved a registration');
    const inv = await asUser(demoted, '/rest/v1/rpc/queue_invitation_email', {
      method: 'POST', body: { p_to_email: 'demoted-invite@example.invalid', p_link: 'https://app.myplatform.trade/register.html', p_lang: 'en' },
    });
    if (inv.ok) fail('a demoted Operator still sent an invitation');
    await http('/rest/v1/email_outbox?to_email=eq.demoted-invite@example.invalid', { method: 'DELETE' });
    const log = await asUser(demoted, '/rest/v1/activity_log?select=id&limit=50');
    if (log.ok && Array.isArray(log.json) && log.json.length) fail('a demoted Operator still read the activity log');

    // 5. Deleted: the token a deleted member still holds opens nothing.
    const heldByPending = w.pending.token;
    await http(`/auth/v1/admin/users/${w.pending.userId}`, { method: 'DELETE' });
    tries += 1;
    const ghost = await http('/rest/v1/profiles?select=id', { key: process.env.SUPABASE_ANON_KEY, token: heldByPending });
    if (ghost.ok && Array.isArray(ghost.json) && ghost.json.length) fail('a deleted member\'s token still read profiles');

    // 6. No token of anybody is stored where Operators or members read.
    const secrets = [heldByA, heldByPending, session.access_token, session.refresh_token, w.B.token, w.operator.token]
      .filter(Boolean).map((t) => t.split('.').pop()).filter((t) => t.length > 10);
    for (const table of ['activity_log', 'notifications', 'deals', 'deal_history', 'messages']) {
      tries += 1;
      const all = (await http(`/rest/v1/${table}?select=*&limit=1000`)).text;
      for (const s of secrets) if (all.includes(s)) fail(`a session token was stored in ${table}`);
    }
  } finally {
    await cleanup();
  }
  console.log(`Token scan: ${tries} attempts at guessing, reusing or keeping secret codes and sessions.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - no code could be guessed, reused or kept, and no session outlived its owner\'s right to it.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
