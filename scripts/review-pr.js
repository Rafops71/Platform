#!/usr/bin/env node
//
// Ask an independent model to read a pull request's diff and post what it
// thinks, as an ordinary PR comment.
//
// This is a second opinion, not a gate. It cannot fail a build and must not
// try to: the tick/cross table and the CI gate decide whether this platform
// works, and a model's judgement does not give the same answer twice.
// docs/CHECKLIST.md exists precisely because the author of the code cannot be
// the one who marks it.
//
// What it is for is the gap no suite covers: reading the code as a reader. A
// test proves the behaviour somebody thought to check. It cannot notice that a
// function truncates at a thousand, or that a comment now describes something
// the code no longer does.
//
// Deliberate limits:
//
//   - It reads the DIFF, not the repository. A few hundred lines, which is
//     what this project's changes actually are (the largest recent one was 476
//     lines across 8 files).
//   - Lock files, build output and minified bundles are skipped. The
//     reviewer's attention is worth more on the code.
//   - A diff larger than one request is read in parts, whole files together
//     (since 2026-10-28: the first-12,000-characters cut read the start of
//     PR 36 only, and the reviewer then called finished code "unfinished").
//     Parts are a minute apart, for the free tier's per-minute limit. Past
//     MAX_PARTS the rest is named as unread, never silently cut: a review of
//     half a change that does not say it read half a change is worse than
//     no review.
//   - It is told to say when it has nothing to say. A reviewer that always
//     finds something teaches everybody to stop reading it.
//
// Every failure is reported and exits 0. The workflow is continue-on-error as
// well; both, because a missing second opinion must never look like a broken
// build.

'use strict';

const { execFileSync } = require('child_process');

const {
  GROQ_API_KEY,
  GITHUB_TOKEN,
  PR_NUMBER,
  BASE_REF = 'main',
  REVIEW_MODEL = 'openai/gpt-oss-120b',
  GITHUB_REPOSITORY,
} = process.env;

// Sized to Groq's free tier, which is what this runs on: 8,000 tokens per
// minute for the whole request, answer included. Measured rather than guessed -
// the first real run sent 39,166 characters and was refused with
// "Limit 8000, Requested 11044". Roughly 3.5 characters to a token, so 18,000
// characters of diff plus a 2,200-token answer sits inside it with room to
// spare - measured at 3,426 prompt and 844 completion tokens on a real run.
//
// The answer budget is large for a short review because gpt-oss-120b REASONS
// before it answers, and that reasoning is billed against the same budget. At
// 700 tokens it spent the lot thinking and returned an empty answer with
// finish_reason "length" - a silent non-review. reasoning_effort 'low' keeps
// that short. Raise either number only against a measured limit, not a hope.
const MAX_DIFF_CHARS = 12_000;
const MAX_ANSWER_TOKENS = 2_200;
const MAX_PARTS = 6;
// About 850 tokens of the 8,000: 12,000 characters of diff + this + a 2,200-token answer is ~6,500.
const MAX_MAP_CHARS = 3_000;
const PAUSE_MS = 62_000;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Paths whose diff teaches a reviewer nothing. */
const SKIP = [
  ':(exclude)package-lock.json',
  ':(exclude)**/*.min.js',
  ':(exclude)**/*.map',
  ':(exclude)test-results/**',
];

function note(msg) { console.log(msg); }

function bail(msg) {
  note(`Skipped - ${msg}`);
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// One question to the reviewer; null when it gives no text.
async function ask(system, user) {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: REVIEW_MODEL, temperature: 0.2, reasoning_effort: 'low', max_tokens: MAX_ANSWER_TOKENS,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const body = await res.json();
    if (!res.ok) { note(`the review service answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`); return null; }
    const answer = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    return (answer && answer.trim()) || null;
  } catch (err) {
    note(`could not reach the review service: ${err.message}`);
    return null;
  }
}

