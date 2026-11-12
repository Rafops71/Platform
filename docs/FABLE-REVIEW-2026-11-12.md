# Fable review, 12 November 2026: winning the first members, and what we missed

Status: an opinion, written for the owner. Nothing here is decided and nothing
is built. Every wording below is a draft for the owner to accept, change or
reject. Where I was not sure, it says so.

## What I read, and what I could not check

Read in full, from the repository, on 12 Nov 2026:

- `docs/STRESS-TEST-BRIEF.md` (branch `stress-test-brief`).
- `docs/CHECKLIST.md`, `HANDOFF.md`, `docs/AGREED-2026-10-25.md`,
  `docs/AGREED-2026-10-28-cloudflare.md`, `docs/AGREED-2026-10-28-help.md`,
  `docs/AGREED-2026-11-01-owner-changes.md`, `docs/BATCH-2026-11-08.md`,
  `docs/LEGAL_REVIEW_NOTES.md`, `docs/OPERATOR_SOP.md`,
  `docs/PARTICIPANT_GUIDE.md`, `docs/TERMS-3.6-full.md`,
  `docs/research/SCORECARD-DATA-PROTECTION.md` (all on `main`).
- Terms 3.7, English and Spanish, as stored in `sql/058_terms_3_7.sql` and in
  the `terms.*` keys of `js/i18n.js`; the listing statements in `app.html`,
  `js/i18n.js` and `sql/033`; the Operator console in `operator.html` and
  `js/operator.js`; the deal files (`sql/035`), scorecard (`sql/037`),
  recommendations (`sql/054`), rate limits (`sql/016`), new-listing email
  (`sql/003`, `sql/008`), the signed-once gate (`sql/057`).
- `docs/IDEAS-2026-11-12.md`, `docs/terms-reviews/*` (ChatGPT, Grok, Mistral),
  `docs/SUPERVISOR-STATE-2026-11-08.md` and the member film script, all on
  branch `claude/great-allen-5xl0gm`.

Could not be checked from here: the live database, the live site, Resend,
Cloudflare, the info@ mailbox. Where I name a real-world example I looked it
up today; the source list is at the end. Where I could not, it is marked
**[not verified]**.

