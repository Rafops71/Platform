// Test account plumbing for the end-to-end suite.
//
// The suite runs against the live Supabase project — Auth is cloud-hosted and
// there is no local equivalent — so it must create everything it touches and
// remove it again afterwards. Two rules keep that safe:
//
//   1. Every account this file creates has an email starting with E2E_PREFIX.
//      Teardown only ever deletes rows matching that prefix, so it cannot
//      reach a real member even if a test crashes halfway.
//   2. Passwords are generated per run and never written to disk. The suite
//      does not need, and is never given, anyone's real password.
//
// Accounts are made through the Auth admin API rather than the registration
// form, because a test that has to register three users through the UI just
// to reach the interesting part spends most of its time re-testing signup.
// The one account that DOES go through the real form is the invited
// participant — that path is the thing under test.

'use strict';

const crypto = require('crypto');
const { loadEnv, connect } = require('../../../scripts/db');

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Shared by every account and every cleanup query. Changing it orphans
// whatever the previous value created, so it is deliberately boring.
const E2E_PREFIX = 'jericho-e2e-';

/** Unique address for one test run. Local part only — the domain never
 *  receives anything, since these accounts are created pre-confirmed. */
function testEmail(label) {
  return `${E2E_PREFIX}${label}-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
}

function testPassword() {
  return `Pw-${crypto.randomBytes(9).toString('base64url')}`;
}

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      'E2E needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. The ' +
      'service key is what lets the suite create and delete its own throwaway ' +
      'accounts instead of borrowing a real one.'
    );
  }
}

async function admin(path, options = {}) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Auth admin ${options.method || 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Create a confirmed auth user. The on_auth_user_created trigger builds the
 *  matching profile as a pending participant; `role` and `status` here are
 *  applied afterwards over SQL, exactly as an operator approval would. */
async function createAccount({ label, role = 'participant', status = 'approved', meta = {} }) {
  const email = testEmail(label);
  const password = testPassword();

  const user = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: meta.first_name || 'E2E',
        last_name: meta.last_name || label,
        company: meta.company || null,
        phone: meta.phone || '+320000000',
        country: meta.country || 'Belgium',
      },
    }),
  });

  const client = await connect();
  try {
    const { rows } = await client.query(
      'update public.profiles set role = $2, status = $3 where user_id = $1 returning id',
      [user.id, role, status]
    );
    if (!rows.length) throw new Error(`No profile was created for ${email}`);
    return { email, password, userId: user.id, profileId: rows[0].id };
  } finally {
    await client.end();
  }
}

/** Remove everything this suite created, in dependency order.
 *
 *  Scoped to E2E_PREFIX throughout. Deletes are keyed on the test profiles
 *  rather than on a reference-number pattern, so a listing created through
 *  the UI (which names itself SELL-26-00N like any other) is still caught.
 *
 *  The order below is not guesswork: profiles.user_id cascades from
 *  auth.users, but ten other tables reference profiles with NO ACTION, so
 *  deleting the auth user fails with a foreign-key violation until each of
 *  them is cleared first. activity_log is the one that bites, because
 *  handle_new_user() writes a 'user_registered' row for every account the
 *  moment it is created. */
async function cleanup() {
  const client = await connect();
  try {
    const { rows: profiles } = await client.query(
      'select id, user_id from public.profiles where email like $1',
      [`${E2E_PREFIX}%`]
    );
    const ids = profiles.map(p => p.id);
    const userIds = profiles.map(p => p.user_id);
    if (!ids.length) return { profiles: 0 };

    const listings = 'select id from public.listings where user_id = any($1)';

    // Outbox first — a queued test email left behind would be sent for real
    // on the next flush of the outbox.
    await client.query(
      `delete from public.email_outbox
        where related_listing_id in (${listings}) or to_email like $2`,
      [ids, `${E2E_PREFIX}%`]
    );
    await client.query(
      `delete from public.message_forward_log
        where operator_id = any($1) or to_user_id = any($1)
           or message_id in (select id from public.messages where sender_id = any($1) or listing_id in (${listings}))`,
      [ids]
    );
    await client.query(
      `delete from public.messages where sender_id = any($1) or listing_id in (${listings})`,
      [ids]
    );
    await client.query(
      'delete from public.document_requests where participant_id = any($1) or requester_id = any($1)',
      [ids]
    );
    // document_checklist, document_requests, matches and email_outbox all
    // cascade from listings, so they need no separate delete.
    await client.query('delete from public.listings where user_id = any($1)', [ids]);
    await client.query(
      'delete from public.invitations where created_by = any($1) or used_by = any($1) or email like $2',
      [ids, `${E2E_PREFIX}%`]
    );
    await client.query('delete from public.activity_log where user_id = any($1)', [ids]);
    // Commodities are shared reference data — if a test operator added one,
    // orphan the authorship rather than deleting a row others may now use.
    await client.query('update public.commodities set created_by = null where created_by = any($1)', [ids]);

    // notifications cascade from profiles, and profiles cascades from
    // auth.users, so this last step removes both.
    //
    // Deliberately not wrapped in a catch: an earlier version swallowed the
    // error here and reported a clean teardown while leaving every test
    // account behind in the live database.
    for (const id of userIds) {
      await admin(`/users/${id}`, { method: 'DELETE' });
    }

    const { rows: left } = await client.query(
      'select count(*)::int n from public.profiles where email like $1',
      [`${E2E_PREFIX}%`]
    );
    if (left[0].n > 0) {
      throw new Error(`Teardown incomplete: ${left[0].n} test profile(s) still in the database`);
    }

    return { profiles: ids.length };
  } finally {
    await client.end();
  }
}

module.exports = { E2E_PREFIX, testEmail, testPassword, createAccount, cleanup, assertConfigured };
