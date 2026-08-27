// Jericho Platform — the Terms & Conditions page.
//
// Deliberately standalone: it loads no Supabase client and requires no
// session, because someone has to be able to read the terms *before* they
// have an account. register.html links here in a new tab, and app.html links
// here from its footer so a participant can re-read them later.
//
// The text itself lives in the terms.* keys in i18n.js, so it is translated
// through the same dictionary as the rest of the participant interface and a
// participant always reads the version matching the language they are using.
// The version string comes from TERMS_VERSION in utils.js and is what gets
// stored against an acceptance — see sql/010.

'use strict';

function renderTerms() {
  document.getElementById('terms-version').textContent =
    t('terms.version', { version: TERMS_VERSION });

  const body = document.getElementById('terms-body');
  body.innerHTML = '';

  for (const n of TERMS_SECTIONS) {
    const section = document.createElement('section');
    section.className = 'terms-section';

    const h = document.createElement('h3');
    h.textContent = t(`terms.s${n}.title`);

    const p = document.createElement('p');
    p.textContent = t(`terms.s${n}.body`);

    section.appendChild(h);
    section.appendChild(p);
    body.appendChild(section);
  }
}

// The back link returns to wherever the reader came from. Opened in a new tab
// from the registration page there is no history to go back to, so fall back
// to closing the tab, and to the sign-in page if the browser refuses to close
// a tab it did not open by script.
function wireBackLink() {
  document.getElementById('terms-back').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.history.length > 1) { window.history.back(); return; }
    window.close();
    window.location.href = 'index.html';
  });
}

window.onLanguageChange = function () {
  applyTranslations();
  renderTerms();
};

document.addEventListener('DOMContentLoaded', () => {
  renderLanguageToggle('lang-toggle');
  applyTranslations();
  renderTerms();
  wireBackLink();
});
