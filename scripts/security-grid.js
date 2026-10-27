// The security grid: every table, every door, every kind of caller.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"). The
// suites in sql/tests prove each rule table by table on a local PostgreSQL.
// This proves the same thing from the outside, on a real Supabase project,
// through the same web API a member's browser uses - where Supabase's own
// default grants apply. Those grants are wide open on every table (checked on
// the live project, 2026-10-27): row-level security is the only lock, so the
// only honest test of it is to knock on every door.
//
// What it does:
//   1. builds a small world: an Operator, two approved members (A and B), a
//      pending and a suspended member, B's listing, A's enquiry about it, a
//      saved search, a deal file - everything owned by somebody;
//   2. signs in as each caller (and as nobody) and, on EVERY table in the
//      public schema, tries to read, add, change and delete rows that are
//      NOT theirs;
//   3. compares what happened with EXPECTED below. A table the database has
//      but EXPECTED does not list is a failure on its own: a new table nobody
//      thought to lock is exactly what this exists to catch;
//   4. deletes everything it made.
//
// It refuses to run against the live project: it writes, and it deletes.
//
//   SUPABASE_URL=https://<staging>.supabase.co SUPABASE_ANON_KEY=... \
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/security-grid.js

const crypto = require('crypto');

const LIVE_REF = 'coarclhafggkakmpggfh';
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TAG = `grid-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

// What each caller may do to a row that is NOT theirs. Anything not listed is
// forbidden. 'read' means at least one foreign row came back; 'write' covers
// add, change and delete. Operators read nearly everything and change only
// what their console changes; everybody else may read only the public lists.
const EXPECTED = {
  activity_log:        { operator: ['read'] },
  // Any signed-in caller may read the commodity names (policy: auth.uid() is
  // not null) - pending and suspended included. It is the public product list.
  commodities:         { operator: ['read', 'write'], member: ['read'], pending: ['read'], suspended: ['read'] },
  deal_history:        { operator: ['read'] },
  deals:               { operator: ['read', 'change'] },
  document_checklist:  { operator: ['read', 'write'] },   // moderation
  document_requests:   { operator: ['read', 'add', 'change'] },
  email_outbox:        {},
  email_phrases:       {},
  email_templates:     {},
  invitations:         { operator: ['read', 'write'] },
  listings:            { operator: ['read', 'change', 'delete'] },   // an Operator may remove a listing
  matches:             { operator: ['read', 'change'] },
  message_forward_log: { operator: ['read', 'add'] },
  messages:            { operator: ['read', 'change'] },
  notifications:       { operator: ['read', 'write'] },   // notifications_* policies: owner or Operator
  profiles:            { operator: ['read', 'change'] },
  reference_counters:  {},
  saved_searches:      {},
  terms_acceptances:   { operator: ['read'] },
  terms_versions:      { anon: ['read'], pending: ['read'], suspended: ['read'], member: ['read'], operator: ['read'] },
};
const DOC = 'Assay Report';
const ROLES = ['anon', 'pending', 'suspended', 'member', 'operator'];

function allowed(table, role, action) {
  const list = (EXPECTED[table] || {})[role] || [];
  if (list.includes(action)) return true;
  if (action !== 'read' && list.includes('write')) return true;
  return false;
}

async function http(path, { method = 'GET', key = SERVICE, token, body, prefer, headers = {} } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      ...(prefer && { Prefer: prefer }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text };
}

async function must(label, p) {
  const r = await p;
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}

// ---------------------------------------------------------------- the world

const made = { users: [], rows: [] };

async function account(label, { role = 'participant', status = 'approved', inviter } = {}) {
  const email = `${TAG}-${label}@example.invalid`;
  const password = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  if (inviter) {
    await must(`invite ${label}`, http('/rest/v1/invitations', {
      method: 'POST', prefer: 'return=minimal',
      body: { token: `${TAG}-${label}-${crypto.randomBytes(6).toString('hex')}`, email, created_by: inviter,
              expires_at: new Date(Date.now() + 864e5).toISOString() },
    }));
  }
  const terms = (await must('terms', http('/rest/v1/terms_versions?select=version&language=eq.en&order=published_at.desc&limit=1')))[0];
  const user = await must(`create ${label}`, http('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email, password, email_confirm: true,
      user_metadata: {
        // Unique per account and per run, so scripts/identity-scan.js can look
        // for exactly these strings in everything another caller is sent.
        first_name: `Gridname${crypto.randomBytes(3).toString('hex')}`, last_name: `Surname${crypto.randomBytes(3).toString('hex')}`,
        phone: `+32${crypto.randomInt(100000000, 999999999)}`, country: 'Belgium', company: `Company${crypto.randomBytes(3).toString('hex')}`,
        terms_version: terms.version, terms_language: 'en', signed_name: `Grid ${label}`,
        signing_capacity: 'individual', address_line1: '1 Grid Street', city: 'Testville',
      },
    },
  }));
  made.users.push(user.id);
  const [profile] = await must(`set ${label}`, http(`/rest/v1/profiles?user_id=eq.${user.id}`, {
    method: 'PATCH', prefer: 'return=representation', body: { role, status },
  }));
  const session = await must(`sign in ${label}`, http('/auth/v1/token?grant_type=password', {
    method: 'POST', key: ANON, body: { email, password },
  }));
  return { label, email, profileId: profile.id, userId: user.id, token: session.access_token,
           identity: { email, first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone,
                       company: profile.company, profile_id: profile.id, user_id: user.id } };
}

async function asUser(who, path, opts) {
  return http(path, { ...opts, key: ANON, token: who.token });
}

async function buildWorld() {
  // An empty project lets its first account in without an invitation
  // (handle_new_user, sql/024); after that someone must invite. If staging is
  // not empty (an earlier run died before cleaning up), an existing Operator
  // invites ours - and with no Operator the run stops and says why.
  const profiles = await must('profiles', http('/rest/v1/profiles?select=id,role,status&limit=50'));
  let opInviter;
  if (profiles.length) {
    const existing = profiles.find((p) => p.role === 'operator' && p.status === 'approved');
    if (!existing) throw new Error('Staging holds accounts but no approved Operator to invite with. Empty it first.');
    opInviter = existing.id;
  }
  const operator = await account('operator', { role: 'operator', inviter: opInviter });
  const inviter = operator.profileId;
  const A = await account('member-a', { inviter });
  const B = await account('member-b', { inviter });
  const pending = await account('pending', { status: 'pending', inviter });
  const suspended = await account('suspended', { status: 'suspended', inviter });

  const commodity = (await must('commodity', http('/rest/v1/commodities?select=name&limit=1')))[0].name;
  const ref = await must('reference', asUser(B, '/rest/v1/rpc/next_reference', { method: 'POST', body: { p_type: 'sell' } }));
  const [listing] = await must('listing', asUser(B, '/rest/v1/listings', {
    method: 'POST', prefer: 'return=representation',
    body: { user_id: B.profileId, reference_number: ref, type: 'sell', commodity, incoterm: 'FOB',
            origin: 'Grid', poster_role: 'principal', docs_seen: 'yes', docs_showable: 'on_request',
            truth_confirmed: true, quantity: 100, unit: 'MT' },
  }));
  await must('checklist', asUser(B, '/rest/v1/document_checklist', {
    method: 'POST', prefer: 'return=minimal',
    body: { listing_id: listing.id, doc_type: DOC, indicated: true },
  }));
  await must('saved search', asUser(B, '/rest/v1/saved_searches', {
    method: 'POST', prefer: 'return=minimal', body: { user_id: B.profileId, commodity },
  }));
  const [message] = await must('enquiry', asUser(A, '/rest/v1/messages', {
    method: 'POST', prefer: 'return=representation',
    body: { sender_id: A.profileId, listing_id: listing.id, subject: 'Grid', body: 'Grid enquiry' },
  }));
  // The Operator forwards it: that opens a deal file (sql/035) and a forward
  // log row, so both tables hold something to protect.
  await must('forward', asUser(operator, '/rest/v1/message_forward_log', {
    method: 'POST', prefer: 'return=minimal',
    body: { message_id: message.id, operator_id: operator.profileId, to_user_id: B.profileId },
  }));
  await must('document request', asUser(operator, '/rest/v1/document_requests', {
    method: 'POST', prefer: 'return=minimal',
    body: { listing_id: listing.id, participant_id: B.profileId, requester_id: operator.profileId, doc_type: DOC },
  }));
  // B answers the forwarded enquiry, and the Operator forwards the answer to
  // A: the full round trip, so the identity scan sees what A is really sent.
  const [reply] = await must('reply', asUser(B, '/rest/v1/messages', {
    method: 'POST', prefer: 'return=representation',
    body: { sender_id: B.profileId, listing_id: listing.id, in_reply_to: message.id, body: 'Grid reply' },
  }));
  await must('forward reply', asUser(operator, '/rest/v1/message_forward_log', {
    method: 'POST', prefer: 'return=minimal',
    body: { message_id: reply.id, operator_id: operator.profileId, to_user_id: A.profileId },
  }));
  return { operator, A, B, pending, suspended, listingId: listing.id };
}

// ---------------------------------------------------------------- the probes

// A "foreign" row: one that does not belong to the caller. B owns the world's
// member data, the Operator owns operator data, and system tables belong to
// nobody - so for every caller but the Operator, every row in the database is
// foreign except their own profile. The Operator's own rows are excluded from
// the Operator's checks by owner columns.
const OWNER_COLUMNS = ['user_id', 'sender_id', 'profile_id', 'participant_id', 'owner_id', 'requester_id', 'operator_id', 'created_by', 'changed_by', 'id'];

async function tables() {
  // PostgREST's own description of what it serves: exactly the tables a
  // caller can name, read from the database, not from a list kept here.
  const spec = await must('openapi', http('/rest/v1/', { headers: { Accept: 'application/openapi+json' } }));
  return Object.keys(spec.paths)
    .filter((p) => p.startsWith('/') && !p.startsWith('/rpc/') && p.length > 1)
    .map((p) => p.slice(1))
    .sort();
}

function foreignFilter(row, who) {
  // Narrow a probe to one specific row by its primary key-ish column.
  if (row.id !== undefined) return `id=eq.${row.id}`;
  const k = Object.keys(row)[0];
  return `${k}=eq.${encodeURIComponent(row[k])}`;
}

function isOwn(row, who) {
  if (!who.profileId) return false;
  // A message an Operator forwarded TO the caller is theirs to read: that is
  // the product (the forward log row names them as to_user_id).
  if (row.to_user_id === who.profileId) return true;
  if (who.forwardedToMe && who.forwardedToMe.has(row.id)) return true;
  return ['user_id', 'sender_id', 'profile_id', 'participant_id', 'owner_id', 'requester_id', 'operator_id', 'created_by', 'changed_by']
    .some((c) => row[c] === who.profileId) || (row.id === who.profileId);
}

async function markForwarded(who) {
  if (!who.profileId) return;
  const rows = await must('forwards', http(`/rest/v1/message_forward_log?select=message_id&to_user_id=eq.${who.profileId}`));
  who.forwardedToMe = new Set(rows.map((r) => r.message_id));
}

async function probe(table, roleName, who, failures, results) {
  const all = await must(`seed rows ${table}`, http(`/rest/v1/${table}?select=*&limit=200`));
  const foreign = all.filter((r) => !isOwn(r, who));
  const record = (action, happened, detail) => {
    const ok = happened ? allowed(table, roleName, action) : true;
    results.push({ table, role: roleName, action, happened, ok, detail });
    if (!ok) failures.push(`${roleName} could ${action} ${table}${detail ? ` (${detail})` : ''}`);
  };
  const call = (path, opts = {}) => (who.token ? asUser(who, path, opts) : http(path, { ...opts, key: ANON }));

  // READ: does any foreign row come back?
  const read = await call(`/rest/v1/${table}?select=*&limit=200`);
  const seen = read.ok && Array.isArray(read.json) ? read.json.filter((r) => !isOwn(r, who)) : [];
  record('read', seen.length > 0, seen.length ? `${seen.length} foreign row(s)` : '');

  if (!foreign.length) {
    results.push({ table, role: roleName, action: 'change/delete', happened: false, ok: true, detail: 'no foreign row to try' });
  } else {
    const target = foreign[0];
    const filter = foreignFilter(target);
    // CHANGE: write a column back to its own value. Nothing moves if it is
    // refused; if it is allowed, a row comes back - and nothing has changed.
    const col = Object.keys(target).find((c) => !['id', 'created_at'].includes(c) && typeof target[c] !== 'object');
    if (col) {
      const upd = await call(`/rest/v1/${table}?${filter}`, {
        method: 'PATCH', prefer: 'return=representation', body: { [col]: target[col] },
      });
      record('change', upd.ok && Array.isArray(upd.json) && upd.json.length > 0, col);
    }
    // ADD: a copy of the foreign row under a new id.
    const copy = { ...target };
    if ('id' in copy) copy.id = crypto.randomUUID();
    const add = await call(`/rest/v1/${table}`, { method: 'POST', prefer: 'return=representation', body: copy });
    const added = add.ok && Array.isArray(add.json) && add.json.length > 0;
    record('add', added, '');
    if (added && copy.id) made.rows.push([table, `id=eq.${copy.id}`]);
    // DELETE last, and only report: a refused delete leaves the world intact.
    const del = await call(`/rest/v1/${table}?${filter}`, { method: 'DELETE', prefer: 'return=representation' });
    record('delete', del.ok && Array.isArray(del.json) && del.json.length > 0, '');
  }
}

// ---------------------------------------------------------------- cleanup

async function cleanup() {
  for (const [table, filter] of made.rows) await http(`/rest/v1/${table}?${filter}`, { method: 'DELETE' });
  // Deleting the auth users removes their profiles and, through the
  // cascades in sql/018, what they owned. Invitations carry the tag.
  for (const id of made.users) await http(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  await http(`/rest/v1/invitations?email=like.${TAG}*`, { method: 'DELETE' });
}

async function main() {
  if (!URL_ || !ANON || !SERVICE) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required');
  if (URL_.includes(LIVE_REF)) throw new Error('Refusing to run against the live project: this script writes and deletes.');
  // A second lock, independent of the address: the service key names its own
  // project. A key for the live project is refused whatever URL it is sent to.
  const keyRef = JSON.parse(Buffer.from(SERVICE.split('.')[1] || '', 'base64url').toString() || '{}').ref;
  if (!keyRef || keyRef === LIVE_REF || !URL_.includes(keyRef)) {
    throw new Error(`Refusing to run: the service key belongs to project "${keyRef}", which is the live project or not the one at ${URL_}.`);
  }

  const failures = [];
  const results = [];
  let world;
  try {
    world = await buildWorld();
    const names = await tables();
    for (const t of names) if (!(t in EXPECTED)) failures.push(`table ${t} is not in the grid: decide who may touch it, then add it to EXPECTED`);
    for (const t of Object.keys(EXPECTED)) if (!names.includes(t)) failures.push(`EXPECTED lists ${t}, which the database no longer has`);
    const callers = { anon: {}, pending: world.pending, suspended: world.suspended, member: world.A, operator: world.operator };
    for (const who of Object.values(callers)) await markForwarded(who);
    for (const t of names.filter((n) => n in EXPECTED)) {
      for (const r of ROLES) await probe(t, r, callers[r], failures, results);
    }
  } finally {
    await cleanup();
  }

  const tried = results.length;
  const blocked = results.filter((r) => !r.happened).length;
  console.log(`Security grid: ${tried} attempts on ${Object.keys(EXPECTED).length} tables as ${ROLES.length} kinds of caller; ${blocked} refused, ${tried - blocked} allowed as expected or not.`);
  if (failures.length) {
    console.log(`\nFAIL - ${failures.length} door(s) open that should be shut:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - every door that should be shut, is.');
}

module.exports = { buildWorld, cleanup, http, asUser, must, guardNotLive: () => {
  if (!URL_ || !ANON || !SERVICE) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required');
  if (URL_.includes(LIVE_REF)) throw new Error('Refusing to run against the live project.');
  const keyRef = JSON.parse(Buffer.from(SERVICE.split('.')[1] || '', 'base64url').toString() || '{}').ref;
  if (!keyRef || keyRef === LIVE_REF || !URL_.includes(keyRef)) throw new Error(`Refusing to run: the service key belongs to "${keyRef}".`);
} };

if (require.main === module) {
  main().catch((err) => { console.error(err.message); cleanup().finally(() => process.exit(1)); });
}
