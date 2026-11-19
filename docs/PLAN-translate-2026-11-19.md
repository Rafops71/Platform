# Plan: the Operator-only Translate button (Cloudflare Workers AI, m2m100-1.2b)

Written 19 Nov 2026 by Builder 3. **Plan only: nothing is built, nothing is created anywhere, no secret exists.**
Owner's decisions (his words, `docs/WALKTHROUGH-2026-11-18.md`, branch `claude/great-allen-5xl0gm`, end of file): Operator
console only; the Operator presses it, never automatic; the original message is never replaced; members never see the
translation; nothing about it in the Terms or Help; English and Spanish at least; route changed to Cloudflare Workers AI
on 19 Nov because the DeepL free plan trains on submitted text.

Every fact below is marked **[checked]** (read with a tool in this session, source named), **[assumption]** (my
arithmetic or inference, shown) or **[not checked]** (could not be checked from here, and what would settle it).

## 0. One thing the owner must decide first (it is not a technical point)
The Terms, section 10, say message content "is disclosed only to the service providers used to run the Platform itself -
hosting, database, and email delivery, named in the next paragraph", and the next paragraph names **Supabase, Resend and
GitHub Actions** [checked: `js/i18n.js` keys `terms.s10.p5` and `terms.s10.p6`, read 19 Nov]. Sending a message's text to
Cloudflare's translation service is a disclosure to a provider that is **not named there**. The owner has decided the
Terms say nothing about the button. I am not deciding that again; I am only putting the sentence next to the decision so
that he chooses it knowingly. Options for him: (a) leave the Terms as they are (his decision of 19 Nov); (b) add Cloudflare
to the named providers when the button goes live. Cloudflare's own side [checked]: Workers AI keeps no inputs or outputs
for ordinary (synchronous) requests and does not train on them (`developers.cloudflare.com/workers-ai/platform/data-usage/`,
"Last updated Oct 16, 2026"); the model page says "Zero data retention: Yes". That page says storage can happen with
batch/asynchronous features, so the plan uses the **synchronous** call only (never `queueRequest` / batch).

## 1. How the call works, end to end
```
Operator console (operator.html, js/operator.js)
  presses "Translate" on one message
    -> POST https://<staging or live project>.supabase.co/functions/v1/operator-translate
       headers: apikey, Authorization: Bearer <the Operator's session token>   (same as operator-recovery-link)
       body: { "text": "...", "target_lang": "en" | "es", "source_lang": "en" | "es" }
  Supabase Edge Function "operator-translate" (verify_jwt true)
    1. who is asking (auth.getUser with the token)            -> 401 if not signed in
    2. is it an approved Operator (profiles.role/status)      -> 403 otherwise
    3. checks: text 1..3,000 characters, languages in the allow-list, daily cap not reached
    4. POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/meta/m2m100-1.2b
       Authorization: Bearer <Cloudflare token, an Edge Function secret>
       body: { "text": ..., "source_lang": ..., "target_lang": ... }
    5. returns { "translated_text": "..." } to the browser
  The browser shows it under the original, in the page only. Nothing is written to the database.
```
Request shape and example [checked]: model page `developers.cloudflare.com/workers-ai/models/m2m100-1.2b/` gives
`curl .../accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/meta/m2m100-1.2b -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
-d '{ "text": ..., "source_lang": "english", "target_lang": "french" }'`; parameters `text` (required, min length 1),
`source_lang` (default `en`), `target_lang` (required). The output field is `translated_text` [checked: Cloudflare's
notebook tutorial example `result["translated_text"]`]. The docs mix codes (`'en'`, `'es'` in the parameter text) and
names (`"english"` in the examples): the quality test (section 5) must try the codes first, because the parameter text says
codes [not checked by a real call].

