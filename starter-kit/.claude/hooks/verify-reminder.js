#!/usr/bin/env node
// A standing reminder injected into EVERY turn, via a UserPromptSubmit hook.
//
// WHY THIS EXISTS AND CLAUDE.md IS NOT ENOUGH
//
// The same rules written in CLAUDE.md did not hold. They were added to the
// original project after a run of mistakes and broken three messages later: a
// file read at session start stops binding once a long conversation has
// drifted away from it. A hook does not depend on remembering to re-read
// anything - the harness puts the sentence in front of the model every time
// the user presses enter.
//
// KEEP IT SHORT. It is paid for on every single turn, in context and in
// money. Two rules that have actually cost you time beat ten that sound wise.
//
// The two below are the ones that cost the original project a day: asserting
// where a button lives in a dashboard nobody in the session could see, and
// creating something in a live system whose deletion path turned out to be
// broken. Replace them with yours once you know what yours are.

const reminder = [
  'Standing check, from this project\'s own history:',
  '1. Before stating any fact about a third-party UI, product, price or limit —',
  '   verify it with a tool in THIS session, or say plainly that it cannot be',
  '   checked from here and ask for a screenshot. Do not describe a menu or a',
  '   button from memory.',
  '2. Never create anything in a live system until the deletion path is proven.',
  '   Prove teardown before setup.',
].join('\n');

// Claude Code reads additionalContext out of this JSON on stdout.
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: reminder,
  },
}));
