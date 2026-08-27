# Jericho Platform — Product and Business Review Brief

This document describes what the Jericho Platform does from a user and business
point of view. It is written in plain language for a business reader and
deliberately avoids technical detail.

Its purpose is to give a product or business advisor enough understanding of how
the platform works today that they can identify what is missing: features,
business rules, safeguards, or operational tools that would make it more useful,
safer, or easier to run.

---

## 1. What Jericho Platform is, in plain words

Jericho Platform is a **private, invitation-only tool for physical commodity
brokers**. It is closed by design: nobody can find it, join it, or see anything
in it without being personally invited and then approved.

Members, called **Participants**, publish two kinds of listing:

- **Sell Offers** — "I have this material available."
- **Buy Requests** — "I am looking for this material."

Every listing is **anonymous to other Participants**. A Participant browsing the
platform can read the full commercial description of an opportunity but has no
way of knowing who posted it.

A small number of **Operators** sit in the middle. They see everything —
including who is behind each listing — and privately introduce counterparties to
one another when a match looks worthwhile. Every contact between two
Participants passes through an Operator.

**What it is not:**

- **Not a trading exchange.** No trades are executed. There is no order book, no
  bid/ask matching for execution, no prices set by the platform.
- **Not a payments system.** No money moves through it. No escrow, no invoicing,
  no settlement.
- **Not a public marketplace.** There is no public signup and no public listing
  pages. Nothing is visible to anyone outside the member group.
- **Not a messaging app.** Participants cannot message each other. Only an
  Operator can pass a message from one person to another.

The business model it supports is traditional brokerage: the Operator's value
comes from knowing both sides and controlling the introduction.

---

## 2. The two roles and what each person can do

### Operator

The Operator role is held by the two people who run the platform, Rafael and
Rodrigo. An Operator can:

- See **all** listings, with the real identity of every poster.
- Approve or reject people who have registered and are waiting.
- Create, edit, resend, and delete invitations.
- Manage the commodity list that Participants choose from.
- Read the entire message queue and decide what happens to each message.
- Forward a message to the right person, reply directly, or ignore it.
- Request specific documents from a Participant and see their response.
- Review the platform's match suggestions.
- View the full activity log of everything that has happened.
- Manage members: promote someone to Operator, demote an Operator, suspend a
  member, or reinstate a suspended one.
- Send a manual reminder about a listing that has gone stale.

### Participant

A Participant is an invited broker. To other Participants they are completely
anonymous. A Participant can:

- Create, edit, and remove their own Sell Offers and Buy Requests.
- Declare which supporting documents they hold for each listing.
- Browse other members' listings anonymously, with filters.
- Contact a listing — which sends the message to the Operator, not the poster.
- Read messages an Operator has forwarded to them, and reply.
- Respond to document requests raised by an Operator.
- See their own notifications.
- Edit their own profile.
- Switch the interface language between English and Spanish at any time.

**What a Participant explicitly cannot do:** see who posted a listing, see who
is asking about theirs, contact another member directly, see the member list,
see anyone else's activity, or change their own account status or role.

---

## 3. Participant journey, step by step

1. **Invitation.** An Operator issues an invitation to a specific email address,
   choosing English or Spanish. The Participant receives a link by email; the
   Operator can also pass the link on manually. **Invitations expire after five
   days** and can only be used once.

2. **Registration.** Following the link, the Participant provides first name,
   last name, company (optional), country, phone, email, and a password, and
   chooses their preferred language.

3. **Waiting.** The account is created in a **pending** state. The Participant
   receives a confirmation that their registration was submitted, and cannot yet
   use the platform. Operators are notified that someone is waiting.

4. **Decision.** An Operator approves or rejects the registration. Either way the
   applicant receives an email, in their own language.

5. **First login.** Once approved, the Participant signs in and reaches their
   dashboard.

6. **Creating a listing.** They choose Sell Offer or Buy Request and complete:
   commodity, quantity, unit, specification, incoterm, origin or destination,
   price conditions, price unit, currency, and free-text notes.

7. **Declaring documents.** They tick which supporting documents they hold, from
   a two-group checklist (described in Section 7).

8. **My Listings.** The listing appears under *My Listings* with an automatically
   assigned reference such as **SELL-26-001** or **BUY-26-004**. This reference
   is how everyone — including the Operator — refers to it, without using names.

9. **Managing the listing.** It can be edited or removed at any time. It also
   carries a status the Operator can move through: *available*, *under review*,
   *in negotiation*, *closed*, or *archived*.

