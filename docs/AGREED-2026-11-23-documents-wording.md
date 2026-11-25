# AGREED 23 Nov 2026: the documents question, asked by role (owner approved the final English wording on 23 Nov)

Job 6 of the 23 Nov batch. The text below is the supervisor's brief as given, word for word.

ENGLISH (final, owner approved). Member-facing statement lines in Browse; the Operator's Read panel shows the same words (console stays English):
- "Poster:" -> "Listing member:". "Stated by the poster on {date}" -> "Stated by the listing member on {date}".
- Broker OR mandated intermediary: label "Supporting documentation status"; answers "Documents sighted" / "Documents not sighted" / "Documents not sighted; availability advised by source".
- Principal (producer or trader): label "Supporting documentation"; answers "Documentation held and available" / "Documentation not currently held".
- Fixed line "Documents: after the introduction, subject to agreement between the parties." -> "Document exchange: after the introduction, subject to agreement between the parties."

POSTING FORM, SELL offers only (Buy requests not asked, as today): broker/mandated: "Have you sighted supporting documentation for this offer?" with the three broker answers; principal: "Do you hold the supporting documentation for this offer?" with the two principal answers.

RULES: existing answers must NOT be deleted: additive migration only (new stored values for principals, e.g. held/not_held; keep yes/source_says/no for broker rows; decide the mapping and tell me; a principal's old yes/no answer must simply not be displayed under the new rule, or mapped only if you can prove it loses nothing). Neither field may imply the platform, Operator or member verified any document. Search the code for EVERY use of the old strings in js/i18n.js (EN and ES), js/app.js, js/operator.js, app.html, demos (js/demo), tests (assertions on the old text), help text, Terms text; list them all in the PR.

SPANISH: written by the builder (formal style, same register as the existing Spanish); route B: the supervisor has it back-translated by a reader that has not seen the approved English and compares; the pull request is not marked merge-ready until the supervisor clears the Spanish.

## What the builder decided (for the supervisor to read)
- **Stored values.** `listings.docs_seen` keeps `yes`, `source_says`, `no` for a broker or mandated intermediary and gains `held`, `not_held` for a principal. Migration 075 widens the check constraint and makes the server refuse the wrong role's answer on a Sell offer (the existing sentence, no new wording).
- **Mapping: none.** A principal's old `yes` ("has personally seen documents") and `held` ("holds the documentation and has it available") are different claims, so a mapping could not be proven to lose nothing. Old answers stay in the column untouched and are simply not shown for a principal (Browse and the Operator's Read panel); editing that listing asks the principal the new question, and nothing is stored until it is answered.
- **Display.** Role principal: "Supporting documentation: <held / not held>". Broker or mandated intermediary: "Supporting documentation status: <sighted / not sighted / not sighted; availability advised by source>". A role that does not fit the stored answer shows no documentation part.
- **Form.** One of two questions by role (`#docs_held` for a principal, `#docs_seen` for a broker or mandated intermediary); none before a role is chosen, none on a Buy request.
- **Left as they are, for the supervisor to decide:** the Operator console's own table header "Poster" and the filter text "Poster: any role" in `operator.html` (console labels, not statement lines); the English film script `video/script.json` ("have you personally seen them", films on hold); the history documents (`docs/AGREED-2026-10-25.md`, `docs/AGREED-2026-11-21-documents-label.md`, `docs/BUILDER-NOTES-2026-11-15.md`), which record what was decided then.

## Every use of the old strings found (searched on 23 Nov)
`js/i18n.js` (EN and ES): `stmt.docsSeen.q/yes/source_says/no`, `stmt.browse.role`, `stmt.browse.docs`, `stmt.browse.stated`, `stmt.browse.docsLine`, `stmt.browse.docs.yes/source_says/no`. `app.html`: the documents question and its three options. `js/app.js`: `statementsLine`, `showRoleQuestions`, `readListingStatements`, `editListing`. `js/operator.js`: `READ_DOCS_LABELS` and the "Poster:" / "Documents seen by poster" line of the Read panel. `js/demo/seed.js` (default `docs_seen` of the demo listings). Tests: `tests/e2e/listing-statements.spec.js`, `tests/e2e/operator-reads-listings.spec.js`, `tests/e2e/helpers/session.js`, and the SQL tests whose seeded principal Sell offers carried `yes` / `no` (01, 02, 03, 19, 20, 34, 35, 37). Help text (`js/help.js`) and the Terms text: no use found.
