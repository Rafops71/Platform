# Plan: the Operator-only Translate button (Cloudflare Workers AI, m2m100-1.2b)

Written 19 Nov 2026 by Builder 3. **Plan only: nothing is built, nothing is created anywhere, no secret exists.**
Owner's decisions (his words, `docs/WALKTHROUGH-2026-11-18.md`, branch `claude/great-allen-5xl0gm`, end of file): Operator
console only; the Operator presses it, never automatic; the original message is never replaced; members never see the
translation; nothing about it in the Terms or Help; English and Spanish at least; route changed to Cloudflare Workers AI
on 19 Nov because the DeepL free plan trains on submitted text.

**Two uses, kept apart:** (1) the Operator translates a *message* (sections 1-9); (2) a member translates a *listing's free
text* on Browse and My Listings (section 10, added the same day at the owner's request). They are separate Edge Functions
on purpose: the member path can never carry free text and can never reach a message.

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

## 9. What I need from the owner, in order (for the Operator button; section 10 has its own list)
1. Section 0: leave the Terms as decided, or name Cloudflare there (his choice).
2. Route A (Edge Function) or route B (Pages Function). I recommend A.
3. Daily cap and per-call cap (my suggestion: 150 calls, 3,000 characters), and whether to log use (my suggestion: no).
4. When he is ready: the Cloudflare account id and a token, entered by him into the Supabase secrets page (never in chat).
5. A look at where the button sits (a mockup, as for "Please reconcile"), and the result of the quality test.
How a translated **reply** is sent to a member is still **his decision** (open since 18 Nov) and is not part of this plan.

## 10. Second use: a member translates a listing's free text (owner, 19 Nov)
Owner's wish [`docs/WALKTHROUGH-2026-11-18.md`, end]: people post in Spanish and English; a member who finds a proposal in the
other language can translate it. Which fields: the three free-text fields Browse shows today, `specification`,
`price_conditions`, `notes` [checked: `js/app.js` lines 708-710 render them verbatim; `get_public_listings()` in
`sql/064_dated_statements.sql` returns them]. Not translated: commodity, quantity, unit, Incoterm, region, status (they are
already in the member's language or are codes), and the statements line.

### 10a. Where a member's press calls: a SEPARATE function that takes a listing id and nothing else
- **New Edge Function `translate-listing`** (`verify_jwt` true), **not** the Operator function. Request body: `{ "listing_id": "<uuid>", "target_lang": "en" | "es" }`.
  It accepts **no text at all**: any other field is ignored, and a `text` field is rejected (400). So it cannot be used as a
  free translator, and it cannot be pointed at a message (messages have a different table and the function never reads it).
- **Who may use it:** the same people who may read Browse today. `get_public_listings()` refuses anyone who is not an
  **approved** profile and, for members (not Operators), anyone who has **not accepted the current Terms** [checked:
  `sql/064_dated_statements.sql` lines 194-208]. The new path must refuse the same people for the same reasons.
- **How the function gets the text without a second copy of those rules:** a new SQL function
  `get_listing_texts(p_listing_id uuid)` (security definer, executable by `authenticated` only) with **exactly the gates of
  `get_public_listings()`** (approved; current Terms for members) and the same visibility (`status <> 'archived'`), returning
  only `specification`, `price_conditions`, `notes` and `updated_at` for that one listing. The Edge Function calls it **with the
  caller's own token** (so `auth.uid()` is the member), and so the database, not TypeScript, decides who may read what. Needed
  because members cannot select other members' listings directly [checked: policy `listings_select` in
  `sql/rls_policies.sql` allows only the owner or an Operator]. A member's **own** listing (My Listings) is readable by the
  same function.
- **Per-member limit:** a counter table `member_translate_usage(profile_id, hour, calls)` (count only; **never** which
  listing), e.g. 30 uncached translations per member per hour (owner's number). Over it: **429**, a friendly line, no call.
  Storing "which member asked for which listing" is deliberately avoided: it would record who was interested in what, which
  is the kind of trail this platform exists not to leave. [design choice, owner may overrule]
- **Input limits:** the three fields have **no length limit** today [checked: `app.html` textareas have no `maxlength`; no DB
  check found for them in `sql/`]. The function would translate at most 2,000 characters per field and refuse longer text
  with a clear line (owner's number; the arithmetic is in 10c).
- **Source language:** not stored per listing and not reliably the poster's profile language (and showing the poster's
  language on Browse would narrow who posted it, against "never shows who posted"). Options: (i) always translate **into
  the viewer's language**, assuming the source is the other of English/Spanish; (ii) add a tiny word-list check in the
  function ("does this look English or Spanish?") so a text already in the viewer's language is not sent at all. I recommend
  (i)+(ii); the word-list is a guess that the quality test must try on real listing text [not checked].

### 10b. Cache: one translation per listing, field and language
- **Table** `listing_translations(listing_id uuid references public.listings(id) on delete cascade, field text, target_lang text,
  source_hash text, translated_text text, created_at timestamptz, primary key (listing_id, field, target_lang))`. RLS on, **no
  policy for members**; written only by the Edge Function (service role); read only through a security-definer function with
  the same gates as `get_public_listings()` (or by the Edge Function itself after `get_listing_texts` has passed). A member
  never selects the table.
- **Stale translations cannot show:** the row keeps a hash of the source text it translated. If the poster edits the field, the
  hash differs, the old row is ignored and overwritten on the next press (primary key = upsert; no orphan rows).
- **When the listing goes away:** members delete a listing for real (`js/app.js` line 310 `listings ... delete()`), and the
  foreign key `on delete cascade` removes its translations, as it already does for `document_checklist` [checked:
  `sql/schema.sql` lines 110, 136, 193]. An archived listing: the read gate refuses it, so its cached text is not served.
- **Who may read a cached translation:** exactly who may read the original: approved members with the current Terms, and
  Operators. It is derived from text those people can already read, so it adds no new disclosure to members.
- **The Operator can see them too** (for support). Members never see another member's request: the cache holds no requester.
- A migration (number from `sql/NEXT` at build time, `applied-probe`, revert, SQL test) would add the two tables and
  `get_listing_texts`. It is **additive only**.

### 10c. Cost and the free allowance (shared with the Operator button)
- Same pool: Workers AI's 10,000 Neurons per day [checked, section 6] is **one allowance for both uses**. Member use can use up
  what the Operator button needs. I recommend **reserving** part of it: the member path stops at a daily cap of its own (e.g.
  6,000 Neurons' worth of calls, kept in the counter table), so the Operator button always has headroom. The cap is the
  owner's number.
- Arithmetic [assumption, same 1.3 tokens per word as section 6; real tokenisation not checked]: one listing, three fields,
  about 70 words in total = about 90 tokens in and 90 out = 180 tokens = **about 5.6 Neurons**. About **1,800 listings a day**
  would fit in the free allowance, and **each listing and language is paid for once**, thanks to the cache. The worst case,
  three fields of 2,000 characters (about 1,500 tokens each way) = about 9,000 tokens = about **280 Neurons** for one listing,
  so a few such listings use up a day; that is why the per-field cap exists.
- **When the allowance is used up:** on the Workers Free plan Cloudflare itself returns an error [checked, section 6]; the
  function turns any Cloudflare error into **503** and the member sees a short line (owner's wording; option: "Translation is
  not available right now. Please try again later."), the original text stays as it is, and **cached translations still work**
  (no Cloudflare call). On a paid plan Cloudflare bills instead; our own daily cap is what keeps the cost bounded. **[not
  checked]: which plan the owner's account is on.**

### 10d. What the member sees, and how they get the original back
Placement (owner chooses; the mockup comes first, as for "Please reconcile"): one small link or button on each listing that has
free text, shown only when it is not already in the member's language where the check (ii) can tell. Text of the label
options, **for the owner to choose, I am not choosing**:
| Where | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| The button | Translate | Translate to English / Translate to Spanish (follows the viewer's language) | Show in English / Show in Spanish |
| The label next to a translation | Machine translation | Machine translation, may contain errors | Automatically translated |
| Back to the original | Show original | Show original text | Original |
Spanish versions of whichever he picks are mine to write. **How the original comes back:** the translation is shown **beneath**
the original, not instead of it, so the original is always visible; one press hides the translation again ("Show original" =
hide the translation). I recommend beneath, because these fields carry trade terms (quality, price conditions) where a
mistranslation must never silently replace what the poster wrote. If he prefers "replace in place", the link flips back.
The translation is **never** stored on the listing and the poster does not see that anyone translated it.

### 10e. Keeping the two uses apart (a member must never translate private messages)
- Different functions, different inputs: the member function takes a **listing id** and reads the three fields itself; the
  Operator function takes text but requires an approved **Operator** token. Neither function reads the `messages` table.
- The member function has **no way to name a message**: no `message_id`, no free text. A test sends a message's text and a
  message id and expects 400.
- The cache table holds listing text only; there is no table or column for message translations at all (section 2: nothing stored).

### 10f. Preconditions for the member use (rule 13)
| # | Precondition | Checked how | Result |
|---|---|---|---|
| M1 | What Browse shows and who may call it | `sql/064_dated_statements.sql` `get_public_listings()` | The three fields are returned; the gates are "approved" and "current Terms (members)"; archived hidden. **Yes.** |
| M2 | Members cannot read other listings directly | `listings_select` policy in `sql/rls_policies.sql` | **Right**: owner or Operator only, so a new definer function is needed. |
| M3 | Field length limits | `app.html` textareas, grep of `sql/` | **None found**: a cap must be added in the function. |
| M4 | A listing delete removes dependants | `js/app.js` line 310, FKs in `sql/schema.sql` | **Yes** (`on delete cascade` pattern exists). |
| M5 | Per-member rate-limit pattern | `sql/016_rate_limits.sql` (messages, listings) | Exists for inserts; the counter table here is new. |
| M6 | Operator and member functions can be kept separate | repo | Yes: a second Edge Function directory. Deploy to staging and live needs the owner's yes, as on 17 Nov. |
| M7 | A migration number is free | `sql/NEXT` | reads `069`; reserve at build time. |
| M8 | The quality of listing-text translation (abbreviations, trade shorthand, "FOB Callao") | needs the token | **Not checkable yet.** Section 5's sentences plus 5 real listing texts. |
| M9 | The word-list language check works | not built | **Not checked.** |
| M10 | Terms: the text is member-visible, but still goes to a provider not named in `terms.s10.p6` | same as section 0 | The owner's decision applies to this use too. |

### 10g. Tests for the member use (what CI can and cannot prove)
Without a Cloudflare token (checks come first): no token 401; a **pending / rejected / suspended** member 403; a member who
has **not accepted the current Terms** 403 (same as Browse); an **archived** or unknown listing 404; a request with `text` or
`message_id` 400; a language other than en/es 400; a member over the hourly limit 429, and **no upstream call** in any of
these cases. **With** a staging token (a handful of calls, tens of Neurons per run): the first press calls Cloudflare and
stores one row; a second press returns the same text and the call counter does not move; editing the listing's text makes the
next press translate again; deleting the listing removes the cache rows; a second member gets the cached text; the poster's
listing row and the Browse list are unchanged by it; no table holds the requesting member (scan for the member's id in the new
tables finds nothing). And the separation: the member function cannot be made to translate a message's text. The quality of the
translation is the owner's judgement, not a test.

### 10h. What I need from the owner for this use
1. Where the button sits (a mockup first) and the wording from 10d (button, label, back-to-original).
2. Beneath the original (my recommendation) or in place of it.
3. The numbers: per-member hourly limit (my suggestion 30), per-field length (2,000), and the share of the daily allowance the
   member path may use (my suggestion 6,000 of 10,000 Neurons).
4. The message shown when translation is unavailable (10c).
5. Whether the Operator may also use the listing translation (my recommendation: yes, through the same function, no extra work).