### Where the call runs: the two routes, and why I recommend the first
| | A. Supabase Edge Function (recommended) | B. Cloudflare Pages Function with an AI binding |
|---|---|---|
| Operator-only check | Copy of `supabase/functions/operator-recovery-link/index.ts` (read 19 Nov): `auth.getUser(token)` then the profiles lookup, same 401/403. Proven pattern, already deployed: **staging** has `operator-recovery-link` v1, `verify_jwt` true (Supabase `list_edge_functions` on the staging project, 19 Nov, checked); live has it per the handover (not re-listed today). | New code: verify a Supabase JWT in a Pages Function and query the profile with the caller's token. No such code exists in the repository (no `functions/` directory, no wrangler config; the site is published with `wrangler pages deploy dist` from `.github/workflows/ci.yml`, built by `scripts/assemble-site.sh`). |
| Cloudflare credential | Needs an API token and account id stored as Edge Function secrets. | No token: a "Workers AI" binding. Docs say it is added in the dashboard under the Pages project's Settings > Bindings > Add > Workers AI [checked: `developers.cloudflare.com/pages/functions/bindings/`]. |
| Extra work | None to the site build. Deploy the function to staging and live (the 17 Nov plan describes the route used for the first one). | Add a `functions/` folder and teach `assemble-site.sh`/the deploy step to ship it: **[not checked]** whether `wrangler pages deploy dist` picks up a `functions` folder from the repository root in that job. Local testing with the binding "will incur usage charges" [checked, same page]. |
| Supabase limits [checked: `supabase.com/docs/guides/functions/limits`] | Free plan: 150 s wall clock, 2 s CPU (async waits do not count), 256 MB memory. A translation call is well inside this. | n/a |
Recommendation: **A**. It reuses the one server-side pattern this project already trusts, and the only cost is one secret.
B avoids storing a token but adds a second place where an Operator check must be written correctly. If the owner prefers
no token at all, B is possible but needs the open question above answered first.

## 2. Operator-only, and what is (not) kept
- Same rule as the recovery-link function: `verify_jwt` on, **then** the function itself looks up the caller's profile and
  refuses anyone who is not `role = 'operator'` and `status = 'approved'`. A signed-in member gets **403** with the same
  words as "no profile" so probing learns nothing; no token gets 401 [checked in the existing code, to be copied].
- The request carries **only** the text, the two language codes. No member name, no profile id, no message id, no listing
  reference. The function does not receive the sender's identity at all.
- **No logging of message text**: no `console.log` of the body or the result, no error message that echoes the text.
  Supabase keeps Edge Function logs; I have **not checked** how long or whether request bodies appear in them (they do not
  unless the code prints them). The code must print nothing but a status and a character count.
- **Nothing stored.** The translation lives only in the browser page until it is closed. This is also what makes "no member
  can read it" true by construction (section 8).
- Optional, owner's call: one activity-log row per use (`message_translated`, with languages and character count only).
  It would need `record_activity()` to accept the new name (a migration, like 051 and 068) and would let him see how often
  it is used. I recommend **not** logging in version 1 and only keeping the counter in section 6.

## 3. What the owner must provide, and how it is stored
1. **A Cloudflare account id.** Cloudflare's REST-API page says "For **Get Account ID**, copy the value for **Account ID**"
   from the Workers AI page [checked: `developers.cloudflare.com/workers-ai/get-started/rest-api/`, 19 Nov].
2. **A Cloudflare API token** with the permissions that page names: "`Workers AI - Read` and `Workers AI - Edit`". The page's
   route is: Workers AI page > **Use REST API** > **Create a Workers AI API Token** [checked on that page as written
   today]. **[not checked]** that these menu names are what his dashboard shows; the safe way is for him to send a
   screenshot of the page before he clicks, and to use the page's own template. A narrower token (only those two
   permissions, no other account rights) is better than a broad one.
3. **Where each is stored:** as Supabase **Edge Function secrets** on the project the function runs in (one on staging, one on
   live), names `CF_ACCOUNT_ID` and `CF_AI_TOKEN`. Supabase's page says: "Open Edge Function Secrets in the Dashboard",
   enter Key and Value, Save; or `supabase secrets set NAME=value`; a function "reads a new secret immediately" with no
   redeploy [checked: `supabase.com/docs/guides/functions/secrets`]. They are never in the repository, never in chat, never
   in a GitHub secret (the function reads them at run time, not CI). The project's `request_credential` form stores keys for
   a host on a *session's* environment, not as Supabase Edge Function secrets, so it is **not** the route for this; the
   owner enters the two values himself in Supabase's secrets page. He can use the same token on staging and live or two
   tokens (two is cleaner: a leak of the staging one cannot spend live allowance).
4. Nothing else. No DeepL account, no card, no other vendor.

