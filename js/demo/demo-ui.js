// DEMO BUILD ONLY - added to every page by scripts/build-demo.js.
//
// Two things, both for the demo only:
//   1. The fixed ribbon at the foot of every page, saying the data is example
//      data and is not saved.
//   2. On the sign-in page, three buttons that enter the demo as a seeded
//      account, with no password. They sit above the normal form, which still
//      works with the demo e-mail addresses.

(function () {
  'use strict';

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

  const form = document.getElementById('login-form');
  if (!form) return;

  const panel = document.createElement('div');
  panel.id = 'demo-enter';
  panel.className = 'card';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  [
    ['member-a', 'Enter as Member A', 'btn-primary'],
    ['member-b', 'Enter as Member B', 'btn-primary'],
    ['operator', 'Enter as Operator', 'btn-secondary'],
  ].forEach(([key, label, cls]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + cls + ' btn-block';
    btn.textContent = label;
    btn.addEventListener('click', () => window.demoEnterAs(key));
    panel.appendChild(btn);
  });

  const card = form.closest('.card') || form;
  card.parentNode.insertBefore(panel, card);
})();
