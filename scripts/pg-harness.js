// A throwaway PostgreSQL with this platform's whole schema on it.
//
//   const { start, SETUP } = require('./pg-harness');
//   const pg = await start();
//   ...use pg.client...
//   await pg.stop();
//
// embedded-postgres downloads real PostgreSQL binaries into node_modules, so
// this needs no Docker, no admin rights, no system install and no credentials.
// Nothing here ever touches the live Supabase project: the server is created
// in a temp directory, used, and deleted.
//
// Extracted from scripts/run-sql-tests.js when a second caller appeared
// (scripts/stress-test.js). The pieces below were each written to fix a real
// failure - a leftover postmaster holding the port, Windows refusing to delete
// a data directory, initdb defaulting to an encoding that cannot hold the
// schema's own comments - and duplicating them would have meant one copy
// quietly losing a fix the other kept.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 55432;

// Order matters: the stub defines the auth schema the rest depends on, then
// the base schema, then every migration in sequence, then seed data.
const SETUP = [
  'sql/tests/00_supabase_stub.sql',
  'sql/schema.sql',
  'sql/rls_policies.sql',
  'sql/002_updates.sql',
  'sql/003_email_notifications.sql',
  'sql/004_email_outbox_retry.sql',
  'sql/005_confirmed_updates.sql',
  'sql/006_checklist_and_price_unit.sql',
  'sql/007_commodities_alphabetical.sql',
  'sql/008_email_language.sql',
  'sql/009_message_threading.sql',
  'sql/010_terms_acceptance.sql',
  'sql/011_profile_self_service.sql',
  'sql/012_saved_searches.sql',
  'sql/013_activity_export.sql',
  'sql/014_listing_renewal.sql',
  'sql/015_operator_analytics.sql',
  'sql/016_rate_limits.sql',
  'sql/017_lock_down_function_access.sql',
  'sql/018_profile_deletion.sql',
  'sql/019_rate_limit_race.sql',
  'sql/020_foreign_key_indexes.sql',
  'sql/021_activity_log_orphan_purge.sql',
  'sql/022_reference_number_overflow.sql',
  'sql/023_purge_orphaned_feeds.sql',
  'sql/024_require_invitation.sql',
  'sql/025_browse_requires_approval.sql',
  'sql/026_active_account_required.sql',
  'sql/027_purge_test_mail.sql',
  'sql/028_reference_numbers_from_the_server.sql',
  'sql/029_browse_from_the_server.sql',
  'sql/030_activity_log_write_only_through_a_function.sql',
  'sql/031_signing_and_acceptance.sql',
  'sql/032_terms_3_0.sql',
  'sql/033_listing_statements.sql',
  'sql/034_signature_required_to_act.sql',
  'sql/035_deal_files.sql',
  'sql/036_terms_3_1.sql',
  'sql/037_member_scorecard.sql',
  'sql/038_deal_analytics.sql',
  'sql/039_terms_3_2.sql',
  'sql/seed_commodities.sql',
];

/** Turn psql meta-commands into something a plain connection can run.
 *  \echo 'text' becomes a select whose single column carries the heading;
 *  other backslash lines are psql display settings and are dropped. */
function translateMetaCommands(sql) {
  return sql
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('\\')) return line;

      const echo = trimmed.match(/^\\echo\s+'(.*)'$/);
      if (echo) return `select '${echo[1].replace(/'/g, "''")}' as "__echo";`;
      if (/^\\echo\s*$/.test(trimmed)) return `select '' as "__echo";`;
      return '';
    })
    .join('\n');
}

async function runFile(client, relPath) {
  const sql = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  await client.query(sql);
}

/** Split SQL into statements on semicolons, ignoring semicolons inside string
 *  literals, dollar-quoted blocks and comments. Needed because a suite has to
 *  run one statement at a time: an expected error inside a single multi-
 *  statement query aborts the whole transaction, taking every later assertion
 *  with it. */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    // String literals and double-quoted identifiers are scanned the same way.
    // Identifiers matter here: a suite names its assertions things like
    // "T12 non-owner cannot modify another's listing", and treating that
    // apostrophe as the start of a literal swallows the rest of the file.
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) { j += 2; continue; }
        if (sql[j] === quote) break;
        j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const dollar = rest.match(/^\$([A-Za-z_]\w*)?\$/);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += sql[i];
    i++;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Delete data directories abandoned by earlier runs.
 *
 *  The cleanup in stop() retries, but on Windows the handle Postgres holds on
 *  its data directory sometimes outlives all five attempts, and the directory
 *  is orphaned. Each one is ~49 MB, so a few weeks of runs quietly cost
 *  hundreds of megabytes of temp space.
 *
 *  Sweeping at startup does not race anything: by then the previous run's
 *  server is long gone, so its handles are released. A directory that still
 *  refuses to go is either genuinely locked or owned by a concurrent run -
 *  both are somebody else's, so the error is swallowed and the sweep moves on.
 *  It never touches the directory this run is about to create, which does not
 *  exist yet. */