Words used below: *principal* = the party who owns the goods or buys them for
itself. *Readiness statement* = the optional tick the owner decided on 12 Nov
("Ex-stock: goods available, title held", and the buyer's sentence).
*Introduction* = the moment the Operator tells each side who the other is.

---

## Part 1. How to win the first legitimate buyers and sellers

The problem in one line: the platform cannot prove anything about anyone, and
cannot show names. So it must sell the two things it *can* prove: **what each
member stated, and when**, and **what the Operator did, and how fast**.

The ideas are ranked. The first four are the ones I would build first.

### 1. Statements that carry a date and expire (the clock is the trust signal)

**What.** Every statement a member makes on a listing (role, documents,
readiness) is already stamped by the server. Show the date next to it in
Browse: "Stated by the poster on 3 Nov". When the 30-day "still available?"
prompt fires, ask the poster to re-affirm the *readiness statement* as well,
not only availability. If it is not re-affirmed, Browse shows "Readiness not
re-affirmed since 3 Nov". The listing stays; only the statement ages.

**Why it works.** A fake offer is cheap to post once and expensive to keep
alive by hand every few weeks. A real one costs ten seconds. Time, which the
platform already records, becomes the filter. Nobody is judged.

**Where something similar worked.** Airbnb's Superhost badge rests on a
measured fact about behaviour over time, a 90% response rate within 24 hours
over a year, not on a judgement of the host (Airbnb's own page, read today).
Paper offers in physical trade carry a validity date for the same reason
**[trade practice, not verified from here]**.

**Fits our limits.** It is the member's own statement, re-made by the member.
The platform states a date, which it knows. Nothing is verified. Terms 3.7
section 7 already says that "the answers you give when you publish a listing"
are statements under the Terms; my reading is that a readiness tick is such an
answer and needs no new Terms version **[my reading, not a legal finding]**.

### 2. The same short sheet on both sides before any introduction

**What.** The owner's goal is "price, terms, paperwork and financial
instruments agreed, then get it done". Today that agreement happens in free
text through the mailbox. Make it a fixed short sheet that each side fills in,
through the Operator, before the deal file moves to "agreed": quantity,
quality basis, incoterm, delivery window, payment instrument, inspection
(who and where), and the order in which the parties will show each other
their proof. The Operator introduces only when the two sheets say the same
thing. The sheet becomes part of the deal file, which already keeps every
change with who and when.

**Why it works.** The introduction then has a known shape. Most wasted time in
this market is the discovery, after names are exchanged, that the two sides
never agreed on payment or inspection. A sheet that does not match is a deal
that should not be introduced, and both sides see that before anyone's name is
out.

**Where something similar worked.** Term sheets before a data room in company
sales; Alibaba's RFQ, where the buyer posts a structured request (quantity,
delivery terms, target price) and suppliers answer against it (Alibaba's
seller guide, read today).

**Fits our limits.** Each line is the member's own statement. The Operator is a
scribe, not an adviser: it copies, it does not recommend terms (Terms section
6). The "order of proof" is a choice each party makes, not a procedure the
platform advises.

### 3. The Operator's own promise, published as plain numbers

**What.** Members are hidden; the Operator is not (the owner's hook 8). The one
service the platform can promise without vouching for anyone is the Operator's
own speed. Publish, members only, a short monthly line: how many enquiries
arrived, how many were forwarded or answered within one working day, how many
introductions were made. Three counts, no names.

**Why it works.** The SOP itself says it: "Silence is the one response that
costs you a participant." A published count turns the promise into something a
member can hold the Operator to, and it is the only "track record" a new
platform can honestly show.

**Where something similar worked.** Airbnb publishes how many fake listings it
removed (59,000 in 2023, in its own announcement, read today). Public status
pages for software services do the same for uptime. The point is the same: a
count about your own conduct, not a claim about your customers.

**Fits our limits.** It describes the Operator, not any member.
**Liability note:** do not put a response time in the Terms. Section 1 says the
Operator's only duties are those in the Terms, so a promise there becomes a
duty. Publish it as a target and a count, nowhere else.

### 4. Zero tolerance built on contradictions, not on verification

**What.** The owner's idea 6 (close the account after one proven fake or
no-show) runs into the firm limit: the Operator never verifies, so it can never
"prove" an offer fake. But it can see something else without checking
anything: **a member contradicting their own statement**. A seller who ticked
"title held" and then writes "my supplier needs two more weeks" has
contradicted a statement made under the Terms. A buyer who ticked "financing
secured" and then asks for time to arrange it has done the same. The Operator
sees both messages. That is observable fact, inside the platform, from the
member's own words.

**How.** The Operator help and the Operator's deal file get one new recorded
fact: "statement contradicted by the member's own message (date, reference)".
Suspension follows the Terms (section 13, no reason owed). Other members are
told only "the account was closed", never why.

**Where something similar worked.** Every market that removes listings for
"not as described" relies on the seller's own description against the seller's
own later conduct. Airbnb's removal counts above are an example of
enforcement published as numbers.

**Fits our limits.** No verification. The platform compares two things the
member wrote. Also see Part 4 on what not to say to other members.

### 5. Readiness declared at the moment of contact, not only at posting

**What.** The owner decided readiness ticks for posters. Add the mirror: when a
member presses Contact on a listing, the same optional tick is offered to
them, for their own side. A buyer enquiring about a sell offer may declare
"financing secured, instrument can be issued when required"; a seller enquiring
about a buy request may declare "ex-stock, title held". The poster receives the
enquiry with the enquirer's own statement attached.

**Why it works.** The poster's first question ("can this person actually pay /
actually deliver?") is answered before the first reply, as a statement with a
date. It also makes both sides equal: today only the poster declares anything.

**Fits our limits.** Same as idea 1. Optional, soft wording, principals only,
following the owner's wording rule.

### 6. The form is the guide: structured fields instead of free text

**What.** The listing today has quantity, unit, specification, incoterm,
origin, destination, price conditions, currency, price unit and notes
(`sql/schema.sql`). The things that decide whether a deal is workable are not
fields: payment instrument acceptable, delivery or shipment window, inspection
basis, offer validity. They end up in "notes", or nowhere. Add them as
optional fields with fixed choices where possible.

**Why it works.** A complete offer is a workable offer. A member who cannot
fill in a delivery window has told everyone something without the platform
saying a word. This is the owner's idea 1 ("useful before it is a marketplace")
done inside the product: the form teaches what a workable offer contains.

**Where something similar worked.** Y Combinator's fixed application form, and
Alibaba's RFQ form (above): structure does the sorting.

**Fits our limits.** Fields are declarations. Nothing is checked. Keep every
new field optional, so no honest member is blocked, following the owner's rule
of never adding a box he did not ask for: this is a proposal for his decision.

### 7. Each side reports its own outcome after an introduction

**What.** The 25 Oct decisions planned outcome recording "from the
counterparty and the Operator" (item 25). Only the Operator's half is built.
Add a one-click report for each introduced member: "closed / did not close /
still talking", stored as that member's own statement in the deal file.

**Why it works.** The Operator cannot see what happens after the introduction.
Members can. Two statements that disagree are themselves a fact the Operator
can note. Over time this is the only honest source for "deals closed here".

**Fits our limits.** Keep the three answers neutral. No "the other side was not
genuine" option: that is an accusation about an identifiable person, which they
may ask to see (see `docs/research/SCORECARD-DATA-PROTECTION.md`).

### 8. "Sought and not found": a members-only note of unmet demand

**What.** The owner's idea 7, narrowed: a short monthly note, by commodity,
counting buy requests that received no sell enquiry and sell offers that
received no buy enquiry. Counts only, and only where at least three listings
sit behind a line, so no one listing can be picked out.

**Why it works.** It tells a seller "there are buyers here for what you have,
and nobody is serving them". That is the strongest reason for a legitimate
seller to join a platform with no names on it.

**Fits our limits.** Aggregates of what members posted. No names, no judgement.

### 9. Response-time facts per listing, in bands

**What.** Next to a listing, once the poster has answered at least three
enquiries: "Replies within a day / within a week / slower". A fact about
platform behaviour, in bands, never a score.

**Where it worked.** Airbnb's response rate (above).

**Fits our limits.** It is a count of forwards and replies the platform
already logs. Bands and a minimum of three enquiries stop one enquiry from
identifying anyone. It is personal data about the poster's behaviour, so the
Privacy Notice would need one line (a new Terms version). Lower priority for
that reason.

### 10. Fewer listings per member, by design

**What.** The flood limit is 20 listings per hour per member (`sql/016`). It
stops abuse; it does not shape quality. A cap on *open* listings per member,
like the cap of 5 open recommendations (item 83), makes each listing a choice.
The number is the owner's.

**Why it works.** A member with three live offers tends them. A member with
forty does not. The owner's "ten people in one niche beat a thousand empty
listings" (idea 4) needs this.

**Fits our limits.** A rule about the member's own account, enforced in the
database like the others.

### 11. Say the two-steps rule out loud

**What.** The rule "no offer more than two steps from the principal" (item 67)
is the single most unusual thing about this platform, and it is hidden in a
form error. The ICC's Commercial Crime Services has warned for years about
commodity offers (urea, gold, cement) dressed in "proof of funds" and "bank
comfort" language, passed along chains of intermediaries (ICC pages, read
today). The platform refuses exactly those chains. Put the rule on the front
page and in the invitation email, in the owner's words.