10. **Browsing.** The Participant browses other members' listings, filtering by
    type, commodity, origin/destination, and status. What they see is
    deliberately reduced: the commercial essentials and a general region, but
    never a name, company, or exact location.

11. **Making contact.** Interested in a listing, they send a message. It goes to
    the Operator queue. **The listing owner does not see it and is not told it
    exists.**

12. **Receiving a message.** If the Operator forwards it, the message appears in
    the recipient's mailbox and they are notified.

13. **Replying.** The reply goes back through the Operator, who forwards it on to
    the person who originally asked. The conversation can continue back and
    forth this way indefinitely.

14. **Notifications and reminders.** The Participant is notified about approval,
    forwarded messages, listing status changes, document requests, and new
    listings. If a listing goes **30 days** without activity, they are reminded
    to confirm it is still valid or remove it.

15. **Language.** They can switch between English and Spanish at any point, and
    the choice sticks — including for the emails they receive.

---

## 4. Operator journey, step by step

1. **Sign in** to the Operator dashboard, which is a different and much broader
   view than the Participant one.

2. **Approvals.** Work through pending registrations, approving or rejecting
   each. This is the gate that decides who gets in.

3. **Invitations.** Create new invitations, choosing the recipient's language.
   Edit an invitation that has not been used, resend it, or delete it.

4. **All listings.** See every listing on the platform, with the real identity of
   each poster, and change a listing's status as a deal progresses.

5. **Commodities.** Maintain the commodity list that every Participant selects
   from, adding or removing entries to keep it relevant and consistent.

6. **Mailbox.** Review every message in the queue. For each one, decide to:
   - **Forward** it to the correct recipient, which is what makes it visible;
   - **Reply** directly as the Operator; or
   - **Ignore** it.

7. **Document requests.** Ask a specific Participant for a specific document
   type against a listing, and track whether they have responded.

8. **Matches.** Review the platform's suggested pairings between opposite
   listings, and mark each as reviewed or dismiss it. These are prompts for the
   Operator's judgement, never automatic introductions.

9. **Activity log.** Review a running record of what has happened across the
   platform — registrations, listing changes, document activity, messages, and
   forwards.

10. **User management.** Promote a Participant to Operator, demote an Operator,
    suspend a member who should no longer have access, or reinstate one.

11. **Reminders.** Send a manual nudge about a listing that looks stale, in
    addition to the automatic 30-day reminder.

---

## 5. Communication model

This is the heart of the product and the part most worth scrutinising.

- **Participants never see each other's names, companies, email addresses, or
  phone numbers.** Not on a listing, not in a message, not anywhere.
- **All contact goes through an Operator.** There is no direct channel between
  two Participants, by design.
- **A message is invisible to its intended recipient until an Operator forwards
  it.** Until that moment it exists only in the Operator's queue. A Participant
  cannot tell whether anyone has enquired about their listing.
- **Anonymity works in both directions.** The person asking never learns who
  posted; the person who posted never learns who is asking.
- **Replies thread correctly.** When someone replies, the Operator is shown the
  right person to send it back to — the one who wrote the message being answered,
  not simply the listing owner. This means a genuine back-and-forth conversation
  can run for as many turns as needed, with the Operator brokering every hop and
  neither side ever learning the other's identity.

The practical effect is that the Operator retains complete control of the
relationship. Two Participants can negotiate at length through the platform and
still only meet when the Operator decides to introduce them.

---

## 6. Email notifications

The platform sends the following emails automatically:

| Email | Sent to | When |
|---|---|---|
| **Invitation** | The invited person | An Operator creates an invitation |
| **Registration submitted** | The applicant | They complete registration |
| **Approval** | The applicant | An Operator approves them |
| **Rejection** | The applicant | An Operator rejects them |
| **New listing** | All approved members **except the poster** | A new listing is published |

Key points for review:

- **Emails are sent in the recipient's own language.** A Spanish-speaking member
  receives Spanish; an English-speaking member receives English. This follows the
  language they chose, not the language of whoever triggered the email.
- **The poster is deliberately excluded** from the new-listing notification, so
  nobody is told about their own listing.
- **Operator-facing email remains in English.**
- The new-listing email describes the opportunity so members can act on it
  without logging in first.

---

## 7. Documents

The platform handles documents as **declarations, not files**.

