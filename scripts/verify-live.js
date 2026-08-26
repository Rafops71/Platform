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

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: no .env — cp .env.example .env and fill it in.');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
  if (!process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL empty in .env');
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
