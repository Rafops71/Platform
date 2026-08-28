// The participant's activity export: a CSV of everything they have done here.
//
// The file is the deliverable, so this spec takes the download Playwright
// catches and reads it, rather than trusting a toast. Two things are asserted
// about the contents: that every kind of activity is in it, and that another
// participant's activity is not - which is the assertion that matters, since an
// export is the one feature whose whole job is to hand someone a copy of data.

'use strict';

const fs = require('fs');
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

/** Click Download and read what the browser was handed. */
async function downloadExport(page) {
  await page.click('button[data-screen="profile"]');
  await expect(page.locator('#screen-profile')).toBeVisible({ timeout: 15_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.click('#export-activity-btn'),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: fs.readFileSync(path, 'utf8') };
}

test.describe.serial('activity export', () => {

  test('the file is a dated CSV with a header row', async ({ page }) => {
    await signIn(page, me);
    const { name, text } = await downloadExport(page);

    expect(name).toMatch(/^jericho-activity-\d{4}-\d{2}-\d{2}\.csv$/);
    // A BOM, because this is opened in Excel and UTF-8 without one is read as
    // the local codepage - which turns every accented character in a Spanish
    // message body into mojibake.
    expect(text.charCodeAt(0)).toBe(0xFEFF);
    expect(text).toContain('"Date","What","Listing","Detail","Status"');
  });

  test('everything the participant has done is in it', async ({ page }) => {
    await signIn(page, me);
    const { text } = await downloadExport(page);

    expect(text).toContain(myRef);
    expect(text).toContain('Listing posted');
    expect(text).toContain('E2E export enquiry of mine');
    expect(text).toContain('Message sent');
    // Forwarded to them by an Operator: theirs to have, though not a row they
    // own, which is the case a "where sender_id = me" export would drop.
    expect(text).toContain('E2E export enquiry of theirs');
    expect(text).toContain('Message received');
    expect(text).toContain('Document requested');
    expect(text).toContain('Certificate of Origin');
  });

  test('nobody else appears in it', async ({ page }) => {
    await signIn(page, me);
    const { text } = await downloadExport(page);

    // Their listing, which I have never been shown as mine.
    const listingRows = text.split(/\r?\n/).filter(line => line.includes('Listing posted'));
    expect(listingRows.join('\n')).toContain(myRef);
    expect(listingRows.join('\n')).not.toContain(theirRef);

    // And no identity of any kind: the export is one participant's own record,
    // and the platform never tells them who the counterparty was.
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(operator.email);
  });

  test('the other participant gets their own file, not this one', async ({ page }) => {
    await signIn(page, other);
    const { text } = await downloadExport(page);

    expect(text).toContain(theirRef);
    expect(text).toContain('E2E export enquiry of theirs');
    const listingRows = text.split(/\r?\n/).filter(line => line.includes('Listing posted'));
    expect(listingRows.join('\n')).not.toContain(myRef);
    expect(text).not.toContain('E2E export enquiry of mine');
  });

  test('the column headings follow the interface language', async ({ page }) => {
    await signIn(page, other);
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    const { text } = await downloadExport(page);

    expect(text).toContain('"Fecha","Qué","Publicación","Detalle","Estado"');
    expect(text).toContain('Publicación creada');
  });
});
