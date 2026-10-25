// Jericho Platform — login + invitation-based registration.
// Runs on both index.html (login) and register.html (registration).

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  renderLanguageToggle('lang-toggle');

  if (document.getElementById('login-form')) initLoginPage();
  if (document.getElementById('register-form')) initRegisterPage();
});

/** Re-render what applyTranslations() cannot reach: the country dropdown,
 *  whose labels are translated while its stored values stay English. */
window.onLanguageChange = function () {
  if (document.getElementById('country')) {
    const select = document.getElementById('country');
    const chosen = select.value;
    select.innerHTML = `<option value="">${escapeHtml(t('register.countryPlaceholder'))}</option>`;
    renderSigningFields(document.getElementById('signing-fields'), '');
  document.getElementById('signing-name').innerHTML = signedNameHtml('');
  applyTranslations(document.getElementById('signing-name'));
    select.value = chosen;
  }
};

// ---------------------------------------------------------------- LOGIN ----
async function initLoginPage() {
  // If already signed in with an approved profile, skip straight to the
  // right dashboard instead of showing the login form.
  const profile = await getCurrentProfile();
  if (profile && profile.status === 'approved') {
    window.location.href = profile.role === 'operator' ? 'operator.html' : 'app.html';
    return;
  }

  const notice = document.getElementById('notice');
  if (getQueryParam('pending') === '1') {
    notice.textContent = t('login.pending');
    notice.classList.remove('hidden');
  } else if (getQueryParam('blocked') === '1') {
    notice.textContent = t('login.blocked');
    notice.classList.remove('hidden');
  } else if (getQueryParam('reset') === '1') {
    // reset.html sends them back here after signing them out, so the last
    // thing they see is a confirmation and a form that proves the new
    // password works while they are still sitting in front of it.
    notice.textContent = t('login.resetOk');
    notice.classList.remove('hidden');
  }

  wireForgotPassword();

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = t('login.submitting');

    const { data, error } = await jericho.auth.signInWithPassword({ email, password });
    if (error) {
      showError(errorMessage(error));
      btn.disabled = false;
      btn.textContent = t('login.submit');
      return;
    }

    const { data: prof, error: profErr } = await jericho
      .from('profiles').select('*').eq('user_id', data.user.id).maybeSingle();

    if (profErr || !prof) {
      showError(t('login.noProfile'));
      await jericho.auth.signOut();
      btn.disabled = false;
      btn.textContent = t('login.submit');
      return;
    }

    await logActivity('login');

    if (prof.status === 'pending') {
      await jericho.auth.signOut();
      window.location.href = 'index.html?pending=1';
      return;
    }
    if (prof.status !== 'approved') {
      await jericho.auth.signOut();
      window.location.href = 'index.html?blocked=1';
      return;
    }
    window.location.href = prof.role === 'operator' ? 'operator.html' : 'app.html';
  });
}

// Through record_activity() rather than straight into the table: sql/030
// removed the direct INSERT grant, because a route that let the browser choose
// `action` let it write any sentence it liked into the Operator's audit trail.
// The actor is no longer passed either - the function reads it from the
// caller's own session - so the userId argument this helper used to take has
// gone with it rather than sitting there unread.
async function logActivity(action, details = null) {
  try {
    await jericho.rpc('record_activity', { p_action: action, p_details: details });
  } catch (e) {
    console.warn('activity log failed (non-fatal):', e);
  }
}

// ------------------------------------------------------------ REGISTER ----
let invitationToken = null;

/** The walkthrough film, in whichever language the page is set to.
 *
 *  Shown only once an invitation has been accepted as valid - it is revealed
 *  beside the registration form and never on the public sign-in page.
 *
 *  The source is set here rather than in the markup so that it follows the
 *  language toggle. Assigning .src (rather than swapping a <source> child)
 *  is what makes the element reload; a <source> swap needs an explicit
 *  load() and silently keeps playing the old file without it. */
