# To ChatGPT: Claude's assessment of the owner's supervision proposal — please review it

You helped the owner write a prompt asking Claude (Claude Code, running in a
cloud session on his project) for an honest assessment of a "supervisory
system" for his development work. This is Claude's answer. The owner wants you
to review it critically: challenge anything that is wrong, weak, or more
complicated than it needs to be.

Everything marked **[verified]** was checked on **2026-10-25** against the
repository itself, the GitHub API, or current official documentation. Anything
marked **[not verified]** could not be confirmed and should be treated as an
assumption.

---

## The project, briefly

- **Owner:** not a developer. Works on a 13-inch laptop. Cannot pay for
  anything extra right now.
- **Product:** "Jericho Platform", a private, invitation-only brokered
  marketplace for physical commodities. Members are anonymous to each other;
  every message passes through a human Operator.
- **Stack:** static HTML/JS pages on **GitHub Pages**, database and auth on
  **Supabase (free plan)**, code in a **public** GitHub repository
  (`Rafops71/Platform`). All development is done by Claude Code.
- **His constraints for the supervisory system:** costs nothing extra; fits
  the existing Claude Code workflow; minimal intervention from him; protects
  the project's *objectives*, not just individual tasks; detects regressions
  and forces correction and retesting; distinguishes tested from merely
  believed; does not burn his Claude usage.

---

## 1. What already exists **[verified]**

**GitHub Actions — 9 workflows:**

| Workflow | Runs on | Purpose |
|---|---|---|
| `ci.yml` (the gate) | push to main, pull requests, manual | 4 jobs: database tests (18 SQL suites on a real throwaway PostgreSQL), the **function checklist** (Playwright browser tests against the live project), Safari on an iPhone, and a volume/stress test |
| `send-emails.yml` | schedule | sends queued listing emails |
| `reminders.yml` | schedule | stale-listing reminders |
| `hygiene.yml` | schedule | checks the live database is clean |
| `heartbeat.yml` | schedule | keeps the free Supabase project awake |
| `review.yml` | pull requests | a second-opinion code review by a different model (Groq, free tier) — comments only, cannot fail a build |
| `apply-sql.yml`, `video.yml`, `verify-desktop-kit.yml` | manual / specific | migrations, narrated films, a film kit |

**The checklist:** `docs/CHECKLIST.md` lists **61 core functions** in plain
words — **22 of them prohibitions** ("Browse never reveals who posted a
listing"), because the product *is* controlled disclosure. Each item has one
test named `ItemNN_…`. The checklist job fails three ways: an item with no
test, an item whose test failed, and a test claiming an item that does not
exist.

**In Claude Code:**
- `CLAUDE.md` — the house rules, including "**Claude is never the
  verification system**" and "**nothing from memory**".
- One **UserPromptSubmit hook** (`.claude/hooks/verify-reminder.js`) that
  injects two standing rules into every turn. It exists because rules in
  `CLAUDE.md` were being forgotten mid-session.
- `docs/AGREED-2026-10-25.md` — the owner's recent decisions, written down so
  a session ending does not lose them.

**Assessment:** the *testing* is genuinely strong for a two-member project.
The problems are in how it is **wired** and in what **reaches the owner**.

---

## 2. What is missing **[verified unless marked]**

**a. The gate does not gate the live site. This is the most important
finding.**

On the merge commit `556e185` (2026-10-21), GitHub's own check runs show:

```
14:42:43Z  deploy               success    ← the live site was updated
14:55:03Z  Function checklist   success    ← the gate finished 12 minutes later
```

GitHub Pages publishes `main` **on its own**, independently of CI. The
`package` job in `ci.yml` only uploads an artifact; it deploys nothing. Had the
checklist failed that day, the broken code would **already have been live**.
The "gate" decides whether an artifact exists — not what users get.

**b. `main` is not protected.** The GitHub API returns *"Branch not
protected"* and an empty rulesets list. Claude pushes and merges to `main`
directly; nothing technical prevents an untested change landing there.

**c. Jobs go green while doing nothing.** `send-emails.yml` has reported
**success on every run** for weeks while **skipping** its send step, because
two secrets are missing. The run is green; no member has ever received an
email.

**d. Nobody is told.** Results sit in the GitHub Actions tab. History proves
the cost: CI on `main` was **red for five days (13–18 Oct)** before anyone
noticed.

**e. The objectives are written down but never checked.** `CHECKLIST.md` and
the decisions file exist, but nothing compares a change against them.
Drift — the owner's main complaint — is caught only if someone remembers to
look.

**f. Claude still reports its own work.** "Done and tested" arrives as
Claude's prose in chat. The rules forbid claiming success without a passing
check, but the only enforcement is Claude obeying the rules.

---

## 3. Can it be built for free?

- **GitHub Actions is free on public repositories** using standard runners
  **[verified, GitHub billing docs]**. Steps 1–5 below cost nothing to run.
- **Scheduled workflows on public repositories are disabled after 60 days
  without repository activity** **[verified, Claude Code docs]**. Fine while
  the project is active; worth knowing.
- **Branch protection with required status checks on a free public
  repository: [not verified].** GitHub's page confirms branch *restrictions*
  for public repositories on Free, but did not state the plan requirement for
  required status checks. Believed available; must be confirmed by trying it.
- **Switching GitHub Pages to deploy from a workflow** is a free setting.
  It cannot be changed from Claude's container (that API path is blocked
  here), so the owner clicks it once.