## 4. Languages
- The model takes `source_lang` and `target_lang`; the docs' examples use `'en'` and `'es'` [checked]. **The page does not
  list the supported codes** and I could not read the schema files it links [checked: page says no list]. The underlying
  M2M100 is described as many-to-many over 100 languages in its own project (`facebookresearch/fairseq/examples/m2m_100`,
  linked from the model page), which I have **not** read.
- **Source language is known, not detected, in version 1.** Every member has `profiles.language` ('en' or 'es', set at
  registration and changeable; `sql/008`). The Operator console would offer one control next to the button:
  "Translate to: English / Spanish", defaulting to the opposite of the sender's language, and the function receives both
  codes. If a Spanish speaker writes in English, the Operator flips the control. There is no auto-detection (it would be a
  second model call and a second guess).
- **Other languages:** the function accepts only an allow-list (`en`, `es`) and returns **400** for anything else. A third
  language is added by adding one line to the allow-list **after** the owner has judged a test of that language (section 5).
  I do not claim any language beyond EN/ES works.
- The Operator console stays English (owner's rule), so the control's labels are English only and need no Spanish.

## 5. Quality test, to run once the token exists (the owner judges)
Run from the function with fixed sentences; show each source, the machine output, and (for the owner) nothing else.
English -> Spanish:
1. We can offer 5,000 metric tons of Thermal Coal, CIF Rotterdam, shipment in March.
2. Please confirm that the quality certificate is issued by an independent inspector.
3. The price is firm for 48 hours, subject to our final confirmation.
4. Payment by irrevocable letter of credit at sight, confirmed by a first-class bank.
5. The vessel will arrive at the load port on 12 December; please send the shipping instructions.
Spanish -> English:
6. Podemos ofrecer 5.000 toneladas métricas de concentrado de cobre, FOB Callao, embarque en marzo.
7. Necesitamos el certificado de origen y el análisis de laboratorio antes de la inspección.
8. El precio es negociable si el comprador acepta un contrato anual.
9. Le ruego que confirme si la mercancía está disponible y si el título es libre de gravámenes.
10. No podemos aceptar el pago a noventa días sin una garantía bancaria.
Check also: numbers, decimal comma vs point (5.000 vs 5,000), units, Incoterms (CIF, FOB) and product names are kept, not
"translated"; a sentence with an email address or phone number (does it survive untouched?); a 2,500-character message
(is it cut off?). The owner decides whether it is good enough; I will not call it good.

## 6. Cost and the hard stop
[checked: `developers.cloudflare.com/workers-ai/platform/pricing/`, 19 Nov]
- **Free:** 10,000 Neurons per day, resetting at 00:00 UTC. The model costs **31,050 Neurons per million input tokens**
  ($0.342 per million input tokens and the same for output). Paid price beyond free: $0.011 per 1,000 Neurons.
- **What happens past the free amount:** on the **Workers Free** plan the page lists the price as "N/A - Upgrade to Workers
  Paid" and says that past the limit "further operations will fail with an error": a **hard stop**. On **Workers Paid** the
  extra use is **billed**, not blocked. **[not checked]: which plan the owner's Cloudflare account is on** (the Cloudflare
  tool available here cannot show it). If it is on the free plan, Cloudflare itself stops at 10,000 Neurons.