**Fits our limits.** It describes the platform's own rule, not any member. It
must not call anyone names: no "joker brokers", no "time-wasters". "MyPlatform
accepts no offer more than two steps from the principal" is enough.

### 12. The first cohort: one route, the owner's own deals, recommendations only

This is the owner's ideas 4, 5 and 9 put in order, with the one addition that
the recommend-a-candidate function (items 82 to 87) is the recruiting tool:

1. The owner runs his own live deals through the platform first, so that the
   first deal files, counts and the first monthly note are real.
2. He invites only counterparties he has closed with, in one commodity on one
   route. Each of them is asked to recommend one counterparty they have closed
   with. No open applications; the sign-in page already says so.
3. The invitation stays scarce on purpose until the first cohort has produced
   introductions. Gmail's 2004 invitation-only year is the known case: scarcity
   made the invitation itself a thing of value (AP coverage, read today), though
   there it began as a capacity limit, not a plan.

OpenTable is the owner's model for idea 1; checked today, it did build the
restaurant side first and opened to diners only in late 1999, by winning "the
five to ten top restaurants in each market" first. The equivalent here is five
principals on one route, not fifty brokers across all commodities.

---

## Part 2. What has been forgotten or overlooked

Product:

1. **The introduction trigger is described five different ways.** Help a1:
   "once both parties have reached mutual agreement on the relevant commercial
   terms". Help a10: "only after a commission agreement has been executed".
   Welcome page: "once price, procedure and document order are agreed". Terms
   section 10: "where the Operator considers that two Participants should deal
   with one another, they will ask each of you ... if both agree". Terms
   section 8: commission agreed with the paying party "before the introduction
   is made". The film: both. A member can read any of these. Pick one sentence
   and use it everywhere. The owner's choice.