- **Participants do not upload anything.** There is no file storage.
- Instead, for each listing they tick which document types they are able to
  provide, from two groups:

  **Material / Product Documentation** — Certificate of Analysis (COA), Assay
  Report, Certificate of Origin, Photos, Videos, Warehouse Receipt (where
  applicable), Bill of Lading / Shipping Documentation (where applicable),
  Packing List (where applicable), and other product or material documentation.

  **Company / Compliance & Supporting Documentation** — Company Registration /
  Corporate Documents, KYC Documentation, CIS (Customer Information Sheet), and
  Other.

- A browsing Participant can see **whether** a listing has supporting
  documentation, which is a useful credibility signal, without seeing the
  documents themselves.
- An **Operator can formally request** a specific document type from a specific
  Participant, and the platform tracks whether they have responded.
- The actual exchange of documents happens outside the platform, once the
  Operator has made an introduction.

---

## 8. Language

- The **Participant interface is fully bilingual, English and Spanish**, with a
  toggle at the top of the screen that switches everything immediately.
- The choice is remembered for that member and also drives the language of the
  emails they receive.
- **Dates are shown in European format (DD/MM/YYYY).**
- The Spanish is written as proper professional commercial Spanish, not a literal
  word-for-word translation — trade terms read the way a Spanish-speaking broker
  would expect.
- Commodity names, units, and incoterms keep their standard international form
  so that a reference means the same thing in both languages.
- **The Operator dashboard remains in English.**

---

## 9. Known product gaps and open questions

These are known and deliberate omissions or unresolved decisions, listed so an
advisor can judge which matter most.

**Legal and compliance**
- **No legal disclaimer or Terms of Use.** Nothing tells users what the platform
  is and is not responsible for.
- **No record of terms acceptance at registration.** There is no evidence that a
  member agreed to anything when they joined.
- No privacy notice covering the personal and company data being held.
- No formal record of the broker relationship or commission arrangement.

**Documents**
- No file upload or in-platform document exchange. Documents are declared and
  requested, then exchanged elsewhere.
- No way to verify that a declared document actually exists.

**Listings**
- **No automatic expiry.** Listings stay live indefinitely; the only mechanism is
  a 30-day reminder asking the owner to confirm or remove.
- No history of past or closed deals a member can look back on.

**Communication**
- **No direct Participant-to-Participant messaging.** This is intentional and
  central to the model, but it does mean every message costs Operator time.
- No indication to a Participant that their listing is attracting interest.

**Discovery**
- **No saved searches, watchlists, or alerts.** A member must browse to discover
  anything, or wait for the new-listing email.
- No way to register a standing interest in a commodity.

**Matching**
- **Matching is simple**: opposite listing types, same commodity, with a rough
  score based on quantity range and location overlap. It produces suggestions for
  the Operator, nothing more.
- No learning from which suggestions the Operator actually acted on.

**Operator tooling**
- **No workload or performance dashboard** — no view of how many messages are
  waiting, how long they have been waiting, or how quickly they are handled.
- No way to divide work between two Operators, or to see who handled what.
- No reporting on platform activity, member engagement, or deal flow.

**Participant transparency**
- **No audit or activity export for Participants.** A member cannot download a
  record of their own listings and messages.

**Open question already identified**
- The new-listing email includes the full listing detail, while the browse screen
  deliberately shows less — withholding the detailed specification, price
  conditions, and notes, and generalising the exact origin to a region. Both
  behaviours were asked for, but together they mean **a member who reads the
  email learns more than a member who browses the same listing.** A decision is
  needed on whether the email should be trimmed to match the browse view, or the
  browse view widened to match the email.

---

## 10. Purpose of this document

This description exists to be handed to a product or business advisor.

The platform's core mechanics are built and working: invitation-controlled
access, Operator approval, anonymous listings, brokered two-way conversation,
document declaration and requests, bilingual operation, and automatic
notifications.

The question now is **what is missing**. Specifically:

- Which **product features** would make the platform more useful to the brokers
  who use it?
- Which **business rules** are absent that a commodity brokerage would normally
  need — around liability, terms, commission, data handling, or member conduct?
- Which **operational tools** would make the platform easier and safer for two
  Operators to run day to day, particularly as the number of members grows?
- Where does the current design create **avoidable manual work** for the
  Operators, and what would reduce it without weakening their control of the
  relationship?
- What would a broker expect to find here that is not here?

Recommendations should assume the core constraints stay fixed: the platform
remains private and invitation-only, listings remain anonymous to other members,
and every introduction continues to be brokered by an Operator rather than
happening automatically.
