#!/usr/bin/env node
// Read-only verification of the LIVE Supabase database.
//
// Node equivalent of verify-live.sh, for environments without `psql`
// installed (e.g. this machine). Same queries, same checks — only the
// client differs.
//
// Safe to run against production: it only SELECTs from catalog tables and
// counts rows. It creates nothing and changes nothing.
//
// One-time setup:
//   npm install
// Then:
//   node scripts/verify-live.js
//   (or: npm run verify-live)

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

// A copy of this loader used to live here and INSISTED on a .env file. A CI
// runner has no .env - it passes repo secrets as environment variables - so
// the daily hygiene check died on its first line every time, with
// "ERROR: no .env", before it read a single row. It had therefore never once
// answered the question it exists to ask. Found on 2026-10-13 by running the
// workflow by hand rather than assuming a scheduled job works.
//
// scripts/db.js already does this correctly, and shares the fix with every
// other script. Two copies of the same plumbing is how one of them drifts.
const { loadEnv: loadEnvShared } = require('./db');

function loadEnv() {
  loadEnvShared();
  if (!process.env.SUPABASE_DB_URL) {
    console.error(
      'ERROR: SUPABASE_DB_URL is not set. Locally it comes from .env; ' +
      'in CI it comes from the repository secrets.'
    );
    process.exit(1);
  }
}

function heading(title) {
  console.log(`\n=========== ${title} ===========`);
}

// Prints rows as a simple left-aligned table (no external deps, no row
// index column, unlike console.table).
function printTable(rows) {
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
  );
  const line = (cells) =>
    cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const r of rows) {
    console.log(line(cols.map((c) => r[c] ?? '')));
  }
}

