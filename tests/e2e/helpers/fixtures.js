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

// Every account also carries a run tag, and teardown only ever deletes
// accounts carrying THIS run's tag.
//
// Why: the suite runs against one live Supabase project, and teardown used to
// delete every jericho-e2e- account it could see. Two runs overlapping — CI
// and a laptop, or two CI runs — therefore deleted each other's fixtures
// halfway through. On 2026-10-11 three CI runs overlapped and eleven
// unrelated tests failed: the signed-in account had been removed underneath
// them, so sign-in never redirected, listings lost their foreign keys, and
// match counts came back zero. The failures moved around between runs, which
// is what a race looks like from the outside.
//
// GITHUB_RUN_ID keeps the tag stable across processes on CI. Locally a random
// tag is enough: Playwright runs this suite in one worker (workers: 1), so the
// module is loaded once and every spec in the run shares it.
const RUN_TAG =
  process.env.E2E_RUN_TAG ||
  (process.env.GITHUB_RUN_ID
    ? `ci${process.env.GITHUB_RUN_ID}x${process.env.GITHUB_RUN_ATTEMPT || 1}`
    : `local${crypto.randomBytes(4).toString('hex')}`);

const RUN_PREFIX = `${E2E_PREFIX}${RUN_TAG}-`;

// A run killed mid-test (a cancelled CI job, a closed laptop) leaves its
// accounts behind, and nothing else will ever claim them. Teardown sweeps
// those too, but only once they are old enough that no live run could still
// be using them.
const ORPHAN_AGE = '2 hours';

/** Unique address for one test run. The domain never receives anything, since
 *  these accounts are created pre-confirmed.
 *
 *  The default is .invalid, which is reserved by RFC 2606 and can never be
 *  routed anywhere. One caller overrides it: a self-service email change goes
 *  through GoTrue's own validation, which rejects any domain without real MX
 *  records — and it validates the address the account *currently* holds, so an
 *  account created at .invalid cannot change its address at all. Teardown keys
 *  on the prefix and not the domain, so overriding it stays safe. */
