// Item 32 - the Operator never requests a document, and a member has nothing
// to answer. Document requests were removed from both consoles on 4 Nov (owner's
// decision 36: the Operator never requests, sees or records a document).
//
// This is a prohibition about the screens. The database still holds the
// document_requests table and its existing rules; nothing here drops it. So the
// proof is that neither console offers the request, the answer, or the columns
// that recorded documents, and that the Operator's own console has no route to
// them.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn } = require('./helpers/session');

let operator, member;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'i32op', role: 'operator', status: 'approved' });
  member = await createAccount({ label: 'i32mem', role: 'participant', status: 'approved' });
});

test.afterAll(async () => {
  await cleanup();
});

test('Item32 the Operator console has no document-request tab, tile, screen, request form, or document columns', async ({ page }) => {
  await signIn(page, operator, 'operator.html');
  await expect(page.locator('nav.tabs button[data-screen="overview"]')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('nav.tabs button[data-screen="doc-requests"]'), 'no Document Requests tab').toHaveCount(0);
  await expect(page.locator('#stat-doc-requests'), 'no outstanding-requests tile').toHaveCount(0);
  await expect(page.locator('#screen-doc-requests'), 'no request screen').toHaveCount(0);
  await expect(page.locator('#create-doc-request-btn'), 'no Send Request button').toHaveCount(0);

  // The Scorecard shows no document columns: its header has none of the two.
  await expect(page.locator('th', { hasText: 'Docs matched' }), 'no matched-documents column').toHaveCount(0);
  await expect(page.locator('th', { hasText: 'Docs faulty' }), 'no faulty-documents column').toHaveCount(0);
});

test('Item32 a member has no Documents tab and no way to answer a document request', async ({ page }) => {
  await signIn(page, member, 'app.html');
  await expect(page.locator('nav button[data-screen="my-listings"]')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('button[data-screen="doc-requests"]'), 'no Documents tab').toHaveCount(0);
  await expect(page.locator('#screen-doc-requests'), 'no answer screen').toHaveCount(0);
  await expect(page.locator('[data-confirm], [data-unavailable]'), 'no I-have-this / not-available buttons').toHaveCount(0);
});
