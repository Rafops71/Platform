'use strict';

// THE ONE FILE YOU WRITE. Copy to video/world.js and fill it in.
//
// Everything else in this kit is project-agnostic. This is the seam: it makes
// whatever the film needs to film, hands back the values the script refers to,
// and clears up afterwards.
//
// ----------------------------------------------------------------- THE RULE
//
// FILM FIXTURES, NEVER REAL DATA. Create throwaway records the way the test
// suite does, and delete them at the end. A film of somebody's real account
// is a privacy breach dressed up as marketing, and it will be the thing
// everybody notices.
//
// PROVE THE TEARDOWN BEFORE YOU WRITE THE SETUP. Run tearDown() against
// hand-made junk and check with your own eyes that the rows are gone, BEFORE
// setUp() ever creates anything. Otherwise the first thing this kit does to a
// live system is leave litter in it that nobody knows how to remove.
//
// ------------------------------------------------------------- THE CONTRACT
//
//   assertConfigured()  throw a clear sentence if credentials are missing.
//                       Called first, so a missing key is one line and not a
//                       stack trace five minutes into a run.
//
//   setUp()             create the fixtures; return an object. Every key
//                       becomes a {placeholder} the script can use in any
//                       selector, any typed value, any action.
//
//   tearDown()          delete all of it. Called after a successful film AND
//                       after a failure, so it must not mind being called
//                       when setUp() never ran, or twice.

// --- a worked example, from the project this kit came from ------------------
//
// const { createAccount, cleanup, assertConfigured } = require('../tests/e2e/helpers/fixtures');
// const { query } = require('../scripts/db');
//
// module.exports = {
//   assertConfigured,
//
//   async setUp() {
//     await cleanup();                       // start from nothing
//
//     const member = await createAccount({ label: 'film', status: 'approved' });
//     const other  = await createAccount({ label: 'film-other', status: 'approved' });
//
//     // Another member's record, so the film has something that is NOT its
//     // own to look at. Its id comes back, which is the whole point: the
//     // script addresses that row by id, never by position - the film adds
//     // rows as it goes, so "the first row" changes under it.
//     const { rows } = await query(
//       `insert into public.listings (user_id, commodity, quantity)
//        values ($1, 'copper cathodes', 600) returning id`, [other.profileId]);
//
//     return {
//       memberEmail:    member.email,
//       memberPassword: member.password,
//       demandId:       rows[0].id,
//     };
//   },
//
//   async tearDown() { await cleanup(); },
// };

module.exports = {
  assertConfigured() {
    // Example: fail early and in words, not with a stack trace.
    for (const key of ['MY_APP_URL', 'MY_APP_SERVICE_KEY']) {
      if (!process.env[key]) {
        throw new Error(`${key} is not set, so there is nothing to film against.`);
      }
    }
  },

  async setUp() {
    throw new Error(
      'video/world.js is still the example. Write setUp() so it creates the ' +
      'records this film needs, and returns the values script.json refers to.');
  },

  async tearDown() {
    // Must survive being called when setUp() never ran, and being called twice.
  },
};