2. **Consent to be introduced is recorded nowhere, and neither is the
   commission agreement.** The deal file stamps "introduced" with the server
   clock (`sql/035`), which is the 24-month evidence. But the "yes, introduce
   me" from each side and the signed commission agreement live in the Operator's
   email. `docs/LEGAL_REVIEW_NOTES.md` A2 raised this in August; still open.
   Cheapest fix without uploads: a fixed-wording "I agree to be introduced"
   message button in the member mailbox (stored like any message), and two
   fields in the deal file: commission agreement date and reference.
3. **Buy requests must answer "Have you personally seen documents for this
   offer?"** `sql/033` requires both document answers on every listing, buy or
   sell. For a buyer the question has no clear meaning. The owner's buyer
   readiness sentence covers what matters (financing). Decide whether buy
   requests should skip the document questions.
4. **"Can documents be shown during due diligence? Yes, on request"** promises
   something nobody can ask for before the introduction (the Operator never
   requests, item 32; documents pass only after the introduction, Terms
   section 10). The three answers do not match the process. The honest answers
   are two: "after the introduction" and "only after a contract is signed".
5. **No field for payment instrument, delivery window, inspection or offer
   validity** (Part 1, idea 6).
6. **Every listing is emailed to every approved member** (`sql/003`,
   `sql/008`). Right for ten members; noise for two hundred, and noise is the
   thing this market hates. Saved searches and watchlists exist (item 22) but do
   not drive the email. Plan the switch before the membership grows.
7. **The Operator's absence.** The SOP says a message that waits three days is
   a deal that quietly did not happen. I found no away notice or holding reply
   in the console. One fixed "received, the Operator will answer by <date>"
   reply, sent with one press, is cheap.
8. **The Operator records "offer not genuine" but verifies nothing.** The deal
   file answers (`sql/035`) include "not genuine". On what basis? Either the
   counterparty's report or a contradiction in the member's own messages (Part
   1, idea 4). Write that basis into the Operator help, so every such record
   names its source and stays a fact.

Terms and member promises (parked by the owner's freeze at 3.7, listed so they
are not lost; all three outside reviews agree on the first two):

9. **Nothing says section 8 survives suspension or deletion.** Section 13 lets
   the Operator withdraw access at any time; section 8 binds for 24 months. A
   member removed in month three can argue the obligation went with the
   account. One sentence fixes it.
10. **Commission before an agreement exists.** If a member circumvents before
    any commission was agreed, section 8 points at an agreement that never
    happened (`LEGAL_REVIEW_NOTES` C1). Anonymity is the practical protection;
    the clause is not. Noted, not resolved.
