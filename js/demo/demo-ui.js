// DEMO BUILD ONLY - added to every page by scripts/build-demo.js.
//
// Two things, both for the demo only:
//   1. The fixed ribbon at the foot of every page, saying the data is example
//      data and is not saved.
//   2. On the sign-in page, two buttons that enter the demo as a seeded
//      member, with no password. They sit above the normal form. The demo is
//      for members only: there is no Operator entry.

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

  const form = document.getElementById('login-form');
  if (!form) return;

  // The Operator demo (window.DEMO_KIND set by scripts/build-demo.js) has its
  // own single button and no member film; the member demo is unchanged.
  const OPERATOR_DEMO = window.DEMO_KIND === 'operator';
  // English only: the Operator demo has no language switch (owner's rule for the
  // Operator side). The member demo keeps its switch.
  if (OPERATOR_DEMO) {
    document.querySelectorAll('#lang-toggle').forEach((el) => el.remove());
  }

  const panel = document.createElement('div');
  panel.id = 'demo-enter';
  panel.className = 'card';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  if (!OPERATOR_DEMO) {
    // The trailer, at the top of the sign-in panel. Same file as the front page;
    // no autoplay, so nothing plays until someone presses play.
    const trailer = document.createElement('video');
    trailer.controls = true;
    trailer.setAttribute('playsinline', '');
    trailer.preload = 'metadata';
    trailer.poster = 'films/trailer-en-poster.jpg';
    trailer.setAttribute('aria-label', 'MyPlatform trailer');
    trailer.style.cssText = 'display:block;width:100%;border-radius:8px;';
    panel.appendChild(trailer);

    // The film follows the language: English or Spanish, with its own poster.
    // Set only when it changes, so switching again does not restart the film.
    function setTrailer() {
      const lang = typeof currentLang === 'function' && currentLang() === 'es' ? 'es' : 'en';
      const next = 'films/trailer-' + lang + '.mp4';
      if (trailer.getAttribute('src') !== next) {
        trailer.setAttribute('poster', 'films/trailer-' + lang + '-poster.jpg');
        trailer.setAttribute('src', next);
      }
    }
    setTrailer();
    // Keep whatever the page already does on a language change (auth.js sets it),
    // and run the trailer's own swap after it.
    const previousOnLanguageChange = window.onLanguageChange;
    window.onLanguageChange = function () {
      if (typeof previousOnLanguageChange === 'function') previousOnLanguageChange();
      setTrailer();
    };
  }

  const buttons = OPERATOR_DEMO
    ? [['operator', 'Enter as Operator', 'btn-primary']]
    : [
      ['member-a', 'Enter as Member A', 'btn-primary'],
      ['member-b', 'Enter as Member B', 'btn-primary'],
    ];
  buttons.forEach(([key, label, cls]) => {
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
