#!/usr/bin/env node
'use strict';
// The standing Operator on the STAGING project - create it, check it, remove it.
//
//   node scripts/staging-operator.js status      read-only: is it there, and is it an approved Operator?
//   node scripts/staging-operator.js create      make it (refuses unless staging holds no other profile)
//   node scripts/staging-operator.js teardown    remove it again, and prove it is gone
//   node scripts/staging-operator.js --self-test proves all of this against a throwaway local PostgreSQL
//
// WHY (docs/PLAN-staging-2026-11-17.md, step 1; owner approved 17 Nov 2026). The browser suite writes
// every fixture's invitation as "the first approved Operator" (tests/e2e/helpers/fixtures.js). Live has a
// real one; staging had none, so five tests failed in PR 117. This account only EXISTS - it never signs in
// (its password is random and thrown away) - so the suite has somebody to name as inviter.
//
// SAFETY. It acts on STAGING only: it refuses when SUPABASE_URL names anything but the staging project, and
// refuses outright when it names the live one. It is run from .github/workflows/staging-operator.yml, a
// manual workflow that is handed the staging secrets and none of the live ones; the self-test checks that.
// The address is staging-operator@example.invalid: it never matches the test prefixes that the suite's
// cleanup deletes ("myplatform-e2e-", "jericho-e2e-"), and nothing can be delivered to .invalid.
//
// HOW. Create goes through Supabase Auth's admin API, as the fixtures do (POST /auth/v1/admin/users with the
// service-role key); handle_new_user() makes the profile; the promotion is the statement
// scripts/bootstrap-operator.sh uses. Teardown deletes the Auth user through the same API; the profile goes
// with it. The one audit-log line the creation wrote stays, by design: the log is write-only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STAGING_REF = 'pqxlfgvjoowawzgoszna';
const LIVE_REF = 'coarclhafggkakmpggfh';
const EMAIL = 'staging-operator@example.invalid';
const META = { first_name: 'Staging', last_name: 'Standing Operator', phone: '+320000000', country: 'Belgium', language: 'en' };

/** Throws unless this address is the staging project's. The one door every command goes through. */
function assertStagingOnly(url) {
  const u = String(url || '');
  if (u.includes(LIVE_REF)) throw new Error(`refusing: SUPABASE_URL names the LIVE project (${LIVE_REF}). This tool only ever touches staging.`);
  if (!u.includes(STAGING_REF)) throw new Error(`refusing: SUPABASE_URL does not name the staging project (${STAGING_REF}): "${u}"`);
}