function testEmail(label, domain = 'example.invalid') {
  return `${RUN_PREFIX}${label}-${crypto.randomBytes(4).toString('hex')}@${domain}`;
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

/** Write the invitation a fixture account needs in order to exist.
 *
 *  No-op on an empty database: there is nobody to attribute an invitation to,
 *  and handle_new_user() lets the first account through for exactly that
 *  reason. Anywhere else - including the live project - an invitation is
 *  required and this creates one.
 *
 *  It deliberately fails loudly if there is no Operator to attribute it to on
 *  a non-empty database. That state means something is wrong with the
 *  database the suite is pointed at, and quietly carrying on would turn it
 *  into a confusing failure thirty assertions later. */
async function inviteFixture(email) {
  const client = await connect();
  try {
    const { rows: [state] } = await client.query(
      `select
         (select count(*)::int from public.profiles) as profiles,
         (select id from public.profiles
           where role = 'operator' and status = 'approved'
           order by created_at limit 1) as inviter`
    );
    if (state.profiles === 0) return;   // bootstrap
    if (!state.inviter) {
      throw new Error(
        'No approved Operator exists to write fixture invitations, but the ' +
        'database is not empty. The suite cannot create accounts in that state.'
      );
    }
    await client.query(
      `insert into public.invitations (token, email, created_by, expires_at)
       values ($1, $2, $3, now() + interval '1 day')`,
      [`e2e-${crypto.randomBytes(12).toString('hex')}`, email, state.inviter]
    );
  } finally {
    await client.end();
  }
}

/** Fill register.html's signing block (js/signing.js) the way a member
 *  would. Everything is overridable, so a test can try a PO box. */
async function fillSignature(page, over = {}, prefix = '') {
  const v = { capacity: 'individual', address_line1: '1 Test Street', city: 'Testville',
              country: 'Belgium', signed_name: 'Test Signer', ...over };
  await page.check(`#${prefix}cap-${v.capacity}`);
  if (v.capacity === 'company') await page.fill(`#${prefix}company`, v.company || 'Test Company Ltd');
  await page.fill(`#${prefix}address_line1`, v.address_line1);
  await page.fill(`#${prefix}city`, v.city);
  await page.selectOption(`#${prefix}country`, v.country);
  await page.fill(`#${prefix}signed_name`, v.signed_name);
}

/** The newest published Terms version in English, or null if none is. */
async function latestTermsVersion() {
  const client = await connect();
  try {
    const { rows } = await client.query(
      `select version, language from public.terms_versions
        where language = 'en' order by published_at desc limit 1`);
    return rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;   // undefined_table: before sql/031
    throw err;
  } finally {
    await client.end();
  }
}

/** Create a confirmed auth user. The on_auth_user_created trigger builds the
 *  matching profile as a pending participant; `role` and `status` here are
 *  applied afterwards over SQL, exactly as an operator approval would. */
async function createAccount({ label, role = 'participant', status = 'approved', meta = {}, domain, welcomeSeen = true }) {
  const email = testEmail(label, domain);
  const password = testPassword();

  // sql/024 made registration invitation-only, enforced by handle_new_user().
  // These fixtures obey that rule rather than being exempted from it: an
  // exemption would mean the suite stops describing the system anybody
  // actually runs, which is the mistake this project already made once with
  // the migration lists.
  //
  // So every fixture account gets a real invitation first, written by an
  // existing Operator, exactly as a real member's would be. It is deleted
  // again by cleanup(), which already removes invitations by this prefix.
  //
  // Skipped only when the database has no profiles at all - the bootstrap
  // case, where the first account needs no invitation because there is nobody
  // to have sent one. That never happens against the live project, which has
  // had profiles since August; it is what lets a throwaway database build a
  // world from nothing.
  await inviteFixture(email);

  // Sign the newest published Terms at registration, as the sign-up form now
  // does. Without it every signed-in test would stop at the acceptance gate.
  // Before sql/031 the table does not exist; then there is nothing to sign.
  const terms = await latestTermsVersion();

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
        ...(terms && {
          terms_version: terms.version,
          terms_language: terms.language,
          signed_name: `${meta.first_name || 'E2E'} ${meta.last_name || label}`,
          signing_capacity: meta.company ? 'company' : 'individual',
          address_line1: '1 Test Street',
          city: 'Testville',
          ...meta.signature,
        }),
      },
    }),
  });

  const client = await connect();
  try {
    const { rows } = await client.query(
      // The welcome page (sql/044) is shown once at a first sign-in; a fixture
      // has "already seen it" unless the test is about the page itself.
      'update public.profiles set role = $2, status = $3, welcome_seen_at = $4 where user_id = $1 returning id',
      [user.id, role, status, welcomeSeen ? new Date().toISOString() : null]
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
    // This run's accounts, plus orphans an earlier run left behind and is far
    // too old to still be using. Never another live run's accounts.
    const { rows: profiles } = await client.query(
      `select id, user_id from public.profiles
        where email like $1
           or (email like $2 and created_at < now() - interval '${ORPHAN_AGE}')`,
      [`${RUN_PREFIX}%`, `${E2E_PREFIX}%`]
    );
    const ids = profiles.map(p => p.id);
    const userIds = profiles.map(p => p.user_id);
    if (!ids.length) return { profiles: 0 };

    const listings = 'select id from public.listings where user_id = any($1)';

    // Captured BEFORE the listings are deleted, because the activity rows the
    // deletion itself writes are identified by listing id and nothing else.
    const { rows: listingRows } = await client.query(listings, [ids]);
    const listingIds = listingRows.map(l => l.id);

    // The Operator's feed, before the listings go.
    //
    // notifications cascade from the profile they are ADDRESSED TO, not the
    // thing they are ABOUT. trg_notify_new_listing writes a row to every
    // Operator - a REAL account - for every listing a test member posts, so
    // deleting the fixtures never touched them. By 2026-10-12 the owner's own
    // feed held 4,776 entries of which six were real, 1,390 of them from a
    // single day's runs. Exactly the shape the activity log had, in a table
    // nobody had looked at.
    await client.query(
      `delete from public.notifications
        where user_id = any($1)
           or related_id in (${listings})
           or related_id = any($1)
           or related_id in (select id from public.messages
                              where sender_id = any($1) or listing_id in (${listings}))`,
      [ids]
    );

    // AND the ones it can no longer name.
    //
    // Everything above matches on an id that still exists. A test that deletes
    // something DURING its run - a withdrawn listing, the member-deletion
    // test - leaves a notification pointing at a row that has already gone,
    // and no id-based predicate can find it afterwards.
    //
    // That is not theoretical. The hygiene check's first real run, on
    // 2026-10-13, found 4,796 of them: 2,852 about registrations, 1,267 about
    // listings, 677 about messages, the newest from that morning's CI. The
    // owner had cleared ~9,500 by hand days earlier and they had rebuilt.
    //
    // This is the same rule the Operator's own purge button uses (sql/023): a
    // notification whose target is absent from listings, profiles AND messages
    // is about something that no longer exists, whichever it was. A row with
    // no target at all is left alone - it points at nothing by design.
    await client.query(
      `delete from public.notifications n
        where n.related_id is not null
          and not exists (select 1 from public.listings l where l.id = n.related_id)
          and not exists (select 1 from public.profiles p where p.id = n.related_id)
          and not exists (select 1 from public.messages m where m.id = n.related_id)`
    );

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
    // sql/035: forwarding a test member's message opens a deal file, which
    // keeps its row when the member goes (SET NULL). Removed here, while it
    // still names them, or every run would leave files in the live table.
    await client.query(
      'delete from public.deals where owner_id = any($1) or counterparty_id = any($1)', [ids]);
    await client.query('delete from public.listings where user_id = any($1)', [ids]);
    // Since sql/031 a member's acceptances outlive the member (SET NULL, not
    // CASCADE), so a test account's would otherwise stay in the live table
    // forever with no owner. Removed here, while they still have one.
    await client.query('delete from public.terms_acceptances where profile_id = any($1)', [ids]);
    await client.query(
      'delete from public.invitations where created_by = any($1) or used_by = any($1) or email like $2',
      [ids, `${E2E_PREFIX}%`]
    );
    // Activity rows, matched on what they SAY and not only on who did it.
    //
    // user_id alone misses nearly all of them. The log triggers record
    // public.current_profile_id(), which resolves auth.uid() - and auth.uid()
    // is null on a direct PostgreSQL connection, which is how this suite
    // seeds and tears down. So every row a fixture caused was born with a
    // null user_id and no `user_id = any(ids)` predicate could ever match it.
    //
    // That was not theoretical: by 2026-10-12 the live activity log held
    // 12,399 rows, of which 12,382 were test residue no teardown had ever
    // been able to see, against 17 rows of the owner's real history.
    //
    // This runs AFTER the listings delete on purpose: that delete fires
    // trg_log_listing_change, which writes a 'listing_removed' row per
    // listing. Running it earlier would miss exactly those.
    await client.query(
      `delete from public.activity_log
        where user_id = any($1)
           or (jsonb_exists(details, 'profile_id') and (details->>'profile_id')::uuid = any($1))
           or (jsonb_exists(details, 'listing_id') and (details->>'listing_id')::uuid = any($2))
           or details->>'email' like $3`,
      [ids, listingIds, `${E2E_PREFIX}%`]
    );
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

    // Checks THIS run's tag only. Asserting on the whole jericho-e2e- prefix
    // would fail whenever another run is legitimately in flight, which is a
    // false alarm about someone else's accounts rather than a real leak.
    const { rows: left } = await client.query(
      'select count(*)::int n from public.profiles where email like $1',
      [`${RUN_PREFIX}%`]
    );
    if (left[0].n > 0) {
      throw new Error(
        `Teardown incomplete: ${left[0].n} test profile(s) tagged ${RUN_TAG} still in the database`
      );
    }

    // The same question asked of the activity log, which is where the residue
    // accumulated unseen for seven weeks. Accounts being gone is not the same
    // as their traces being gone, and only one of those was ever checked.
    const { rows: trail } = await client.query(
      `select count(*)::int n from public.activity_log
        where details->>'email' like $1
           or (jsonb_exists(details, 'profile_id') and (details->>'profile_id')::uuid = any($2))`,
      [`${RUN_PREFIX}%`, ids]
    );
    if (trail[0].n > 0) {
      throw new Error(
        `Teardown incomplete: ${trail[0].n} activity row(s) from run ${RUN_TAG} left in the log`
      );
    }

    // The same question of the Operator's feed. Asked by id rather than by
    // tag, because these rows are addressed to a real account and carry no
    // trace of which run caused them.
    const { rows: feed } = await client.query(
      `select count(*)::int n from public.notifications
        where related_id = any($1) or user_id = any($1)`,
      [ids]
    );
    if (feed[0].n > 0) {
      throw new Error(
        `Teardown incomplete: ${feed[0].n} notification(s) from run ${RUN_TAG} left in the Operator feed`
      );
    }

    return { profiles: ids.length };
  } finally {
    await client.end();
  }
}

module.exports = {
  E2E_PREFIX, RUN_PREFIX, RUN_TAG,
  testEmail, testPassword, createAccount, cleanup, assertConfigured, fillSignature, latestTermsVersion,
};
