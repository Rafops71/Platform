# Agreed 19 Nov 2026: Translate (Operator messages, and members on listings)

Source: the owner's answers in `docs/WALKTHROUGH-2026-11-18.md` (branch `claude/great-allen-5xl0gm`, end of file), relayed by Supervisor 2, and BATCH GO for the build on 19 Nov 2026. Plan: `docs/PLAN-translate-2026-11-19.md`; mockup: branch `mockup-translate-2026-11-19`.

**Route (owner, 19 Nov):** Cloudflare Workers AI translation model `@cf/meta/m2m100-1.2b`, not DeepL (the DeepL free plan trains on submitted text).

**The Terms (owner, 19 Nov, his words: "So leave the translation out of the terms, okay?"):** leave translation OUT of the Terms and Help. Terms section 10 stays as it is. Reason he gave: the translated text carries no names, and messages go anonymously through the Operator. Caveat he was given: a typed message could itself contain a name or detail.

**First wish (owner, 18-19 Nov, his words):** "we need a Translate button if counterparties don't speak English/Spanish or I have to mediate between a Spanish-speaking member and an English-speaking member". Decision: an Operator-only Translate button for a message; the Operator presses it, never automatic; the original message is never replaced; members never see it; nothing about messages is stored.

**Second wish (owner, 19 Nov):** people write posts in Spanish and in English; a member who stumbles on a proposal in the other language should be able to translate it (the listing's free text: specification, price conditions, notes).

**The owner's answers to the mockup (19 Nov, mockup commit f6d9255):**
1. A member sees the translation BENEATH the original (not replacing it).
2. Words (owner's own, typed): TWO buttons only, "Translate" and "Hide translation". NO label such as "Machine translation, may contain errors": "It's up to the member to check as well." Spanish of both: the builder's.
3. Unavailable message when the free allowance is used up (option A): "Translation is not available right now. Please try again later." Spanish: the builder's.
4. The Operator may also use the member's Translate button on listings (his yes). The Operator's separate message Translate (Operator console, English) stays Operator-only.
5. The button is shown on EVERY listing (no language guessing for now).
6. Limits: 30 listings per member per hour; each text field cut at 2,000 characters; 6,000 of the 10,000 free daily units reserved for members.
Earlier, still standing: translation is NOT mentioned in the Terms/Help; nothing stored for messages; Operator-only message translate.

**Not yet decided by the owner (the builder used the mockup's words, to be confirmed):** the wording of the Operator's own message-translate control (console in English): "Translate", a "to English / Spanish" drop-down, "Hide translation".

**How the builder read the owner's answers where they leave room (each open to correction):**
- "Every listing": the button is shown on every listing that has any words in its free text. A listing with no free text, or only a bare number as its price condition, has nothing to translate, so no button is shown there.
- "30 listings per member per hour" counts a press that actually asks Cloudflare; showing a translation that is already stored costs no press.
- "Cut at 2,000 characters": the first 2,000 characters of each field are translated; the rest is not, and nothing on screen says so.
- "6,000 of 10,000 reserved for members": members may use up to 6,000 estimated units a day; the Operator's message translation may use up to 4,000. Units are estimated from the text length before the call (the service does not report them here).
- "My Listings": the member's own list does not show the free text today, so no button is added there.
- "The Operator may also use the member's button on listings": the function accepts an Operator, but the Operator console shows no listing free text anywhere, and an Operator who opens the member page is sent to the console, so there is no button for the Operator on a listing yet; adding one would first need the console to show that text.
