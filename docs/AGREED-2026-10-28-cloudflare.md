# Agreed 2026-10-28/29: migration to Cloudflare Pages, step 1

Plan: HANDOFF.md, "Migration to Cloudflare Pages". Decisions the owner gave,
one permission at a time:

1. A Cloudflare API token limited to Pages: Edit (user token `platform-pages`,
   made by the owner). Tested read-only. The owner can delete it on the
   Cloudflare "API Tokens" page; that stops it at once.
2. Teardown proven before setup: an empty Pages project `deletetest-platform`
   was created and deleted through the API, and the project list read back
   empty. The owner's three Workers (jericho-prices, jericho-ai-inbox,
   empty-truth-3fb0, seen in his screenshot) were never touched; the token
   has no Workers permission.
3. An empty Pages project `platform` was created (address
   platform-84i.pages.dev - Cloudflare added the suffix). Delete it with
   `DELETE /accounts/<id>/pages/projects/platform`.
4. A deploy-to-Cloudflare job in ci.yml behind the same gate as the GitHub
   Pages deploy, added alongside it. GitHub Pages stays live. The job skips
   with a warning until the owner adds the repository secrets
   CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.

Still to come: the two secrets, the Spaceship CNAMEs, the Supabase redirect
URLs for app.myplatform.trade, the front-page text.

## Rules the owner set on 2026-10-29

- A green run is not proof. Before domains or Supabase are touched, show all
  three: (1) the Cloudflare job log shows the files uploaded, not skipped;
  (2) the Cloudflare address serves the same /REVISION and front page as the
  live site; (3) the checklist passes against the Cloudflare address.
- A missing Cloudflare secret fails the job (done in the same push as this
  note); it never skips.
- The manual checklist run only tests, never publishes (no publish step, no
  Cloudflare secrets; check:deploy refuses a publish step in any other file).
- Item 54 follows the address under test (E2E_BASE_URL). Supabase Redirect
  URLs, added by the owner himself, exact entries, no wildcards:
  `https://platform-84i.pages.dev/reset.html` for the test run, and
  `https://app.myplatform.trade/reset.html` only at the domain switch.
  Nothing is added to Supabase without his say-so.

## Gate 2 finding, 2026-10-29: the checklist on the Cloudflare address

Proof 3 ran (manual run 40853784654, https://platform-84i.pages.dev) and
FAILED: 55 of 76 functions proven, 21 not.

Cause, checked from outside with curl and from Cloudflare's own page:
Cloudflare Pages redirects `/x.html` to `/x` with a 308 (its documentation:
"Pages will also redirect HTML pages to their extension-less counterparts";
it says nothing about turning that off). Measured: app.html, operator.html,
reset.html -> 308 to /app, /operator, /reset; index.html -> /. GitHub Pages
answers app.html with 200 and keeps the extension.

What that does:
- Most failures are tests waiting for a URL ending `.html` (`**/app.html`,
  `**/operator.html`, `/help\.html/`, `/index\.html\?reset=1/`,
  `register.html`) after the app has been moved to the extension-less
  address. The tests are what is wrong there, not the app: they were written
  for a host that keeps the extension. Many later tests in a serial file are
  skipped because the first one stopped.
- ONE REAL APP BUG, found by reading why Item 01 failed: `js/operator.js`
  built the invitation link with `pathname.replace('operator.html',
  'register.html')`. On Cloudflare the path is `/operator`, nothing is
  replaced, and an invitation would have pointed at the Operator page, not at
  registration. Fixed here: the pattern now accepts both; shown on both paths.
- Item 54 reached the right page (`/?reset=1`); its later assertions (new
  password works, old one does not) were not reached, so it is not proven.

Proposed, not done (needs the owner's go because it edits the checklist's
tests): make the URL expectations accept the extension-less form on every
host, in one change, without touching what each test asserts; then re-run
the checklist on the Cloudflare address.

## Owner's go and conditions, 2026-10-29 (after Gate 2)

Go to make the tests accept the address with or without `.html`, on three
conditions: (1) change only the address checks and show that no assertion was
changed or removed (done in the pull request that carries it); (2) on the
re-run Item 54 must actually run its password checks, reaching the page is not
enough; (3) never retake an approved picture without showing why first.

Also asked, AFTER the migration (not done yet): the Operator's Activity tab
picture check is wobbly (it failed once on 38c7219 and passed on 4d024c2 with
nothing touching that screen). Find exactly which rows change between runs,
show them, and cover them in tests/visual steady.css like the other moving
parts. Do not retake the reference picture. The failed run's pictures were
kept as the "pictures" artifact of run 40857388841 until about 2026-11-05.

## Proof 3, second attempt, 2026-10-29 (14:01 Brussels)

Checklist on https://platform-84i.pages.dev (manual run 40873698934, commit
5fea738, i.e. with the first address pattern from #47): **76 of 76 functions
proven**. Item 54: 6 passing (ui), so its password checks ran, not only the
page. Item 01: 1 passing (ui), which also exercises the invitation-link fix.

The owner then asked (before the domain switch) for the address pattern to be
no looser than the checks it replaced: exact by default; anything after the page
only where the old check allowed it; `index.html` must match only the site's own
root or index, never `/operator/`. Done in the following pull request, which
lists every changed check old against new. The domain switch waits for a
re-run of the checklist on Cloudflare with the tightened pattern.

Also recorded: the second opinion's parts are reviewed blind to each other
(#47: the part that held helpers/session.js was reviewed separately from the
specs that import it, hence "not exported" claims). Fix to be shown after the
migration.

## Final state (2026-10-29, Brussels time)

Both domains active (app.myplatform.trade, www.myplatform.trade). DNS 8 -> 10
records, only the two CNAMEs added. Supabase: 3 Redirect URLs and Site URL
https://app.myplatform.trade/ (owner). Checklist on the final address:
76 of 76 proven; Item 54 6 passing (ui) after the Site URL change (run
40904353833); Item 01 1 passing (ui). The scripts that named the old address
(morning report, email scan, token scan) now watch the new one, and the morning
report also checks the front page shows "Where opportunity meets discretion.".
Open: GitHub Pages switch-off (owner's decision); picture wobble; reviewer
parts; Spanish film.
