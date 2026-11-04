# Owner's decisions, 2026-11-01 - one batch, not yet built

Status: decided by the owner in chat, item by item. NOTHING here is built yet.
Sonnet drafts all wording (EN+ES); the owner approves every word; nothing is
pushed live until the owner writes BATCH GO. Items marked ON HOLD are not to
be built. All Terms changes go out as ONE new Terms version.

1. Replace rafael@myplatform.trade with info@myplatform.trade in all 3 places:
   Help Q17 (EN+ES, js/i18n.js help.a17), Terms s16 notices (new Terms version,
   with the parked Terms update), Operator help page (operator.html "Something is
   not working"). Q17 "the Operators" -> "the Operator". Mailbox: owner sets it up
   later with help; must receive mail before launch.

7. Intro TRAILER: the Operator is called "commercial intermediary" (owner confirmed). Terms: add dictionary sentence "When MyPlatform calls the Operator a commercial intermediary, it means a broker" (owner: yes). Welcome page + member film broker wording: ON HOLD.

2. Help "how it works" answer (Members post...): rewrite so introductions happen only
   after both parties agree on ALL issues and terms. "Operators" -> "the Operator". EN+ES. Owner approves wording.
3. Terms changes: before re-signing, members see a short "what changed" list + link to full Terms. (Owner chose.)
4. Help "New Listing" answer: "who you are" -> "your role in this offer". EN+ES. Owner approves wording.
5. Terms ONLY (NOT Help): in the procedure section on how MyPlatform proceeds, state that before
   any introduction both parties sign an NCNDA and a commission agreement. EN+ES. Owner approves wording.
6. Terms: add "Membership is built on honesty and mutual trust" (from welcome page) so it is binding.
8. Signup "I sign" choice -> two tick boxes (must pick one): "Individual capacity" with text
   "I act personally and solely on my own behalf, not for any company or employer" (owner's words),
   and "Corporate capacity" with text: "The signatory warrants that they are duly authorised to
   sign these Terms on behalf of the Company and to bind it to them." (owner chose "these Terms").
   Field label: Company name (the "Company"). Remove the separate "Company (optional)" box higher
   on the form. EN+ES; ES needs owner approval.
9. Front/welcome screen: "MyPlatform" title far too big. Use design tools (impeccable skill;
   A1 Gallery measured norms once authorised) to propose sizes; owner picks from options.
10. Terms: clear clause - physical goods with real delivery only; no derivatives (futures, options,
    cash-settled). Terms only, no listing-form change. (Owner chose.) Payment-trigger clause: owner said NO.
11. Corporate capacity: job title REQUIRED (with Company name). Individuals: no title.
12. After signing: email the member a receipt (date/time + copy of what was signed). Sonnet first checks if it exists.
13. Terms: indemnity - member pays back MyPlatform's costs caused by the member's own actions
    (e.g. side-broker vs employer). (Owner: yes.)
14. Terms: when fraud is reported, MyPlatform suspends, investigates and may remove the member. (Owner: yes.)
Decided NO: separate NDA at signup (Terms s9 + per-deal NCNDA enough); referral sentence; payment-trigger clause.
Owner's own pending (from Mistral): FCA-related document to share; a favour to ask.
15. ON HOLD (owner checking with Mistral): show BOTH sides the commission amount + who pays,
    in writing, before introduction. Reason: Hopcraft v Close Brothers [2025] UKSC 33 paras 211, 226
    ("Partial disclosure has never been enough"); fiduciary test paras 276-282.
RULE (owner, 2026-11-01): every Terms statement must be verified and fact-checked, with its source
(statute / judgment paragraph / exact file+key in the app). Add to CLAUDE.md in the batch.
Mistral memo received 2026-11-01: corrections found - Hopcraft decided 2025 (not pending), rejected Hurstanger;
"Medsted v Collins Stewart [2008]" is actually Medsted v Canaccord [2019] EWCA Civ 83 (commission disclosure).
Open questions from memo: who invites (memo says member referrals); payment timing (owner said NO earlier);
"free" wording rule for trailer/front page; "not an agent of either party"; mandate upload; employee warranties;
anti-bribery; sanctions; e-signature clause; GDPR notice (Terms s10 exists).
16. "Free" wording wherever "free" appears (trailer, front page): "Free to join and use. We are remunerated
    by a success fee, payable only when an introduction leads to a successful conclusion, as defined and
    agreed in advance in the per-deal agreement." (Owner chose, replaces earlier version.) Terms dictionary:
    "success fee" and "commission" mean the same payment. Sources: BPR 2008 regs 3 & 6; CAP Code 3.19, 3.23,
    3.24; DMA v Brazilian Nickel [2026] EWHC 833 (Ch) para 140.
    Never advertise "disinterested advice" (Hopcraft [2025] UKSC 33, fiduciary paras 276-281).
Correction logged: Medsted v Canaccord [2019] EWCA Civ 83 IS a non-circumvention damages case where commission
disclosure was the defence; broker won on appeal (Mistral right, Claude's earlier summary wrong).
PLAN (owner): the finished Terms draft gets a rigorous double-check by other AIs (e.g. Mistral) before BATCH GO; each finding checked against its source.
17. Invitations: ONLY the Operator invites (app unchanged; checked sql/rls_policies.sql invitations_insert = is_operator()). No referral sentence.
18. Success-fee timing / "successful conclusion" defined ONLY in each per-deal agreement; Terms silent on timing.
19. Terms s1: replace "may act for both sides" with "acts as an independent intermediary (broker), not as agent
    of either party". Operator must never promise to protect a side's interests or give advice.
    Source: Hopcraft [2025] UKSC 33 paras 282, 285; current text js/i18n.js terms.s1.body.
20. Terms: individual-capacity members also promise: participation breaches no employment contract or duty;
    no employer's confidential information, contacts or resources used. (Owner: B only.)
Decided NO (Mistral extras): mandate upload, anti-bribery clause, sanctions-removal clause.
21. Films: Sonnet rewrites trailer + Member walkthrough (EN+ES) + Operator walkthrough (EN) SCRIPTS together with
    the app changes (new words: commercial intermediary, success fee item 16). Recording waits until new screens
    are live and the voice is chosen; then trailer + all walkthroughs in ONE recording run.
22. Voice test: one short EN + ES sample each from VoxCPM2 (openbmb/VoxCPM2, Apache-2.0, page says "free for
    commercial use", Spanish yes) and Kokoro-82M (hexgrad/Kokoro-82M, Apache-2.0; ES voices ef_dora, em_alex,
    em_santa). Made on GitHub Actions, free. Owner listens and picks. CosyVoice3 avoided ("academic purposes only").
    No paid Google billing (owner).
33. (2026-11-03) The owner approved the English trailer (90 s, OpenMontage on a runner, drawn pictures, Gemini
    Algieba voice, his licensed music "Corporate advertising" by Nastelbom mixed in; the music file itself stays out
    of the repository, only the finished film is published). File: films/trailer-en.mp4. Place it on the front page
    (www/), at the top under the title, play on press (no autoplay).
34. (2026-11-03) The same trailer on the demo's start page, at the top above the three sign-in buttons, play on press.
35. (2026-11-03) Spanish trailer (same picture, Spanish texts, Kokoro ef_dora voice, his licensed music mixed in):
    films/trailer-es.mp4. On the front page and the demo start page, a visitor who switches to ES sees the Spanish
    trailer in place of the English one, in the same place, play on press.
36. (2026-11-04) The Operator never requests, sees or records any document or claim about documents: remove the Operator's
    Document Requests tab, the document columns in Deals and Scorecard, and the members' Documents tab. Members still declare
    documents on their listings. (Live: 0 document requests, 0 deals.)
37. (2026-11-04) Terms 3.5: replace the sentence saying the Operators record whether documents matched or were genuine with the
    owner's wording in docs/films-2026-11/terms-3-5.md (EN approved; ES translation by the supervisor).
38. (2026-11-04) Forward with editing: the Operator edits the message before forwarding; emails, phone numbers, websites and
    LinkedIn/social links are highlighted in red automatically; the receiver gets only the edited text; the original is kept
    privately in the Activity Log.
39. (2026-11-04) The Operator gets an email for each new member message ("New message awaiting review" and a console link),
    never the message content.
40. (2026-11-04) Walkthrough films: Member EN + ES (about 2 min), Operator EN (about 3 min), Google voice, scripts and scene
    plans in docs/films-2026-11/. The owner approved scripts and scenes and delegated the rest without further approval.
41. (2026-11-04) The approved Member walkthrough film on the app's sign-in page (app.myplatform.trade), BELOW the sign-in
    box, play on press: English when the page is English (films/walkthrough-member-en.mp4), Spanish when it is Spanish
    (films/walkthrough-member-es.mp4). The Operator film (films/walkthrough-operator-en.mp4) is NOT on the public page.
