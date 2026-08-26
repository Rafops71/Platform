#!/usr/bin/env node
// Sends queued new-listing emails (sql/003_email_notifications.sql writes to
// public.email_outbox; this script is the only thing that ever sends them).
//
// Provider: Resend (https://resend.com) — chosen for a generous free tier
// and a trivial REST API, but nothing here is Resend-specific beyond the
// request in sendOne(); swap providers by editing just that function.
//
// Requires in .env (see .env.example):
//   SUPABASE_DB_URL      — already used by apply-sql.js / verify-live.js
//   RESEND_API_KEY        — from https://resend.com/api-keys (Rafael must
//                            create the account; Claude cannot sign up for
//                            third-party services on anyone's behalf)
//   LISTING_EMAIL_FROM     — verified sender, e.g. "Jericho Platform
//                            <notifications@yourdomain.com>". Until a domain
//                            is verified with Resend, use their sandbox
//                            sender "onboarding@resend.dev" — but Resend only
//                            delivers that one to the email address the
//                            Resend account itself is registered with, so
//                            it's only useful for testing against your own
//                            inbox, not real members.
//
// Usage:
//   node scripts/send-listing-emails.js               # send all pending, live
//   node scripts/send-listing-emails.js --dry-run     # print what would send, sends nothing
//   node scripts/send-listing-emails.js --retry-failed # un-fail given-up rows, then send
//
// Safe to run repeatedly / on a schedule: each row is only sent once (sent_at
// is set right after a successful send, before moving to the next row), and a
// row that cannot be sent is eventually retired rather than retried forever —
// see the failure handling below and sql/004_email_outbox_retry.sql.

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const RETRY_FAILED = process.argv.includes('--retry-failed');

// How many times a *transient* failure is retried before the row is retired.
// Permanent rejections ignore this and fail on the first attempt.
const MAX_ATTEMPTS = 5;

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
  if (!DRY_RUN && !process.env.RESEND_API_KEY) {
    console.error('ERROR: RESEND_API_KEY empty in .env — see the header of this file.');
    console.error('(Use --dry-run to preview queued emails without sending or needing a key.)');
    process.exit(1);
  }
  if (!DRY_RUN && !process.env.LISTING_EMAIL_FROM) {
    console.error('ERROR: LISTING_EMAIL_FROM empty in .env — see the header of this file.');
    process.exit(1);
  }
}

// A 4xx means the provider understood the request and refused it — a bad
// address, an unverified sender, a malformed payload. Re-sending an identical
// request cannot change that answer, so these are terminal on the first try.
// 408 (timeout) and 429 (rate limited) are the two 4xx codes that *are* worth
// retrying. Everything else — 5xx, network errors — is treated as transient.
function isPermanent(status) {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

// Records the outcome of one attempt. `permanent` retires the row immediately;
// otherwise it is retired once it has used up MAX_ATTEMPTS.
async function recordFailure(client, row, message, permanent) {
  const attempts = row.attempts + 1;
  const giveUp = permanent || attempts >= MAX_ATTEMPTS;

  await client.query(
    `update public.email_outbox
        set attempts  = $2,
            error     = $3,
            failed_at = case when $4 then now() else null end
      where id = $1`,
    [row.id, attempts, message.slice(0, 2000), giveUp]
  );

  return giveUp
    ? `gave up (${permanent ? 'permanent rejection' : `${attempts} attempts`})`
    : `will retry (attempt ${attempts}/${MAX_ATTEMPTS})`;
}

async function sendOne(client, row) {
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.LISTING_EMAIL_FROM,
        to: row.to_email,
        subject: row.subject,
        text: row.body_text,
      }),
    });
  } catch (err) {
    // Never reached the provider (DNS, TLS, timeout) — always transient.
    const note = await recordFailure(client, row, `NETWORK: ${err.message}`, false);
    return { ok: false, note };
  }

  if (res.ok) {
    await client.query(
      'update public.email_outbox set sent_at = now(), attempts = attempts + 1, error = null where id = $1',
      [row.id]
    );
    return { ok: true };
  }

  const detail = await res.text().catch(() => res.statusText);
  const note = await recordFailure(
    client,
    row,
    `HTTP ${res.status}: ${detail}`,
    isPermanent(res.status)
  );
  return { ok: false, note };
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
    if (RETRY_FAILED) {
      const { rowCount } = await client.query(
        'update public.email_outbox set failed_at = null, attempts = 0 where sent_at is null and failed_at is not null'
      );
      console.log(`Re-queued ${rowCount} previously failed row(s).\n`);
    }

    const { rows } = await client.query(
      `select id, to_email, subject, body_text, attempts
       from public.email_outbox
       where sent_at is null and failed_at is null
       order by created_at asc`
    );

    // Surface retired rows so a silent permanent failure is still visible.
    const { rows: [{ n: retired }] } = await client.query(
      'select count(*)::int n from public.email_outbox where failed_at is not null'
    );

    if (rows.length === 0) {
      console.log('Nothing queued.');
      if (retired > 0) {
        console.log(`(${retired} row(s) previously given up on — re-queue with --retry-failed.)`);
      }
      return;
    }

    console.log(`${rows.length} queued email(s)${DRY_RUN ? ' (dry run — not sending)' : ''}:\n`);

    let sent = 0, failed = 0;
    for (const row of rows) {
      console.log(`-> ${row.to_email} — ${row.subject}`);
      if (DRY_RUN) continue;
      const result = await sendOne(client, row);
      if (result.ok) { sent++; } else { failed++; console.log(`   FAILED — ${result.note}`); }
    }

    if (!DRY_RUN) {
      console.log(`\nSent: ${sent}  Failed: ${failed}`);
      if (retired > 0) console.log(`Previously given up on: ${retired} (re-queue with --retry-failed)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
