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
