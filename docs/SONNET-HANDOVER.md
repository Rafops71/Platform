# Handover from the builder session (Sonnet), 2026-11-05

Branch: `films-build`. Written at the supervisor's request before the chat is closed. Everything below was checked against this
session's own transcript and the repository on 2026-11-05; nothing is from memory.

## 1. What the owner typed directly into this chat

**Nothing.** I counted every human-role message in this session's transcript
(`/root/.claude/projects/-home-user-Platform/2a9cbb55-5e5c-5ff2-afd1-1edb49630380.jsonl`). The only ones that are not system
notices, tool output, images or sub-agent hand-backs are:

1. The opening brief, 2026-11-03 13:35 (below). It came from the supervisor session (session_01YYf4pfb68MBYS2VH1YfWwE) setting me up, and says the supervisor relays the owner's decisions.
2. "This session's worker process was restarted ... continue from where you left off." (system notice, 2026-11-03 16:52.)
3. Stop-hook messages asking me to commit and push (system).

Everything else I was asked to do, every wording and every decision, came from the supervisor, who said each time that it relayed the owner's decision.
I have no direct record of the owner's own words except what the supervisor quoted. Images in the transcript were my own screenshots.

### The opening brief (storyboard v11), as received
Builder for the MyPlatform trailer; report only to the supervisor; hand simple chores to Haiku sub-agents. Read CLAUDE.md and
docs/HANDOFF-films.md (branch films-handover, 4c2facf); base on branch storyboard-v10. Hard rules: never name an Operator or say how many
there are; never show the plural "Operators" on screen; never use legitimate / verified / trusted / vetted / confidential; never reword
the owner's text; Brussels time; the owner sees English only; never cancel a live recording; work goes through PRs naming
docs/AGREED-2026-11-01-owner-changes.md; do not merge without asking the supervisor. Task: storyboard v11 as stills, light app colours
(#ffffff #15202b #52677a #27618f #f0f6fb #e2ebf3), high-end motion drawn in code, the 8 act texts word for word, music = the licensed
"Nastelbom" track kept out of the repository, sound effects planned only, CC0 only. (The full text is in the transcript.)

## 2. Standing rules the supervisor passed to me during the session (not typed by the owner into this chat)
- Reports go only to the supervisor, short, honest about what was and was not checked. No PR and no merge without asking the supervisor.
- No music in any render; the supervisor mixes the licensed track. It must never enter the repository.
- No photos or stock footage: all pictures drawn (CC0 drawings recorded: Openclipart 57067 handshake, 322884 cargo ship; see video/trailer3).
- "The Operator" always singular. Later (04 Nov) the supervisor said the plural "Operators" is fine on screen in the app's own screens.
- Never decide wording for the owner. The on-screen diagram labels in the films are my placeholders (video/films/films-texts.json) and are not owner-approved wording.
- Films: speed = the trailer's, 140 wpm, held in every block (136-144); explainers: Operator film English only, member film English and Spanish.
- Films demo built from a local merge of `origin/documents-removal-2026-11-04` (item 36) and `origin/forward-editing-2026-11-04` (item 38); fake data only; no Documents tab, no Docs column for the Operator.
- Gemini free tier: 10 requests a day. Used on 04 Nov: 6 (voices of the three films, two requests each).

## 3. Work product and where it is
All pushed. Local and remote commit ids are identical for each branch below; `git status` was clean when this was written.

| branch | what it holds |
|---|---|
| `storyboard-v11` ... `storyboard-v15` | storyboard stills (approved at v15) |
| `trailer-sample-1/2`, `trailer-full-2`, `trailer-final` | silent trailer, then the final English trailer (Gemini Algieba) |
| `trailer-final-es` | Spanish trailer: texts, capture script, Kokoro voice script, final job (run 41701728764, artifact `trailer-final-es`) |
| `trailer-films` | films scaffolding, voice scripts (`video/films/films_voice.py`, `films_pace.py`, `films_check.py`), diagrams |
| `films-build` | the three walkthrough films: capture scripts, composition `video/films/FilmApp.tsx`, plans, the films-only demo build, the render job, and this note |

No pull request exists for any of these branches (the supervisor's rule).

Run ids that matter: films voices 41818970262; paced voices 41819429709; whisper check 41819705515 (small) and 41820274873 (medium);
**films final 41873028455** (artifact `films-final`: 3 silent + 3 voice mp4, voice tracks, timings, stills). Earlier films renders
41870919396, 41872595919 (cancelled) are superseded.

## 4. Not on GitHub / unfinished
- **The finished films exist only as a workflow artifact** (`films-final`, run 41873028455, retention 14 days from 2026-11-04) and as my local download in the scratchpad. They are not committed to the repository or published. Same for the Spanish trailer (`trailer-final-es`, run 41701728764) and the paced voices (`films-voice-paced`, 41819429709). Artifacts expire; download or re-run before then.
- Scratch files in my container only (test captures, contact sheets): `/tmp/claude-0/-home-user-Platform/2a9cbb55-5e5c-5ff2-afd1-1edb49630380/scratchpad/`. Nothing there is needed to rebuild: every film file is regenerated by the `films-render` job from the branch.
- I have **not watched any film or listened to any voice**; only stills, ffprobe, and whisper checks were done.
- Spanish trailer capture (run 41699484599) used the live project with throwaway members; the job log does not print a cleanup confirmation, so removal of those members is not proven by the log (the script runs its cleanup in a `finally` block and the step passed). Worth a look at the live database.
- Open small points reported to the supervisor: my Spanish translation of the demo's sample texts (video/films/build-films-demo.js, "Spanish sample texts"); the fake phone/email are readable in the Operator mailbox scene until deleted; `films-build` carries a merge conflict resolution (scripts/apply-sql.js, scripts/pg-harness.js kept as ours) that the films do not use and that must not be merged to main as is.
- Two whisper-spotted words not resolved (Operator block 2 "listings" heard as "listing", possibly a dropped final s), judged not worth a Gemini request.
- Any PR from these branches must name a checklist item or a docs/AGREED file (CLAUDE.md, scripts/check-pr-purpose.js); none was prepared.
