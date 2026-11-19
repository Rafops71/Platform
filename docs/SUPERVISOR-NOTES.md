# Owner's change list (started 2026-11-01) — one bulk batch for Sonnet

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
23. Company/capacity (owner, replaces item 8's "remove the Company (optional) box", which is on the PROFILE page, not sign-up):
    capacity + company marked at signing; Profile company/job title stay editable when things change; NO re-sign on
    profile change. Each new listing still asks the role in that offer (exists: stmt.role.*). So asked twice: signing + each post.
24. CLARIFIED (owner): item 16 "free / success fee / successful conclusion" wording is for the TRAILER/marketing only.
    In the Terms everything stays plainly "broker"/"brokering" and "commission". Terms s1 "free of charge ... paid by
    commission" stays. Dictionary line (success fee = commission; commercial intermediary = broker) still ties trailer to Terms.
    Sonnet found: the word "free" appears nowhere in the trailer, front page or films today.
25. Trailer: ADD closing card + one spoken line with the item-16 sentence (EN; ES = Sonnet's draft, owner to approve).
26. Terms s8: replace "may act for, and receive commission from, both sides" with "may be paid commission by either or
    both parties". 24-month non-circumvention protection in s8 STAYS.
27. Item 14 wording REPLACED (owner): "When fraud is reported, MyPlatform may suspend the member concerned while it reviews
    the report, and may remove them. MyPlatform does not decide disputes between members and does not disclose the reasons
    for its decisions to other members." Sources: Braganza v BP Shipping [2015] UKSC 17 paras 20, 24, 27, 30 (discretion
    not arbitrary, consider relevant matters, good faith; application to termination rights NOT verified);
    Defamation Act 2013 ss.1(1), 2(1). Fits Terms s12 (disputes) and s13.
28. Indemnity (item 13) says "including legal costs". Privacy s10.p10 address also -> info@ (and e2e test + business-update.js default follow).
    Terms also add "Each member stands behind their own posts and statements." with item 6.
29. Spanish terms (owner delegated to Claude; chosen by checked sources + consistency with the existing approved ES Terms):
    broker = "corredor" (already used in ES terms.s1.body "corredores e intermediarios"; DPEJ "contrato de mediacion o corretaje");
    success fee = "comisión de éxito" (DPEJ: mediator paid "prima o comisión"; dictionary line ties it to "comisión");
    commercial intermediary = "intermediario comercial" (matches existing "intermediarios");
    capacity boxes = "A título personal" (already in sign.capacity.individual ES) and "En nombre y representación de la Empresa"
    (standard legal Spanish for acting for a company). Native-Spanish read-through still recommended before BATCH GO.
30. Front page (www/index.html .title): font-size clamp(48px,11vw,96px) -> clamp(40px, 8vw, 68px). Owner chose A.

=== TABLED (owner, 29 Oct 2026) ===
- Terms: "no account sharing" sentence (starred)
- Operator alerts for unusual sign-ins (starred)
- Separate test/staging database
- Make the repo private
- Longer trailer
- Front-page cards
- App look redesign
- Paperwork brainstorm (other chat)
=== PARKED (1 Nov 2026) ===
- Full new Terms 3.5 (draft in repo docs/DRAFT-terms-3.5.md, NOT applied; item 15 on hold)
- "Operators" plural in ~60-62 strings (js/i18n.js) - owner's wording decision
- Receipt email after signing (item 12)
- Broker wording on welcome page + walkthroughs
- info@myplatform.trade mailbox setup (must exist before launch)
- Scheduled email sender can mail e2e test addresses during tests (race found by Sonnet on PR #65)
- Corporate job title enforced in browser only, not in database
- Demo mode for testers: REVIVED 3 Nov (BATCH GO), Haiku building it
RULE (owner, 2 Nov): never send or show the owner Spanish films/texts; he does not read Spanish. English only to him.
TRAILER REDO (owner, 2 Nov): look = 3 'App colours' (white #fff, text #15202b, accent blue #27618f, tints from css/styles.css). Voice 10-20% slower. Remove 'How legitimate is the counterparty?'. Narration/name/structure: still to choose (ChatGPT vs Grok proposals). ON HOLD until owner decides the rest.
TRAILER naming (owner, 2 Nov, to confirm): 'the Operator' = the platform's connector while members talk anonymously; becomes the 'commercial intermediary' once both parties agree all procedures and decide to go to the next level (introduction). Never 'checks'.
TRAILER line (owner, 2 Nov, final): "All communication passes through the Operator. Introduction follows only once both sides agree on the essential terms and wish to proceed."
31. (owner agreed 2 Nov) Operator 'Document Requests': relabel status 'confirmed' to a neutral wording (e.g. 'available, per member'); owner approves the exact words. Platform never receives documents (verified: no upload/attachment anywhere in the app).
32. (owner agreed 2 Nov) Terms/Help line: "Do not send documents to MyPlatform; documents are exchanged between the parties after introduction." Owner approves the exact words.
TRAILER TODAY (owner 2 Nov): EN voice = Google (Gemini); ES = Chatterbox; both slower at the researched ideal pace; fill visuals if they run short; speed samples first.
RULE (owner, 2 Nov): always give times in Brussels time (Nov = UTC+1).
TRAILER speed (owner, 2 Nov): B = ~130 wpm (Gemini Algieba slowed 7%, atempo 0.93). Spanish: Chatterbox ~131 wpm measured, or Kokoro - owner's choice still open.
TRAILER v7 APPROVED (owner 2 Nov): mixed text (7 parts, ~145 words), Gemini Algieba EN at B (~130 wpm), app colours, text + real app recordings + simple Operator diagram. Email EN to owner when done.
TRAILER v8 (owner 2 Nov): success-fee = option 2 'Free to join. We are paid a success fee only when an introduction leads to a concluded deal.' on a card at the END during the closing, NOT spoken; >=6 s, dark on white. Sources CAP 3.9/3.10/3.23/3.24; ASA Omnipod 2024.
WALKTHROUGHS redo (owner 2 Nov): too slow/tedious, should be a brisk walkthrough. Voice: EN (Member, Operator) = Gemini Algieba at natural ~140 wpm (no slowing); ES Member = Kokoro at ~140 wpm. Shorter holds per screen.
STORYBOARD v9 TEXT REVIEW (owner, 3 Nov):
Act 1 voice (final): "MyPlatform is a private marketplace to trade physical commodities. By invitation only."
Act 1 screen: "MyPlatform" title, then "Physical commodities. By invitation only."
Act 2 voice: "In commodity trading, counterparties are often difficult to identify. Disclosing your position too early can weaken your commercial leverage."
Act 2 screen: "The counterparty." then "Too early."
Act 3 voice: keep "Members post buying and selling opportunities with the key details: commodity, quantity, origin and Incoterm."
Act 3 screen: "Commodity · Quantity · Origin · Incoterms" (clean new full-frame app capture needed)
Act 4: keep voice and screen as storyboard v9.
Act 3 voice amended: "...commodity, quantity, origin and Incoterms."
Act 5 voice: "All communication passes through the Operator, who relays every message between the two sides." Screen: "Through the Operator."
REMINDER after Q&A (owner): introduce the ROLE of the Operator somewhere in the trailer.
Act 6 voice: "Introduction follows only once both sides agree on the essential terms and conditions and wish to proceed." Screen: "Mutual agreement. Then the introduction."
Act 7 voice (owner): "MyPlatform, the commercial intermediary, introduces; members transact on the strength of their own judgement and due diligence." Screen: "Each Member warrants the accuracy of its statements and accepts responsibility for them." + MEMBERS · DOCUMENTS · TRANSACTIONS
TABLED (owner, 3 Nov): reinforce the Terms on MEMBERS RESPONSIBILITIES (own statements, own due diligence, warranties).
ONE ENTITY (owner): possessive. Act 5 voice now: "All communication passes through MyPlatform's Operator, who relays every message between the two sides." Then just "the Operator".
Act 7: 'does not verify' sentence LEFT OUT (owner's choice, against both AIs' advice; noted).
Act 8: voice keep "Where opportunity meets discretion."; success-fee card CANCELLED (owner). OK legally: the word "free" no longer appears anywhere in the trailer.
COMMISSION CARD (owner): on screen in ACT 6 after "Mutual agreement. Then the introduction.", NOT read, held ~10 s, dark on white, static background: "Membership is provided without any membership or access fees. The Operator of MyPlatform is remunerated by commission on successfully concluded transactions resulting from introductions made through MyPlatform."
Operator role: owner says well covered; no extra line.
GFX Act 1: richer fine-line globe (dotted continents, glowing port route-ends, slow rotation); "MyPlatform" title next to the globe, above the words on the left, from the start.
GFX Act 2: fine-line port + two faint outlined figures on opposite quays, faces hidden/blurred; coloured containers craned from ship, lowered onto a truck, truck drives away.
GFX Act 3: real app, interactive: a mouse pointer clicks through real screens (Browse -> open offer -> next window as in the real app). Example offer: copper cathodes, LME Grade A, origin South Africa, CIF (no Peru). Clean capture, no test-member names, no contradictory documents line.
GFX Act 4: mouse continues, opens the offer; real detail window shows role + declared documents; a small member badge next to the offer stays blurred/greyed out (identity hidden).
GFX Act 5: real Mailbox (mouse sends a message) melts into diagram; interactive flow: message travels member -> centre, the Operator receives and forwards to other member and back; centre circle shows MyPlatform name/mark with "Operator" under it.
GFX Act 6: the two lines meet and form a thin fine-line handshake; commission card UNDER the dimmed picture, ~10 s.
Act 7 screen text (final): "Each member warrants their own representations." + MEMBERS · DOCUMENTS · TRANSACTIONS (replaces the earlier warranty sentence).
GFX Act 7: fine-line pen signs a document (replaces the three cards).
GFX Act 8: "MyPlatform" name above "Where opportunity meets discretion."; no web address; no fee card.
SFX (owner yes): subtle CC0 sound effects only (Openverse, license cc0): soft whoosh on match moves, quiet mouse clicks in acts 3-5, low tone at open/close; under the music.
v10 REVIEW Act 1: more trade routes and port dots on the globe.
v10 REVIEW Act 2: REPLACE port with SHIPS IN FOG: night sea, light fog, two ships approach, each sees only a blurred radar blip of the other ("unidentified"); one ship switches its lights on too early and its cargo is exposed while the other stays hidden. Richer motion: light, depth, glow, soft blur, camera movement. Key words placed in clean space, not over objects.
v10 REVIEW Act 3: each detail (commodity, quantity, origin, Incoterms) lights up on the real offer as the voice says it.
v10 REVIEW Act 4: "Poster: Principal (Trader)" and "Documents" light up as the voice says role and documentation. (Badge unchanged.)
v10 REVIEW Act 5: hide "Operators" (plural) spots in the film (app unchanged); livelier flow: glowing envelopes both ways, centre pulses on receive/forward; keep earlier choice of MyPlatform name in centre; remove stray corner text (glitch).
v10 REVIEW Act 6: keep the HANDSHAKE idea but much better animation (elegant, realistic-feeling hands meeting, light glow), not simplistic; fee card UNDER the dimmed picture, ~10 s.
v10 REVIEW Act 7: richer, refined realistic fountain pen writing a signature, ink flowing, soft light.
v10 REVIEW Act 8: the act-1 globe returns faintly behind the closing words. NB act 2 night/day fog question still open (raised, unanswered).
v10 REVIEW: realistic scenes (ships/handshake/pen) = code, best effort (free); act 2 = NIGHT fog.
PROCESS (owner 3 Nov): stills -> full trailer WITHOUT voice (music + sfx) -> voice added only after he likes it. New builder session: session_01DzTmTBphKqQWDCqi3ohH93 (old Sonnet session_01DzTmTArce3uLX2Y8oVzTnS stopped).
DEMO (BATCH GO 3 Nov 14:43 Brussels): Haiku session session_01DzTmTAZfvVuoXEyCiKPZE3 builds demo build (mock Supabase, fake seed, DEMO ribbon, GitHub Pages workflow), PR not merged until checked.
- Owner yes\/no pending: delete branches trailer-files-tmp, trailer-files-tmp2
v11 REVIEW: owner agrees weak points (hands stiff, signature scribble, ships flat). Decision: stay all-graphic, one more round improving drawings (no real footage).
v12 REVIEW: signature approved; ships: DAYLIGHT (not night), needs more work; handshake: must look like real drawn hands (illustration-quality), not clay.

## 2026-11-03 ~15:40 Brussels
- Act 2 ship v14 APPROVED (Openclipart 322884, CC0, daylight). Act 6 hands v15 APPROVED (same skin, 2 gentle shakes).
- Owner rule: NO real photos/stock footage ever. Drawings only. OpenMontage = production tool (must be reinstalled each cloud session).
- SUPERVISOR RULE (my failure 03-11): every brief to a builder MUST state the tool: OpenMontage (runner, pinned 195eab2). Before showing anything, check which tool made it.
- OWNER RULE: trailer rounds are SILENT (no music, no SFX, no voice) until he accepts the picture. Then render with voice + music.
- 03-11 ~19:50 Brussels: FINAL EN TRAILER APPROVED. File: scratchpad/final/MyPlatform-trailer-EN.mp4 (run 41693626607 silent+voice, music mixed locally, sidechain duck, vol .35). Builder branch trailer-final (516b522), no PR. Next: where it goes (owner's choice).
- BATCH ITEM 33: put approved EN trailer on front page (www/), TOP under the title, click-to-play (no autoplay). Waits for BATCH GO.
- BATCH ITEM 34: same trailer on the DEMO start page, top, above the 3 sign-in buttons, click-to-play. Waits for BATCH GO.
- 03-11 OWNER: mixing 'Operator'/'Operators' in app text is OK, it does not matter. TABLED item 'Operators plural (~60 strings)' DROPPED. Still never name an Operator.
## 04-11 Walkthrough films decisions
- Member EN+ES ~2 min (Google voice: EN Gemini Algieba; ES Google voice too per owner 04-11), Operator EN ~3 min, Google voice.
- Member: start sign-in (Terms once) -> New Listing; middle stresses PRIVACY; end: Notifications, Profile+Help, then commission line, then introduction + own due diligence.
- Commission line (owner's exact words): "Introductions are made, and direct access between the parties is granted only after commission agreement has been executed."
- Operator: follow the tabs order.
- Next: exact spoken script, shown to owner block by block for approval.
## 04-11 BATCH ITEMS (wait for BATCH GO)
36. Operator never requests/sees/records documents or claims: remove Operator "Document Requests" tab; remove document columns from Deals + Scorecard (live: 0 doc_requests, 0 deals rows); remove members' "Documents" tab. Members still declare documents on listings.
37. New Terms version (3.5): replace "Operators record ... whether the documents matched what was declared, whether they were genuine" with owner's Version A: "The Operators do not request, receive, review or hold any document, certificate or other evidence relating to a listing, and have no knowledge of whether any statement a Participant makes about documents is accurate. Documents pass only between the introduced parties, after the introduction." (Spanish to match.)
- Member EN script final: scratchpad/member-en-script.md (block 3 Documents line replaced).
- RULE 04-11: before building any film, verbal scene-by-scene visualisation, approved per scene. Scripts: scratchpad/member-en-script.md, scratchpad/operator-en-script.md
38. Operator edits message before forwarding: editable box in Forward; auto-highlight in red anything like email, phone, website, LinkedIn/social link; receiver gets only edited version; original kept privately in Activity Log (disputes). Owner reason: stop members circumventing by inserting contact details. Terms may need a line (check) - ask owner.
39. Operator gets an EMAIL on each new member message: 'New message awaiting review' + console link; never the message content. (Today only in-app notify via trg_notify_new_message.)
- OWNER RULE 04-11: explainer speech speed = same as approved trailers (~140 wpm EN Algieba, ES ~140).
- 04-11 OWNER: EMAIL him when the explainer films are done (phone). Plan: mix music here -> push EN films (member-en, operator-en; NOT Spanish) to branch films-email -> edit send-films.yml on that branch to read repo files -> dispatch with ref=films-email (Resend, rafael.e@intercommodities.net, <40MB).
- CHANGED: owner wants only a CONFIRMATION email, not films. Ready: branch notify-owner (a5dc0f0). When films done+checked: dispatch send-films.yml with ref=notify-owner. Then delete the branch.
- 04-11 OWNER DELETED from tabled/parked: Longer trailer; Front-page cards; Paperwork brainstorm; Broker wording. Remaining: no-account-sharing Terms*, Operator unusual sign-in alerts*, repo private, app redesign, reinforce member responsibilities Terms, full Terms draft (now 3.6), receipt email, info@ mailbox, email-race, job title DB.
42. (04-11) OPERATOR demo: separate Cloudflare project myplatform-operator-demo, one 'Enter as Operator' button, fake data, English, unlinked from public pages; teardown proof first. Haiku.
- 05-11 Terms 3.6 choices: A no-sharing = Option 2 ('Your account is for you alone. Do not give your login details to anyone, and do not allow anyone else to act through it.'); B responsibility = Option 2 ('You are responsible for the accuracy of what you state on the Platform, and you warrant that you hold any authority you claim to hold, before any commitment is made.'). Draft on branch terms-3-6-draft 101374b. Branch deletion blocked by classifier (Git Destructive).
- 05-11 Grok T&C review analysed (Haiku). PARKED until after Sunday: liability cap (UCTA s.2(2)/s.11), 11 placeholders (s.10/s.16), trading as individual, DIFC Art.14(B) verify, survival/injunction s.8, confidentiality exceptions s.9, affirmative acceptance s.14.
## STATE 05-11 10:00 UTC (pre-compact)
LIVE: trailers EN/ES (www + member demo), member demo myplatform-demo.pages.dev (members only), operator demo myplatform-operator-demo.pages.dev, items 36-39 (#80,#82,#83), member walkthrough under app sign-in (#84), operator demo (#85); sql 045/046/047 live. Films final: scratchpad/final-films/ (also films/ on branch).
IN FLIGHT: #86 receipt email (head 86ae4b4, sql/048, owner-approved EN wording option A) and #87 Terms 3.6 (head 6482e1e, sql/049, owner's 2 sentences + Jericho->MyPlatform + ES fix). Trigger trig_014QvATQ5576E9EHraZmcvxK fires 10:12 UTC: apply 049/048 live via apply-sql.yml (no CI running), re-run CI, merge when green, send owner final EN Terms text.
SUNDAY 08-11 09:00 Brussels trigger trig_01GgCRVKC6YETuRsMeiuUt5o: Haiku analyses docs/terms-reviews/{grok,chatgpt,mistral}.md (commit 6acd667) -> one ranked list; remind owner: branches deletion (blocked by classifier, needs his permission), cost savers, Operator film placement.
Haiku session idle except #86/#87. Owner at ~91% weekly usage, resets Sun 02:00. Helpers report only when done/blocked.
Morning check trigger trig_01RyvM8cWzSUkmcfbT6jNNvh daily (silent unless broken).

## PAUSE 05-11 ~11:00 UTC (owner): Terms 3.6 + receipt PAUSED until Sunday. Do NOT merge #87/#86; more Terms changes coming.
Already done: sql/048 + sql/049 applied LIVE; branch terms-3-6 head 0e03a90 contains #86 merged in + terms picture retakes + marker fix (CI was running, result not checked).
Sunday: combine with the 3-review ranked list, owner decides changes, then finish.

## 05-11 evening: ALL PAUSED till Sunday (owner).
- CAUSE: live DB terms = 3.6 (sql/049 applied 10:13 UTC) but main js/utils.js TERMS_VERSION='3.5' -> full-flow "approved participant posts a listing" times out on EVERY PR. No members, no harm. Fix Sunday: finalise Terms, merge terms-3-6 (head 0e03a90, includes #86) so site=DB.
- Waiting on that: PR #90 remove-old-films (operator-en + overview-en mp4, owner approved), PR #89 platformdemo (Haiku; then dispatch platformdemo-cloudflare-setup.yml FROM MAIN after merge, verify link, send owner).
- Delivered today: pitch (docs/PITCH-5-MIN.md, branch pitch-script; ~800 words, offered trim to 5 min, no answer), stress-test brief (branch stress-test-brief, PDF sent), links list, Mistral instructions. Sonnet archived.
- 08-11: platformdemo -> Cloudflare project tradedemo (owner). platformdemo.pages.dev taken by a stranger.
- 08-11 05:00 UTC: tradedemo LIVE https://tradedemo.pages.dev via one-off .github/workflows/tradedemo-now.yml on branch platformdemo (owner: test page, publish now). Verified: no myplatform/video on sign-in, app, help, terms, register; no supabase/mp4 requests. REMOVE tradedemo-now.yml before merging #89.

## OWNER 08-11 (do LATER TODAY, after Terms reviews) - TABLED
T1. Help FAQ "Why must I sign the Terms..." answer is FALSE per owner: members sign the Terms ONCE only. When Terms change, members get an EMAIL saying changes happened and WHAT changed (no re-sign).
    NOTE: this changes app behaviour, not just text: checklist item 62 (re-sign gate held at sign-in) + Terms "accept new version before carrying on" clause + pitch text. Owner to decide; present options.
T2. Help & questions wording overall: owner finds it crude in places -> rewrite in better language (owner approves wording; EN+ES).
Applies to real app AND tradedemo (copy).
- 08-11 05:10 UTC: tradedemo republished WITHOUT Help (link, nav button, help.html). Verified live.
## NEW RULE (owner 08-11): do NOTHING until the owner starts work. Sunday 09:00 plan CANCELLED (trigger trig_01GgCRVKC6YETuRsMeiuUt5o disabled). Morning check trig_01RyvM8cWzSUkmcfbT6jNNvh also paused. Owner has new things to negotiate first.

## OWNER 08-11 (TABLE for next working conversation)
T3. ORCHESTRATION / COST: fine-tune further. Opus = brains only; Haiku/Sonnet = grunt; GitHub Actions max; outsource MORE. Owner will paste a DeepSeek recommendation next. Things must be done properly.
T4. MESSAGES: Operator must NO LONGER EDIT member messages. Keep the red highlighting of risky content, but instead the Operator ASKS THE MEMBER to rephrase/rewrite without that info. (Reverses decision 38 forward-editing.) Affects app, Operator console, Terms, films, pitch, stress brief, checklist items. Present options; do not build until owner approves wording/behaviour.
T5. Owner has more points to discuss.
T6. Remove EVERY "Jericho" everywhere (code, app, tests, scripts, docs, package names, client name 'jericho', test prefix jericho-e2e-, filenames). Today on main: 90 files, 404 mentions.
## OWNER METHOD (08-11): collect ALL changes first, then do everything in ONE shot (one batch) for a perfect product - not one by one.
T7. REFERRALS / NEW MEMBERS: design how existing members refer/suggest new members, and what we ask (the referrer and the candidate) before accepting a new member. Discuss with owner first (check what the app does today for invitations/approval before proposing).
T8. CODE PROTECTION: watermark / traces in the code to protect against theft. Other AIs gave the owner suggestions (he will share). Discuss at a later stage. Related: repo is still PUBLIC ("make repo private" on the old list).
T3 detail: DeepSeek proposed freellmpool (PyPI 0.13.0, exists, verified 08-11). My verdict: not for our core work (LLMs can't run Playwright; code/member data to unknown providers clashes with T8/privacy; GitHub standard runners FREE for public repos per docs.github.com; real bottlenecks = one-lane live-DB CI group + Claude context size). Maybe for throwaway text drafts only. Owner to decide.
