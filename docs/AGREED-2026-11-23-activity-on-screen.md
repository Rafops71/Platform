# AGREED 23 Nov 2026: "Your activity" on screen instead of a spreadsheet download (owner's decision)

Owner, 23 Nov: "the member should be able to see his history on the screen but not a downloadable spreadsheet."

## Decided (owner, by button)
- The member's history is shown ON THE SCREEN on the Profile page (the card that today has the heading "Your activity" and a "Download CSV" button).
- Content: EVERYTHING the download has today (listings, messages sent and received, document requests and answers, listing renewals, account changes: my_activity_export()). Nothing added, nothing removed. Newest first.
- Length: the LATEST 50 entries with a "Show more" button for older ones.
- Wording: the card's heading AND the sentence under it are replaced by ONE line: "Activity overview" (owner: "It replaces both"; no sentence under it).
- The "Download CSV" button, the download code and its wording are REMOVED.
- Rules kept as today: the list contains only the member's own data (checklist item 35) and never names a counterparty (item 36). A received message shows the message text and the listing reference only.
- Spanish: owner does not view it. Route B: Builder writes it; the supervisor has it back-translated by a reader that has not seen the approved English; the owner sees only lines whose meaning drifted. Applies to this change only.

## To check while building (do not decide, report)
- Whether the Operator can edit a message before forwarding; a received-message row shows the ORIGINAL stored text (message_forward_log keeps only the translation). Report what you find; do not change forwarding.

## What the builder did (for the supervisor to read)
- Profile page card: the heading is now the one line "Activity overview" (key `export.title`); the sentence is gone; nothing sits under it except the rows and, when there are more than 50, a "Show more" button (`export.more`).
- Content: everything `my_activity_export()` returns, nothing added or removed (the function and its SQL tests are unchanged); sorted newest first in the browser; the first 50 shown, 50 more per press.
- Removed: the "Download CSV" button, `exportMyActivity`, `toCsv`, `csvField`, `downloadFile`, and the keys `export.intro`, `export.download`, `export.empty`, `export.done`, `export.colDate`, `export.colCategory`, `export.colReference`, `export.colDetail`, `export.colStatus` (English and Spanish). The category names (`export.cat.*`) stay: the rows use them.
- Checklist: Items 35 and 36 now say "activity overview" and are proven on the screen; new Item 99 (MUST NOT: no download any more, no button, no link, no code) and Item 100 (shows everything, newest first, 50 and Show more).
- The demo's `my_activity_export` mock used category names that did not match the keys (`Listing`, `Message`); fixed to `listing` and `message_sent`.
- Spanish (route B), new or changed: `export.title` "Resumen de actividad" (was "Su actividad"), `export.more` "Mostrar más".
- The Operator question: see the supervisor's message; answer: the Operator cannot edit a message before forwarding (the forward box is read-only), so a received message always shows the original stored text.
