# Legal Review Notes

Points for a qualified lawyer to examine in the Terms & Conditions and Privacy
Notice (currently **v2.4**, in `js/i18n.js`, rendered by `terms.html`).

**Mostly this is a list of questions, not edits.** The exceptions are A1, A2 and A3: on 2026-08-28 Rafael asked for those to be corrected, so the
Privacy Notice text *was* changed for them and `TERMS_VERSION` went to 2.4.
Both were factual corrections — the notice was describing a system that was not
the one in the database — and both are still marked for a lawyer's sign-off.
Everything else below is untouched.

**Who wrote this:** an engineer who has read the Terms against the code that
implements them. That is the one useful thing this document offers — several
points below are not matters of legal opinion at all, but places where the text
describes the platform inaccurately, which can be checked against the database
and fixed before a lawyer's time is spent on them. Everything else is flagged
because it looked worth a second opinion, not because it is known to be wrong.

Priority is a rough ordering for the lawyer's attention, not a legal judgement.

---

## A. Where the text does not match the system

These are factual mismatches, verifiable from the code, and they should be
corrected regardless of what a lawyer says about anything else.

### A1 — The Privacy Notice's list of collected data was incomplete · **FIXED 2026-08-28** (still needs lawyer sign-off)

As it read up to v2.2, `terms.s10.p2` listed: first name, last name, company,
country, telephone, email, hashed password, language preference — then listings,
messages, document declarations, and activity records.

The database stored more than that:

