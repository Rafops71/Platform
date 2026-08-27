#!/usr/bin/env node
// Run sql/tests/01_security_suite.sql against a throwaway local PostgreSQL.
//
//   npm run test:sql
//
// Why this exists: the security suite has caught two real bugs (a privilege
// escalation, and forwarded messages silently never arriving), but it needed
// a local PostgreSQL that this machine did not have, so it went unrun while
// migrations 003-007 were applied straight to production. This makes it a
// one-command check with no Docker, no admin rights and no system install:
// embedded-postgres downloads real PostgreSQL binaries into node_modules.
//
// Those binaries include initdb/pg_ctl/postgres but NOT psql, and the suite
// is written for psql — so its backslash meta-commands are translated here
// rather than executed. Only three appear in it: \echo becomes a printed
// heading, \pset and \set QUIET are display settings with no meaning outside
// psql and are dropped.
//
// Exit code is 0 only if every assertion printed PASS.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SQL_TEST_PORT || 55432);

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
  'sql/seed_commodities.sql',
];

// Each suite runs against the same freshly-built database, in order. 02
// depends on nothing 01 leaves behind — it creates its own users — but it
// does read email_outbox, so it filters by its own addresses rather than
// counting rows globally.
const SUITES = [
  'sql/tests/01_security_suite.sql',
  'sql/tests/02_email_language.sql',
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
 *  literals, dollar-quoted blocks and comments. Needed because the suite has
 *  to run one statement at a time (see runSuite). */
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
    // Identifiers matter here: this suite names its assertions things like
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

/** An assertion is any single-row result whose first column is named "Tn …"
 *  and whose value starts PASS or FAIL. Everything else is a side effect. */
function readAssertion(res) {
  if (!res || !res.fields || !res.rows || res.rows.length === 0) return null;
  const name = res.fields[0].name;
  const value = res.rows[0][name];
  if (name === '__echo') return { heading: value };
  if (typeof value !== 'string' || !/^(PASS|FAIL)/.test(value)) return null;
  return { name, value, passed: value.startsWith('PASS') };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jericho-pgtest-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    // persistent:true only means "do not delete the data directory on stop".
    // Left false, embedded-postgres removes it itself the instant the server
    // exits, which on Windows races the OS still holding a handle and throws
    // EBUSY out of stop() — failing an otherwise green run. Cleanup is done
    // below instead, with retries.
    persistent: true,
    // On Windows initdb defaults to WIN1252, which cannot represent the
    // em-dashes and arrows in the schema comments and commodity names —
    // the first CREATE TABLE fails outright. Supabase runs UTF-8, so this
    // also keeps the local cluster faithful to production.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  console.log(`Starting PostgreSQL on port ${PORT} …`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('jericho');

  const client = new Client({
    host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'jericho',
  });
  await client.connect();

  let failed = 0;
  try {
    for (const file of SETUP) {
      process.stdout.write(`  applying ${file} … `);
      await runFile(client, file);
      console.log('ok');
    }

    // One statement at a time, in autocommit, exactly as psql would run it.
    // The suite deliberately performs statements that must be rejected — a
    // participant setting an operator-only status, for instance — and then
    // asserts the row was left alone. Running the file as a single query put
    // all of it in one transaction, where the first expected error aborted
    // every assertion after it.
    for (const suite of SUITES) {
      const suiteSql = translateMetaCommands(fs.readFileSync(path.join(ROOT, suite), 'utf8'));

      for (const statement of splitStatements(suiteSql)) {
        let res;
        try {
          res = await client.query(statement);
        } catch (err) {
          // Expected rejections land here. They are the point of the test, and
          // the assertion that follows is what decides pass or fail. Run with
          // SQL_TEST_VERBOSE=1 to see them — an assertion failing for a boring
          // reason (a renamed value the suite still uses) looks identical to a
          // real regression until you can read the error underneath it.
          if (process.env.SQL_TEST_VERBOSE) {
            console.log(`  · rejected: ${err.message}`);
            console.log(`      ${statement.replace(/\s+/g, ' ').slice(0, 120)}`);
          }
          continue;
        }

        const item = readAssertion(res);
        if (!item) continue;
        if (item.heading !== undefined) {
          console.log(item.heading ? `\n${item.heading}` : '');
        } else if (item.passed) {
          console.log(`  PASS  ${item.name}`);
        } else {
          failed++;
          console.log(`  FAIL  ${item.name}  ->  ${item.value}`);
        }
      }
    }
  } finally {
    await client.end();
    await pg.stop();
    // Windows keeps a handle on the data directory briefly after the server
    // exits, so an immediate rmdir throws EBUSY. Retry, and treat a stubborn
    // directory as noise rather than a test failure — it is under the OS temp
    // directory and the run itself already finished.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 4) { console.warn(`(left ${dataDir} behind: ${err.code})`); break; }
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  console.log(failed === 0 ? '\nAll assertions passed.' : `\n${failed} assertion(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