11. **Both sides told who pays.** Section 8 agrees commission "with the paying
    party". Decision 15 (1 Nov) to tell both sides is on hold. The supervisor's
    notes record *Medsted v Canaccord* [2019] EWCA Civ 83 as verified: the
    broker there lost its non-circumvention damages at first instance because
    it had not disclosed its commission to the introduced clients. I did not
    re-read the judgment today **[relies on the supervisor's verification]**.
    The 2025 Supreme Court case the files call *Johnson v FirstRand* and
    Mistral calls *Hopcraft v Close Brothers* is one judgment, [2025] UKSC 33,
    1 August 2025, three joined appeals (checked today on the National Archives
    case-law site). It says partial disclosure is not informed consent. The
    per-deal commission agreement is where both sides can be told, in writing,
    without changing the Terms.
12. **Help a12 promises an email confirmation link that is not sent**
    (`HANDOFF.md`, "Changing an email address needs a confirmation this project
    does not send"). A member-facing promise that is untrue. Change the text or
    build the confirmation.
13. **Three contact addresses in one Terms document.** Section 10 names
    rafael@ for data questions, the Candidates paragraph names info@, section
    16 names rafael@ for notices, Help a16 names info@. Decision 1 of 1 Nov said
    info@ everywhere. And info@ must receive mail before launch (supervisor
    notes: still waiting on a screenshot). Cannot be checked from here.

The Operator's role:

14. **The SOP tells the Operator to verify.** Section 2 of `OPERATOR_SOP.md`:
    "satisfy yourself that the company is real and trades in the commodities
    concerned". That is a check of a member, against the firm limit and against
    Terms section 4. Approval is discretion (section 2 of the Terms), not
    vetting. Rewrite that paragraph: the Operator decides whom to admit, at its
    discretion, and checks nothing on anyone's behalf.
15. **The SOP's condition for an introduction includes answered document
    requests** (section 8, point 3), which no longer exist.

---

## Part 3. What is redundant or working against us

1. **The five introduction sentences** (Part 2, point 1).
2. **The "documents showable" question** (Part 2, point 4): half of it repeats
   "documents seen", the other half promises a step the process does not have.
3. **"Operators", plural, in member-facing text**, against the owner's rule
   "always the Operator": `mailbox.intro`, `mailbox.fromYou`, `contact.intro`,
   `contact.sent`, `common.operators`, Help a9, in English and Spanish
   (`js/i18n.js`). The Spanish Terms 3.7, section 1, still has a plural verb
   after the singular noun ("El Operador actúa ... y pueden actuar"). The
   Operator help says "outcomes Operators recorded".
4. **The PLACEHOLDER banner inside the Terms.** Every member who signs reads
   "THIS DOCUMENT IS NOT YET COMPLETE" and "must be reviewed by a qualified
   lawyer before the Platform is opened to real Participants". Honest, and
   right while nobody real has signed. But the owner's trial period means real
   members will sign it. A contract that announces itself unfinished works
   against trust more than any feature works for it. His decision: fill the
   address placeholders with his own details (the 26 Oct decision already
   allows his name and address) and drop the banner, or keep the banner and
   accept what it says to members.
5. **Help a11: "Up-to-date listings are taken more seriously."** It is about
   listings, not people, but it brushes the owner's wording rule of 12 Nov.
   His call. `docs/PARTICIPANT_GUIDE.md` lines 75 and 129 use "serious" about
   people, in a document members may be given.
6. **The matches tab** scores high/medium/low on commodity alone and, in the
   SOP's own words, "knows nothing about quantity being wildly mismatched". It
   is harmless as a reminder; it should not be described to anyone as a
   feature.
7. **Dormant document columns.** `member_scorecard()` (`sql/037`) still returns
   documents-matched, documents-false and similar counts, and `deals` still
   has `docs_match` and `docs_genuine`, although the Operator has not been
   able to see or record anything about documents since Terms 3.5 and PR #80.
   The screens hide them. The function should stop returning them, so the
   privacy notice and the code say the same thing.
8. **The broadcast email** (Part 2, point 6).

---

## Part 4. Liability: in my ideas, and in what exists

In the ideas:

- **Showing a member's statement is not vouching, as long as it is labelled.**
  Browse already says "Seen by the poster". Every new statement must carry the
  same shape: "Stated by the poster on <date>." Never "verified", never a
  tick on its own, never a badge without the word "stated".
- **Counts shown to members need a floor.** Response bands, unmet-demand lines
  and closure counts: never below three behind a figure, never per member in
  anything a member sees. The scorecard research already says why: a small
  count identifies a person.
- **The Operator's speed promise stays out of the Terms** (Part 1, idea 3).
- **Zero tolerance must not become a verdict.** The Operator may record a
  contradiction or a counterparty's report; it must not tell other members an
  offer was "fake", because it cannot know that and the Terms say it does not
  check. "The account was closed" is the whole message. The Terms already
  allow closure without reasons (section 13).
- **The pre-introduction sheet must not become advice.** No default terms, no
  "recommended" payment instrument. The Operator copies what each side says
  (Terms section 6).
- **Any new personal-data field** (response times are the one) needs a line in
  the Privacy Notice, which is a new Terms version. Readiness statements are
  about the goods and the money, not about a person; my reading is that they
  need no new version **[my reading]**.

In what exists (all three outside reviews agree on the first two; parked by
the Terms freeze, listed so the owner sees them in one place):

- **Section 11 has no financial cap** and section 12 is a blanket release. Under
  UCTA 1977 a clause found unreasonable can fall entirely rather than be read
  down (`LEGAL_REVIEW_NOTES` C5; all three reviews). The repository's own
  finding that UCTA s.27(1) may disapply the reasonableness test where English
  law applies only by choice (`AGREED-2026-10-25`, research) cuts the other way
  and is marked "caveat, not verified" there. Open.
- **Section 3's "future company" sentence** binds a company that has not
  signed. All three reviews doubt it. The per-deal commission agreement, signed
  by the entity that will trade, is the practical answer.
- **Section 8 survival** (Part 2, point 9).
- **The SOP's vetting language** (Part 2, point 14) is the one place where the
  platform's own document contradicts "we check nothing". If it were ever read
  against the Operator in a dispute, it would be read as a duty assumed.
- **Help a12** (Part 2, point 12): a promise not kept.
- **"Free" in marketing.** The Terms say the Platform is free and the Operator
  earns commission, which is accurate. The front page (`www/index.html`) does
  not use the word "free" today (checked). If it ever does, put "commission is
  payable only on a closed deal" next to it, as Mistral noted.

---

## Part 5. Out of date or inconsistent, file by file

- **`docs/STRESS-TEST-BRIEF.md`** (branch `stress-test-brief`): says 80 items
  and 38 prohibitions (the checklist has 88 and 42); says a member who has not
  signed the newest Terms is held at sign-in (item 62 now says the opposite:
  signed once, never held again, `sql/057`); says the Operator edits a message
  before forwarding (the Operator cannot edit since PR #93; item 78); says the
  current Terms are 3.6 on a branch (3.7 is on `main` and, per the supervisor's
  notes, live); says 47 migrations (61); says the test prefix is `jericho-e2e-`
  (now `myplatform-e2e-`, both still cleaned); uses "the Operators".
- **`docs/AGREED-2026-11-01-owner-changes.md`**: header says "NOTHING here is
  built yet". Built since: 2, 4, 8, 11, 12 (as 43), 42, 44, and 1 in part
  (info@ in the Candidates paragraph and Help a16, but section 16 still says
  rafael@). Item 3 was replaced by the 8 Nov decision (email summary, no
  re-signing). Not in Terms 3.7: 5 (NCNDA and commission agreement before
  introduction), 6 (honesty sentence), 7 ("commercial intermediary means a
  broker"), 10 (no derivatives), 13 (indemnity), 14 (fraud: suspend,
  investigate, remove). I checked the 3.7 text for each. The owner froze the
  Terms at 3.7, so these are parked; the file should say so.
- **`docs/AGREED-2026-10-25.md`**: item 15 (re-accept gate) is superseded by
  item 62; item 23 (document request menu) by decisions 36 and 37; the error
  text quotes "Jericho". It is history and can stay, with a one-line note at
  the top.
- **`docs/TERMS-3.6-full.md`**: superseded by 3.7 (singular Operator, the
  Candidates paragraph, section 17).
- **`docs/OPERATOR_SOP.md`**: document requests tab and section 5 (removed);
  five Overview tiles (document requests gone); "Operators" throughout;
  "Introductions counted here are forwards" (deal files now count
  introductions, `sql/038`); introduction condition on document requests; the
  vetting paragraph (Part 2, point 14). It should also say that the deal
  file's "introduced" date is the start of the 24 months.
- **`docs/PARTICIPANT_GUIDE.md`**: section 8 (document requests) no longer
  exists; "Operators"; "serious" twice; the quoted email subjects could not be
  checked against the live templates from here.
- **`docs/LEGAL_REVIEW_NOTES.md`**: written against version 2.4. A1 to A3 are
  fixed; B1 to B4, C1 to C6, D1 to D5 are still open and still true of 3.7.
  Needs a "status as of 3.7" line so nobody re-researches them.
- **`HANDOFF.md`**: "Deliberately not built" still says documents are
  "requested through a workflow"; "Current state" says the checklist stands at
  56 of 56; the open list mixes done and undone items. The CLAUDE.md rule that
  a document is updated in the same commit has not held here.
- **`js/i18n.js`**: the plural keys listed in Part 3, point 3; Terms section 1
  says "This review is not a check", but nothing before it is called a review
  since the rewrite to the singular; Spanish section 1 plural verb.
- **`sql/037`**: dormant document columns (Part 3, point 7).
- **`docs/IDEAS-2026-11-12.md`**, hook 3: "Anonymity until a commission
  agreement is signed." Terms section 10 says anonymity ends when both agree to
  be introduced. The two are the same only if the commission agreement *is*
  the consent. Decide, then say it once (Part 2, point 1).
- **`docs/CHECKLIST.md`**: current. Its note that items 48 and 49 are blocked
  on an unverified sending domain may be stale: `HANDOFF.md` says
  mail.myplatform.trade is verified. Cannot be checked from here.

---

## Decisions this review needs from the owner

Listed, not answered. Each is his.

1. One sentence for when an introduction happens, used everywhere.
2. Whether buy requests skip the two document questions.
3. Whether to replace the three "documents showable" answers with two.
4. Which of ideas 1 to 12 to build, and in what order.
5. The number for a cap on open listings per member, if any.
6. The PLACEHOLDER banner: fill and drop, or keep.
7. The three contact addresses in the Terms: one address.
8. Help a11 and the Participant Guide: keep or change "serious".
9. Whether the SOP's approval paragraph is rewritten as discretion, not vetting.
10. Whether the parked Terms points (survival, cap, future company, both sides
    told who pays) go into the per-deal commission agreement now, since the
    Terms are frozen.

## Sources looked up today

- Airbnb, "How to become a Superhost" (response rate 90% within 24 hours):
  https://www.airbnb.co.in/resources/hosting-homes/a/how-to-become-a-superhost-702
- Airbnb removed 59,000 fake listings in 2023 (The Star, 21 Sep 2023):
  https://thestar.com.my/tech/tech-news/2023/09/21/airbnb-says-its-cracking-down-on-fake-listings-and-has-removed-59000-of-them-this-year
- Alibaba seller guide to RFQ:
  https://seller.alibaba.com/businessblogs/how-to-use-rfq-a-detailed-guide-with-examples-px97m41v
- OpenTable's restaurant-first start (Kellogg, 2009):
  https://www.kellogg.northwestern.edu/news/blog/2009/10/07/solving-the-dining-out-dilemma/
- Gmail's invitation-only launch, 2004 (AP via PBS):
  https://www.pbs.org/newshour/nation/20-years-ago-people-thought-googles-gmail-launch-was-an-april-fools-day-joke
- Airbnb founders in New York, "do things that don't scale" (First Round
  Review): https://review.firstround.com/how-design-thinking-transformed-airbnb-from-failing-startup-to-billion-dollar-business/
- ICC Commercial Crime Services on commodity frauds (urea, "proof of funds"):
  https://iccwbo.org/news-publications/news/ccs-uncovers-commodity-frauds/ and
  https://iccwbo.org/news-publications/news/fib-warns-of-bogus-proof-of-funds-letter/
- Hopcraft, Johnson and Wrench [2025] UKSC 33 (one judgment, three appeals):
  https://caselaw.nationalarchives.gov.uk/uksc/2025/33

Not looked up today, taken from the repository's own records: *Medsted v
Canaccord* [2019] EWCA Civ 83 (supervisor's notes, 8 Nov); UCTA 1977 s.27(1)
(`docs/AGREED-2026-10-25.md`, marked there as not fully verified).