- **Arithmetic** [assumption: about 1.3 tokens per English or Spanish word; M2M100's real tokenisation is **not checked**]:
  a 100-word message is about 130 tokens in and 130 out = 260 tokens, so 260 x 31,050 / 1,000,000 = **8.1 Neurons**.
  10,000 Neurons is then about **1,200 such messages a day**. A 500-word message (650 + 650 = 1,300 tokens) is about 40
  Neurons, so about **250 a day**. (If output tokens are counted at the same rate, as the price table suggests: the
  Neuron rate for **output** tokens was not shown on the page I read, only the dollar rate [checked].)
- **Our own hard stop, so it does not depend on the plan:** a per-call limit of 3,000 characters and a per-day limit of, say,
  150 calls, kept in a tiny table the function updates (needs a migration, number from `sql/NEXT` at the time, with the
  `applied-probe` line, revert and test). Worst case: 150 x (3,000 chars is about 750 tokens in and up to about 900 out =
  1,650 tokens x 31,050 / 1e6 = about 51 Neurons) = about 7,700 Neurons, inside the 10,000 free. The two limits are the
  owner's to set; they are stated here so the arithmetic can be redone. Rate limit [checked: `.../platform/limits/`]: translation
  models allow **720 requests per minute**, which is not a constraint for one Operator.

## 7. Preconditions (rule 13)
| # | Precondition | Checked how | Result |
|---|---|---|---|
| 1 | An Operator-check pattern exists and is deployed | read `supabase/functions/operator-recovery-link/index.ts`; Supabase `list_edge_functions` on staging | **Yes** on staging (v1, `verify_jwt` true, listed 19 Nov); live per the handover, not re-listed today. |
| 2 | The browser can call an Edge Function with the Operator's token | `js/operator.js` `makeRecoveryLink()` does exactly that | **Yes**, no CSP or connect-src rule found (grep of html files and `_headers`). |
| 3 | The model, parameters and output field | Cloudflare docs pages above | **Yes** for `text`, `source_lang`, `target_lang`, `translated_text`; **no** complete language list. |
| 4 | The call works with the owner's account | needs the token | **Not checkable yet.** |
| 5 | Token permissions and where to click | REST-API page | Permissions **yes**; dashboard path as the page words it, **not confirmed in his dashboard**. |
| 6 | Secrets can be set on an Edge Function without a redeploy | Supabase secrets page | **Yes** (page quoted above); **not checked** that his dashboard looks the same. |
| 7 | Edge Function limits suit the call | Supabase limits page | **Yes** (150 s wall, 2 s CPU). |
| 8 | Cloudflare plan (free or paid) | cannot be read from here | **Not checked.** Decides whether Cloudflare itself stops at 10,000 Neurons. |
| 9 | No data retention, no training | Cloudflare data-usage page (updated Oct 16, 2026) | **Yes for synchronous calls**; the page notes batch/async can store, so none is used. |
| 10 | The Terms allow it | `terms.s10.p5`, `terms.s10.p6` | **Conflict with the wording as written** (section 0). The owner's decision. |
| 11 | A migration number is free if a usage table is added | `sql/NEXT` | reads `069` today; reserve with `npm run migration:next` at build time. |
| 12 | Staging can test the 401/403 properties | staging already runs an Edge Function (item 1); the new function would be deployed there first | Needs the deploy step (the owner's yes, as on 17 Nov). The Cloudflare call itself would use a staging token. |
| 13 | Operator console place for the button | `operator.html` Forward window and mailbox rows (item 78 area) | Exists; exact placement is a design choice to show the owner before building. |

## 8. How the two properties would be proven (a test, not my judgement)
**Operator-only** (run on staging, in CI, **no Cloudflare token needed**, because the checks come first):
- no `Authorization` header -> **401**;
- a signed-in **member's** token -> **403**, and the response body is the same as for "no profile";
- a **pending** or **suspended** Operator -> **403**;
- an approved Operator with an empty text, a 3,001-character text, or language `fr` -> **400**, and **no call is made** to
  Cloudflare (the function is written so the check fails before the fetch);
- the console: `app.html` and `js/app.js` contain no Translate control (static check, as the Item 78 reconcile box test does),
  and a member signed in on `app.html` has no `[data-translate]` element anywhere.
**No member can read the translation:**
- by construction nothing is stored, and a test proves it: after an Operator translates a message with a unique sentence,
  a query across **every** public table for that sentence and its translation finds **zero** rows (the same shape as the
  existing "nothing leaked" scans), and the sender's Mailbox and notifications do not contain it;
- the original message row is byte-identical before and after (the original is never replaced);
- the `message_forward_log` and `activity_log` row counts are unchanged by a translation (unless the owner chooses the
  optional log row).
**What CI cannot prove:** that the translation is correct, and that the Cloudflare call works with a real token. The first
is the owner's judgement (section 5); the second is a manual run once the token exists. Until then the success path is
"written, not yet run".

## 9. What I need from the owner, in order
1. Section 0: leave the Terms as decided, or name Cloudflare there (his choice).
2. Route A (Edge Function) or route B (Pages Function). I recommend A.
3. Daily cap and per-call cap (my suggestion: 150 calls, 3,000 characters), and whether to log use (my suggestion: no).
4. When he is ready: the Cloudflare account id and a token, entered by him into the Supabase secrets page (never in chat).
5. A look at where the button sits (a mockup, as for "Please reconcile"), and the result of the quality test.
How a translated **reply** is sent to a member is still **his decision** (open since 18 Nov) and is not part of this plan.
