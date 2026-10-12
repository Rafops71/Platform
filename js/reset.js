// Setting a new password from a recovery link.
//
// The other half of "Forgotten your password?" on index.html. Before these two
// files there was no way back into an account at all: no link, no flow, and an
// Operator with nobody else to ask. The owner lost his own password and it took
// an administrator with a service key to let him back in - which is not a
// recovery path, it is a person.
//
// HOW THE LINK WORKS
//
// Supabase Auth sends the email itself, so this does not depend on
// RESEND_API_KEY or the outbox. Recovery must not rest on the part of the
// system that is broken, or the first time anybody needs it is the time it
// cannot help.
//
// The link goes to Supabase, which verifies the token and then redirects here
// with a session in the URL fragment. The supabase-js client reads that
// fragment on load and raises PASSWORD_RECOVERY. That session can change the
// password and nothing else useful - it is a one-use key to one door.
//
// WHY THE FORM IS HIDDEN UNTIL THE LINK IS ACCEPTED
//
// A page that shows the form first and fails afterwards invites somebody to
// type a new password into something that was never going to save it. So the
// form appears only once there is a session to save it with, and a bad or
// expired link says so plainly and sends them back to ask for another.
//
// WHY IT SIGNS OUT AFTERWARDS
//
// The recovery session arrived from a link in an inbox. Leaving it signed in
// means a recovery link is also a way in without the new password - and the
// person may be on a machine that is not theirs. Signing out and asking them
// to sign in properly costs one extra step and proves the new password works
// while they are still sitting there.

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initLanguage();
  initReset();
});

/** True once a recovery session exists and the form may be shown. */
let RECOVERY_READY = false;

async function initReset() {
  const form = document.getElementById('reset-form');
  const status = document.getElementById('reset-status');

  // Written here rather than carried on a data-i18n attribute, because this
  // line changes and an attribute would let the translation pass overwrite
  // whatever this function decides. See the comment in reset.html.
  status.textContent = t('reset.checking');

  // The client reads the fragment on load, but the event can land before or
  // after this listener depending on timing, so BOTH paths are handled: the
  // event below, and the explicit check after it.
  jericho.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showForm();
  });

  // Give the client a moment to consume the fragment, then ask it directly.
  // Polling rather than a fixed sleep: a fast machine should not wait, and a
  // slow one should not fail.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !RECOVERY_READY) {
    const { data } = await jericho.auth.getSession();
    if (data && data.session) { showForm(); break; }
    await new Promise(r => setTimeout(r, 150));
  }

  if (!RECOVERY_READY) {
    // No session. Either the link is old, already used, or somebody opened
    // this page directly. All three get the same honest sentence and a way
    // to ask for a new link.
    status.textContent = t('reset.linkInvalid');
    status.classList.remove('hidden');
    form.classList.add('hidden');
    return;
  }

  form.addEventListener('submit', saveNewPassword);
}

function showForm() {
  if (RECOVERY_READY) return;
  RECOVERY_READY = true;
  document.getElementById('reset-form').classList.remove('hidden');
  document.getElementById('reset-status').classList.add('hidden');
}

async function saveNewPassword(e) {
  e.preventDefault();
  const pw = document.getElementById('new-password').value;
  const again = document.getElementById('confirm-password').value;
  const btn = document.getElementById('reset-btn');

  // Checked here as well as by the browser's own minlength, because a browser
  // that does not enforce it would otherwise send a password Supabase rejects
  // with a message written for developers.
  if (pw.length < 8) { showError(t('reset.tooShort')); return; }
  if (pw !== again) { showError(t('reset.mismatch')); return; }

  btn.disabled = true;
  btn.textContent = t('reset.saving');

  const { error } = await jericho.auth.updateUser({ password: pw });
  if (error) {
    showError(errorMessage(error));
    btn.disabled = false;
    btn.textContent = t('reset.save');
    return;
  }

  // Out, deliberately. See the note at the top of this file.
  await jericho.auth.signOut();

  showSuccess(t('reset.done'));
  setTimeout(() => { window.location.href = 'index.html?reset=1'; }, 1200);
}
