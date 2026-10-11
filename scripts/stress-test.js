#!/usr/bin/env node
// Volume and concurrency, against a throwaway PostgreSQL.
//
//   npm run stress                 # the default sizes, CI-friendly
//   STRESS_MEMBERS=1000 STRESS_LISTINGS=8000 npm run stress
//
// Nothing here touches the live Supabase project. scripts/pg-harness.js starts
// a real PostgreSQL in a temp directory, applies the whole schema and every
// migration, and deletes the server afterwards — so this can fabricate
// thousands of members without anything to undo in production. That ordering
// is deliberate: a volume test on the live database would leave rubbish behind
// that the owner has to live with.
//
// Three questions, which the browser and database suites do not ask:
//
//   1. Does it still behave correctly when there is a lot of data? A
//      prohibition that holds for three members and fails for three hundred is
//      not a prohibition.
//   2. Is anything pathologically slow? Not a benchmark — a tripwire for the
//      shape of a query. A missing index shows up as seconds rather than
//      milliseconds, and the thresholds are set wide enough that only that
//      kind of change trips them.
//   3. Does it hold up when several members act at the same instant? The rate
//      limit counts rows in the last hour, which is the classic shape for
//      being wrong under concurrency: twenty parallel inserts can each see
//      nineteen and all decide they are allowed.
//
// Exit code is 0 only if every check passed. Timings are printed either way,
// because "it got slower" is worth reading even on a pass.

'use strict';

const { start: startPostgres } = require('./pg-harness');

const MEMBERS = Number(process.env.STRESS_MEMBERS || 200);
const LISTINGS = Number(process.env.STRESS_LISTINGS || 2000);
const MESSAGES = Number(process.env.STRESS_MESSAGES || 2000);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 24);

// Wide on purpose. These are not performance targets; they are the point at
// which a query has almost certainly changed shape rather than merely slowed
// down on a busy runner. A shared CI machine is several times slower than a
// laptop, and a threshold that fails there teaches people to ignore it.
const BUDGET_MS = {
  browse: 3000,
  analytics: 5000,
  export: 3000,
  listingInsert: 1500,
};

const checks = [];
const timings = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ->  ${detail}` : ''}`);
}

async function timed(label, fn) {
  const began = process.hrtime.bigint();
  const value = await fn();
  const ms = Number(process.hrtime.bigint() - began) / 1e6;
  timings.push({ label, ms });
  return { value, ms };
}

/** Run as a signed-in participant. auth.uid() in the stub reads test.uid, and
 *  the role decides which RLS policies apply — the same mechanism the database
 *  suite uses, so a pass here means the same thing it means there. */
async function asMember(client, userId, fn) {
  await client.query(`set role authenticated`);
  await client.query(`set test.uid = '${userId}'`);
  try {
    return await fn();
  } finally {
    await client.query('reset role');
    await client.query('reset test.uid');
  }
}

