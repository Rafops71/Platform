// Shared database plumbing for the Node tooling in this directory.
//
// Every script here needs the same two things: read .env (without letting a
// stale local file shadow real environment variables, which CI relies on),
// and open a pg client against SUPABASE_DB_URL. This module is that, once,
// so scripts stop re-implementing it — and so a fix to the env rules lands
// everywhere at the same time.

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

/** Merge .env into process.env if the file exists. Real environment variables
 *  always win: CI has no .env and passes repo secrets directly, and a
 *  developer exporting a one-off override should not be silently overruled. */
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

/** Read one required variable, failing with a message that names where it
 *  should have come from rather than assuming .env. */
function requireEnv(name) {
  loadEnv();
  if (!process.env[name]) {
    const where = fs.existsSync(path.join(ROOT, '.env'))
      ? '.env'
      : 'the environment (CI: repo secrets)';
    console.error(`ERROR: ${name} not set in ${where}`);
    process.exit(1);
  }
  return process.env[name];
}

/** Connected pg client. Caller is responsible for end(). */
async function connect() {
  const client = new Client({
    connectionString: requireEnv('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}

/** Run one query against a fresh connection and close it again. */
async function query(sql, params = []) {
  const client = await connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

module.exports = { ROOT, loadEnv, requireEnv, connect, query };
