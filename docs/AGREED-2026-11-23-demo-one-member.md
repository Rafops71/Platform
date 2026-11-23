# AGREED 23 Nov 2026: the member demo, one member, a new first page (owner's decisions, BATCH GO on 23 Nov)

Job 8 of the 23 Nov batch. The owner's decisions, as the supervisor passed them on, nothing added or interpreted:
1. ONE entry button, ONE example member only (the old demo had two and confused his friends). No password.
2. Top of the page: the name only (MyPlatform). No sentence, no feature lines.
3. The tester chooses their role per offer on the posting form (poster_role principal / mandated / broker, principal_kind producer / trader, as in the real app). No role per account. Buyer side = browse offers and post a buy request, as a real member can. Seed data must make both sides usable.
4. No film or trailer in the demo (films on hold). Remove the trailer from the demo panel in js/demo/demo-ui.js; do not delete the film files.
KEEP: the ribbon "DEMO — example data, nothing is saved"; the EN / ES switch on the member demo. The Operator demo is untouched (English, one button, as now).
Any new visible wording is the owner's choice. Spanish route B for anything new.

## The owner's answers on the details (23 Nov, passed on by the supervisor)
1. Button text: "Enter the demo". English only, like the buttons before it (he asked for no Spanish).
2. Of the four things the builder listed (tagline, sign-in form with "Forgotten your password?", walkthrough film, "Access is by invitation only."), he chose to remove ONLY the line "Access is by invitation only.". The tagline, the normal sign-in form and the walkthrough film stay. The trailer in the entry panel is removed (his earlier answer). If anything conflicts with his earlier "no password / no film", the literal answer is built and the supervisor asks him. **The builder sees one such conflict: the kept sign-in form has a password box and the kept walkthrough film is a film on the page. The entry button itself needs no password.**
3. The member: the seeded Member A, no Member B entry (a seed detail, not specified by him).

## What the builder did
- `js/demo/demo-ui.js`: the trailer is removed from the entry panel; the panel has ONE button, "Enter the demo", above the unchanged sign-in form. `js/demo/seed.js`: one entry, `member` = the seeded Member A. Member B stays in the seed (their offers are what the one member browses); there is no way in as them.
- `scripts/build-demo.js` takes the line "Access is by invitation only." out of the demo's COPY of `index.html` (never out of the real page) and refuses to build if the line is not where expected or survives.
- Both sides are usable with the seed as it was: Browse shows the other member's sell offers and buy requests (Contact works), the posting form offers principal / mandated / broker, Producer or Trader for a principal's Sell offer, and a Buy request with the same role choice and no Producer or Trader; a buy request can be posted and is listed.
- `tests/demo/demo.spec.js` proves: one button "Enter the demo" and no "Member A / Member B / Enter as", no Operator entry, the language switch stays, the ribbon, the invitation line gone in English and Spanish (and still in the real page), no trailer in the panel and no trailer file requested, the role choices on the posting form for both types, a buy request can be posted, and the older walk-through checks for the one member.
