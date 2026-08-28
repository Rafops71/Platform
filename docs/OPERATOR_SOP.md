# Operator Standard Operating Procedure

For the people running the Jericho Platform. Practical, in the order you
actually do things.

---

## The one rule everything else serves

**Participants are anonymous to each other, and every message passes through
you.** There is no direct contact. You are not a moderation layer bolted onto a
marketplace — you are the connection itself. Nothing reaches a participant that
an Operator did not send.

That means two failure modes matter more than any other:

1. **Leaking an identity.** A name, company, email or phone number that reaches
   the wrong side cannot be recalled.
2. **Sitting on a message.** A forwarded enquiry that waits three days is a deal
   that quietly did not happen. Nobody complains; they just stop using the
   platform.

Everything below is in service of those two.

---

## 1. The daily pass

Sign in. You land on **Overview**, which is a to-do list, not a report. Five
tiles, each a count of things waiting for a human:

| Tile | What it counts | Where it takes you |
| --- | --- | --- |
| Pending registrations | `profiles` awaiting approval | Approvals |
| Messages | messages `pending_review` | Mailbox |
| Document requests | requests still `requested` | Document Requests |
| Matches | matches still `new` | Matches |
| Stale listings | `available`, untouched 30+ days | All Listings, pre-filtered |

**Work them in that order.** It is roughly cheapest-first, and approvals gate
everything else — an unapproved participant cannot read the reply you forward.

A tile showing **`—`** is not zero. It means the count query failed. Refresh; if
it persists, something is wrong with the database connection, and the other
tiles are not trustworthy either.

Target: clear Messages and Approvals every working day. Documents and Matches
can run a day or two behind. Stale listings are a weekly job.

## 2. Approvals

**Approvals** lists everyone who has registered and is waiting.

For each, you see name, company, job title, country, phone and email. Before
approving, satisfy yourself that:

- The company is real and trades in the commodities concerned.
- The person plausibly works there — a corporate email domain matching the
  company is the strongest cheap signal.
- You (or whoever invited them) know why they were invited.

**Approve** lets them sign in, immediately, and they are emailed. **Reject**
does not. If you are unsure, leave them pending and find out — pending is a
holding state with no cost, and approving is hard to walk back socially even
though `Suspend` exists.

Approving is the moment a stranger becomes someone whose enquiries you will
forward to your existing members. Treat it as the gate it is.

## 3. Invitations

**Invitations.** Nobody joins without one.

**To invite:** enter the email address, pick the language the invitation should
be written in (English or Spanish), and send. The platform emails a
registration link.

Each invitation is **valid 5 days and single-use**.

Per invitation you can:

- **Copy link** — for when you would rather send it yourself, through a channel
  the recipient already trusts.
- **Edit** — correct a mistyped address, or push the expiry date out.
- **Resend email** — re-sends the same link. Use this first when someone says
  it never arrived; it usually means spam folder.
- **Delete** — revoke it. Do this the moment an invitation goes to the wrong
  address. The link works until deleted or expired.

Expired invitations show as expired and offer only **Delete**.

**Housekeeping:** clear out used and expired invitations periodically. A long
list of dead invitations makes it hard to see the live ones, and the live ones
are the ones that need chasing.

## 4. The Mailbox — and the forwarding rules

**Mailbox** is where the brokering happens. It holds every message on the
platform. Rows marked **pending review** are the ones needing you.

For each pending message you have three actions: **Forward**, **Reply**,
**Ignore**.

### Before forwarding — read the body

Check it for anything that identifies the sender:

- Names, company names, email addresses, phone numbers, websites
- "As we discussed at [conference]", letterheads pasted into the text, bank
  details, signatures

**If the message identifies its sender, do not forward it.** Use **Reply** to
ask the sender to resend without those details. Forwarding is not editing —
what you forward is what they wrote.

### Who a forward goes to

The platform works this out; you should still know the rule, because it is the
single place this system has been wrong before:

- **An opening enquiry** (not a reply to anything) goes to **the listing
  owner**. The button reads *Forward to Owner*.
- **A reply** goes to **whoever wrote the message it answers** — which is *not*
  the listing owner, because on a reply the owner is the one replying. The
  button reads *Forward Reply* and the modal names the recipient.

The platform refuses to forward a message back to its own author, and refuses
when there is nobody to forward to. If you see either error, stop and read the
thread — it means the message is not what you assumed.

Threads alternate correctly for any number of turns. You do not need to track
who is "buyer" and who is "seller"; forward each message and the routing
follows.

### Reply vs Forward

- **Forward** passes a participant's message to the other side, anonymously.
- **Reply** answers the sender *as an Operator*. Use it to ask for a rewrite,
  to explain a delay, or to decline. Your reply is threaded onto the message it
  answers and is marked handled — it will not come back into the queue as if it
  were a new enquiry.
- **Ignore** marks a message handled without sending anything. Use it for spam
  and duplicates. It is not a bin: the message stays in the log.

### Timing

Same working day for anything that looks commercial. If you cannot action it,
**Reply** to say so. Silence is the one response that costs you a participant.

## 5. Document requests

**Document Requests.** Use these when a listing needs substantiating before you
are willing to broker an introduction.

**To request:** choose the listing, choose the document type, send. The owner
gets a notification and sees it under **Documents**.

