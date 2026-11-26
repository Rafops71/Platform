# The language a member chooses is saved in order, so the last press wins

**STATUS: AGREED.** The owner said yes on 26 Nov 2026 (about 09:00 UTC), relayed through the Overseer session; carried out by
Builder 3. Nothing a member sees changes: no wording, no layout.

## The fault (found, not guessed)

`js/app.js`, `window.onLanguageChange` (the persist block) sent one un-awaited update of `profiles.language` per language
press, and `adoptProfileLanguage` sent another on sign-in. Two quick presses (ES then EN) were two independent requests that
could reach the database in either order. In CI run 45756301030 a test pressed ES and then EN and the profile ended `es`
while the screen showed English. Notification emails are composed in the database from `profiles.language` (sql/008), so a
member in that state would receive email in the language they had just moved away from, and a second device would open in it.

## The change

`js/app.js`: every save goes through `saveLanguageChoice()`, which joins one promise chain. Each link writes the value the
profile object holds WHEN THAT LINK RUNS, so a burst of presses is written in order and ends on the last choice. A failed
write is logged (as before) and does not break the chain. `onLanguageChange` and `adoptProfileLanguage` both use it. No
database change, no migration.

## The proof

Checklist Item 101. `tests/e2e/language-last-choice.spec.js` holds back by two seconds the browser's update that writes
Spanish and lets English through at once, presses ES then EN, waits until the page has no request in flight, and reads the
profile: it must say `en`. A second test presses ES, EN, ES and expects `es`. Without the in-order writes the first test
fails (the held-back Spanish update lands last); that is why it holds the update back instead of hoping for a race.

## Not changed

The language shown on screen, localStorage, and which language wins when the browser and the profile disagree
(`adoptProfileLanguage` logic is unchanged apart from using the same writer).
