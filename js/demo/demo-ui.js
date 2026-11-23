// DEMO BUILD ONLY - added to every page by scripts/build-demo.js.
//
// Two things, both for the demo only:
//   1. The fixed ribbon at the foot of every page, saying the data is example
//      data and is not saved.
//   2. On the first page, ONE button that enters the demo as the one seeded
//      member, with no password and no film (owner, 23 Nov 2026). The Operator
//      demo (DEMO_KIND "operator") has its own single button.

(function () {
  'use strict';

  // The live site has no favicon, so the browser asks for /favicon.ico and
  // gets a 404 in the console. An empty inline icon stops that request here,
  // in the demo only.
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'data:,';
    document.head.appendChild(icon);
  }

  const ribbon = document.createElement('div');
  ribbon.id = 'demo-ribbon';
  ribbon.setAttribute('role', 'status');
  ribbon.textContent = 'DEMO — example data, nothing is saved';
  ribbon.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483000',
    'background:#7c2d12', 'color:#fff', 'text-align:center',
    'font:600 13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'letter-spacing:0.02em', 'padding:6px 12px', 'box-shadow:0 -2px 8px rgba(0,0,0,0.2)',
  ].join(';');
  document.body.appendChild(ribbon);
  document.body.style.paddingBottom = (ribbon.offsetHeight + 8) + 'px';

  // The Operator demo (window.DEMO_KIND set by scripts/build-demo.js) keeps the ordinary sign-in page with its single
  // button above it. The MEMBER demo's first page is built differently (owner, 23 Nov 2026,
  // docs/AGREED-2026-11-23-demo-one-member.md): scripts/build-demo.js removes the tagline, the sign-in form, the
  // walkthrough film and the invitation line from index.html and leaves a slot, so the page is the name, ONE button
  // and the language switch. No film, no password.
  const OPERATOR_DEMO = window.DEMO_KIND === 'operator';
  const form = document.getElementById('login-form');
  const slot = document.getElementById('demo-enter-slot');
  if (!form && !slot) return;

  // English only: the Operator demo has no language switch (owner's rule for the
  // Operator side). The member demo keeps its switch.
  if (OPERATOR_DEMO) {
    document.querySelectorAll('#lang-toggle').forEach((el) => el.remove());
  }

  const panel = document.createElement('div');
  panel.id = 'demo-enter';
  panel.className = 'card';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  const buttons = OPERATOR_DEMO
    ? [['operator', 'Enter as Operator', 'btn-primary']]
    : [['member', 'Enter as Member', 'btn-primary']];
  buttons.forEach(([key, label, cls]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + cls + ' btn-block';
    btn.textContent = label;
    btn.addEventListener('click', () => window.demoEnterAs(key));
    panel.appendChild(btn);
  });

  if (slot) { slot.appendChild(panel); return; }
  const card = form.closest('.card') || form;
  card.parentNode.insertBefore(panel, card);
})();
