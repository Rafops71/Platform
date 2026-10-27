// The collision scan: two hands on the same thing at the same instant.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"), fifth
// on the agreed list. Everything here is fired truly in parallel, against
// the staging project, and then the database is read to see what actually
// stuck - because a collision that "worked" twice is the failure:
//
//   - two Operators approve the same registration at once: one approval,
//     one approval email;
//   - two Operators forward the same enquiry at once: one deal file;
//   - twenty listing references drawn at once: twenty different numbers;
//   - one member posts thirty listings at once: the hourly limit (20) holds;
//   - one member signs the Terms twice at once: one signature on record;
//   - two members write in the same thread at once: both messages kept.
//
// Refuses the live project.

const crypto = require('crypto');
const { buildWorld, account, cleanup, http, asUser, must, guardNotLive } = require('./security-grid');

const together = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));

async function main() {
  guardNotLive();
  const findings = [];
  const fail = (m) => findings.push(m);
  const checked = [];
  try {
    const w = await buildWorld();
    const op2 = await account('operator-2', { role: 'operator', inviter: w.operator.profileId });

    // 1. Two Operators approve the same pending registration.
    const p = await account('race-pending', { status: 'pending', inviter: w.operator.profileId });
    await Promise.all([w.operator, op2].map((op) =>
      asUser(op, `/rest/v1/profiles?id=eq.${p.profileId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'approved' } })));
    const [prof] = (await http(`/rest/v1/profiles?select=status&id=eq.${p.profileId}`)).json;
    if (prof.status !== 'approved') fail(`double approval left status "${prof.status}"`);
    const mails = (await http(`/rest/v1/email_outbox?select=subject&to_email=eq.${encodeURIComponent(p.email)}`)).json
      .filter((m) => /approved|aprobado/i.test(m.subject));
    if (mails.length !== 1) fail(`double approval queued ${mails.length} approval emails`);
    checked.push('double approval');

    // 2. Two Operators forward the same enquiry.
    const [listing] = (await http(`/rest/v1/listings?select=id&id=eq.${w.listingId}`)).json;
    const [enq] = await must('enquiry', asUser(w.A, '/rest/v1/messages', {
      method: 'POST', prefer: 'return=representation',
      body: { sender_id: w.A.profileId, listing_id: listing.id, body: 'race enquiry' },
    }));
    const dealsBefore = (await http(`/rest/v1/deals?select=id&listing_id=eq.${listing.id}`)).json.length;
    await Promise.all([w.operator, op2].map((op) =>
      asUser(op, '/rest/v1/message_forward_log', {
        method: 'POST', prefer: 'return=minimal',
        body: { message_id: enq.id, operator_id: op.profileId, to_user_id: w.B.profileId },
      })));
    const dealsAfter = (await http(`/rest/v1/deals?select=id&listing_id=eq.${listing.id}`)).json.length;
    if (dealsAfter - dealsBefore > 1) fail(`one enquiry forwarded twice at once opened ${dealsAfter - dealsBefore} deal files`);
    checked.push('double forward');

    // 3. Twenty reference numbers at once.
    const refs = await together(20, () => asUser(w.B, '/rest/v1/rpc/next_reference', { method: 'POST', body: { p_type: 'buy' } }));
    const got = refs.filter((r) => r.ok).map((r) => r.json);
    if (got.length !== 20) fail(`only ${got.length} of 20 simultaneous reference draws succeeded`);
    if (new Set(got).size !== got.length) fail('two simultaneous draws were given the same reference number');
    checked.push('20 references at once');

    // 4. Thirty listings at once by one member: the hourly limit of 20 holds.
    const flooder = await account('race-flooder', { inviter: w.operator.profileId });
    const commodity = (await http('/rest/v1/commodities?select=name&limit=1')).json[0].name;
    const posts = await together(30, (i) => asUser(flooder, '/rest/v1/listings', {
      method: 'POST', prefer: 'return=minimal',
      body: { user_id: flooder.profileId, reference_number: `RACE-${crypto.randomBytes(5).toString('hex')}-${i}`,
              type: 'buy', commodity, incoterm: 'CIF', destination: 'Race', poster_role: 'principal',
              docs_seen: 'no', docs_showable: 'no', truth_confirmed: true },
    }));
    const accepted = posts.filter((r) => r.ok).length;
    const stored = (await http(`/rest/v1/listings?select=id&user_id=eq.${flooder.profileId}`)).json.length;
    if (stored > 20) fail(`thirty simultaneous posts stored ${stored} listings, over the limit of 20`);
    if (stored !== accepted) fail(`${accepted} posts were answered "accepted" but ${stored} were stored`);
    checked.push(`30 posts at once (${stored} stored)`);

    // 5. One member signs the Terms twice at once.
    const signer = await account('race-signer', { inviter: w.operator.profileId });
    const [terms] = (await http('/rest/v1/terms_versions?select=version&language=eq.en&order=published_at.desc&limit=1')).json;
    const before = (await http(`/rest/v1/terms_acceptances?select=id&profile_id=eq.${signer.profileId}&version=eq.${terms.version}`)).json.length;
    await together(2, () => asUser(signer, '/rest/v1/rpc/accept_terms', {
      method: 'POST',
      body: { p_version: terms.version, p_language: 'en', p_signed_name: 'Race Signer', p_capacity: 'individual',
              p_company: null, p_address_line1: '1 Race Street', p_address_line2: null, p_city: 'Testville',
              p_postal_code: null, p_country: 'Belgium' },
    }));
    const after = (await http(`/rest/v1/terms_acceptances?select=id&profile_id=eq.${signer.profileId}&version=eq.${terms.version}`)).json.length;
    if (after > 1) fail(`signing the same Terms twice at once left ${after} signatures`);
    if (after < before) fail('signing again removed a signature');
    checked.push('double signature');

    // 6. Two members write in the same thread at once: both are kept.
    const [m1, m2] = await Promise.all([
      asUser(w.A, '/rest/v1/messages', { method: 'POST', prefer: 'return=representation',
        body: { sender_id: w.A.profileId, listing_id: listing.id, in_reply_to: enq.id, body: 'race A' } }),
      asUser(w.B, '/rest/v1/messages', { method: 'POST', prefer: 'return=representation',
        body: { sender_id: w.B.profileId, listing_id: listing.id, in_reply_to: enq.id, body: 'race B' } }),
    ]);
    const kept = (await http(`/rest/v1/messages?select=body&in_reply_to=eq.${enq.id}`)).json.map((m) => m.body);
    for (const [r, body] of [[m1, 'race A'], [m2, 'race B']]) {
      if (r.ok && !kept.includes(body)) fail(`"${body}" was accepted but not kept`);
    }
    checked.push('two writers in one thread');
  } finally {
    await cleanup();
  }
  console.log(`Collision scan: ${checked.length} collisions fired in parallel - ${checked.join(', ')}.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - nothing happened twice that should happen once, and nothing accepted was lost.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