**No file is ever uploaded.** The participant answers *I have this document* or
*Not available*. You are collecting an assertion, not evidence.

Be deliberate about what that is worth. A confirmed assay means the owner says
an assay exists. It is a filter against time-wasters, not proof of anything, and
it should never be described to the other side as verification.

**Chase unanswered requests.** A request that sits at `requested` for a week is
usually a participant who has lost interest — worth knowing before you introduce
them to someone.

## 6. Matches

**Matches** shows pairs the platform has generated automatically — a Sell Offer
and a Buy Request in the same commodity — scored high, medium or low.

These are **suggestions from a simple rule**, not judgements. The score reflects
how well the fields line up, and it knows nothing about quantity being wildly
mismatched, incoterms that make no sense together, or two parties who should
not be introduced.

For each: **Mark Reviewed** (you have looked, and it is noted) or **Dismiss**
(remove it from the list permanently).

Working the list:

1. Read both listings in full, not just the commodity.
2. Sanity-check quantity, incoterm, origin/destination, and timing.
3. If it is genuinely promising, act on it — see section 8. Marking a match
   reviewed does not tell either participant anything.
4. If not, **Dismiss**, so the list stays a queue rather than a graveyard.

Reviewing is timestamped and feeds **Analytics**, so a match left `new` forever
makes the platform look idle even when you are busy.

## 7. Stale listings

A listing is **stale** at 30 days without an update. The owner sees a prompt
asking whether it is still available; you see the count on **Overview**.

Clicking the tile opens **All Listings** filtered to stale ones, with a note
saying so and a **Show all** to clear it. Search or Clear also drops the filter
— if the list looks wrong, check whether the filter is still on.

Per listing, **Remind** sends the owner a reminder.

Weekly: work the stale list, remind the owners, and for anything long dead ask
directly whether to close it. A browse view full of listings nobody has looked
at in two months is the fastest way to make the platform feel abandoned.

## 8. Introducing two parties

The point of the whole exercise. Everything up to here is anonymous; this is the
step that is not.

**Introduce only when all of these hold:**

1. Both sides have engaged — a real exchange through the mailbox, not one
   enquiry and silence.
2. The commercial fit is real: commodity, quantity, incoterm, timing.
3. Any document requests you thought necessary have been answered.
4. **Both parties have agreed to be introduced.** Ask each, separately, through
   the mailbox.

That last one is not a formality. Until you have it in writing from both, an
introduction is you disclosing one participant's identity to another without
their consent — the exact thing the platform promises not to do, and section 8
of the Terms (non-circumvention, 24 months) is what makes the disclosure worth
something to you commercially.

**How:** the platform has no "introduce" button, by design — the moment is
deliberately manual. Send an email to both parties, from your own Operator
address, naming both, referencing the listing, and stating plainly that from
this point they are in direct contact and the non-circumvention terms apply.

Then log it: a short note on the listing, or a message in the thread, so the
next Operator can see the relationship exists.

## 9. User management

**Users** lists every account. Per user:

- **Approve** — same as Approvals, for anyone still pending.
- **Suspend** — revokes access immediately. Their listings stay. Use it for a
  participant who has broken the rules (attempted circumvention, abusive
  messages, repeated identity leaks) or a company you have lost confidence in.
- **Reinstate** — returns a suspended user to approved.
- **Promote to Operator** — full access to everything here, including every
  identity behind every anonymous listing.
- **Demote to Participant** — the reverse.

**On promotion:** an Operator sees everything. Every real name behind every
listing, every message, the whole activity log. Promote only people who would
be trusted with the client list on paper, because that is what it is.

**Do not demote yourself.** If you are the only Operator, you would lock the
platform out of administration entirely. Check there is another approved
Operator first:

```bash
node scripts/q.js "select count(*) from public.profiles where role='operator' and status='approved'"
```

**On suspension:** it stops access; it does not remove their data or withdraw
their listings from Browse. Close or remove the listings separately if that is
what you intend.

## 10. Activity Log and Analytics

**Activity Log** — the last 200 actions, who did what and when. First place to
look when something is not as you left it.

**Analytics** — five counts per period (registrations, new listings, messages
reviewed, introductions made, matches reviewed), weekly or monthly. It answers
"is this place busier than it was", which Overview cannot.

Two things to know before you read anything into it:

- **`reviewed_at` was added in `sql/015` and nothing was backfilled.** Messages
  and matches actioned before that date appear in no period at all. Early
  periods therefore understate real activity.
- **Introductions counted here are forwards**, not the formal introductions of
  section 8, which happen over email and are invisible to the platform.

---

## Quick reference

| Situation | Do this |
| --- | --- |
| Invitation "never arrived" | Resend email; tell them to check spam |
| Wrong address invited | Delete the invitation immediately |
| Registration you cannot vouch for | Leave pending, find out, then decide |
| Message contains sender's identity | Do not forward. Reply asking for a rewrite |
| "Forward would send it back to its author" | Stop; re-read the thread |
| Overview tile shows `—` | Count query failed. Refresh; suspect the connection |
| Listing untouched 30+ days | Remind; if long dead, ask about closing |
| Both parties keen and agreed | Introduce by email, then log it |
| Only one Operator left | Do not demote or suspend anyone with the role |
