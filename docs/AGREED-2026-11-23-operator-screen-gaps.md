# Operator screen gaps (23 Nov 2026)

Job 4 of the 23 Nov batch (owner: BATCH GO, 23 Nov; the supervisor's brief). The Operator console is English only. No member-visible wording, no migration.

1. **Match Suggestions: a Read control** on each suggestion. It shows BOTH listings, each built by the same function as the All Listings panel (`listingReadHtml`), and ONE Translate control at the very bottom of the panel for the whole match (not one per listing). The two listings are read when Read is pressed, so the list itself stays as light as before. Checklist Item 90.
2. **Deals: a Read control** on each deal file: the listing the file is about, through the same panel and the same single Translate control. A file whose listing has been deleted says so and offers nothing to translate. Item 91.
3. **Pending Approvals and Users rows** show job title, the capacity the member signs in (Individual / Company) and language (English / Spanish); "Not stated" when empty. Not the postal address. Item 92, and the prohibition Item 93 (the two lists never read an address field and never show one).

The labels are the console's own plain ones ("Job title", "Signing as", "Language", "Not stated", "The listing ... is no longer on the platform."); the owner can change any of them.

Proof: `tests/e2e/operator-screen-gaps.spec.js`, a parity test and a screen test per item. Written, not yet run: the browser tests need CI.
