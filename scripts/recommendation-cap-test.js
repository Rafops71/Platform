#!/usr/bin/env node
// Concurrency check for the five-open cap on candidate recommendations (sql/054).
//
//   npm run check:recommend-cap
//   node scripts/recommendation-cap-test.js --no-lock   (negative control)
//
// Each round: a member has four open recommendations, and two submissions
// are fired at the same moment on two separate connections. The cap holds
// only if exactly one is accepted, the other is refused with the five-open
// message, and the member ends with five open.
//
// The --no-lock control removes the per-member advisory lock from the
// function in the throwaway database, and puts a 200 ms pause between the
// count and the insert. Without that pause the race is too narrow to show on
// most machines. The control must FAIL, or the test proves nothing.
//
// It runs against a throwaway local PostgreSQL only (scripts/pg-harness.js).
// It is not part of `npm run test:sql`, which uses a single connection.

'use strict';

const { start } = require('./pg-harness');

const ROUNDS = 30;
const NO_LOCK = process.argv.includes('--no-lock');

const SUBMIT = `select public.submit_candidate_recommendation(
  'Race Candidate', 'Race Co', 'race@example.invalid', 'known', 'Copper', true, 'exp')`;

async function asMember(client, userId) {
  await client.query(`set role authenticated`);
  await client.query(`select set_config('test.uid', $1, false)`, [userId]);
}

(async () => {
  const pg = await start({ quiet: true });
  const admin = pg.client;
  const MEMBER_UID = 'c0c0c0c0-0001-0001-0001-000000000001';

  await admin.query(`select public.test_invite('race-mem@example.invalid')`);
  await admin.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1::uuid, 'race-mem@example.invalid', jsonb_build_object('first_name','Race','last_name','Member',
    'phone','+3200000901','country','Chile','language','en'))`, [MEMBER_UID]);
  await admin.query(`update public.profiles set status = 'approved' where email = 'race-mem@example.invalid'`);
  await admin.query(`select public.test_sign_approved()`);

  if (NO_LOCK) {
    // Rebuild the function without the lock, and with a pause that widens the gap.
    const { rows } = await admin.query(`select pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'submit_candidate_recommendation'`);
    let def = rows[0].def;
    const before = def;
    def = def.replace(/perform pg_advisory_xact_lock\([^;]*\);/i, 'null;');
    def = def.replace(/(select count\(\*\) into v_open[\s\S]*?;)/i, '$1 perform pg_sleep(0.2);');
    if (def === before) throw new Error('control: could not find the lock line to remove');
    await admin.query(def);
    console.log('CONTROL: lock removed, 200 ms pause added between count and insert');
  }

  let held = 0, broken = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    await admin.query(`delete from public.candidate_recommendations r
                        using public.profiles p
                        where p.id = r.referrer_id and p.email = 'race-mem@example.invalid'`);
    await admin.query(`insert into public.candidate_recommendations
        (referrer_id, candidate_name, candidate_company, candidate_email, how_known,
         commodities, agreed_contact, own_experience)
      select p.id, 'Open ' || g, 'Co', 'open' || g || '@example.invalid', 'k', 'Copper', true, 'e'
        from public.profiles p, generate_series(1, 4) g
       where p.email = 'race-mem@example.invalid'`);

    const a = await pg.newClient();
    const b = await pg.newClient();
    await asMember(a, MEMBER_UID);
    await asMember(b, MEMBER_UID);

    const attempt = (c) => c.query(SUBMIT).then(() => 'OK', (e) => 'ERR ' + e.message);
    const results = await Promise.all([attempt(a), attempt(b)]);

    const { rows } = await admin.query(`select count(*)::int n from public.candidate_recommendations r
      join public.profiles p on p.id = r.referrer_id
     where p.email = 'race-mem@example.invalid' and r.status = 'open'`);
    const oks = results.filter(r => r === 'OK').length;
    const refused = results.filter(r => r === 'ERR You can have up to 5 open recommendations at a time.').length;
    const open = rows[0].n;
    const ok = oks === 1 && refused === 1 && open === 5;
    if (ok) held++; else broken++;
    if (!ok || round === 1) console.log(`round ${round}: ${results.join(' | ')} -> open ${open} ${ok ? 'cap held' : 'CAP BROKEN'}`);
  }

  console.log(`\nrounds: ${ROUNDS}, cap held: ${held}, cap broken: ${broken}`);
  await pg.stop();
  if (NO_LOCK) {
    // The control is supposed to break. Exit 0 only if it did.
    console.log(broken > 0 ? 'CONTROL OK: the test detects the race without the lock.'
                           : 'CONTROL FAILED: no race was detected, so this test proves nothing.');
    process.exit(broken > 0 ? 0 : 1);
  }
  console.log(broken === 0 ? 'PASS: the cap holds under simultaneous submissions.'
                           : 'FAIL: the cap was broken.');
  process.exit(broken === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
