# HANDOVER (supervisor + builder). Update only when something meaningful changes.
Last updated: 16 Nov 2026, after Terms 3.8 merged (#113). Longer history: docs/SUPERVISOR-STATE-2026-11-08.md.

## 1. Architecture and current state
- MyPlatform (repo Rafops71/Platform): static HTML/CSS/JS on Cloudflare Pages, Supabase live project coarclhafggkakmpggfh (+ Staging pqxlfgvjoowawzgoszna). Operator = ONE legal party (singular everywhere). Entity will be UAE; Terms: English law, DIFC courts, PLACEHOLDER banner kept.
- Gate: CI (.github/workflows/ci.yml) on PR head; Function checklist (Playwright, live DB) is the verification. Migrations sql/NNN_*.sql + sql/revert; applied live ONLY via apply-sql.yml (workflow_dispatch, input files, ref = branch). Live now: up to 065.
- People/windows: owner (non-developer, small screen, toddler plain English, one block at a time, buttons, Brussels time, wording and Spanish: owner delegated Spanish to us, member-visible English wording is his). Supervisor Sonnet = me. ONE Sonnet builder (code). Former supervisor (Opus window) keeps idea list docs/IDEAS-2026-11-12.md.

## 2. Completed (live)
#102 sign-in line; #103 pg_cron daily purge (061, 055); #108 Operator singular, SOP approval paragraph, introduction rule in Help/welcome; #109 HMS rename (062); #110 no "serious"; #111 document questions (063: buy skips both, fixed Documents line); #112 dated statements (064, Option A: "Yes, still available" restamps); #113 Terms 3.8 (065).

## 3. Outstanding
- Readiness ticks (principals only): drop-down role (Principal/Mandated intermediary/Broker) -> Producer/Trader (sell principals) -> ticks; buyer single tick. Mockup on branch mockup-readiness-2026-11-15 (drop-down version). OPEN: tick visible to others or Operator only.
- "Please reconcile" button (Operator, mirrors item 78). Not built.
- Function-by-function walkthrough with the owner (verified toddler explanations, buttons, answers in a file), THEN one build batch.
- Parked: SOP wording proposals (section 2, 8, 5), checklist items 66/68 wording, 3.8 change-summary wording (walk through later), Terms s.10 p4 plural verb, application-review clause (3 options shown, none chosen), sanctions name check, UAE licence facts, info@ mailbox (must receive mail before launch), T8/T11/T12, films, code protection, OpenCode trial.

## 4. Key decisions
Never decide member-visible wording for the owner; Spanish is ours. Standing: merge only when EVERY check on the head is green; additive DB changes with proven revert may be applied after telling him; deletes/changes of member data need his explicit yes. Never ask him to approve a mockup for a pure text change. Nothing from memory: verify with a tool.

## 5. Known risks
Free-AI panel (freellmpool) works only for short prompts. CI lane is one at a time (apply-sql can queue 20-30 min). Builder context ~330k: start a fresh builder from this file.

## 6. Paths
docs/SUPERVISOR-STATE-2026-11-08.md, docs/IDEAS-2026-11-12.md (branch claude/great-allen-5xl0gm), docs/BUILDER-NOTES-2026-11-15.md (builder branch), sql/, js/i18n.js, js/app.js, tests/e2e, tests/visual/screenshots, terms/changes/.

## 7. Tests
All checks green on every merged PR (#102-#113); test:sql 468 PASS at 3.8.

## 8. Exact next task
Ask the owner ONE question: who sees the readiness tick (Operator only / on the listing). Then build ticks + dated line reuse; then reconcile button mockup; then walkthrough.
