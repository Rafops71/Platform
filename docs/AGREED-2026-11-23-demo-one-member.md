# AGREED 23 Nov 2026: the member demo, one member, a new first page (owner's decisions, BATCH GO on 23 Nov)

Job 8 of the 23 Nov batch. The owner's decisions, as the supervisor passed them on, nothing added or interpreted:
1. ONE entry button, ONE example member only (the old demo had two and confused his friends). No password.
2. Top of the page: the name only (MyPlatform). No sentence, no feature lines.
3. The tester chooses their role per offer on the posting form (poster_role principal / mandated / broker, principal_kind producer / trader, as in the real app). No role per account. Buyer side = browse offers and post a buy request, as a real member can. Seed data must make both sides usable.
4. No film or trailer in the demo (films on hold). Remove the trailer from the demo panel in js/demo/demo-ui.js; do not delete the film files.
KEEP: the ribbon "DEMO — example data, nothing is saved"; the EN / ES switch on the member demo. The Operator demo is untouched (English, one button, as now).
Any new visible wording is the owner's choice. Spanish route B for anything new.

## What the builder did
- `scripts/build-demo.js` takes the tagline, the whole sign-in card (email, password, "Forgotten your password?"), the walkthrough film card and the "Access is by invitation only." line out of the member demo's COPY of `index.html` (never out of the real page) and leaves a slot; `js/demo/demo-ui.js` puts ONE button in it. The page is the language switch, "MyPlatform", the button and the ribbon. The build refuses if the copy still has a password box, a film, the tagline or the invitation line, or if it has no slot.
- The trailer code is removed from `js/demo/demo-ui.js`. The member demo no longer ships `films/` (91 MB; no page of it points at a film); the film files stay in the repository, and the Operator demo is untouched.
- ONE member: `js/demo/seed.js` has one entry, `member` (the seeded Member A, who owns the odd-numbered demo listings, has messages, a saved search and deal files). Member B stays in the seed because their listings are what the one member browses; there is no way in as them.
- Both sides are usable with the seed as it was: Browse shows the other member's sell offers and buy requests (a Contact works), and the posting form offers all three roles, Producer or Trader for a principal's Sell offer, and a Buy request with the same role choice and no Producer or Trader.
- `tests/demo/demo.spec.js` proves: one button and no second member, no input of any kind, only "EN ES MyPlatform Enter as Member" on the page, the language switch, no video element and no film request or file, the ribbon on every page, the role choices on the posting form for both types, a buy request can be posted and listed, and the older walk-through checks for one member.
- Button wording: "Enter as Member" (the existing words minus the letter), English only like the buttons before it; the owner may choose other words.
