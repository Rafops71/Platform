# Function-by-function walkthrough, owner's answers (18 Nov 2026)
Format: block -> asked -> owner answered. Nothing is built until the walkthrough is done (one batch). Wording below in quotes is the owner's own.

## Block 1: getting in (items 1-3)
Asked: Operator invites by email; link works once, expires after 5 days; person registers, accepts the Terms, lands as "pending" and sees "Your registration is awaiting Operator approval. You will be able to sign in once approved."
Answered: KEEP AS IS.

## Block 2: approve / reject, who can sign in (items 4-6)
Asked: Operator presses Approve or Reject; anyone not approved is refused at sign-in; today a rejected or suspended person sees "This account is not currently active. Contact an Operator."
Answered (CHANGE): a rejected person must be told the registration was not approved: "Your registration was not approved." A suspended member (who already got a notification when suspended) who tries to sign in must see: "This account has been suspended." Spanish for both: ours to write.
To build later: login.html messages for status rejected and suspended (EN + ES); today both fall under login.blocked.

## Block 3: Terms when registering (items 7-8)
Asked: today a tick box "I have read and accept the Terms & Conditions" with a link to terms.html; refused without the tick; version and language saved.
Answered (CHANGE, owner's words): "The terms and conditions should be on the page and the tick box should be at the bottom so they confirmed that they have read the page and the terms and conditions and agree with it and agree to it."
To build later: the Terms text shown ON the register page (not only a link), the tick box at the bottom of it, confirming they read the page and the Terms and agree. Exact tick sentence: owner to choose (options offered). Item 7/8 behaviour (refused without tick; version + language recorded) stays.
Block 3 tick sentence, owner's own words (typed 18 Nov): "I have read and agree to the terms and conditions". Spanish: ours to write.

## Question raised by the owner during block 4 (for the broker design B1-B4, not decided)
"What if a trader has access to material for another producer and he functions for this particular deal as a broker, or he quit his former employment and works to own title?" Today (read in code 18 Nov): the role (Principal / Mandated intermediary / Broker; Producer or Trader for a seller) is chosen PER LISTING (listings.poster_role), not once per member. Not yet checked: whether the profile stores a member type too, and what stops a wrong role being ticked. To settle together with the broker decisions.

## Block 4: a member's own details (items 9-13)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 5: posting and managing own listings (items 14-16)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 6: Browse (items 17-21)
Asked: Browse shows other members' listings, newest first (read in code: listings.sort by created_at descending, no member choice); filters by type, commodity, region, status; never shows who posted.
Owner asked: how is it ranked, can the member sort alphabetically or by date?
Answered (CHANGE): ADD a sort choice on Browse (drop-down): Newest first (default), Oldest first, Commodity A to Z. Labels EN+ES: ours to write, shown to owner. Everything else on Browse unchanged. Saved searches must still report the same count Browse shows (item 23): sorting must not change counts.

## Block 7: saved searches and watchlist (items 22-25)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 8: enquiries and replies through the Operator (items 26-30)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 9: documents declared, activity download (items 31-36)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 10: stale listings (items 37-39)
Answered: KEEP AS IS (owner, 18 Nov). (30 days; "Is it still available?"; one-press renew by the owner only.)

## Block 11: the Operator's console (items 40-44)
Answered: KEEP AS IS (owner, 18 Nov). Tabs today: Overview, Approvals, All Listings, Invitations, Users, Commodities, Mailbox, Matches, Deals, Scorecard, Analytics, Activity Log, Help.

## Block 12: introductions, flood limit, language, emails (items 45-49)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 13: forgotten password, deleting a member, invitation-only (items 53-57)
Answered: KEEP AS IS (owner, 18 Nov).
(Items 50-52 privacy/audit prohibitions and 58-61 safety rules are invisible to members; covered next as one block.)

## Block 14: safety rules members never see (items 50-52, 58-61, 63-65)
Answered: KEEP ALL AS IS (owner, 18 Nov).

## Block 15: statements on every listing (items 66-69)
Answered: KEEP AS IS (owner, 18 Nov). Broker/role details are decided separately (B1-B4 with Opus).

## Block 16: deal files and scorecard (items 70-75)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 17: Help, welcome page, operator mail alert, film (items 76, 77, 79, 80)
Answered: KEEP AS IS (owner, 18 Nov). (Films are on hold per earlier rule.)

## Block 18: Terms receipts, Terms-change emails, recommendations (items 62, 81-88)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 19: messages with contact details, rewrite request (item 78)
Answered: KEEP AS IS, PLUS A NEW WISH (owner's words, 18 Nov): "we need a Translate button if counterparties don't speak English/Spanish or I have to mediate between a Spanish-speaking member and an English-speaking member". Details open: who translates, languages, who sees it (next block). Privacy note: sending a message's text to an outside translation service discloses it to that service.
Translate decision (owner, 18 Nov): Operator-only Translate button, using an outside machine-translation service. The Operator alone sees the translation (private aid in the mailbox); the original message is never replaced; members do not see it. To do BEFORE building: research which service is safe, cheap, and acceptable for confidential text (data handling, no training on inputs, region), show the owner the options; the SERVICE CHOICE IS THE OWNER'S. Also decide languages beyond EN/ES, and how a translated reply is sent to a member (owner to decide).

## SUMMARY: walkthrough finished (owner, 18 Nov). All 88 listed functions shown; nothing else missing.
Keep as is: items 1-3, 4-6 (apart from message change), 9-13, 14-16, 17-25 (apart from sort), 26-30, 31-36, 37-39, 40-44, 45-49, 50-52, 53-57, 58-65, 66-69, 70-75, 76-77, 79-80, 81-88, 78.
CHANGES TO BUILD (one batch, after the owner's BATCH GO):
 1. Sign-in messages (EN+ES): rejected -> "Your registration was not approved."; suspended -> "This account has been suspended." (owner's words; Spanish ours).
 2. Register page shows the Terms on the page, tick box at the bottom: "I have read and agree to the terms and conditions" (owner's words; Spanish ours). Item 7/8 behaviour unchanged.
 3. Browse sort drop-down: Newest first (default) / Oldest first / Commodity A to Z (labels ours to propose, owner to see). Saved-search counts unchanged.
 4. Operator-only Translate button (outside machine translation; service choice is the owner's after research; EN/ES plus others to decide).
OPEN, separate: broker design B1-B4 (Opus); the owner's question about a trader acting as broker on one deal / a salesman who went independent; whether the Operator is told when a member edits company/job title (owner did not ask for it).

## Translate button: service decision (owner, 19 Nov)
Owner chose: DeepL FREE plan. Told plainly (from DeepL's own privacy policy, deepl.com/en/privacy): the free version uses submitted texts to train and improve its systems (API Free by cross-reference; the paid API plan does not). Free allowance found: 500,000 characters a month (from a search result; the official support page refused my fetch, so not confirmed from the primary page). Owner's decisions, his words: "DeepL free anyway, not in terms and conditions". So: NO mention in the Terms/Help. Design: Operator-only button; translation only when the Operator presses it, never automatic; original message untouched; member never sees it.
Before building (rule 13): list preconditions with tools: DeepL API Free account and key (owner signs up; the key is stored as a secret via the credential form, never in the repo or chat), supported languages (not checked yet), the call must come from a server-side function (Supabase Edge Function), not the browser; how the Operator sends a translated reply (owner to decide).

## Translate button: route decision (owner, 19 Nov)
Owner changed route: CLOUDFLARE Workers AI translation model (m2m100-1.2b), not DeepL, after the DeepL free plan was found to train on submitted texts. Facts checked 19 Nov (Cloudflare docs): 10,000 Neurons/day free, model 31,050 Neurons per million tokens (about 1,000 average messages/day free, my arithmetic); model page: "Zero data retention: Yes"; Workers AI privacy page (via search summary, not read in full): no training on customer content. Languages: es/en shown as examples; full list not on the page; quality untested. Operator-only button; press-to-translate only; original untouched; nothing in the Terms (owner's earlier decision, still stands). Next: plan with preconditions (token scopes, where the call runs, Operator-only check, key stored as a secret), quality test on real trade sentences shown to the owner before members get anything.

## Second Translate wish: members translating listings on Browse (owner, 19 Nov)
Owner: people write posts in Spanish and in English; a member who stumbles on a proposal in the other language should be able to translate it. Today (read in code 19 Nov): listing free text (specification, price conditions, notes) is shown exactly as typed; no translate. Owner's decisions still needed: where the button sits, which fields, whether translations are saved (cache) so the free allowance is not used twice, the sentence shown with a translation (e.g. "Machine translation"), and what happens when the free allowance is used up. Listing text is already visible to all approved members; member-to-member messages stay Operator-only. Plan alongside the Operator button.

## Translate and the Terms (owner, 19 Nov, his words: "So leave the translation out of the terms, okay?")
DECISION: leave translation OUT of the Terms. Terms section 10 stays as it is. Reason he gave earlier: the translated text carries no names, and messages go anonymously through the Operator. I told him (checked in GDPR Art. 13(1)(e), text only, no case law): the law asks for "recipients or categories of recipients", not every company name; Terms s.10 p5/p6 name Supabase, Resend, GitHub Actions and say data goes only to hosting, database and email providers. Caveat given: a typed message could itself contain a name or detail.
