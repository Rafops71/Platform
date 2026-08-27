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
    populateSelect('country', COUNTRIES, false, countryLabel);
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
  }

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

    await logActivity(prof.id, 'login');

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

async function logActivity(userId, action, details = null) {
  try {
    await jericho.from('activity_log').insert({ user_id: userId, action, details });
  } catch (e) {
    console.warn('activity log failed (non-fatal):', e);
  }
}

// ------------------------------------------------------------ REGISTER ----
let invitationToken = null;

async function initRegisterPage() {
  invitationToken = getQueryParam('token');
  const checking = document.getElementById('invitation-checking');
  const invalidCard = document.getElementById('invitation-invalid');
  const registerCard = document.getElementById('register-card');
  populateSelect('country', COUNTRIES, false, countryLabel);

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
  if (invitation.email) {
    document.getElementById('email').value = invitation.email;
  }

  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.textContent = t('register.submitting');

  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const first_name = document.getElementById('first_name').value.trim();
  const last_name = document.getElementById('last_name').value.trim();
  const company = document.getElementById('company').value.trim();
  const country = document.getElementById('country').value.trim();
  const phone = document.getElementById('phone').value.trim();

  // The language they actually filled this form in becomes their stored
  // preference, and handle_new_user() copies it onto the profile. It is what
  // every later notification email is rendered in — see sql/008. Anything
  // unexpected is folded to English by norm_lang() on the way in.
  const language = currentLang();

  const { data, error } = await jericho.auth.signUp({
    email, password,
    options: { data: { first_name, last_name, company, country, phone, language } }
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

  const { error: markError } = await jericho.rpc('mark_invitation_used', { p_token: invitationToken });
  if (markError) {
    console.error('mark_invitation_used failed:', markError);
    // Registration itself succeeded (profile exists, pending approval) —
    // this only affects invitation bookkeeping, so don't block the user.
  }

  await jericho.auth.signOut();
  window.location.href = 'index.html?pending=1';
}
