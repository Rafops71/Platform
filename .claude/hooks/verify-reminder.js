#!/usr/bin/env node
// Standing reminder injected into every turn, via a UserPromptSubmit hook.
//
// This exists because the same rule written in CLAUDE.md did not hold. It was
// added on 11 October after a run of mistakes, and broken three messages later:
// a file read at session start stops binding once a long conversation has
// drifted away from it. The harness putting the sentence in front of the model
// on every turn does not depend on remembering to re-read anything.
//
// The two rules are the two classes that actually cost the owner time that day.
// Seven mistakes were the first (asserting where a button lives in a dashboard
// nobody here can see); three were the second (creating an account in the live
// database whose deletion path turned out to be broken, which then took four
// attempts and the owner's own hands to clear).
//
// Prints one JSON object on stdout; Claude Code reads additionalContext from it.
// Deliberately short: it is paid for on every single turn.

const reminder = [
  'Standing check, from this project\'s own history:',
  '1. Before stating any fact about a third-party UI, product, price or limit —',
  '   verify it with a tool in THIS session, or say plainly that it cannot be',
  '   checked from here and ask for a screenshot. Do not describe a menu or a',
  '   button from memory.',
  '2. Never create anything in a live system until the deletion path is proven.',
  '   Prove teardown before setup.',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: reminder,
  },
}));