async function authAdmin(cfg, method, route, body) {
  const res = await cfg.fetch(`${cfg.url}/auth/v1/admin${route}`, {
    method,
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Auth admin ${method} ${route} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

async function state(db) {
  const { rows } = await db.query(
    `select (select count(*)::int from public.profiles) as profiles,
            (select row_to_json(p) from (select id, user_id, email, role, status from public.profiles where email = $1) p) as me`,
    [EMAIL]);
  return rows[0];
}

/** The three commands. cfg = { url, serviceKey, fetch, db } - injected so the self-test can run them for real
 *  against a local database and a local stand-in for the Auth admin API. */
async function run(cfg, command, log = console.log) {
  const s = await state(cfg.db);
  if (command === 'status') {
    log(`profiles on this database: ${s.profiles}`);
    log(s.me ? `${EMAIL}: role=${s.me.role} status=${s.me.status}` : `${EMAIL}: not present`);
    return { ok: !!(s.me && s.me.role === 'operator' && s.me.status === 'approved'), present: !!s.me };
  }

  if (command === 'create') {
    if (s.me) {
      log(`already present (role=${s.me.role}, status=${s.me.status}); nothing created.`);
      if (s.me.role === 'operator' && s.me.status === 'approved') return { ok: true, present: true };
    } else {
      // Only on an empty database: the first account needs no invitation (handle_new_user()). On a database that
      // already has members this tool would need an invitation it must not forge, so it stops and says so.
      if (s.profiles !== 0) throw new Error(`refusing: staging holds ${s.profiles} profile(s) but no ${EMAIL}. This tool only creates the first account on an empty database.`);
      await authAdmin(cfg, 'POST', '/users', { email: EMAIL, password: crypto.randomBytes(24).toString('base64url') + 'aA1!', email_confirm: true, user_metadata: META });
      log('Auth user created.');
    }
    // handle_new_user() makes the profile; allow a moment for it.
    let me = null;
    for (let i = 0; i < 20 && !me; i++) {
      me = (await state(cfg.db)).me;
      if (!me) await new Promise((r) => setTimeout(r, 500));
    }
    if (!me) throw new Error('the Auth user exists but no profile appeared within 10 s; nothing promoted.');
    await cfg.db.query(`update public.profiles set role = 'operator', status = 'approved' where email = $1`, [EMAIL]);
    const after = (await state(cfg.db)).me;
    const ok = after && after.role === 'operator' && after.status === 'approved';
    log(`${ok ? 'PASS' : 'FAIL'} - ${EMAIL}: role=${after && after.role} status=${after && after.status}`);
    if (!ok) throw new Error('the promotion did not persist (is sql/002 applied?).');
    return { ok: true, present: true };
  }

  if (command === 'teardown') {
    if (!s.me) { log(`${EMAIL} is not present; nothing to remove.`); return { ok: true, present: false }; }
    await authAdmin(cfg, 'DELETE', `/users/${s.me.user_id}`);
    const after = await state(cfg.db);
    const gone = !after.me;
    log(`${gone ? 'PASS' : 'FAIL'} - ${EMAIL} ${gone ? 'removed' : 'is still present'}; profiles now: ${after.profiles}`);
    if (!gone) throw new Error('the Auth user was deleted but the profile is still there.');
    return { ok: true, present: false };
  }
  throw new Error(`unknown command "${command}" (use status, create or teardown)`);
}

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const command = argv[0];
  const { loadEnv, connect } = require('./db');
  loadEnv();
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  assertStagingOnly(url);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY (the staging one) is not set.');
  // The database must be staging's too: the project ref is the user name in the pooler address.
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  if (dbUrl.includes(LIVE_REF) || (dbUrl && !dbUrl.includes(STAGING_REF))) throw new Error('refusing: SUPABASE_DB_URL does not name the staging project.');
  const db = await connect();
  try { await run({ url, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, fetch, db }, command); } finally { await db.end(); }
  return 0;
}

/** Against a throwaway PostgreSQL (needs a non-root user, like test:sql) and a local stand-in for the Auth admin
 *  API that does what Supabase's does for this purpose: insert into auth.users / delete from it. */
async function selfTest() {
  const http = require('http');
  const { start } = require('./pg-harness');
  const results = [];
  const check = (what, ok) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); };

  // 1. the guard
  const refuses = (u) => { try { assertStagingOnly(u); return false; } catch (e) { return true; } };
  check('refuses the live project', refuses(`https://${LIVE_REF}.supabase.co`));
  check('refuses an address that is neither', refuses('https://example.com'));
  check('refuses an empty address', refuses(''));
  check('accepts the staging project', !refuses(`https://${STAGING_REF}.supabase.co`));

  // 2. the workflow holds no live secret
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'staging-operator.yml'), 'utf8');
  const bad = (wf.match(/secrets\.[A-Z_]+/g) || []).filter((s) => !/^secrets\.STAGING_/.test(s));
  check(`the workflow names only STAGING_ secrets${bad.length ? ' (found ' + bad.join(', ') + ')' : ''}`, bad.length === 0);
  check('the workflow is manual only (no push or pull_request trigger)', /workflow_dispatch/.test(wf) && !/^\s*(push|pull_request|schedule):/m.test(wf));

  // 3. create / status / teardown for real, locally
  const pg = await start();
  let server;
  try {
    await pg.client.query('delete from public.profiles; delete from auth.users;');
    server = http.createServer(async (req, res) => {
      let body = ''; for await (const c of req) body += c;
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
      if (!/^Bearer .+/.test(req.headers.authorization || '')) return send(401, { msg: 'no key' });
      if (req.method === 'POST' && req.url === '/auth/v1/admin/users') {
        const b = JSON.parse(body);
        const { rows } = await pg.client.query('insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2::jsonb) returning id', [b.email, JSON.stringify(b.user_metadata || {})]);
        return send(200, { id: rows[0].id, email: b.email });
      }
      const m = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(req.url);
      if (req.method === 'DELETE' && m) { await pg.client.query('delete from auth.users where id = $1', [m[1]]); return send(204); }
      return send(404, {});
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const cfg = { url: `http://127.0.0.1:${server.address().port}`, serviceKey: 'x', fetch, db: pg.client };
    const quiet = () => {};

    check('status before: not present', (await run(cfg, 'status', quiet)).present === false);
    check('create: ends as an approved Operator', (await run(cfg, 'create', quiet)).ok === true);
    check('the suite\'s own inviter query finds it', (await pg.client.query("select id from public.profiles where role = 'operator' and status = 'approved' order by created_at limit 1")).rows.length === 1);
    check('create again: idempotent (still one profile)', (await run(cfg, 'create', quiet)).ok && (await state(pg.client)).profiles === 1);
    check('status after: an approved Operator', (await run(cfg, 'status', quiet)).ok === true);
    check('teardown: removes it', (await run(cfg, 'teardown', quiet)).present === false);
    check('teardown left no profile and no Auth user', (await state(pg.client)).profiles === 0 && (await pg.client.query('select count(*)::int n from auth.users')).rows[0].n === 0);
    check('teardown again: nothing to remove, no error', (await run(cfg, 'teardown', quiet)).present === false);

    // a database that already has members: create must refuse rather than forge an invitation
    await pg.client.query("insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'someone@mailcheck-platform.com', '{}')");
    let refused = false; try { await run(cfg, 'create', quiet); } catch (e) { refused = /refusing/.test(e.message); }
    check('create refuses on a staging that already has other members', refused);
    await pg.client.query('delete from public.profiles; delete from auth.users;');
  } finally { if (server) server.close(); await pg.stop(); }
  const failed = results.filter((x) => !x).length;
  console.log(failed ? `\n${failed} self-test(s) FAILED` : `\nStaging Operator tool: ${results.length} self-tests pass.`);
  return failed ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c || 0), (e) => { console.error(e.message); process.exit(1); });
module.exports = { assertStagingOnly, run, EMAIL };
