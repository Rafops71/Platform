// The identity scan: does anything a member is sent name another member?
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"), first
// on the agreed list after the security grid. The platform's product is that
// members never learn who is on the other side. The grid proves a member
// cannot read another member's ROWS; this proves a member is never SENT the
// other member's NAME, wherever it might travel - a column of their own rows,
// a function's answer, an error message, a notification.
//
// It builds the grid's world on the staging project (scripts/security-grid.js:
// B posts a listing, A enquires, the Operator forwards, B replies, the Operator
// forwards the reply), gives every account a unique name, surname, company,
// phone and email, and then, signed in as A, calls EVERY table and EVERY
// function the web API serves - including with nonsense arguments, to make
// them fail - and searches every byte that comes back for any of B's
// identifiers. Then the same the other way round, as B looking for A.
//
// One known, accepted exception, recorded in HANDOFF.md ("PARKED, by the
// owner, on 2026-10-19"): a forwarded message carries its writer's random
// profile id in `sender_id`. It names nobody and is never printed; the owner
// weighed it and parked it. The scan allows that one value in that one field
// on messages, and nowhere else - so if it ever spreads, the scan fails.
//
// Refuses the live project.

const { buildWorld, cleanup, http, asUser, guardNotLive } = require('./security-grid');

const KNOWN_EXCEPTIONS = [
  { table: 'messages', field: 'sender_id', which: 'profile_id' },   // HANDOFF.md, parked 2026-10-19
];

function needles(identity) {
  return Object.entries(identity)
    .filter(([, v]) => typeof v === 'string' && v.length >= 6)
    .map(([kind, value]) => ({ kind, value, lower: value.toLowerCase() }));
}

// Remove exactly the accepted exception before searching, so it cannot hide
// anything else in the same answer.
function stripExceptions(source, json, other) {
  if (!Array.isArray(json)) return json;
  return json.map((row) => {
    const copy = { ...row };
    for (const ex of KNOWN_EXCEPTIONS) {
      if (source === `table ${ex.table}` && copy[ex.field] === other.identity[ex.which]) delete copy[ex.field];
    }
    return copy;
  });
}

async function scanAs(who, other, findings) {
  const looking = needles(other.identity);
  const check = (source, body) => {
    const hay = (typeof body === 'string' ? body : JSON.stringify(body)).toLowerCase();
    for (const n of looking) if (hay.includes(n.lower)) findings.push(`${who.label} was sent ${other.label}'s ${n.kind} via ${source}`);
  };

  const spec = (await http('/rest/v1/', { headers: { Accept: 'application/openapi+json' } })).json;
  const paths = Object.keys(spec.paths);
  const tables = paths.filter((p) => p.length > 1 && !p.startsWith('/rpc/')).map((p) => p.slice(1));
  const rpcs = paths.filter((p) => p.startsWith('/rpc/')).map((p) => p.slice(5));

  for (const t of tables) {
    const r = await asUser(who, `/rest/v1/${t}?select=*`);
    check(`table ${t}`, r.json ? stripExceptions(`table ${t}`, r.json, other) : r.text);
    // And the same table asked wrongly, so its error message is scanned too.
    const bad = await asUser(who, `/rest/v1/${t}?id=eq.not-a-uuid`);
    check(`table ${t} (error)`, bad.text);
  }
  for (const f of rpcs) {
    // Functions get no arguments, then deliberately wrong ones; both answers
    // are scanned. A function the caller may not use should refuse in words
    // that name nobody.
    for (const body of [{}, { p_profile_id: other.profileId, p_listing_id: other.profileId, p_token: 'x' }]) {
      const r = await asUser(who, `/rest/v1/rpc/${f}`, { method: 'POST', body });
      check(`function ${f}()`, r.text);
    }
  }
  // Their own session as Supabase reports it.
  const me = await http('/auth/v1/user', { key: process.env.SUPABASE_ANON_KEY, token: who.token });
  check('their own auth record', me.text);
  return tables.length + rpcs.length;
}

async function main() {
  guardNotLive();
  const findings = [];
  let reached = 0;
  try {
    const world = await buildWorld();
    reached += await scanAs(world.A, world.B, findings);
    reached += await scanAs(world.B, world.A, findings);
    // The pending and suspended members are outsiders: they may learn no one.
    for (const outsider of [world.pending, world.suspended]) {
      reached += await scanAs(outsider, world.A, findings);
      reached += await scanAs(outsider, world.B, findings);
    }
  } finally {
    await cleanup();
  }
  console.log(`Identity scan: ${reached} endpoints read, as two members and two outsiders, each searched for the other side's name, surname, company, phone, email and ids.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length} leak(s):`);
    for (const f of [...new Set(findings)]) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - nobody was sent anybody else\'s identity.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