async function main() {
  if (!GROQ_API_KEY) bail('no GROQ_API_KEY is set, so there is nobody to ask.');
  // GITHUB_TOKEN is no longer needed: nothing is posted (see the end of main).
  if (!PR_NUMBER) bail('no pull request number.');

  // The merge base, not the branch tip: what this PR actually changes, rather
  // than everything that has landed on main since it was opened.
  // REVIEW_BASE: compare with a given commit instead, to try the reviewer
  // on a change already merged.
  let base = process.env.REVIEW_BASE;
  if (!base) try {
    git(['fetch', '--no-tags', '--depth=200', 'origin', BASE_REF]);
    base = git(['merge-base', 'HEAD', `origin/${BASE_REF}`]).trim();
  } catch (err) {
    bail(`could not work out what changed: ${err.message}`);
  }

  let diff = git(['diff', '--unified=3', base, 'HEAD', '--', '.', ...SKIP]);
  if (!diff.trim()) bail('this pull request changes nothing readable.');

  // The whole change in one glance, given to EVERY part. The parts are read by
  // separate requests that cannot see each other, so a part holding a spec
  // could not see the file that defines what the spec imports, and the
  // reviewer reported it "not exported" (PR 47, 49 and 50 all had reviews like
  // that). The map says what else changed; the rule below says what to do
  // about the parts it cannot see. Capped, because the free tier counts it.
  let changeMap = git(['diff', '--numstat', base, 'HEAD', '--', '.', ...SKIP]).trim().split('\n')
    .map((l) => l.split('\t')).filter((c) => c.length === 3)
    .map(([add, del, file]) => `${file} (+${add} -${del})`).join('\n');
  if (changeMap.length > MAX_MAP_CHARS) changeMap = `${changeMap.slice(0, MAX_MAP_CHARS)}\n... (more files)`;

  // Whole files together, up to MAX_DIFF_CHARS a part; a file larger than
  // that is cut at its own hunks.
  const pieces = [];
  for (const file of diff.split(/(?=^diff --git )/m)) {
    if (file.length <= MAX_DIFF_CHARS) { pieces.push(file); continue; }
    const [head, ...hunks] = file.split(/(?=^@@ )/m);
    let cur = head;
    for (const h of hunks) {
      if (cur.length + h.length > MAX_DIFF_CHARS && cur !== head) { pieces.push(cur); cur = head; }
      cur += h.slice(0, MAX_DIFF_CHARS - head.length);
    }
    pieces.push(cur);
  }
  const parts = [];
  for (const piece of pieces) {
    if (parts.length && parts[parts.length - 1].length + piece.length <= MAX_DIFF_CHARS) parts[parts.length - 1] += piece;
    else parts.push(piece);
  }
  const fileOf = (t) => [...t.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]);
  const read = parts.slice(0, MAX_PARTS);
  const unread = [...new Set(parts.slice(MAX_PARTS).flatMap(fileOf))];

  const system = [
    'You are reviewing a pull request for Jericho Platform, a private brokered',
    'trading platform. Members never contact each other directly and never learn',
    "each other's identity; every message passes through an Operator. That",
    'secrecy is the product, so anything that could leak one member to another',
    'is the most serious kind of bug here.',
    '',
    'You did not write this code. Another AI did, and it also wrote the tests.',
    'Your job is to read it as a reader, and to say what the tests cannot: logic',
    'that is wrong at a boundary, an edge case nobody thought of, a comment that',
    'no longer describes the code, a change that is riskier than it looks.',
    '',
    'Rules:',
    '- Be specific. Name the file and what is wrong with it.',
    '- Say plainly when you have nothing to report. "Nothing to flag" is a',
    '  useful review. Inventing a concern to look useful is not.',
    '- Do not restate what the change does. The author knows.',
    '- Do not comment on formatting or style.',
    '- At most five points, most serious first.',
    '- Be brief. The reader has little patience for long text.',
    '- You may be shown only PART of the change. Everything that changed is',
    '  listed under "All files in this pull request"; the rest of it is read by',
    '  someone who cannot see your part, and you cannot see theirs. So a helper,',
    '  export, translation key, column or function you cannot find may well be',
    '  defined in a file you were not shown. Never report something as missing,',
    '  undefined, not exported or not translated unless the file that would',
    '  define it is in YOUR part and you can see that it is not there.',
  ].join('\n');

  const answers = [];
  for (let i = 0; i < read.length; i += 1) {
    if (i) await new Promise((r) => setTimeout(r, PAUSE_MS));
    const user = [
      read.length > 1
        ? `This is part ${i + 1} of ${read.length} of the diff (whole files: ${fileOf(read[i]).join(', ')}). Review this part; other parts are reviewed separately.\n`
        : 'Here is the complete diff.\n',
      'All files in this pull request:',
      changeMap,
      '',
      '```diff',
      read[i],
      '```',
    ].join('\n');
    const answer = await ask(system, user);
    if (answer) answers.push(read.length > 1 ? `### Part ${i + 1}: ${fileOf(read[i]).join(', ')}\n\n${answer}` : answer);
    else answers.push(`### Part ${i + 1}: ${fileOf(read[i]).join(', ')}\n\n_Not reviewed - the service gave no answer for this part._`);
  }
  if (!answers.some((a) => !a.includes('_Not reviewed'))) bail('the review service gave no answer at all.');

  const comment = [
    '## Second opinion',
    '',
    answers.join('\n\n'),
    '',
    unread.length
      ? `_Not read (more than ${MAX_PARTS} parts): ${unread.join(', ')}. Treat the silence about these as silence, not approval._`
      : '',
    '',
    `_Reviewed by \`${REVIEW_MODEL}\` via Groq - a model that did not write this code._`,
    '_This is an opinion, not a gate. The checklist and CI decide whether the platform works._',
  ].filter(Boolean).join('\n');

  // Written to the run's own page and log, not posted as a comment: every
  // comment emailed the owner, who asked for no more GitHub mail
  // (2026-10-28). Claude reads it from the run.
  console.log(comment);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment + '\n');
  }
  note(`Wrote a second opinion for PR #${PR_NUMBER} to the run summary.`);
}

main().catch(err => {
  // Never fail the build over a missing second opinion.
  note(`Skipped - the reviewer hit an unexpected problem: ${err.message}`);
  process.exit(0);
});
