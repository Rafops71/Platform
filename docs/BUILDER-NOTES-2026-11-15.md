# Builder working notes, 2026-11-15 (for the next session; not a decision document)

## Role and rules (from CLAUDE.md and the supervisor)
- I am the BUILDER. The supervisor session (session_01DzTmTBerFFsng54vi1snGx) assigns jobs; I report with the claude-code-remote send_message tool.
- I write code, migrations, tests. I never merge and never apply anything live. Wording is the owner's: options plus a recommendation, or only wording he gave.
- Nothing from memory: verify with a tool. A test that never ran is not a pass. Never weaken, skip or quarantine a test.
- Every PR names an `Item NN` or a `docs/AGREED-....md`. After every PR: read the "Second opinion" job log, check each claim against the code, report acted/not acted with reasons.
- test:sql runs as user pgtest (chown repo to pgtest, `su pgtest -c "cd /home/user/Platform && npm run test:sql"`, chown back to root). Scripts for pgtest must be in a world-readable place (/tmp/pgtest-*.js).
- Picture baselines are re-taken only "the GitHub-runner way" (temporary push-triggered workflow, allow-listed PNGs, removed in the next commit).
- ci.yml runs on pushes to main and on pull requests only; a plain branch push does not run it.

## Done and merged this session
- #109 HMS rename (migration 062, test 33), applied live by the supervisor. #110 "serious" wording (Help a11, Participant guide).
- Earlier: #93, #95, #96, #98, #99, #102, #103, #108.

## Mockups (text only, branch mockup-readiness-2026-11-15, head 5d01e41)
- mockups/readiness/{sell-form,buy-form,listing-card}.html. Owner wanted drop-downs: role select (Principal / Mandated intermediary / Broker), then Producer/Trader select for a Principal on a Sell offer, then ticks. Buy: role select, buyer-only Principal text "Principal - I purchase as the contracting party" (DRAFT), one buyer tick.
- ON HOLD until the owner answers: do other members see the tick on the listing, or only the Operator?

## In progress: branch doc-questions-2026-11-15 (one PR, not yet committed except these notes)
Owner decisions F2 + F3. Verified facts:
- Latest definition of the server check is sql/060 `enforce_listing_statements()`; it refused any listing without BOTH docs_seen and docs_showable. Browse never exposes docs_showable (sql/tests/20 asserts that).
- Migration 063 (written): function body = 060 except: only a SELL offer needs docs_seen; nothing about docs_showable; nothing cleared. Revert = 060's function. Files: sql/063_documents_questions.sql, sql/revert/063_documents_questions_revert.sql.
- Code edits already made: app.html (docs_showable select removed; docs_seen wrapped in #docs-seen-row, hidden unless Sell), js/app.js (showRoleQuestions toggles the row; readListingStatements needs docs_seen only on Sell, sends docs_seen only on Sell, never docs_showable; statementsLine shows no documents part for a Buy; Browse adds `data-docs-line` fixed line for Sell), js/i18n.js (docsShowable keys removed EN+ES; stmt.err.docs now singular EN "Please answer the question about documents." / ES "Responda a la pregunta sobre documentos."; new key stmt.browse.docsLine EN "Documents: after the introduction, subject to agreement between the parties." / ES "Documentos: tras la presentación, sujetos a acuerdo entre las partes." - ES written by me, "presentación" is the site's word for introduction).
- STILL TO DO: (1) add 063 to scripts/apply-sql.js, scripts/pg-harness.js; new test sql/tests/34_documents_questions.sql + scripts/run-sql-tests.js; check:migrations. (2) sql/tests/20 case 'one docs answer' (docs_seen yes, no docs_showable) used to be REFUSED, now accepted: change it to a Sell with docs_seen missing (refused) - a decision change, not a weakening. (3) sql/tests/31 pins the function at 060's state: at its start run `\i sql/revert/063_documents_questions_revert.sql`, at its end `\i sql/063_documents_questions.sql`. (4) e2e: tests/e2e/helpers/session.js (drop the docs_showable line), tests/e2e/listing-statements.spec.js (drop docs_showable lines; the Buy expectation now "Poster: Principal" with no Documents part; add a check of the fixed line on a Sell card). (5) docs/CHECKLIST.md Items 66 and 68 mention "both document answers" - wording needs the owner's approval: propose, do not decide. (6) Report-only, not edited: video/script.json line ~266 narration and video/trailer2/capture.js + script.json still select #docs_showable (films on hold); docs/AGREED-2026-10-25.md item 18 is history. (7) Run test:sql as pgtest + static checks, push, open PR naming Item 66, wait for checks (pictures may need the GitHub-runner re-take), read second opinion, report.
- Report to supervisor also: SOP proposals (report only): (i) the paragraph "If you are unsure, leave them pending and find out", (ii) SOP section 8 conditions without the commission agreement. Propose exact replacement wording; owner decides.

## Next build after that (owner YES, "Idea 1 dated statements")
- Show "Stated by the poster on <date>" on EXISTING statements (role, docs_seen etc.), plus a 30-day reminder / "Not re-confirmed since <date>". No new fields. Propose exact placement and tell the supervisor BEFORE building. Existing facts: listings.truth_confirmed_at is stamped by the server on each member save; `isStaleListing` / STALE_LISTING_DAYS exist in js/app.js.

## Environment facts
- Chromium: use executablePath '/opt/pw-browsers/chromium' with the repo's playwright (its own bundled path is missing).
- Scratchpad: /tmp/claude-0/-home-user-Platform/46436cc2-e674-5bb0-a9f2-fb2eff737c0c/scratchpad/ (mockup PNGs, ideas.md).
