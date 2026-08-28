// The in-platform mailbox round trip:
//
//   browse anonymously -> contact -> operator sees it -> operator forwards
//   -> owner reads it -> owner replies -> operator forwards the reply back
//   -> the original enquirer reads it -> and answers again
//
// The last two hops only work because of sql/009: forward targets used to be
// derived from listings.user_id, which sent a reply back to its own author.
// They now come from messages.in_reply_to, so the thread alternates for any
// number of turns.
//
// This is the leg that had been run by hand. No email is involved anywhere:
// posting a listing does queue email_outbox rows through
// trg_queue_listing_emails, but nothing here flushes that outbox, and
// teardown deletes those rows before they could ever be sent.
//
// Every message is brokered. Two participants never address each other
// directly - the operator is the only party who can move a message between
// them, and neither side is told who the other is. Both halves of that are
// asserted: the enquirer must not learn who posted the listing, and the owner
// must not learn who is asking.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { openScreen, signIn, signOut } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Deliberately unusable as a substring of anything else on the page, so a
// "not.toContain" failure means a real leak and not an incidental word match.
const OWNER_ID = {
  first_name: 'Ondrexa',
  last_name: 'Vulmiratt',
  company: 'Korrindale Metals NV',
  phone: '+32471777222',
};
const ENQUIRER_ID = {
  first_name: 'Pherolan',
  last_name: 'Trescovix',
  company: 'Ashgrove Minerals SA',
  phone: '+32471888444',
};

const LISTING = {
  commodity: 'Antimony',
  quantity: '900',
  unit: 'Metric tons',
  specification: 'Sb 99.80% ingot',
  incoterm: 'FOB',
  origin: 'Peru',
  price: '14200',
  currency: 'USD',
  notes: 'Mailbox flow automated check',
};

const ENQUIRY = 'E2E mailbox: can you confirm the Sb assay and the loading port?';
const REPLY = 'E2E mailbox reply: assay confirmed at 99.80, loading from Callao.';
const FOLLOW_UP = 'E2E mailbox: understood - can you hold 200 mt until Friday?';
const OP_REPLY = 'E2E mailbox operator reply: the seller can hold 200 mt until Friday 17:00.';

let owner, enquirer, operator, listingRef, listingId;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'mbop', role: 'operator', status: 'approved' });
  owner = await createAccount({ label: 'mbowner', role: 'participant', status: 'approved', meta: OWNER_ID });
  enquirer = await createAccount({ label: 'mbenq', role: 'participant', status: 'approved', meta: ENQUIRER_ID });
});

test.afterAll(async () => { await cleanup(); });

