#!/usr/bin/env node
// Apply the Jericho Platform SQL scripts to the live Supabase database, in order.
//
// Node equivalent of apply-sql.sh, for environments without `psql` installed.
//
//   node scripts/apply-sql.js                                   # apply everything
//   node scripts/apply-sql.js 002_updates.sql seed_commodities.sql   # or a subset
//
// Reads SUPABASE_DB_URL from .env.
//
// Each file is sent to Postgres as a single multi-statement query (like
// `psql -f`). Unlike psql's default autocommit-per-statement, the Postgres
// simple-query protocol implicitly wraps a multi-statement message in one
// transaction — so a failure partway through a file rolls that whole file
// back rather than leaving it half-applied. Every statement in these files
// is guarded (CREATE OR REPLACE / DROP IF EXISTS / ADD COLUMN IF NOT
// EXISTS), so they are safe to re-run either way.

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

// The full apply order for a fresh database. Numbered migrations must follow
// schema and policies, and the commodity seed goes last because 007 reorders
// what it inserts. This list is the same one scripts/run-sql-tests.js applies
// before running the suite - if a migration is added to one and not the other,
// the tests stop describing the database anyone actually deploys.
const DEFAULT_ORDER = [
  'schema.sql',
  'rls_policies.sql',
  '002_updates.sql',
  '003_email_notifications.sql',
  '004_email_outbox_retry.sql',
  '005_confirmed_updates.sql',
  '006_checklist_and_price_unit.sql',
  '007_commodities_alphabetical.sql',
  '008_email_language.sql',
  '009_message_threading.sql',
  '010_terms_acceptance.sql',
  '011_profile_self_service.sql',
  'seed_commodities.sql',
];

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: no .env file. Run:  cp .env.example .env  and fill it in.');
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
    console.error('ERROR: SUPABASE_DB_URL is empty in .env.');
    console.error('Get it from the Supabase Dashboard -> Connect -> connection string.');
    process.exit(1);
  }
}

async function main() {
  loadEnv();

  const files = process.argv.slice(2);
  const targets = files.length ? files : DEFAULT_ORDER;

  const dbUrl = process.env.SUPABASE_DB_URL;
  const at = dbUrl.indexOf('@');
  const scheme = dbUrl.slice(0, dbUrl.indexOf(':'));
  console.log(`Target: ${scheme}://...@${dbUrl.slice(at + 1)}`);
  console.log('');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();

  try {
    for (const f of targets) {
      const filePath = path.join(ROOT, 'sql', f);
      if (!fs.existsSync(filePath)) {
        console.error(`ERROR: sql/${f} not found`);
        process.exit(1);
      }
      console.log(`=== applying ${f} ===`);
      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await client.query(sql);
        console.log('    OK');
      } catch (err) {
        console.error(`    FAILED on ${f} — stopping.`);
        console.error(`    ${err.message}`);
        process.exit(1);
      }
      console.log('');
    }
    console.log('All scripts applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