async function main() {
  loadEnv();

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();

  try {
    heading('TABLES');
    printTable(
      (
        await client.query(`
        select
          t.expected as table_name,
          case when c.relname is null then 'MISSING' else 'present' end as status,
          case when c.relrowsecurity then 'RLS on' else 'RLS OFF <-- PROBLEM' end as rls
        from (values
          ('profiles'),('invitations'),('commodities'),('reference_counters'),
          ('listings'),('document_checklist'),('document_requests'),('messages'),
          ('message_forward_log'),('activity_log'),('matches'),('notifications')
        ) as t(expected)
        left join pg_class c on c.relname = t.expected
          and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        order by t.expected;
      `)
      ).rows
    );

    heading('SECURITY FUNCTIONS');
    printTable(
      (
        await client.query(`
        select f.expected as function_name,
               case when p.proname is null then 'MISSING' else 'present' end as status,
               case when p.prosecdef then 'definer' else 'invoker' end as security
        from (values
          ('current_profile_id'),('is_operator'),('is_approved_participant'),
          ('handle_new_user'),('protect_profile_columns'),('protect_listing_columns'),
          ('protect_document_request_columns'),('get_invitation_by_token'),
          ('mark_invitation_used'),('next_reference'),('get_public_listings'),
          ('generate_matches_for_listing'),('send_listing_reminders'),('send_manual_reminder')
        ) as f(expected)
        left join pg_proc p on p.proname = f.expected and p.pronamespace = 'public'::regnamespace
        order by f.expected;
      `)
      ).rows
    );

    heading('TRIGGERS (002_updates applied?)');
    printTable(
      (
        await client.query(`
        select t.expected as trigger_name,
               case when tg.tgname is null then 'MISSING <-- run 002_updates.sql' else 'present' end as status
        from (values
          ('trg_protect_profile_columns'),('trg_protect_listing_columns'),
          ('trg_log_listing_change'),('trg_log_profile_change'),('trg_log_message_insert'),
          ('trg_notify_new_registration'),('trg_notify_new_listing'),
          ('trg_notify_listing_status'),('trg_notify_profile_approved'),
          ('on_listing_matchable')
        ) as t(expected)
        left join pg_trigger tg on tg.tgname = t.expected and not tg.tgisinternal
        order by t.expected;
      `)
      ).rows
    );

    heading('THE TWO BUG FIXES');
    const bootstrapFix = await client.query(`
      select case when pg_get_functiondef(p.oid) like '%auth.uid() is null%'
                  then 'FIXED — bootstrap exemption uses auth.uid()'
                  when pg_get_functiondef(p.oid) like '%current_user in%'
                  then 'NOT FIXED — still uses current_user (escalation risk); run 002_updates.sql'
                  else 'UNKNOWN — inspect protect_profile_columns manually' end as fix
      from pg_proc p where p.proname='protect_profile_columns' and p.pronamespace='public'::regnamespace;
    `);
    console.log(
      'operator bootstrap fix:',
      bootstrapFix.rows[0]?.fix ?? 'UNKNOWN — protect_profile_columns not found'
    );

    // Postgres stores the PARSED expression and deparses it, dropping the
    // redundant 'public.' prefix — so the stored text reads 'messages.id',
    // never 'public.messages.id'. Test the semantics: correlating against
    // messages.id is right; correlating f.message_id against f.id is the bug.
    const mailboxFix = await client.query(`
      select case when qual like '%f.message_id = messages.id%'
                  then 'FIXED — messages_select correlates on messages.id'
                  when qual like '%f.message_id = f.id%'
                  then 'NOT FIXED — forwarded messages will not reach recipients; run 002_updates.sql'
                  else 'UNKNOWN — inspect: select qual from pg_policies where policyname=''messages_select''' end
             as fix
      from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_select';
    `);
    console.log(
      'mailbox forwarding fix:',
      mailboxFix.rows[0]?.fix ?? 'UNKNOWN — messages_select policy not found'
    );

    heading('POLICY COUNT PER TABLE');
    printTable(
      (
        await client.query(`
        select tablename, count(*) as policies
        from pg_policies where schemaname='public' group by tablename order by tablename;
      `)
      ).rows
    );

    heading('DATA');
    printTable(
      (
        await client.query(`
        select 'commodities' as item, count(*)::text as value from public.commodities
        union all select 'commodities with sort_order', count(*)::text from public.commodities where sort_order is not null
        union all select 'profiles', count(*)::text from public.profiles
        union all select 'operators (role=operator, approved)', count(*)::text from public.profiles where role='operator' and status='approved'
        union all select 'pending approvals', count(*)::text from public.profiles where status='pending'
        union all select 'listings', count(*)::text from public.listings
        union all select 'invitations (unused, unexpired)', count(*)::text from public.invitations where used_at is null and expires_at > now();
      `)
      ).rows
    );

    // ------------------------------------------------------- HYGIENE ----
    //
    // Everything above this point asks whether the database is SHAPED right.
    // This asks whether it is CLEAN, which is a different question and the one
    // nothing was asking.
    //
    // It matters because the test suites cannot answer it. They prove
    // behaviour - a member can post, Browse names nobody, a deletion deletes -
    // and every one of them passed on 2026-10-12 while the owner's Notifications
    // screen held 4,776 entries of which six were real. "The gate is green" and
    // "your database is clean" are different claims, and they had been reported
    // as one.
    //
    // Each row here is a count that should be zero on a quiet database. A
    // non-zero one is not necessarily an emergency - a test run in flight will
    // show leftovers that its own teardown is about to remove - so this prints
    // what it found and says plainly that a run in progress explains it.
    heading('HYGIENE — these should all be zero on a quiet database');
    const hygiene = (
      await client.query(`
        select 'test accounts left behind' as check, count(*)::int as rows
          from public.profiles where email like 'jericho-e2e-%'
        union all
        select 'listings owned by nobody', count(*)::int
          from public.listings l
         where not exists (select 1 from public.profiles p where p.id = l.user_id)
        union all
        select 'notifications about something gone', count(*)::int
          from public.notifications n
         where n.related_id is not null
           and not exists (select 1 from public.listings l where l.id = n.related_id)
           and not exists (select 1 from public.profiles p where p.id = n.related_id)
           and not exists (select 1 from public.messages m where m.id = n.related_id)
        union all
        select 'activity rows about something gone', count(*)::int
          from public.activity_log a
         where a.user_id is null
           and ((jsonb_exists(a.details, 'profile_id')
                 and not exists (select 1 from public.profiles p
                                  where p.id = (a.details->>'profile_id')::uuid))
             or (jsonb_exists(a.details, 'listing_id')
                 and not exists (select 1 from public.listings l
                                  where l.id = (a.details->>'listing_id')::uuid)))
        union all
        select 'mail queued to a test address', count(*)::int
          from public.email_outbox
         where sent_at is null and (to_email like 'jericho-e2e-%'
                                 or to_email like '%@example.invalid')
        union all
        select 'mail stuck in the queue over a day', count(*)::int
          from public.email_outbox
         where sent_at is null and failed_at is null
           and created_at < now() - interval '1 day';
      `)
    ).rows;
    printTable(hygiene);

    const dirty = hygiene.filter((r) => r.rows > 0);
    if (dirty.length) {
      console.log('');
      console.log('  Not clean. ' + dirty.map((r) => `${r.rows} ${r.check}`).join('; ') + '.');
      console.log('  A test run in flight explains leftovers of its own, and its');
      console.log('  teardown will clear them; anything still here when nothing is');
      console.log('  running is residue. The Operator\'s "Clean up old test entries"');
      console.log('  button removes the two "about something gone" kinds.');
      process.exitCode = 1;
    } else {
      console.log('');
      console.log('  Clean.');
    }

    heading('OPERATOR ACCOUNTS');
    printTable(
      (
        await client.query(`
        select email, role, status, created_at::date
        from public.profiles where role='operator' order by created_at;
      `)
      ).rows
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