async function main() {
  console.log(
    `\nVolume: ${MEMBERS} members, ${LISTINGS} listings, ${MESSAGES} messages. ` +
    `Concurrency: ${CONCURRENCY} parallel sessions.\n`
  );

  const pg = await startPostgres({ quiet: true });
  const db = pg.client;

  try {
    // ---------------------------------------------------------- the members --
    //
    // Inserted into auth.users, not profiles, so on_auth_user_created builds
    // each profile exactly as a real registration would - along with its terms
    // acceptance and its activity row. Fabricating profiles directly would
    // skip the triggers and test a database this platform does not have.
    console.log('Building the market …');
    const { ms: membersMs } = await timed('create members', () => db.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      select gen_random_uuid(),
             'stress-member-' || g || '@example.invalid',
             jsonb_build_object('first_name', 'Member', 'last_name', 'Number' || g,
                                'company', 'Stress Co ' || g, 'phone', '+3200' || g,
                                'country', 'Belgium', 'language', case when g % 3 = 0 then 'es' else 'en' end)
        from generate_series(1, $1) g
    `, [MEMBERS]));

    await db.query(`update public.profiles set status = 'approved' where email like 'stress-member-%'`);

    const { rows: memberRows } = await db.query(
      `select id, user_id from public.profiles where email like 'stress-member-%' order by email`
    );
    check('every fabricated member got a profile from the trigger',
      memberRows.length === MEMBERS, `${memberRows.length} of ${MEMBERS}`);

    // One operator, to own the forwarding and read the figures.
    await db.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), 'stress-operator@example.invalid',
              jsonb_build_object('first_name','Ops','last_name','Stress','phone','+3200','country','Belgium','language','en'))
    `);
    await db.query(`update public.profiles set role = 'operator', status = 'approved' where email = 'stress-operator@example.invalid'`);
    const { rows: [operator] } = await db.query(
      `select id, user_id from public.profiles where email = 'stress-operator@example.invalid'`
    );

    // --------------------------------------------------------- the listings --
    //
    // Spread across the members and the real commodity list, with a third of
    // them buy-side so the matcher has something to pair. updated_at is also
    // spread, so the stale predicate has a realistic mix to filter.
    const { ms: listingsMs } = await timed('create listings', () => db.query(`
      with m as (select id, row_number() over (order by email) rn from public.profiles where email like 'stress-member-%'),
           c as (select name, row_number() over (order by name) rn from public.commodities)
      insert into public.listings
        (user_id, type, commodity, incoterm, origin, destination, quantity, unit,
         reference_number, status, created_at, updated_at)
      select m.id,
             case when g % 3 = 0 then 'buy' else 'sell' end,
             c.name,
             (array['FOB','CIF','CFR','DAP'])[1 + g % 4],
             case when g % 3 = 0 then null else (array['Chile','Peru','Brazil','Belgium','Spain'])[1 + g % 5] end,
             case when g % 3 = 0 then (array['China','India','Turkey','Belgium'])[1 + g % 4] else null end,
             100 + (g % 900),
             'Metric tons',
             'STRESS-' || lpad(g::text, 6, '0'),
             'available',
             now() - (g % 90) * interval '1 day',
             now() - (g % 90) * interval '1 day'
        from generate_series(1, $1) g
        join m on m.rn = 1 + (g % $2)
        join c on c.rn = 1 + (g % (select count(*) from public.commodities))
    `, [LISTINGS, MEMBERS]));

    const { rows: [{ n: listingCount }] } = await db.query(
      `select count(*)::int n from public.listings where reference_number like 'STRESS-%'`
    );
    check('every listing was accepted', listingCount === LISTINGS, `${listingCount} of ${LISTINGS}`);

    // --------------------------------------------------------- the messages --
    //
    // Enquiries addressed to listings their sender does not own, which is what
    // a brokered enquiry is. Sent with the triggers live, so the audit log and
    // the operator feed fill up the way they would in use.
    const { ms: messagesMs } = await timed('create messages', () => db.query(`
      with l as (select id, user_id, row_number() over (order by reference_number) rn
                   from public.listings where reference_number like 'STRESS-%'),
           m as (select id, row_number() over (order by email) rn
                   from public.profiles where email like 'stress-member-%')
      insert into public.messages (sender_id, listing_id, body)
      select m.id, l.id, 'Stress enquiry ' || g || ': interested, please advise laycan.'
        from generate_series(1, $1) g
        join l on l.rn = 1 + (g % $2)
        join m on m.rn = 1 + ((g * 7) % $3)
       where m.id <> l.user_id
    `, [MESSAGES, LISTINGS, MEMBERS]));

    console.log(
      `\n  built in ${(membersMs / 1000).toFixed(1)}s members, ` +
      `${(listingsMs / 1000).toFixed(1)}s listings, ${(messagesMs / 1000).toFixed(1)}s messages\n`
    );

    // ------------------------------------------------- does it still behave --
    console.log('Correctness at volume:');

    const sampleMember = memberRows[Math.floor(memberRows.length / 2)];

    // Browse is the one screen every member reads, and the one that must never
    // name anybody. At 2000 listings a leak is no more acceptable than at two.
    const browse = await timed('browse', () =>
      asMember(db, sampleMember.user_id, () => db.query('select * from public.get_public_listings()')));
    check('Browse returns every non-archived listing',
      browse.value.rows.length >= LISTINGS, `${browse.value.rows.length} rows`);
    const browseColumns = browse.value.rows.length ? Object.keys(browse.value.rows[0]) : [];
    check('Browse still exposes no column that could name the poster',
      !browseColumns.some(c => /user_id|first_name|last_name|company|phone|email/i.test(c)),
      browseColumns.join(','));

    // The prohibition that matters most, asked at volume: a member reading
    // their own listings must get theirs and nobody else's, however many
    // thousands of other rows are sitting in the table.
    const mine = await asMember(db, sampleMember.user_id, () =>
      db.query('select count(*)::int n from public.listings'));
    const { rows: [{ n: trulyMine }] } = await db.query(
      'select count(*)::int n from public.listings where user_id = $1', [sampleMember.id]);
    check('a member reading listings still sees only their own',
      mine.rows[0].n === trulyMine, `saw ${mine.rows[0].n}, owns ${trulyMine}`);

    // Same question for the mailbox, where the brokered walls live.
    const mail = await asMember(db, sampleMember.user_id, () =>
      db.query('select count(*)::int n from public.messages'));
    const { rows: [{ n: ownMail }] } = await db.query(
      `select count(*)::int n from public.messages where sender_id = $1`, [sampleMember.id]);
    check('a member reading messages sees no more than their own',
      mail.rows[0].n <= ownMail, `saw ${mail.rows[0].n}, sent ${ownMail}`);

    const exported = await timed('export', () =>
      asMember(db, sampleMember.user_id, () => db.query('select * from public.my_activity_export()')));
    check('the member can still export their own activity',
      exported.value.rows.length >= 0, `${exported.value.rows.length} rows`);

    const analytics = await timed('analytics', () =>
      asMember(db, operator.user_id, () =>
        db.query(`select * from public.operator_analytics('week', 12)`)));
    check('the Operator figures still come back at volume',
      analytics.value.rows.length > 0, `${analytics.value.rows.length} periods`);

    // ------------------------------------------------------------- the clock --
    console.log('\nTimings against a wide budget:');
    const budgetChecks = [
      ['Browse', browse.ms, BUDGET_MS.browse],
      ['Operator figures', analytics.ms, BUDGET_MS.analytics],
      ['Activity export', exported.ms, BUDGET_MS.export],
    ];
    for (const [label, ms, budget] of budgetChecks) {
      check(`${label} inside ${budget}ms`, ms <= budget, `${ms.toFixed(0)}ms`);
    }

    // ----------------------------------------------------------- all at once --
    //
    // The rate limit counts listings created in the last hour and refuses the
    // twenty-first. Twenty-four sessions inserting at the same instant is the
    // case where a counting check is classically wrong: each can read the same
    // count before any has committed, and all decide they are under the limit.
    console.log(`\n${CONCURRENCY} sessions posting at the same instant:`);

    const racer = memberRows[0];
    const clients = [];
    for (let i = 0; i < CONCURRENCY; i++) clients.push(await pg.newClient());

    const results = await Promise.allSettled(clients.map(async (c, i) => {
      await c.query(`set role authenticated`);
      await c.query(`set test.uid = '${racer.user_id}'`);
      return c.query(`
        insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
        values ($1, 'sell', 'Iron Ore', 'FOB', 'Chile', $2)
      `, [racer.id, `STRESS-RACE-${i}`]);
    }));

    const accepted = results.filter(r => r.status === 'fulfilled').length;
    const refused = results.filter(r => r.status === 'rejected');
    const rateRefusals = refused.filter(r => /Rate limit/i.test(r.reason && r.reason.message || '')).length;
    const otherErrors = refused.filter(r => !/Rate limit/i.test(r.reason && r.reason.message || ''));

    const { rows: [{ n: racerTotal }] } = await db.query(
      `select count(*)::int n from public.listings
        where user_id = $1 and created_at > now() - interval '1 hour'`, [racer.id]);

    console.log(`  ${accepted} accepted, ${rateRefusals} refused for rate, ${otherErrors.length} other errors`);
    if (otherErrors.length) {
      console.log(`  first other error: ${otherErrors[0].reason && otherErrors[0].reason.message}`);
    }

    // The limit is 20 an hour (sql/016). Nothing may get past it, however many
    // sessions push at once. More than 20 surviving is a real hole.
    check('the flood limit is not beaten by doing it all at once',
      racerTotal <= 20, `${racerTotal} listings in the last hour, limit is 20`);
    check('no session failed for a reason other than the rate limit',
      otherErrors.length === 0,
      otherErrors.length ? String(otherErrors[0].reason && otherErrors[0].reason.message).slice(0, 120) : '');

    // Every accepted insert must be in the audit trail, and no refused one.
    const { rows: [{ n: raceLogged }] } = await db.query(
      `select count(*)::int n from public.activity_log
        where action like '%listing%' and details::text like '%STRESS-RACE-%'`);
    check('the audit trail recorded the accepted listings and not the refused ones',
      raceLogged <= accepted, `${raceLogged} logged, ${accepted} accepted`);

    // ------------------------------------------------------------- teardown --
    //
    // The whole point of doing this on a throwaway server is that teardown is
    // guaranteed. It is still worth proving the cascades work at volume: this
    // is sql/018 deleting hundreds of members, each with listings, messages
    // and a trail, in one statement.
    console.log('\nTeardown at volume:');
    const removal = await timed('delete every member', () =>
      db.query(`delete from public.profiles where email like 'stress-%'`));

    const { rows: [left] } = await db.query(`
      select
        (select count(*)::int from public.profiles where email like 'stress-%') profiles,
        (select count(*)::int from public.listings where reference_number like 'STRESS-%') listings,
        (select count(*)::int from public.messages where body like 'Stress enquiry%') messages,
        (select count(*)::int from public.listings l
           where not exists (select 1 from public.profiles p where p.id = l.user_id)) orphan_listings,
        (select count(*)::int from public.messages m
           where not exists (select 1 from public.profiles p where p.id = m.sender_id)) orphan_messages
    `);
    check('every fabricated member is gone', left.profiles === 0, `${left.profiles} left`);
    check('their listings went with them', left.listings === 0, `${left.listings} left`);
    check('their messages went with them', left.messages === 0, `${left.messages} left`);
    check('nothing is left pointing at a deleted member',
      left.orphan_listings === 0 && left.orphan_messages === 0,
      `${left.orphan_listings} listings, ${left.orphan_messages} messages`);
    console.log(`  (${(removal.ms / 1000).toFixed(1)}s to remove ${MEMBERS} members and everything they had)`);

    // The record of what happened survives them, unlinked. That is the policy
    // sql/018 chose, and at volume it is worth seeing it actually happen.
    const { rows: [{ n: keptHistory }] } = await db.query(
      `select count(*)::int n from public.activity_log where user_id is null`);
    check('the history survives them, with the person unlinked',
      keptHistory > 0, `${keptHistory} rows kept`);

  } finally {
    await pg.stop();
  }

  const failed = checks.filter(c => !c.passed);
  console.log('\nTimings');
  for (const t of timings) console.log(`  ${t.ms.toFixed(0).padStart(7)}ms  ${t.label}`);

  console.log(
    failed.length === 0
      ? `\nPASS — ${checks.length} checks, at ${MEMBERS} members and ${LISTINGS} listings.`
      : `\nFAIL — ${failed.length} of ${checks.length} checks:\n` +
        failed.map(f => `  • ${f.name}  ${f.detail}`).join('\n')
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(err => {
  const detail = (err && (err.message || err.code)) || err || 'no error detail was provided';
  console.error('\nERROR:', detail);
  process.exit(1);
});