- **Claude Code in GitHub Actions** (`anthropics/claude-code-action`) can
  authenticate with a **Claude subscription token** (`CLAUDE_CODE_OAUTH_TOKEN`,
  available on Pro, Max, Team and Enterprise) instead of a billed API key
  **[verified, Claude Code docs]**. That means **no extra money — but every run
  consumes the owner's subscription usage**. The owner's plan is **[not
  verified]**.

**So yes: everything needed is free. Only the optional AI-repair step (6)
costs usage.**

---

## 4. A separate supervisor agent — Claude's challenge to the idea

**Claude recommends against it, for three reasons.**

1. **It is a model judging a model.** The project's own rule, learned the hard
   way, is that a check must give the *same answer every time*. Playwright
   does. A supervising model does not. The owner asked for something that
   "distinguishes tested from believed" — a second AI produces a second
   *belief*, more fluently stated.

2. **The track record says so.** The project has already run three outside AI
   reviews. Two ran at roughly one useful point in three, with the wrong points
   stated as confidently as the right ones. The best scored five of nine. Every
   finding still had to be checked against the code before acting. A supervisor
   would add that work, not remove it.

3. **It costs usage on every run** — the one thing the owner asked to protect.

**On "JEV" [not verified]:** secondary sources (LinkedIn posts, blog lists, a
package listing — no official documentation found) describe it as a non-LLM
model from TypeSafe AI, launched around September 2026, that returns typed
answers with probabilities, used as a guardrail and as a "is this work
complete?" judge (e.g. a tool called Foreman). It reportedly needs a provider
key, so it is likely **not free**, and it is still a model's judgement of
completion. Not recommended.

**The better approach:** don't add a supervisor. **Make the existing gate
actually gate, and make its results reach the owner.** Deterministic checks
are the supervisor.

---

## 5. Claude's recommended plan, in order

1. **Gate the deploy.** Switch Pages to deploy from a workflow job that
   `needs` the database, checklist, stress and Safari jobs. **Red means nothing
   goes live.** This closes gap (a).

2. **Protect `main`.** Changes arrive by pull request; the CI jobs are
   required checks; merge only on green. Claude works on its branch and cannot
   land untested work. Closes (b) and most of (f).

3. **A morning report — with no AI in it.** A scheduled GitHub Action that
   writes a plain report every morning as a GitHub Issue, which GitHub emails
   to the owner for free:
   - commits in the last 24 hours, and what each changed
   - every CI run: passed / failed, and which checklist items
   - the 61-item checklist table, ticked or crossed
   - any scheduled job that **failed or skipped**
   - open decisions from the decisions file

   **Zero Claude usage** — it is a script. Closes (d).

4. **Make skips loud.** Any workflow that skips work for missing configuration
   reports it as **not working** in the morning report, never as green.
   Closes (c).

5. **Tie every change to an objective — mechanically.** Each pull request must
   name the checklist item(s) or decision it serves. A plain script fails the
   PR if code changes without one, and the existing rule stands: a new
   function needs a new checklist item. This is how drift gets caught. Closes
   (e).

6. **Optional, later, only if usage allows:** when CI fails, the Claude Code
   GitHub Action (subscription token, capped with `--max-turns`) investigates
   and **opens a pull request with a fix** — which must pass the **same gate**.
   It never merges itself.

**Effort:** steps 1–5 are one working session to build, plus two clicks from
the owner (the Pages setting, and confirming branch protection).

---

## 6. What can and cannot be automated

**Can:**
- run every test on every change
- **block the live site** when anything fails
- produce the morning report without the owner asking
- detect regressions **in anything a test covers**
- flag jobs that silently do nothing
- attempt a fix automatically (step 6), judged by the same gate

**Cannot:**
- catch a regression **in something no test covers** — the checklist is only
  as good as its items
- judge whether the product still serves the owner's **business goals** —
  the checklist is the proxy, and the owner keeps it honest
- guarantee an AI fix is *right* — the gate judges it, not the AI
- do anything requiring the owner's own accounts (email domain, secrets,
  Pages setting)
- make AI repair free in **usage** terms

---

## 7. The simplest, most reliable solution for this owner

**Steps 1 to 4.** They need no AI, no new tools, no money and no Claude usage
once built. They turn an already-strong test suite into an actual gate, and
put its results in his inbox every morning. Step 5 adds drift protection.
Step 6 is a luxury to consider only after the rest has proven itself.

---

## What we would like you to check

1. Is branch protection with **required status checks** available on a
   **free, public** GitHub repository today? This was not verified.
2. Is there a **simpler free way** to get the morning report to the owner than
   a GitHub Issue notification?
3. Is Claude's central judgement right — **deterministic gates over an AI
   supervisor** — or is there a case for a supervisor agent that this misses?
4. Anything above that is wrong, overstated, or missing.

Please mark anything you cannot verify yourself, rather than stating it as
fact. The owner is not technical; plain words help.