| Stored | Was in the notice? | Now |
| --- | --- | --- |
| `profiles.job_title` | **No.** Added in `sql/011`, after the notice was written | Listed |
| `saved_searches` (a participant's saved criteria and watchlist) | **No.** Added in `sql/012` | Listed |
| `notifications` (per-user message records) | **No** | Listed |
| `email_outbox` (recipient addresses, full listing content, delivery state and errors) | **No** | Listed |

Under GDPR Art. 13 the notice has to describe the categories of data actually
processed. Two of these arrived in migrations after the text was drafted, which
is exactly how this kind of drift happens.

**What changed.** `terms.s10.p2` now names all four, in both languages, and four
assertions in `tests/e2e/terms.spec.js` pin them so the list cannot quietly fall
behind again. **A lawyer should still confirm the wording is adequate for
Art. 13** — this was a factual correction by an engineer, not a drafting
exercise.

> Worth deciding at the same time: **whose job is it to update the notice when a
> migration adds a personal-data column?** Today nothing connects the two, and
> `sql/011` and `sql/012` both slipped through.

### A2 — "No other Participant is shown your name" was stated absolutely, but introductions exist · **FIXED 2026-08-28** (still needs lawyer sign-off)

As it read up to v2.2, `terms.s10.p4` said: *"Participants never see one
another's identity… No other Participant is shown your name, company, country,
telephone number, or email address."*

That was true of the platform software. It was **not** true of the service: the
entire purpose is that Operators eventually introduce two parties to each other
by name, and `docs/OPERATOR_SOP.md` §8 describes exactly that step. The
introduction happens by email, outside the platform, which is why the code can
honestly claim what it claims — but the Privacy Notice is a notice about the
service, not about the software.

As written, a participant could reasonably have read p4 as a promise that their
identity is never disclosed to another participant, and then been introduced.

The SOP requires both parties to consent before an introduction, so the practice
was sound — but the notice did not mention that the disclosure happens at all.

**What changed.** `terms.s10.p4` now qualifies the absolute sentence with
"through the Platform", and describes the introduction as the one exception:
the Operators ask each party separately, disclose identity and contact details
to the other if and only if both agree, do so by email outside the Platform,
and the participant may decline. Both languages; asserted in
`tests/e2e/terms.spec.js`.

**Still open for the lawyer:**

- Is "we will ask you and you may decline" the right *mechanism*, or does this
  disclosure need consent captured under GDPR Art. 6/7 with a record of it?
- **The consent is currently recorded nowhere.** It lives in whatever an
  Operator's mailbox happens to contain. If the lawyer wants it evidenced, the
  platform would need to store it — `terms_acceptances` shows the pattern
  already exists.
- Section 8's commission is triggered by an introduction, so the record of who
  agreed to what, and when, is commercially load-bearing as well as a data
  protection question.

### A3 — Sub-processors and international transfers were not addressed · **PARTLY FIXED 2026-08-28** (the legal determination is still open)

`terms.s10.p5` refers generically to *"hosting, database, and email delivery"*
providers. In fact:

- **Supabase** hosts the database and authentication.
- **Resend** delivers email. Resend is US-based, and every notification carries
  a participant's email address.
- **GitHub Actions** runs the scheduled jobs, with database credentials.

There was no mention of **where** personal data is processed, of transfers
outside the UK/EEA, or of any transfer mechanism (adequacy, SCCs, IDTA). Given a
US email provider and a Spanish-language interface aimed at participants who may
be in the EU, this was a genuine gap rather than a drafting nicety.

**What changed.** A new paragraph, `terms.s10.p6` "Where your data is
processed", names all three providers and says what each does, and states that
email delivery and the scheduled tasks are performed by providers established in
the United States — so an email to a participant transfers their address and the
message content outside the UK and the EEA. `terms.s10.p5` now points forward to
it. Section 10 went from 9 paragraphs to 10, so `TERMS_SECTION_PARAGRAPHS` and
the old p6–p9 were renumbered to p7–p10; the controller is now **p9** and
complaints **p10**.

**Two new placeholders, deliberately.** These are legal or account facts that
cannot be established from the code, and inventing either would be worse than
marking it:

| Placeholder | Where the answer comes from |
| --- | --- |
| `[PLACEHOLDER — database hosting region]` | Supabase Dashboard → Project Settings → General → Region. Not discoverable from the database: the server reports UTC and nothing about its location. |
| `[PLACEHOLDER — international transfer safeguard…]` | Depends on where the controller is established, which is itself a section 16 placeholder, and on what is actually in the Supabase and Resend terms. |

Placeholders per language therefore go from **12 to 14**.

**Still open for the lawyer:**

- Whether a processor agreement (DPA) is in place with Supabase and with Resend,
  and whether GitHub needs one. Nobody has checked; the repository cannot show
  it either way.
- Whether naming three providers is sufficient, or a maintained sub-processor
  list with a change-notification commitment is required.
- Whether GitHub Actions should be described as a processor at all. It runs
  scheduled jobs holding database credentials, so it can reach personal data,
  but it stores none itself. It is named here on the cautious reading.

---

## B. Data protection

### B1 — No lawful basis is stated · HIGH

`terms.s10.p3` explains *why* data is collected, thoroughly. It never states the
**lawful basis** under GDPR Art. 6 — contract, legitimate interests, consent, or
legal obligation — for any of it. Art. 13(1)(c) requires it, and where the basis
is legitimate interests, those interests must be spelled out.

### B2 — The list of data subject rights is partial · MEDIUM

`terms.s10.p9` (p8 before the v2.4 renumber) offers *access, correct, delete*. Not mentioned: restriction of
processing, objection, data portability, and the right not to be subject to
automated decision-making. The right to complain to a supervisory authority
**is** covered (p9).

Related question worth asking in the same breath: the platform's **matching**
function (`generate_matches_for_listing`) pairs listings automatically. It only
suggests matches to an Operator and has no effect on any individual, so it is
almost certainly not automated decision-making in the Art. 22 sense — but the
lawyer should confirm, since it is the only automated processing here.

### B3 — Retention is described by criteria, not periods · MEDIUM

`terms.s10.p6` says data is kept *"as long as it is needed"* and evidential
records *"for as long as a claim arising from them could still be brought"*.
Art. 13(2)(a) allows criteria instead of a fixed period, so this may well be
adequate — but "as long as a claim could be brought" is doing a lot of work and
should be tied to a limitation period.

Note also that **no deletion process exists in the code**. Nothing purges
anything on a schedule; `activity_log` and `email_outbox` grow forever. The
notice describes a retention practice that is not currently implemented.

### B4 — UK/EU split and the Art. 27 representative · MEDIUM

Section 15 chooses English law. If the operating company is established in the
UK and offers the service to participants in the EU — which the Spanish-language
interface suggests is intended — then **UK GDPR and EU GDPR may both apply**,
and an EU representative under Art. 27 may be required. The supervisory
authority placeholder in p10 is currently singular; there may need to be two.

This cannot be resolved until the section 16 company details exist, so it is
naturally a question for the same conversation.

---

## C. Commercial terms

### C1 — Section 8 commission: an agreement to agree · HIGH

Section 8 is the clause with money attached, and the one most likely to be
tested. It says the Operators are entitled to *"the commission agreed between
the parties during negotiation"*.

If no commission has been agreed — because the participant circumvented the
Operators before any negotiation — the clause appears to define the debt by
reference to an agreement that never happened. Under English law an agreement to
agree is generally unenforceable for uncertainty, which would leave the
non-circumvention obligation with no quantified remedy attached to it.

Worth asking the lawyer about: a default or fallback rate, a formula, a
liquidated damages provision, or an express reasonable-fee mechanism.

### C2 — Section 8 breadth · MEDIUM

The clause runs 24 months from introduction, binds the participant in respect of
the counterparty *and* its "affiliates, employees, agents, and related
companies", and applies "regardless of which side makes the approach". A lawyer
should confirm this survives a restraint-of-trade challenge, and that the
affiliate wording is definite enough to be enforceable.

### C3 — Section 8 refers to third parties, but third-party rights are not addressed · MEDIUM

Section 8 creates expectations about affiliates and related companies who are
not parties to the Terms, and there is no clause dealing with the Contracts
(Rights of Third Parties) Act 1999 — neither excluding it nor conferring rights
deliberately. Standard in an English-law contract; absent here.

### C4 — What survives loss of access? · MEDIUM

Section 13 lets the Operators withdraw access at any time without reason.
Section 8 binds the participant for 24 months after an introduction. **The Terms
never say that section 8 survives termination**, nor whether a participant whose
access is withdrawn remains bound.

There is also no exit route for a participant: no clause on how to leave, what
happens to their listings and data when they do, or which obligations continue.

### C5 — Section 11: a total exclusion with no cap · HIGH

Section 11 excludes liability for essentially everything, subject only to the
usual carve-outs for fraud and death/personal injury. Under UCTA 1977 an
exclusion in standard terms is subject to a **reasonableness test**, and a
blanket exclusion with no liability cap at all is the kind that is most often
struck down — in which case the clause could fail entirely rather than being
read down.

A cap ("liability shall not exceed £X or fees paid in the preceding 12 months")
is the conventional way to make such a clause defensible. There is none, partly
because the platform currently charges no fees, which itself makes a
fee-based cap awkward. Worth the lawyer's attention.

### C6 — Section 12's blanket release · LOW/MEDIUM

*"You release the Operators from all claims arising out of any such dispute."*
Broad releases of unknown future claims can be vulnerable. Likely fine B2B, but
cheap to confirm alongside C5.

---

## D. Contract mechanics

### D1 — Acceptance of changes · MEDIUM

Section 14 says material amendments will be put to participants for acceptance,
but that continued use constitutes acceptance of any amendment. A lawyer should
say whether "continued use" is sufficient here, and who decides what counts as
"material".

**Implementation note:** the platform *does* record acceptance properly —
`terms_acceptances` stores the version and language accepted per user, and
`TERMS_VERSION` is bumped on every text change. Re-acceptance on a material
change is therefore enforceable in the product if the lawyer wants it. That
mechanism is available and currently only used at registration.

### D2 — Missing boilerplate · MEDIUM

No severability, no entire agreement, no force majeure, no assignment/novation,
no notices provision beyond section 16, no waiver clause. Severability is the
one that matters most given C1, C2 and C5: without it, a single unenforceable
clause is more dangerous than it needs to be.

### D3 — No intellectual property clause · LOW

Nothing addresses who owns listing content, what licence participants grant the
Operators to store and display it, or what happens to that content after an
account ends. Section 7 forbids scraping and redistribution but never
establishes ownership.

### D4 — Two languages, no precedence clause · MEDIUM

The Terms exist in English and Spanish, and participants accept in whichever
language their interface is set to — `terms_acceptances` records which. Nothing
says **which version governs** if the two are ever found to differ.

This is not hypothetical: a translation discrepancy in the Privacy Notice was
found and corrected on 2026-08-27 (the Spanish said *cifrada*, implying
recoverable encryption, where the English said *hashed*). It was caught by
chance. A prevailing-language clause is the usual answer.

### D5 — "The Operators" is never defined as a legal person · MEDIUM

The Terms refer throughout to "the Operators", plural, and section 16 defines
that phrase as a single company — currently a placeholder. Until section 16 is
completed it is not clear whether obligations run to a company, to individuals,
or to both. Worth confirming the plural usage does not create personal liability
for the individuals acting as Operators.

---

## E. Standing blocker

**The Terms cannot go live in their current state.** Fourteen placeholders per
language remain — section 16 (company legal name, incorporation, registration
number, registered office, trading address, VAT number, notices address) and the
Privacy Notice p9/p10 (data controller name and address, data protection contact,
supervisory authority), plus the two transfer placeholders added in A3.

`terms.s16.p6` says so in the rendered text, and an amber banner appears above
the Terms. Two E2E tests assert that every bracketed span is marked
`PLACEHOLDER`, so filling one with an invented value fails the suite by design.

**Do not fill these in to make the document look finished for the lawyer.** They
are the accurate current state, and several questions above (B4, D5) cannot be
answered until the real company details exist.

Nobody has accepted any version yet — `terms_acceptances` is empty on the live
database — so completing the Terms creates no re-consent problem.

---

## Suggested order

1. **Company details** (section 16) — several questions cannot be answered
   without them.
2. **A1, A2, A3** are all corrected in the text and now need review rather than
   drafting. A3 carries two live questions with it: is there a DPA with
   Supabase and Resend, and what transfer safeguard should be named?
3. **C1 and C5** — the two clauses with the most money attached.
4. **B1–B4** — the data protection set, as one conversation.
5. **D1–D5** — mechanics and boilerplate.