function showIntroVideo() {
  const card = document.getElementById('intro-video-card');
  const video = document.getElementById('intro-video');
  if (!card || !video) return;

  setIntroVideoSource();
  card.classList.remove('hidden');

  // setLang() calls this after it has re-translated the page, so the film
  // follows the EN/ES buttons like every other piece of text here.
  window.onLanguageChange = () => setIntroVideoSource();
}

function setIntroVideoSource() {
  const video = document.getElementById('intro-video');
  if (!video) return;
  const lang = typeof currentLang === 'function' ? currentLang() : 'en';
  const next = `films/member-${lang === 'es' ? 'es' : 'en'}.mp4`;
  // Only touch src when it actually changes: reassigning it restarts the
  // film, and re-translating the page must not throw somebody back to the
  // beginning of a three-minute video they are halfway through.
  if (!video.getAttribute('src') || !video.getAttribute('src').endsWith(next)) {
    video.setAttribute('src', next);
  }
}

async function initRegisterPage() {
  invitationToken = getQueryParam('token');
  const checking = document.getElementById('invitation-checking');
  const invalidCard = document.getElementById('invitation-invalid');
  const registerCard = document.getElementById('register-card');
  renderSigningFields(document.getElementById('signing-fields'), '');
  document.getElementById('signing-name').innerHTML = signedNameHtml('');
  applyTranslations(document.getElementById('signing-name'));

  if (!invitationToken) {
    checking.classList.add('hidden');
    invalidCard.classList.remove('hidden');
    return;
  }

  const { data, error } = await jericho.rpc('get_invitation_by_token', { p_token: invitationToken });
  const invitation = Array.isArray(data) ? data[0] : data;

  checking.classList.add('hidden');

  const isValid = invitation && !invitation.used_at && new Date(invitation.expires_at) > new Date();
  if (error || !isValid) {
    invalidCard.classList.remove('hidden');
    return;
  }

  registerCard.classList.remove('hidden');
  showIntroVideo();
  if (invitation.email) {
    document.getElementById('email').value = invitation.email;
  }

  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
}

async function handleRegisterSubmit(e) {
  e.preventDefault();

  // The `required` attribute on the checkbox already stops the browser
  // submitting, so reaching this branch means the form was submitted some
  // other way. Checked again rather than assumed, because the whole point of
  // the box is that nobody registers without it.
  const acceptBox = document.getElementById('accept-terms');
  if (!acceptBox || !acceptBox.checked) {
    showError(t('register.terms.required'));
    return;
  }

  // The signature. Checked here so the member is told in their own words;
  // handle_new_user() records it only if it passes the same rules again.
  const signature = readSignature('');
  if (signature.errorKey) {
    showError(t(signature.errorKey));
    return;
  }
  const sig = signature.values;

  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.textContent = t('register.submitting');

  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const first_name = document.getElementById('first_name').value.trim();
  const last_name = document.getElementById('last_name').value.trim();
  const company = sig.signing_capacity === 'company' ? sig.company : '';
  const country = sig.country;
  const phone = document.getElementById('phone').value.trim();

  // The language they actually filled this form in becomes their stored
  // preference, and handle_new_user() copies it onto the profile. It is what
  // every later notification email is rendered in — see sql/008. Anything
  // unexpected is folded to English by norm_lang() on the way in.
  const language = currentLang();

  // The terms version and the language the terms were read in travel as
  // signup metadata, because handle_new_user() writes the acceptance row in
  // the same transaction that creates the profile (sql/010). Recording it
  // from the browser afterwards would mean a registration could complete with
  // no acceptance on file if that second call failed or was never made.
  const { data, error } = await jericho.auth.signUp({
    email, password,
    options: {
      data: {
        first_name, last_name, company, country, phone, language,
        terms_version: TERMS_VERSION,
        terms_language: language,
        signed_name: sig.signed_name,
        signing_capacity: sig.signing_capacity,
        address_line1: sig.address_line1,
        address_line2: sig.address_line2,
        city: sig.city,
        postal_code: sig.postal_code,
      }
    }
  });

  if (error) {
    showError(errorMessage(error));
    btn.disabled = false;
    btn.textContent = t('register.submit');
    return;
  }

  if (!data.session) {
    // Project has "Confirm email" enabled, so there's no active session yet
    // to call mark_invitation_used with. This platform is set up to run
    // with email confirmation OFF (see README) specifically so this step
    // works in one pass; if it's on, tell the user plainly rather than
    // silently failing to consume the invitation.
    showError(`${t('register.emailConfirm')} ${t('register.inviteNotMarked')}`);
    btn.disabled = false;
    btn.textContent = t('register.submit');
    return;
  }

  // The invitation is consumed by handle_new_user() during signup itself
  // (sql/024), inside the same transaction that creates the profile - which is
  // strictly better than a second call from here, because a browser that is
  // closed between the two steps used to leave an invitation unspent.
  //
  // This used to call mark_invitation_used() here. After 024 that call always
  // failed with "Invitation already used", caught and written to the console,
  // on EVERY successful registration. Confirmed against the live function on
  // 2026-10-13: handle_new_user() sets used_at and used_by itself. A harmless
  // error in a log is not harmless - it is the noise somebody learns to ignore
  // just before a real one appears next to it.

  await jericho.auth.signOut();
  window.location.href = 'index.html?pending=1';
}

