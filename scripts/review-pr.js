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
//   - The diff is truncated, with a visible note saying so, rather than being
//     silently cut: a review of half a change that does not say it read half a
//     change is worse than no review.
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

async function main() {
  if (!GROQ_API_KEY) bail('no GROQ_API_KEY is set, so there is nobody to ask.');
  if (!GITHUB_TOKEN) bail('no GITHUB_TOKEN, so a comment could not be posted.');
  if (!PR_NUMBER) bail('no pull request number.');

  // The merge base, not the branch tip: what this PR actually changes, rather
  // than everything that has landed on main since it was opened.
  let base;
  try {
    git(['fetch', '--no-tags', '--depth=200', 'origin', BASE_REF]);
    base = git(['merge-base', 'HEAD', `origin/${BASE_REF}`]).trim();
  } catch (err) {
    bail(`could not work out what changed: ${err.message}`);
  }

  let diff = git(['diff', '--unified=3', base, 'HEAD', '--', '.', ...SKIP]);
  if (!diff.trim()) bail('this pull request changes nothing readable.');

  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }

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
  ].join('\n');

  const user = [
    truncated
      ? `Here is the FIRST ${MAX_DIFF_CHARS} characters of the diff; it was cut short.\n`
      : 'Here is the complete diff.\n',
    '```diff',
    diff,
    '```',
  ].join('\n');

  let answer;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        temperature: 0.2,
        reasoning_effort: 'low',
        max_tokens: MAX_ANSWER_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      bail(`the review service answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    }
    answer = body && body.choices && body.choices[0]
      && body.choices[0].message && body.choices[0].message.content;
    answer = answer && answer.trim();
    if (!answer) {
      bail('the review service returned no text. Nothing to post.');
    }
  } catch (err) {
    bail(`could not reach the review service: ${err.message}`);
  }

  const comment = [
    '## Second opinion',
    '',
    answer,
    '',
    truncated
      ? `_This change is larger than one free-tier request can hold (${MAX_DIFF_CHARS} characters), so the reviewer read only the beginning of the diff. Treat the silence about everything after that as silence, not approval._`
      : '',
    '',
    `_Reviewed by \`${REVIEW_MODEL}\` via Groq - a model that did not write this code._`,
    '_This is an opinion, not a gate. The checklist and CI decide whether the platform works._',
  ].filter(Boolean).join('\n');

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: comment }),
    }
  );
  if (!res.ok) {
    bail(`could not post the comment: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  note(`Posted a second opinion on PR #${PR_NUMBER}.`);
}

main().catch(err => {
  // Never fail the build over a missing second opinion.
  note(`Skipped - the reviewer hit an unexpected problem: ${err.message}`);
  process.exit(0);
});
