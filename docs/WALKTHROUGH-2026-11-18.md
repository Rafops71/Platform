# Function-by-function walkthrough, owner's answers (18 Nov 2026)
Format: block -> asked -> owner answered. Nothing is built until the walkthrough is done (one batch). Wording below in quotes is the owner's own.

## Block 1: getting in (items 1-3)
Asked: Operator invites by email; link works once, expires after 5 days; person registers, accepts the Terms, lands as "pending" and sees "Your registration is awaiting Operator approval. You will be able to sign in once approved."
Answered: KEEP AS IS.

## Block 2: approve / reject, who can sign in (items 4-6)
Asked: Operator presses Approve or Reject; anyone not approved is refused at sign-in; today a rejected or suspended person sees "This account is not currently active. Contact an Operator."
Answered (CHANGE): a rejected person must be told the registration was not approved: "Your registration was not approved." A suspended member (who already got a notification when suspended) who tries to sign in must see: "This account has been suspended." Spanish for both: ours to write.
To build later: login.html messages for status rejected and suspended (EN + ES); today both fall under login.blocked.

## Block 3: Terms when registering (items 7-8)
Asked: today a tick box "I have read and accept the Terms & Conditions" with a link to terms.html; refused without the tick; version and language saved.
Answered (CHANGE, owner's words): "The terms and conditions should be on the page and the tick box should be at the bottom so they confirmed that they have read the page and the terms and conditions and agree with it and agree to it."
To build later: the Terms text shown ON the register page (not only a link), the tick box at the bottom of it, confirming they read the page and the Terms and agree. Exact tick sentence: owner to choose (options offered). Item 7/8 behaviour (refused without tick; version + language recorded) stays.
Block 3 tick sentence, owner's own words (typed 18 Nov): "I have read and agree to the terms and conditions". Spanish: ours to write.

## Question raised by the owner during block 4 (for the broker design B1-B4, not decided)
"What if a trader has access to material for another producer and he functions for this particular deal as a broker, or he quit his former employment and works to own title?" Today (read in code 18 Nov): the role (Principal / Mandated intermediary / Broker; Producer or Trader for a seller) is chosen PER LISTING (listings.poster_role), not once per member. Not yet checked: whether the profile stores a member type too, and what stops a wrong role being ticked. To settle together with the broker decisions.

## Block 4: a member's own details (items 9-13)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 5: posting and managing own listings (items 14-16)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 6: Browse (items 17-21)
Asked: Browse shows other members' listings, newest first (read in code: listings.sort by created_at descending, no member choice); filters by type, commodity, region, status; never shows who posted.
Owner asked: how is it ranked, can the member sort alphabetically or by date?
Answered (CHANGE): ADD a sort choice on Browse (drop-down): Newest first (default), Oldest first, Commodity A to Z. Labels EN+ES: ours to write, shown to owner. Everything else on Browse unchanged. Saved searches must still report the same count Browse shows (item 23): sorting must not change counts.

## Block 7: saved searches and watchlist (items 22-25)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 8: enquiries and replies through the Operator (items 26-30)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 9: documents declared, activity download (items 31-36)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 10: stale listings (items 37-39)
Answered: KEEP AS IS (owner, 18 Nov). (30 days; "Is it still available?"; one-press renew by the owner only.)

## Block 11: the Operator's console (items 40-44)
Answered: KEEP AS IS (owner, 18 Nov). Tabs today: Overview, Approvals, All Listings, Invitations, Users, Commodities, Mailbox, Matches, Deals, Scorecard, Analytics, Activity Log, Help.

## Block 12: introductions, flood limit, language, emails (items 45-49)
Answered: KEEP AS IS (owner, 18 Nov).

## Block 13: forgotten password, deleting a member, invitation-only (items 53-57)
Answered: KEEP AS IS (owner, 18 Nov).
(Items 50-52 privacy/audit prohibitions and 58-61 safety rules are invisible to members; covered next as one block.)

## Block 14: safety rules members never see (items 50-52, 58-61, 63-65)
Answered: KEEP ALL AS IS (owner, 18 Nov).

## Block 15: statements on every listing (items 66-69)
Answered: KEEP AS IS (owner, 18 Nov). Broker/role details are decided separately (B1-B4 with Opus).

## Block 16: deal files and scorecard (items 70-75)
Answered: KEEP AS IS (owner, 18 Nov).
