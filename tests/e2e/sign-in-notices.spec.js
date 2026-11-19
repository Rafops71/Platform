// Sign-in notices follow the language switch (owner, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 4).
//
//   Item06  a person who is not approved cannot sign in, and is told why
//
// "Registration pending" (?pending=1) and "password changed" (?reset=1) were written once, in the language the page
// opened in, and stayed there when the language was switched. Rejected and suspended already followed the switch
// (tests in walkthrough-batch.spec.js). No Spanish or English sentence changed: the same two existing strings are used.
// These pages need no account, so this file needs nothing but the static site.

'use strict';

const { test, expect } = require('@playwright/test');

const NOTICES = [
  { query: 'pending=1',
    en: 'Your registration is awaiting Operator approval. You will be able to sign in once approved.',
    es: 'Su registro está pendiente de aprobación por parte de un Operador. Podrá iniciar sesión una vez aprobado.' },
  { query: 'reset=1',
    en: 'Your password has been changed. Sign in with the new one.',
    es: 'Su contraseña se ha actualizado. Acceda con la nueva.' },
];

for (const n of NOTICES) {
  test(`Item06 the ${n.query.split('=')[0]} notice on the sign-in page switches language with the language buttons, both ways`, async ({ page }) => {
    await page.goto(`/index.html?${n.query}`);
    await expect(page.locator('#notice')).toHaveText(n.en);
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(page.locator('#notice')).toHaveText(n.es);
    await page.locator('.lang-btn', { hasText: 'EN' }).click();
    await expect(page.locator('#notice')).toHaveText(n.en);
    // And it opens in Spanish when Spanish is already chosen.
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await page.goto(`/index.html?${n.query}`);
    await expect(page.locator('#notice')).toHaveText(n.es);
  });
}