function sweepStaleDataDirs() {
  const tmp = os.tmpdir();
  let swept = 0;
  let entries;
  try {
    entries = fs.readdirSync(tmp);
  } catch {
    return; // an unreadable temp dir is not this script's problem
  }
  for (const name of entries) {
    if (!name.startsWith('jericho-pgtest-')) continue;
    try {
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
      swept++;
    } catch {
      // Locked, or in use by a concurrent run. Leave it.
    }
  }
  if (swept) console.log(`Swept ${swept} stale data director${swept === 1 ? 'y' : 'ies'} from a previous run.`);
}

/** Is this port free to listen on right now? */
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/** The port to run on.
 *
 *  A run that dies before its cleanup — Ctrl-C, a killed terminal, a Windows
 *  handle that outlives the process — leaves a PostgreSQL listening on the old
 *  port, and every later run then fails at startup with "could not create any
 *  TCP/IP sockets". That is a confusing way to be told the suite never ran,
 *  and it happened twice in one afternoon.
 *
 *  So the default port is a preference, not a requirement: if it is taken,
 *  walk up until something is free. An explicitly set SQL_TEST_PORT is
 *  honoured as given, because someone who names a port wants that port and
 *  should be told plainly when it is unavailable rather than quietly moved. */
async function choosePort() {
  if (process.env.SQL_TEST_PORT) {
    const wanted = Number(process.env.SQL_TEST_PORT);
    if (!(await portIsFree(wanted))) {
      throw new Error(
        `SQL_TEST_PORT=${wanted} is already in use. Something is listening there — ` +
        'most likely a PostgreSQL left behind by an earlier run. Stop it, or unset ' +
        'SQL_TEST_PORT and a free port will be chosen automatically.'
      );
    }
    return wanted;
  }
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 40; port += 1) {
    if (await portIsFree(port)) {
      if (port !== DEFAULT_PORT) {
        console.log(`Port ${DEFAULT_PORT} is busy — using ${port} instead.`);
      }
      return port;
    }
  }
  throw new Error(`No free port between ${DEFAULT_PORT} and ${DEFAULT_PORT + 39}.`);
}

/** Start a throwaway PostgreSQL and apply the whole schema to it.
 *
 *  Returns { client, port, connectionString, newClient(), stop() }. newClient()
 *  opens an additional connection to the same database, which is how a
 *  concurrency test gets more than one session.
 *
 *  @param {object}  [opts]
 *  @param {boolean} [opts.applySetup=true]  apply SETUP before returning
 *  @param {boolean} [opts.quiet=false]      do not print each file as it goes
 */
async function start({ applySetup = true, quiet = false } = {}) {
  const port = await choosePort();
  sweepStaleDataDirs();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jericho-pgtest-'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    // persistent:true only means "do not delete the data directory on stop".
    // Left false, embedded-postgres removes it itself the instant the server
    // exits, which on Windows races the OS still holding a handle and throws
    // EBUSY out of stop() — failing an otherwise green run. Cleanup is done
    // in stop() below instead, with retries.
    persistent: true,
    // On Windows initdb defaults to WIN1252, which cannot represent the
    // em-dashes and arrows in the schema comments and commodity names —
    // the first CREATE TABLE fails outright. Supabase runs UTF-8, so this
    // also keeps the local cluster faithful to production.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  if (!quiet) console.log(`Starting PostgreSQL on port ${port} …`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('jericho');

  const connection = {
    host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'jericho',
  };
  const extras = [];

  const client = new Client(connection);
  await client.connect();

  if (applySetup) {
    for (const file of SETUP) {
      if (!quiet) process.stdout.write(`  applying ${file} … `);
      await runFile(client, file);
      if (!quiet) console.log('ok');
    }
  }

  return {
    client,
    port,
    connection,

    /** An extra connection to the same database, for concurrency. Closed by
     *  stop() along with everything else, so a caller cannot leak one. */
    async newClient() {
      const extra = new Client(connection);
      await extra.connect();
      extras.push(extra);
      return extra;
    },

    async stop() {
      for (const extra of extras) {
        try { await extra.end(); } catch { /* already gone */ }
      }
      try { await client.end(); } catch { /* already gone */ }
      await pg.stop();

      // Windows keeps a handle on the data directory briefly after the server
      // exits, so an immediate rmdir throws EBUSY. Retry, and treat a
      // stubborn directory as noise rather than a failure — it is under the
      // OS temp directory and the run itself already finished.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.rmSync(dataDir, { recursive: true, force: true });
          break;
        } catch (err) {
          if (attempt === 4) { console.warn(`(left ${dataDir} behind: ${err.code})`); break; }
          await new Promise(r => setTimeout(r, 400));
        }
      }
    },
  };
}

module.exports = {
  start,
  SETUP,
  DEFAULT_PORT,
  runFile,
  translateMetaCommands,
  splitStatements,
  sweepStaleDataDirs,
  portIsFree,
  choosePort,
};
