# The look: decided, not yet built

**Chosen on 2026-10-13: "Sky Tint".** The owner picked it from eight
white-background options after rejecting a cream-paper version of the same
idea. **Do not start this work until the open list in `HANDOFF.md` is cleared** —
he was explicit that it comes last.

## What he actually asked for

- **White behind everything, always.** Not cream, not off-white, not a tinted
  page. This is a standing rule, not a preference for one screen.
- Colour belongs in the details: blocks, badges, buttons. Pastel is welcome.
- A serif for headings and titles. He chose the serif look twice.

## Sky Tint, precisely

| Part | Value |
|---|---|
| Page behind | `#ffffff` |
| Text | `#15202b` |
| Quiet text | `#5f7488` |
| Accent (buttons, active tab) | `#27618f` |
| Listing block fill | `#f0f6fb` |
| Hairline | `#e2ebf3` |
| Headings and listing titles | Spectral (Google Fonts), Georgia fallback |
| Labels, buttons, reference numbers | Source Sans 3, system sans fallback |
| Corners | 12px on listing blocks, 10px on buttons |
| Rules | none — the tinted block separates rows, not a line |

## What this does not change

Nothing underneath. Same screens, same buttons, same order, same prohibitions.
If a change to the look would alter what a screen DOES, it has stopped being a
restyle and needs its own checklist item.

## Two things to watch when it is built

1. **The touch rules in `css/styles.css` are load-bearing.** The phone suite
   (`tests/e2e/on-a-phone.spec.js`) fails anything a thumb cannot hit — it
   caught four targets under 32px once already. A restyle that shrinks padding
   will redden that suite, and the suite is right.
2. **The tests find buttons by name.** Renaming a label in the interface means
   updating the specs in the same commit, not after a red run.

## Where the options came from

Two preview pages, built 2026-10-13:
- Six looks: https://claude.ai/artifact/86ghEf8HahexDNmD8b3yPZ
- Eight on white (the chosen set): https://claude.ai/artifact/RR4WdfhkfNUU5RW2Kb4EQL

He also noted his own eyesight: whatever the style, the type can be set larger
across the platform, and that is a setting rather than a style.