test.describe.serial('in-platform mailbox: browse -> contact -> forward -> reply', () => {

  test('setup: the owner posts a listing to be found', async ({ page }) => {
    await signIn(page, owner, 'app.html');
    await openScreen(page, 'new-listing');

    await page.check('input[name="type"][value="sell"]');
    await page.selectOption('#commodity-select', LISTING.commodity);
    await page.fill('#quantity', LISTING.quantity);
    await page.selectOption('#unit', LISTING.unit);
    await page.fill('#specification', LISTING.specification);
    await page.selectOption('#incoterm', LISTING.incoterm);
    await page.selectOption('#location', LISTING.origin);
    await page.fill('#price_conditions', LISTING.price);
    await page.selectOption('#currency', LISTING.currency);
    await page.fill('#notes', LISTING.notes);
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select count(*)::int n from public.listings where user_id = (select id from public.profiles where email = $1)',
        [owner.email]
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      'select id, reference_number from public.listings where user_id = (select id from public.profiles where email = $1)',
      [owner.email]
    );
    listingId = rows[0].id;
    listingRef = rows[0].reference_number;
  });

  // ---- 1 ----------------------------------------------------------------
  test('1. browsing shows the listing but never the poster identity', async ({ page }) => {
    await signIn(page, enquirer, 'app.html');
    await openScreen(page, 'browse');

    const card = page.locator('.list-row', { hasText: listingRef });
    await expect(card).toBeVisible();
    await expect(card).toContainText(LISTING.commodity);

    // No name, company, email or phone anywhere on the rendered page - not
    // just inside the card, so a leak in a header or sidebar still fails.
    const body = await page.locator('body').innerText();
    for (const [field, secret] of Object.entries({ ...OWNER_ID, email: owner.email })) {
      expect(body, `browse leaked the poster's ${field}: "${secret}"`).not.toContain(secret);
    }

    // The data source itself must not carry an identity column, so no future
    // UI change can render one by accident.
    const { rows } = await query('select * from public.get_public_listings() limit 1');
    for (const forbidden of ['user_id', 'email', 'first_name', 'last_name', 'company', 'phone']) {
      expect(Object.keys(rows[0] || {}), `get_public_listings exposes ${forbidden}`).not.toContain(forbidden);
    }
  });

  // ---- 2 ----------------------------------------------------------------
  test('2. the browsing participant can contact the listing', async ({ page }) => {
    await signIn(page, enquirer, 'app.html');
    await openScreen(page, 'browse');
    await page.locator('.list-row', { hasText: listingRef }).locator('[data-contact]').click();

    await expect(page.locator('#contact-modal')).toBeVisible();
    await expect(page.locator('#contact-ref')).toContainText(listingRef);
    await page.fill('#contact-body', ENQUIRY);
    await page.click('#contact-send-btn');

    // It lands as pending_review, against the right listing, from the enquirer
    // - it is NOT delivered to the owner yet. That is the operator's call.
    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [ENQUIRY]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      `select m.status, m.listing_id, p.email sender
         from public.messages m join public.profiles p on p.id = m.sender_id
        where m.body = $1`, [ENQUIRY]
    );
    expect(rows[0]).toMatchObject({ status: 'pending_review', listing_id: listingId, sender: enquirer.email });

    const { rows: fwd } = await query(
      'select count(*)::int n from public.message_forward_log where message_id = (select id from public.messages where body = $1)',
      [ENQUIRY]
    );
    expect(fwd[0].n, 'message was delivered without an operator forwarding it').toBe(0);
  });

  test('the owner cannot see the enquiry before it is forwarded', async ({ page }) => {
    await signIn(page, owner, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).not.toContainText(ENQUIRY, { timeout: 10_000 });
  });

  // ---- 3 ----------------------------------------------------------------
  test('3. the operator sees the pending message in the mailbox', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');

    const row = page.locator('#operator-mailbox-list .list-row', { hasText: ENQUIRY });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Pending Review');
    await expect(row).toContainText(`Re: ${listingRef}`);
    // Awaiting a decision, so all three actions are offered.
    await expect(row.locator('[data-forward]')).toBeVisible();
    await expect(row.locator('[data-reply]')).toBeVisible();
    await expect(row.locator('[data-ignore]')).toBeVisible();
  });

  // ---- 4 ----------------------------------------------------------------
  test('4. the operator forwards it to the listing owner', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');

    const row = page.locator('#operator-mailbox-list .list-row', { hasText: ENQUIRY });
    await row.locator('[data-forward]').click();
    await expect(page.locator('#forward-modal')).toBeVisible();
    await expect(page.locator('#forward-target-info')).toContainText(listingRef);
    await page.click('#forward-confirm-btn');

    // Logged against the owner, by this operator, and the message reclassified.
    await expect.poll(async () => {
      const r = await query(
        `select count(*)::int n from public.message_forward_log
          where message_id = (select id from public.messages where body = $1)
            and to_user_id = (select id from public.profiles where email = $2)
            and operator_id = (select id from public.profiles where email = $3)`,
        [ENQUIRY, owner.email, operator.email]
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query('select status from public.messages where body = $1', [ENQUIRY]);
    expect(rows[0].status).toBe('forwarded');
    await expect(page.locator('#operator-mailbox-list .list-row', { hasText: ENQUIRY })).toContainText('Forwarded');
  });

  // ---- 5 ----------------------------------------------------------------
  test('5. the owner receives the forwarded message in their mailbox', async ({ page }) => {
    await signIn(page, owner, 'app.html');
    await openScreen(page, 'mailbox');

    const row = page.locator('#mailbox-list .list-row', { hasText: ENQUIRY });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(listingRef);

    // Brokered in both directions: the owner is not told who is asking.
    const mailbox = await page.locator('#mailbox-list').innerText();
    for (const [field, secret] of Object.entries({ ...ENQUIRER_ID, email: enquirer.email })) {
      expect(mailbox, `mailbox leaked the enquirer's ${field}: "${secret}"`).not.toContain(secret);
    }
  });

  // ---- reply ------------------------------------------------------------
  test('the owner can reply, and the reply queues for operator review', async ({ page }) => {
    await signIn(page, owner, 'app.html');
    await openScreen(page, 'mailbox');

    await page.locator('#mailbox-list .list-row', { hasText: ENQUIRY }).locator('[data-reply]').click();
    await expect(page.locator('#contact-modal')).toBeVisible();
    await page.fill('#contact-body', REPLY);
    await page.click('#contact-send-btn');

    // The reply is not auto-delivered either - it queues for review like any
    // other message, against the same listing.
    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [REPLY]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      `select m.status, m.listing_id, p.email sender from public.messages m
         join public.profiles p on p.id = m.sender_id where m.body = $1`, [REPLY]
    );
    expect(rows[0]).toMatchObject({ status: 'pending_review', listing_id: listingId, sender: owner.email });
  });

  test('the operator sees the reply awaiting review', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: REPLY });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Pending Review');
    await expect(row).toContainText(`Re: ${listingRef}`);
  });

  // This used to be a pinned gap. Forward targets were derived from
  // listings.user_id, which is right for an enquiry and wrong for a reply -
  // on a reply the listing owner IS the sender, so "Forward to Owner" handed
  // the message back to its own author and nothing reached the enquirer.
  // sql/009 added messages.in_reply_to and the operator now routes a reply to
  // the sender of the message it answers. These are the happy path.
  test('the operator is offered the enquirer, not the owner, as the reply target', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: REPLY });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const forward = row.locator('[data-forward]');
    expect(await forward.getAttribute('data-owner')).toBe(enquirer.profileId);
    expect(await forward.getAttribute('data-owner')).not.toBe(owner.profileId);
    expect(await forward.getAttribute('data-target-kind')).toBe('sender');
    // And it says so, rather than claiming to forward to the listing owner.
    await expect(forward).toContainText('Forward Reply');
  });

  test('the operator forwards the reply and the enquirer receives it', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: REPLY });
    await row.locator('[data-forward]').click();

    await expect(page.locator('#forward-modal')).toBeVisible();
    // The modal names who it is actually going to.
    await expect(page.locator('#forward-target-info')).toContainText(ENQUIRER_ID.first_name);
    await page.click('#forward-confirm-btn');

    await expect.poll(async () => {
      const r = await query(
        `select count(*)::int n from public.message_forward_log
          where message_id = (select id from public.messages where body = $1)
            and to_user_id = (select id from public.profiles where email = $2)`,
        [REPLY, enquirer.email]
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    // It was never sent back to its own author.
    const { rows } = await query(
      `select count(*)::int n from public.message_forward_log
        where message_id = (select id from public.messages where body = $1)
          and to_user_id = (select id from public.profiles where email = $2)`,
      [REPLY, owner.email]
    );
    expect(rows[0].n, 'the reply was forwarded back to its own sender').toBe(0);
  });

  test('the enquirer sees the answer, still without an identity', async ({ page }) => {
    await signIn(page, enquirer, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).toContainText(REPLY, { timeout: 15_000 });
    // Their own enquiry is still there too - this is a conversation now.
    await expect(page.locator('#mailbox-list')).toContainText(ENQUIRY);

    const mailbox = await page.locator('#mailbox-list').innerText();
    for (const [field, secret] of Object.entries({ ...OWNER_ID, email: owner.email })) {
      expect(mailbox, `the reply leaked the owner's ${field}: "${secret}"`).not.toContain(secret);
    }
  });

  // The routing has to keep alternating, or it is just a special case for the
  // second message rather than a working thread.
  test('a third turn routes back to the owner again', async ({ page }) => {
    await signIn(page, enquirer, 'app.html');
    await openScreen(page, 'mailbox');
    await page.locator('#mailbox-list .list-row', { hasText: REPLY }).locator('[data-reply]').click();
    await expect(page.locator('#contact-modal')).toBeVisible();
    await page.fill('#contact-body', FOLLOW_UP);
    await page.click('#contact-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [FOLLOW_UP]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    // Threaded onto the owner's reply, so the operator's target is the owner.
    const { rows } = await query(
      `select parent.sender_id = (select id from public.profiles where email = $2) as targets_owner
         from public.messages m join public.messages parent on parent.id = m.in_reply_to
        where m.body = $1`,
      [FOLLOW_UP, owner.email]
    );
    expect(rows[0] && rows[0].targets_owner, 'the follow-up is not threaded onto the reply').toBe(true);

    await signOut(page);
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: FOLLOW_UP });
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await row.locator('[data-forward]').getAttribute('data-owner')).toBe(owner.profileId);
  });

  // The operator can also answer a message themselves, and that reply is a
  // message like any other: it answers something, so it has to be threaded the
  // same way. Left unthreaded it came back to this very mailbox as pending
  // with a "Forward to Owner" button - the listing-derived target returning
  // through the one path sql/009 did not touch - and the owner is not who the
  // operator wrote it for.
  test("the operator's own reply is threaded, delivered, and not left pending", async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');
    const row = page.locator('#operator-mailbox-list .list-row', { hasText: FOLLOW_UP });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-reply]').click();

    await expect(page.locator('#reply-modal')).toBeVisible();
    await page.fill('#reply-body', OP_REPLY);
    await page.click('#reply-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [OP_REPLY]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      `select m.status,
              parent.body as parent_body,
              (select count(*)::int from public.message_forward_log f
                where f.message_id = m.id
                  and f.to_user_id = (select id from public.profiles where email = $2)) as to_enquirer,
              (select count(*)::int from public.message_forward_log f
                where f.message_id = m.id
                  and f.to_user_id = (select id from public.profiles where email = $3)) as to_owner
         from public.messages m
         left join public.messages parent on parent.id = m.in_reply_to
        where m.body = $1`,
      [OP_REPLY, enquirer.email, owner.email]
    );
    const reply = rows[0];
    expect(reply.parent_body, 'the operator reply is not threaded onto what it answers').toBe(FOLLOW_UP);
    expect(reply.to_enquirer, 'the operator reply did not reach the person who asked').toBe(1);
    expect(reply.to_owner, 'the operator reply was delivered to the listing owner').toBe(0);
    expect(reply.status, 'a reply delivered in the same action is still shown as pending').toBe('forwarded');

    // So the mailbox offers no second, wrong forward for it.
    const opRow = page.locator('#operator-mailbox-list .list-row', { hasText: OP_REPLY });
    await expect(opRow).toBeVisible({ timeout: 15_000 });
    await expect(opRow).toContainText('Forwarded');
    await expect(opRow.locator('[data-forward]')).toHaveCount(0);
  });

  test('no email was sent at any point in this flow', async () => {
    // Listing creation queues outbox rows by design; the point is that nothing
    // in this flow flushed them, and no message became an email.
    const { rows } = await query(
      'select count(*)::int n from public.email_outbox where sent_at is not null and to_email like $1',
      ['jericho-e2e-%']
    );
    expect(rows[0].n).toBe(0);
  });
});

// ---- 6 -------------------------------------------------------------------
// Cleanup is afterAll above; this asserts it actually happened rather than
// trusting it. Runs last because the file is serial.
test('6. teardown removes every test account and all its data', async () => {
  await cleanup();
  const { rows } = await query(
    `select
       (select count(*)::int from public.profiles where email like $1) profiles,
       (select count(*)::int from public.messages where body in ($2, $3)) messages,
       (select count(*)::int from public.email_outbox where to_email like $1) outbox`,
    ['jericho-e2e-%', ENQUIRY, REPLY]
  );
  expect(rows[0]).toMatchObject({ profiles: 0, messages: 0, outbox: 0 });
});
