// The crowd scan: many members on the real platform at the same instant.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"), the
// last on the agreed list. scripts/stress-test.js already floods a private
// PostgreSQL with thousands of rows; this asks the other half, through the
// real Supabase API on the staging project: when CROWD members (default 40)
// all act at once, does every one get an answer, and a quick one?
//
// All at once, each member: reads the market, reads their own profile and
// notifications, posts a listing, and asks about another member's listing.
// Then the database is read past every policy: every accepted listing and
// enquiry is stored, once, owned by the member who sent it.
//
// Fails on any 5xx answer, any request that never answers, a refusal of
// something a member may do, or a slowest-in-twenty (95th percentile) answer
// over 5 seconds. Wide on purpose: a tripwire for a crowd that jams, not a
// speed target. Timings are printed either way.
//
// Refuses the live project.

const crypto = require('crypto');
const { buildWorld, account, cleanup, http, asUser, guardNotLive } = require('./security-grid');

const CROWD = Number(process.env.CROWD || 40);
// Measured on the free staging project, 2026-10-27: 10 members (50 requests
// at once) about 0.9 s; 40 members (200 at once) about 3.0 s - answers queue
// in line, nothing jams. 5 s leaves room for a slow day, not for a jam.
const P95_LIMIT_MS = 5000;

async function timed(label, p) {
  const t0 = Date.now();
  try {
    const r = await p;
    return { label, ms: Date.now() - t0, status: r.status, ok: r.ok, json: r.json, text: r.text };
  } catch (err) {
    return { label, ms: Date.now() - t0, status: 0, ok: false, text: err.message };
  }
}

async function main() {
  guardNotLive();
  const findings = [];
  const fail = (m) => findings.push(m);
  const results = [];
  try {
    const w = await buildWorld();
    const crowd = [];
    for (let i = 0; i < CROWD; i += 1) crowd.push(await account(`crowd-${i}`, { inviter: w.operator.profileId }));
    const [commodity] = (await http('/rest/v1/commodities?select=name&limit=1')).json;

    // Everybody at once.
    const t0 = Date.now();
    await Promise.all(crowd.map(async (m, i) => {
      const steps = await Promise.all([
        timed('market', asUser(m, '/rest/v1/rpc/get_public_listings', { method: 'POST', body: {} })),
        timed('own profile', asUser(m, `/rest/v1/profiles?select=id,first_name&id=eq.${m.profileId}`)),
        timed('notifications', asUser(m, '/rest/v1/notifications?select=id&limit=20')),
        timed('post listing', asUser(m, '/rest/v1/listings', {
          method: 'POST', prefer: 'return=minimal',
          body: { user_id: m.profileId, reference_number: `CROWD-${crypto.randomBytes(5).toString('hex')}-${i}`,
                  type: i % 2 ? 'buy' : 'sell', commodity: commodity.name, incoterm: 'CIF',
                  ...(i % 2 ? { destination: 'Crowdport' } : { origin: 'Crowdport' }),
                  poster_role: 'principal', ...(i % 2 ? {} : { principal_kind: 'trader' }), docs_seen: 'no', docs_showable: 'no', truth_confirmed: true },
        })),
        timed('enquiry', asUser(m, '/rest/v1/messages', {
          method: 'POST', prefer: 'return=minimal',
          body: { sender_id: m.profileId, listing_id: w.listingId, body: `crowd enquiry ${i}` },
        })),
      ]);
      for (const s of steps) results.push({ ...s, who: i });
    }));
    const wall = Date.now() - t0;

    for (const r of results) {
      if (r.status === 0) fail(`member ${r.who} ${r.label}: no answer (${r.text.slice(0, 120)})`);
      else if (r.status >= 500) fail(`member ${r.who} ${r.label}: server error ${r.status}`);
      else if (!r.ok) fail(`member ${r.who} ${r.label}: refused ${r.status} ${r.text.slice(0, 120)}`);
    }

    // What stuck: one listing and one enquiry per member, each their own.
    const ids = crowd.map((m) => m.profileId);
    const listings = (await http(`/rest/v1/listings?select=user_id&user_id=in.(${ids.join(',')})&destination=eq.Crowdport`)).json
      .concat((await http(`/rest/v1/listings?select=user_id&user_id=in.(${ids.join(',')})&origin=eq.Crowdport`)).json);
    const enquiries = (await http(`/rest/v1/messages?select=sender_id,body&sender_id=in.(${ids.join(',')})&body=like.crowd enquiry*`)).json;
    crowd.forEach((m, i) => {
      const L = listings.filter((l) => l.user_id === m.profileId).length;
      const E = enquiries.filter((e) => e.sender_id === m.profileId);
      if (L !== 1) fail(`member ${i}: ${L} listings stored, expected 1`);
      if (E.length !== 1 || E[0].body !== `crowd enquiry ${i}`) fail(`member ${i}: their enquiry was not stored once, as sent`);
    });

    // Timings.
    const by = {};
    for (const r of results) (by[r.label] = by[r.label] || []).push(r.ms);
    const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
    console.log(`Crowd scan: ${CROWD} members, ${results.length} requests at once, all answered in ${wall} ms.`);
    for (const [label, ms] of Object.entries(by)) {
      const p95 = pct(ms, 0.95);
      console.log(`  ${label.padEnd(14)} middle ${pct(ms, 0.5)} ms, slowest-in-twenty ${p95} ms, slowest ${Math.max(...ms)} ms`);
      if (p95 > P95_LIMIT_MS) fail(`${label}: slowest-in-twenty answer took ${p95} ms (limit ${P95_LIMIT_MS})`);
    }
  } finally {
    await cleanup();
  }
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of [...new Set(findings)].slice(0, 40)) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - every member answered, quickly, and everything they sent was stored once, as theirs.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
