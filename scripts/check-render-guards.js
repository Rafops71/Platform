#!/usr/bin/env node
//
// Fails if a screen loader can paint the DOM with a stale answer.
//
// Why this file exists
// --------------------
// Every screen here follows one shape: clear a container, await rows, write
// them in. That is safe exactly once. Trigger the same loader twice and two
// requests are in flight, and the container is painted by whichever ANSWER
// lands last rather than by whichever question was asked last - so the screen
// shows rows the member has moved on from, while the controls show the ones
// they picked. Nothing on the page admits the disagreement.
//
// It shipped twice before anything looked for it: the operator listings table
// (e03ebf9), then the analytics table, where CI run 50 found 26 weekly rows on
// screen after 8 monthly periods were asked for. Both were written by hand,
// both were found one at a time, and the pattern existed in nineteen other
// functions that nobody had checked.
//
// Finding this class of bug one failure at a time is the problem this file
// solves. js/utils.js provides renderToken(); this asserts that every loader
// that writes the DOM after an await actually uses it, so a new screen written
// without the guard breaks the build instead of shipping and being discovered
// in a month.
//
// What it checks, per top-level `async function` in js/app.js and
// js/operator.js:
//
//   - does it write the DOM at all (innerHTML / appendChild / textContent /
//     classList)? If not, it is not a renderer and is ignored.
//   - does it await before that write? If not, there is no window and no guard
//     is needed.
//   - if both, it must call renderToken() and must check the result after
//     EVERY await that is not inside a nested callback.
//
// Deliberately not checked:
//
//   - awaits inside a nested function (an event handler attached to a rendered
//     row). Those run later, on their own click, and are not part of this
//     render.
//   - anything that is not a loader. Only load* / refresh* / populate* are
//     screen renderers. An action handler - submitListingForm, confirmReply,
//     changeEmail - also writes the DOM after an await, but what it writes is
//     one status line about one action, and the right guard there is to stop
//     the second submit, not to drop the second answer. Eight of those exist
//     and are NOT covered by this file. That is a known gap, written down
//     rather than papered over: see HANDOFF.md.

const fs = require('fs');

const FILES = ['js/app.js', 'js/operator.js'];
const DOM_WRITE = /innerHTML|appendChild|textContent|classList|\.value\s*=/;

/** Byte span of an `async function name()`'s body, by brace matching. */
function bodyOf(src, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return [openBraceIndex + 1, i];
    }
  }
  throw new Error('unbalanced braces');
}

/** Strip comments and template/string literals so the word "await" inside a
 *  sentence, or "innerHTML" inside a template, is not mistaken for code. */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const problems = [];
let checked = 0;
let guarded = 0;

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /^async function (\w+)\s*\([^)]*\)\s*\{/gm;
  let m;
  while ((m = re.exec(src))) {
    const name = m.group ? m.group(1) : m[1];
    const [start, end] = bodyOf(src, m.index + m[0].length - 1);
    const raw = src.slice(start, end);
    const body = codeOnly(raw);

    // Loaders only. See the note above on why action handlers are excluded.
    if (!/^(load|refresh|populate)/.test(name)) continue;

    const awaits = [...body.matchAll(/\bawait\b/g)];
    if (!awaits.length) continue;
    if (!DOM_WRITE.test(body)) continue;

    // A DOM write that happens only BEFORE the first await (a "Loading…"
    // placeholder, say) is not at risk; require a write after one.
    const afterFirstAwait = body.slice(awaits[0].index);
    if (!DOM_WRITE.test(afterFirstAwait)) continue;

    checked++;
    const where = `${file} ${name}()`;

    if (!/renderToken\(/.test(body)) {
      problems.push(
        `${where}\n    writes the DOM after an await but never calls renderToken().\n` +
        `    Two of these in flight at once paint the container out of order.\n` +
        `    Fix: const fresh = renderToken('<unique-name>'); then\n` +
        `         if (!fresh()) return;   after each await.`
      );
      continue;
    }

    // Every await not inside a nested function must be followed by a check
    // before the next DOM write.
    let missing = 0;
    for (const a of awaits) {
      const rest = body.slice(a.index);
      const nextGuard = rest.search(/!fresh\(\)|fresh\(\)\s*===|!\s*fresh\b/);
      const nextWrite = rest.slice(1).search(DOM_WRITE);
      const inNestedFn = /(=>\s*\{|function\s*\()[^{}]*$/.test(
        body.slice(0, a.index).split('\n').slice(-3).join('\n')
      );
      if (inNestedFn) continue;
      if (nextWrite >= 0 && (nextGuard < 0 || nextGuard > nextWrite)) missing++;
    }
    if (missing) {
      problems.push(
        `${where}\n    has renderToken() but ${missing} await(s) reach a DOM write\n` +
        `    without an "if (!fresh()) return;" in between.`
      );
      continue;
    }
    guarded++;
  }
}

if (problems.length) {
  console.error('\nStale-render guard check FAILED\n');
  problems.forEach(p => console.error('  • ' + p + '\n'));
  console.error(
    `${problems.length} of ${checked} loader(s) can paint a stale answer.\n` +
    'See the comment at the top of js/utils.js for the pattern.\n'
  );
  process.exit(1);
}

console.log(`Stale-render guards: ${guarded} of ${checked} loaders guarded. OK.`);