/** "Forgotten your password?" — request a link that sets a new one.
 *
 *  THE ANSWER IS ALWAYS THE SAME, whether or not the address has an account.
 *  This is the whole reason the code below looks like it ignores errors. On a
 *  private, invitation-only platform, a form that says "no such account" for
 *  one address and "email sent" for another lets anybody test whether a given
 *  company trades here - which is exactly the thing members are promised is
 *  secret. The secrecy IS the product, so account enumeration is not a
 *  theoretical weakness here; it leaks the membership list one guess at a time.
 *
 *  Supabase Auth sends this email itself, not through our own outbox, so it
 *  works even while LISTING_EMAIL_FROM and RESEND_API_KEY are unset. That is
 *  deliberate: recovery must not depend on the part of the system that is
 *  broken, or the first time anyone needs it will be the time it cannot help.
 */
function wireForgotPassword() {
  const link = document.getElementById('forgot-link');
  const panel = document.getElementById('forgot-panel');
  const form = document.getElementById('forgot-form');
  const done = document.getElementById('forgot-done');
  if (!link || !panel || !form) return;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    panel.classList.remove('hidden');
    // Carry across whatever they already typed: somebody who has just failed
    // to sign in has their address in the box above, and asking for it twice
    // is the kind of small rudeness that makes people give up.
    const typed = document.getElementById('email').value.trim();
    const box = document.getElementById('forgot-email');
    if (typed && !box.value) box.value = typed;
    box.focus();
  });

  document.getElementById('forgot-cancel-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    done.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const btn = document.getElementById('forgot-send-btn');
    btn.disabled = true;
    btn.textContent = t('reset.sending');

    // The redirect lands on reset.html of whatever host this page is served
    // from, so a local run returns to localhost and the live site returns to
    // the live site. Supabase only honours it if the URL is on the project's
    // allow list; otherwise it falls back to the project's Site URL.
    const redirectTo = new URL('reset.html', window.location.href).href;

    // Deliberately unchecked. An error here - unknown address, rate limit -
    // must look exactly like success, or the form becomes a membership oracle.
    // Nothing is logged to the console either, for the same reason.
    await jericho.auth.resetPasswordForEmail(email, { redirectTo }).catch(() => {});

    form.classList.add('hidden');
    done.textContent = t('reset.sentNeutral');
    done.classList.remove('hidden');
  });
}
