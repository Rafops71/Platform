# What this project must do

Every core function, in plain words, one per line, each with an `ItemNN` tag.

**This file is the source of truth, not a summary of the tests.** You write
down what the thing must do; the tests then have to prove it. Adding a
function here without a test breaks the build, on purpose.

## The rules of this file

- One test per item, with `ItemNN` in the test's NAME.
- `<YOUR CHECKLIST COMMAND>` runs them and prints one line per function.
- It fails three ways: an item with no test, an item whose test failed, and a
  test claiming an `ItemNN` this file does not list.
- CI gates the build on it. A crossed function produces no artifact.

## Write prohibitions, not just features

The single most useful thing learned on the project this came from: nearly
half its checklist items are things that must NOT happen. Proving a thing
did not happen is worth more than proving a button worked, because a broken
button is visible on the first try and a leak is not.

So for every "X works", ask what the matching "and Y never happens" is.

| # | Must do | How it is proven |
|---|---------|------------------|
| Item01 | <A member can sign in with the right password> | `Item01_...` |
| Item02 | <A WRONG password is refused, and says so in plain words> | `Item02_...` |
| Item03 | <A signed-out visitor can reach nothing at all> | `Item03_...` |
| Item04 | <Somebody else's data is never returned, even to a valid user> | `Item04_...` |
| Item05 | <A failure says what happened in words a non-technical person reads> | `Item05_...` |

Replace all of the above. Keep the shape: a number, a sentence a
non-programmer understands, and the name of the test that proves it.
