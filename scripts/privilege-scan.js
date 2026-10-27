// The privilege scan: can anybody make themselves more than they are?
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"), third
// on the agreed list. On the staging project, with the grid's world
// (scripts/security-grid.js), a member, a pending and a suspended account
// each try every way up we could think of:
//
//   - write role = 'operator' or status = 'approved' on their own profile;
//   - put role = 'operator' into their own Supabase account metadata;
//   - forge their session token with a stronger role;
//   - call every Operator-only database function;
//   - log activity in the Operator's name, or as an action members never log;
//   - (suspended / pending) read the market or post as if still active.
//
// Afterwards it reads the database with the service key to prove nothing
// actually changed - a refused call that quietly succeeded is the failure
// that matters, and an HTTP status alone cannot show it.
//
// Refuses the live project.

const crypto = require('crypto');
const { buildWorld, cleanup, http, asUser, guardNotLive } = require('./security-grid');

// Functions only an Operator may use. Each must refuse a member, a pending and
// a suspended caller - an error, or (for the yes/no helpers) the answer "no".
const OPERATOR_ONLY = {
  operator_analytics: { p_bucket: 'week', p_periods: 4 },
  deal_analytics: { p_bucket: 'week', p_periods: 4 },
  member_scorecard: (w) => ({ p_profile_id: w.B.profileId }),
  purge_orphaned_activity: {},
  send_manual_reminder: (w) => ({ p_listing_id: w.listingId }),
  send_listing_reminders: {},
  notify_operators: { p_type: 'x', p_message: 'escalation probe', p_related_id: null },
  queue_invitation_email: { p_to_email: 'probe@example.invalid', p_link: 'https://example.invalid', p_lang: 'en' },
  log_activity: (w) => ({ p_user_id: w.operator.profileId, p_action: 'operator agreed to waive documents', p_details: {} }),
  generate_matches_for_listing: (w) => ({ p_listing_id: w.listingId }),
};

function forge(token, claims) {
  const [h, p, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  return [h, Buffer.from(JSON.stringify({ ...payload, ...claims })).toString('base64url'), sig].join('.');
}

async function main() {
  guardNotLive();
  const findings = [];
  let tries = 0;
  const fail = (msg) => findings.push(msg);
  try {
    const w = await buildWorld();
    const before = await http(`/rest/v1/profiles?select=id,role,status&id=in.(${[w.A, w.pending, w.suspended].map((x) => x.profileId).join(',')})`);
    const invitationsBefore = (await http('/rest/v1/invitations?select=id')).json.length;
    const outboxBefore = (await http('/rest/v1/email_outbox?select=id&to_email=eq.probe@example.invalid')).json.length;
    const forgedBefore = (await http(`/rest/v1/activity_log?select=id&action=eq.${encodeURIComponent('operator agreed to waive documents')}`)).json.length;

    for (const who of [w.A, w.pending, w.suspended]) {
      // 1. Own profile.
      for (const body of [{ role: 'operator' }, { status: 'approved' }, { role: 'operator', status: 'approved' }]) {
        tries += 1;
        await asUser(who, `/rest/v1/profiles?id=eq.${who.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body });
      }
      // 2. Own account metadata.
      tries += 1;
      await http('/auth/v1/user', { method: 'PUT', key: process.env.SUPABASE_ANON_KEY, token: who.token,
                                    body: { data: { role: 'operator', status: 'approved' } } });
      // 3. Forged session tokens.
      for (const claims of [{ role: 'service_role' }, { role: 'operator' }, { app_metadata: { role: 'operator' } }]) {
        tries += 1;
        const forged = forge(who.token, claims);
        const r = await http('/rest/v1/profiles?select=id,email', { key: process.env.SUPABASE_ANON_KEY, token: forged });
        if (r.ok) fail(`${who.label} was served with a forged token (${JSON.stringify(claims)})`);
      }
      // 4. Operator-only functions.
      for (const [fn, args] of Object.entries(OPERATOR_ONLY)) {
        tries += 1;
        const body = typeof args === 'function' ? args(w) : args;
        const r = await asUser(who, `/rest/v1/rpc/${fn}`, { method: 'POST', body });
        if (r.ok) fail(`${who.label} ran the Operator-only function ${fn}() (HTTP ${r.status}: ${r.text.slice(0, 120)})`);
      }
      tries += 1;
      const op = await asUser(who, '/rest/v1/rpc/is_operator', { method: 'POST', body: {} });
      if (op.json === true) fail(`${who.label} is told is_operator() = true`);
      // 5. Activity log in someone else's words.
      for (const action of ['invitation_created', 'operator agreed to waive documents']) {
        tries += 1;
        const r = await asUser(who, '/rest/v1/rpc/record_activity', { method: 'POST', body: { p_action: action, p_details: {} } });
        if (r.ok) fail(`${who.label} wrote "${action}" into the activity log`);
      }
    }
    // 6. The inactive cannot act as active.
    for (const who of [w.pending, w.suspended]) {
      tries += 2;
      const market = await asUser(who, '/rest/v1/rpc/get_public_listings', { method: 'POST', body: {} });
      if (market.ok && Array.isArray(market.json) && market.json.length) fail(`${who.label} read the market (${market.json.length} listings)`);
      const ref = await asUser(who, '/rest/v1/rpc/next_reference', { method: 'POST', body: { p_type: 'sell' } });
      if (ref.ok) fail(`${who.label} drew a listing reference number`);
    }

    // What actually happened, read past every policy.
    const after = await http(`/rest/v1/profiles?select=id,role,status&id=in.(${[w.A, w.pending, w.suspended].map((x) => x.profileId).join(',')})`);
    const was = Object.fromEntries(before.json.map((p) => [p.id, `${p.role}/${p.status}`]));
    for (const p of after.json) if (was[p.id] !== `${p.role}/${p.status}`) fail(`profile ${p.id} changed from ${was[p.id]} to ${p.role}/${p.status}`);
    const invitationsAfter = (await http('/rest/v1/invitations?select=id')).json.length;
    if (invitationsAfter !== invitationsBefore) fail(`invitations changed from ${invitationsBefore} to ${invitationsAfter}`);
    const forgedLog = await http(`/rest/v1/activity_log?select=id&action=eq.${encodeURIComponent('operator agreed to waive documents')}`);
    if (forgedLog.json.length !== forgedBefore) fail('a forged line reached the activity log');
    const outbox = await http('/rest/v1/email_outbox?select=id&to_email=eq.probe@example.invalid');
    if (outbox.json.length !== outboxBefore) fail('a member queued an invitation email');
  } finally {
    await cleanup();
  }
  console.log(`Privilege scan: ${tries} attempts to rise above their station, by a member, a pending and a suspended account.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - nobody became more than they are, and the database shows nothing changed.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
