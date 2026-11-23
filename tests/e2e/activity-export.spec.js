// The participant's activity overview, ON THE SCREEN (owner, 23 Nov 2026; docs/AGREED-2026-11-23-activity-on-screen.md).
// It replaced the CSV download: the same data (my_activity_export()), newest first, the latest 50, "Show more" for older.
//
//   Item35  it contains only the member's own data (MUST NOT)
//   Item36  it never names a counterparty (MUST NOT)
//   Item99  there is no download of a member's activity any more: no button, no code (MUST NOT)
//   Item100 it shows everything my_activity_export() returns, newest first, the latest 50, with Show more
//
// What the screen shows is read from the page itself. The old download tests read a file; there is no file now.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn } = require('./helpers/session');
const { query } = require('../../scripts/db');

let me, other, operator;
let myRef, theirRef;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'expop', role: 'operator', status: 'approved' });
  me = await createAccount({ label: 'expmine', role: 'participant', status: 'approved' });
  other = await createAccount({ label: 'expother', role: 'participant', status: 'approved' });

  myRef = await insertListing(me.profileId, 'E2E Export Mine');
  theirRef = await insertListing(other.profileId, 'E2E Export Theirs');

  // A message I sent, a message somebody else sent about my listing, and an
  // Operator forwarding that one to me.
  await query(
    `insert into public.messages (sender_id, listing_id, body, status)
     values ($1, (select id from public.listings where reference_number = $2),
             'E2E export enquiry of mine', 'pending_review')`,
    [me.profileId, theirRef]
  );
  const { rows: theirs } = await query(
    `insert into public.messages (sender_id, listing_id, body, status)
     values ($1, (select id from public.listings where reference_number = $2),
             'E2E export enquiry of theirs', 'forwarded')
     returning id`,
    [other.profileId, myRef]
  );
  await query(
    `insert into public.message_forward_log (message_id, operator_id, to_user_id)
     values ($1, $2, $3)`,
    [theirs[0].id, operator.profileId, me.profileId]
  );

  await query(
    `insert into public.document_requests
       (listing_id, requester_id, participant_id, doc_type, status, responded_at)
     values ((select id from public.listings where reference_number = $1), $2, $3,
             'Certificate of Origin', 'confirmed', now())`,
    [myRef, operator.profileId, me.profileId]
  );
});

test.afterAll(async () => { await cleanup(); });

async function insertListing(profileId, commodity) {
  const { rows } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
     values ($1, 'sell', $2, 100, 'Metric tons', 'FOB', 'Chile', 'available',
             public.next_reference('sell'))
     returning reference_number`,
    [profileId, commodity]
  );
  return rows[0].reference_number;
}

/** Open the Profile page and wait for the overview to be drawn. */
async function openOverview(page) {
  await page.click('button[data-screen="profile"]');
  await expect(page.locator('#screen-profile')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#activity-list [data-activity-row]').first()).toBeVisible({ timeout: 15_000 });
  return (await page.locator('#activity-list').innerText());
}

test.describe.serial('activity overview', () => {

  test('Item100 everything the participant has done is on the screen', async ({ page }) => {
    await signIn(page, me);
    const text = await openOverview(page);
    expect(text).toContain(myRef);
    expect(text).toContain('Listing posted');
    expect(text).toContain('E2E export enquiry of mine');
    expect(text).toContain('Message sent');
    // Forwarded to them by an Operator: theirs to see, though not a row they own, which is the case a
    // "where sender_id = me" list would drop.
    expect(text).toContain('E2E export enquiry of theirs');
    expect(text).toContain('Message received');
    expect(text).toContain('Document requested');
    expect(text).toContain('Certificate of Origin');
  });

  test('Item35 and Item36 nobody else appears in it, and no counterparty is named', async ({ page }) => {
    await signIn(page, me);
    const text = await openOverview(page);
    const listingRows = await page.locator('#activity-list [data-activity-row]', { hasText: 'Listing posted' }).allInnerTexts();
    expect(listingRows.join('\n')).toContain(myRef);
    expect(listingRows.join('\n')).not.toContain(theirRef);
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(operator.email);
    for (const name of ['expother', 'expop']) expect(text.toLowerCase()).not.toContain(name);
  });

  test('Item35 the other participant sees their own overview, not this one', async ({ page }) => {
    await signIn(page, other);
    const text = await openOverview(page);
    expect(text).toContain(theirRef);
    expect(text).toContain('E2E export enquiry of theirs');
    expect(text).not.toContain(myRef);
    expect(text).not.toContain('E2E export enquiry of mine');
  });

  test('Item100 the heading is the one line "Activity overview" with nothing under it but the rows', async ({ page }) => {
    await signIn(page, me);
    await openOverview(page);
    const card = page.locator('#screen-profile .card', { has: page.locator('#activity-list') });
    await expect(card.locator('h3')).toHaveText('Activity overview');
    await expect(card.locator('p')).toHaveCount(0);
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(card.locator('h3')).toHaveText('Resumen de actividad');
    await expect(card.locator('#activity-list')).toContainText('Publicación creada');
  });

  test('Item100 newest first, the latest 50, and Show more for older ones', async ({ page }) => {
    // 55 more messages of mine, the newest one an hour ahead, so the order is not left to chance.
    await query(
      `insert into public.messages (sender_id, listing_id, body, status, created_at)
       select $1, (select id from public.listings where reference_number = $2), 'E2E export bulk ' || g, 'pending_review',
              now() - (g || ' minutes')::interval
         from generate_series(1, 55) g`, [me.profileId, theirRef]);
    await query(
      `insert into public.messages (sender_id, listing_id, body, status, created_at)
       values ($1, (select id from public.listings where reference_number = $2), 'E2E export newest of all', 'pending_review', now() + interval '1 hour')`,
      [me.profileId, theirRef]);
    await signIn(page, me);
    await openOverview(page);
    const rows = page.locator('#activity-list [data-activity-row]');
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText('E2E export newest of all');
    const more = page.locator('#activity-more-btn');
    await expect(more).toBeVisible();
    await expect(more).toHaveText('Show more');
    await more.click();
    const total = await rows.count();
    expect(total, 'Show more must add rows').toBeGreaterThan(50);
    expect(total).toBeLessThanOrEqual(100);
    // The oldest rows (the listing and the document request made first) are reachable by pressing on.
    while (await more.isVisible()) await more.click();
    await expect(page.locator('#activity-list')).toContainText(myRef);
  });

  test('Item99 there is no download of the activity any more: no button, no link, no file code', async ({ page }) => {
    await signIn(page, me);
    await openOverview(page);
    await expect(page.locator('#export-activity-btn')).toHaveCount(0);
    await expect(page.locator('#screen-profile').getByRole('button', { name: /download|csv|descargar/i })).toHaveCount(0);
    await expect(page.locator('#screen-profile a[download]')).toHaveCount(0);
    const root = path.join(__dirname, '..', '..');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
    const i18n = fs.readFileSync(path.join(root, 'js', 'i18n.js'), 'utf8');
    for (const dead of ['createObjectURL', 'text/csv', 'csvField', 'toCsv', 'downloadFile', 'exportMyActivity']) {
      expect(app, `js/app.js still contains ${dead}`).not.toContain(dead);
    }
    expect(html).not.toContain('export-activity-btn');
    for (const key of ['export.download', 'export.intro', 'export.done', 'export.empty', 'export.colDate', 'export.colDetail']) {
      expect(i18n, `${key} is still in js/i18n.js`).not.toContain(`'${key}'`);
    }
  });
});
