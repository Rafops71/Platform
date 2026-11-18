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
