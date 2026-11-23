'use strict';
// The browser spec files that must NEVER run beside another spec file.
//
// Why a list. With more than one worker, Playwright runs different spec files at the same moment against the one shared
// database. Almost every file only reads and writes rows it made itself (its accounts, its listings, found by id, email
// or message text), so they can overlap safely. These five cannot, because what they assert is about the WHOLE database,
// so a neighbour's rows or a neighbour's moment makes them wrong:
//
//   operator-overview     each Operator tile (pending approvals, messages, matches, stale listings) is compared with a
//                         count over a whole table, read a moment apart: a row made in between is a false failure.
//   operator-analytics    the totals row is compared with whole-table totals, and activity_log is counted before and after.
//   saved-searches        a saved search's match count is compared with the count of every listing of that commodity.
//   browse-at-volume      seeds hundreds of listings (and an email and a feed row for each) and counts them.
//   operator-at-volume    seeds listings, messages, matches and feed rows, and counts the Operator's whole screens.
//
// They run in their own project, "chromium-exclusive", after the parallel one has finished and on ONE worker, so each is
// alone with the database exactly as before. npm run checklist (scripts/checklist-report.js) runs the two projects one after
// the other when E2E_WORKERS is above 1 and merges the results; with one worker (the default) nothing is split and
// "--project=chromium" runs every file in order, as it always did.
//
// Adding a spec whose assertions are about whole tables, or that seeds mass data, means adding its file name here.
module.exports = [
  'operator-overview.spec.js',
  'operator-analytics.spec.js',
  'saved-searches.spec.js',
  'browse-at-volume.spec.js',
  'operator-at-volume.spec.js',
];
