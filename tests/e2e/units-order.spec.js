// The Unit and "Price per" dropdowns must both list their units in plain
// alphabetical order.
//
// Both are fed from the single UNITS constant in js/utils.js, so this could be
// asserted against the array alone — but that would pass even if a dropdown
// stopped using UNITS, or re-sorted on the way to the DOM. The check that is
// worth having is the one on the rendered <option> list a participant sees.
//
// Ordering is asserted on the option VALUES, which are canonical English. The
// Spanish labels are not alphabetical in Spanish and are not meant to be:
// reordering per language would move an option under the participant while
// they were switching, and the stored value is the English one either way.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');

// Every unit that must survive the sort. DMTU is listed here explicitly
// because it is the one with a parenthetical and the one most likely to be
// "tidied" into a group of its own at the end of the list.
const EXPECTED = [
  'Barrels',
  'Bushels',
  'Cubic meters',
  'Dry Metric Ton Units (DMTU)',
  'Gallons',
  'Grams',
  'Kilograms',
  'Liters',
  'Metric tons',
  'Ounces',
  'Pounds',
];

let participant;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  participant = await createAccount({ label: 'units', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

async function optionValues(page, selectId) {
  return page.locator(`#${selectId} option`).evaluateAll(opts =>
    opts.map(o => o.value).filter(v => v !== '')  // drop the leading blank
  );
}

test.describe.serial('unit dropdowns are alphabetical', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#email', participant.email);
    await page.fill('#password', participant.password);
    await page.click('#login-btn');
    await page.waitForURL('**/app.html', { timeout: 20_000 });
    await page.click('button[data-screen="new-listing"]');
  });

  for (const selectId of ['unit', 'price_unit']) {
    test(`#${selectId} lists every unit in alphabetical order`, async ({ page }) => {
      const values = await optionValues(page, selectId);

      // Nothing dropped or duplicated by the reordering.
      expect([...values].sort()).toEqual([...EXPECTED].sort());
      expect(values).toContain('Dry Metric Ton Units (DMTU)');

      // Case-insensitive alphabetical, with no group pinned anywhere.
      const alphabetical = [...values].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
      expect(values).toEqual(alphabetical);
      expect(values).toEqual(EXPECTED);
    });
  }

  test('the Spanish labels follow the same option order', async ({ page }) => {
    await page.click('#lang-toggle .lang-btn >> nth=1');
    // Translating must not reorder or drop options — only relabel them.
    for (const selectId of ['unit', 'price_unit']) {
      expect(await optionValues(page, selectId)).toEqual(EXPECTED);
    }
    await expect(page.locator('#unit option[value="Metric tons"]')).toHaveText('Toneladas métricas');
  });
});
