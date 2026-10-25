// Signing the Terms: the fields, the checks, and the gate at sign-in.
//
// Shared by register.html (signature given at registration) and app.html
// (the gate a member meets when they have not signed the newest Terms).
// sql/031 makes every one of these checks again on the server; the ones
// here exist only so the member is told in plain words before pressing.
//
// Field ids are `prefix + name`, so the same block can sit on a page that
// already has a "country" or "company" field of its own.

/** Mirrors public.looks_like_po_box() in sql/031. Keep the two in step. */
const PO_BOX_PATTERN = new RegExp(
  '\\bp\\.?\\s*o\\.?\\s*box\\b|\\bpost\\s*office\\s*box\\b|\\bpob\\b'
  + '|\\bapartado(\\s+de\\s+correos)?\\b|\\bapdo\\.?\\s*\\d'
  + '|\\bcasilla(\\s+de\\s+correos?)?\\b|\\bcaixa\\s+postal\\b'
  + '|\\bpostfach\\b|\\bbo[iî]te\\s+postale\\b', 'i');

function looksLikePoBox(text) {
  return PO_BOX_PATTERN.test(text || '');
}

/** The address and capacity fields, without the typed name: register.html
 *  puts the name beside its accept box, the gate puts it at the bottom. */
function signingFieldsHtml(prefix) {
  const p = prefix;
  return `
    <fieldset class="signing-capacity">
      <legend><span data-i18n="sign.capacity">I sign</span> *</legend>
      <label class="checkbox-row"><input type="radio" name="${p}capacity" id="${p}cap-individual" value="individual" required>
        <span data-i18n="sign.capacity.individual">as an individual</span></label>
      <label class="checkbox-row"><input type="radio" name="${p}capacity" id="${p}cap-company" value="company">
        <span data-i18n="sign.capacity.company">on behalf of a company</span></label>
    </fieldset>
    <div id="${p}company-row" class="hidden">
      <label for="${p}company"><span data-i18n="sign.company">Company name</span> *</label>
      <input type="text" id="${p}company" autocomplete="organization">
    </div>

    <p class="field-hint" data-i18n="sign.poBoxNotice">Your street address, where you live or work. PO boxes cannot be used: legal papers must reach a real address.</p>
    <label for="${p}address_line1"><span data-i18n="sign.address1">Street and number</span> *</label>
    <input type="text" id="${p}address_line1" required autocomplete="address-line1">
    <label for="${p}address_line2" data-i18n="sign.address2">Address line 2 (optional)</label>
    <input type="text" id="${p}address_line2" autocomplete="address-line2">
    <div class="grid-2">
      <div>
        <label for="${p}city"><span data-i18n="sign.city">City</span> *</label>
        <input type="text" id="${p}city" required autocomplete="address-level2">
      </div>
      <div>
        <label for="${p}postal_code" data-i18n="sign.postcode">Postcode (if your country uses one)</label>
        <input type="text" id="${p}postal_code" autocomplete="postal-code">
      </div>
    </div>
    <label for="${p}country"><span data-i18n="register.country">Country</span> *</label>
    <select id="${p}country" required autocomplete="country-name">
      <option value="" data-i18n="register.countryPlaceholder">Select a country…</option>
    </select>`;
}

function signedNameHtml(prefix) {
  return `
    <label for="${prefix}signed_name"><span data-i18n="sign.name">Type your full name as your signature</span> *</label>
    <input type="text" id="${prefix}signed_name" required autocomplete="name">`;
}

/** Fill `host` with the fields, translate them, and wire the company row. */
function renderSigningFields(host, prefix) {
  host.innerHTML = signingFieldsHtml(prefix);
  applyTranslations(host);
  populateSelect(prefix + 'country', COUNTRIES, false, countryLabel);
  const row = document.getElementById(prefix + 'company-row');
  const box = document.getElementById(prefix + 'company');
  host.querySelectorAll(`input[name="${prefix}capacity"]`).forEach(r => {
    r.addEventListener('change', () => {
      const isCompany = r.value === 'company' && r.checked;
      row.classList.toggle('hidden', !isCompany);
      box.required = isCompany;
    });
  });
}

/** Read the fields. Returns { values } or { errorKey }, never both. */
function readSignature(prefix) {
  const val = (name) => (document.getElementById(prefix + name)?.value || '').trim();
  const picked = document.querySelector(`input[name="${prefix}capacity"]:checked`);
  const values = {
    signed_name: val('signed_name'),
    signing_capacity: picked ? picked.value : '',
    company: val('company'),
    address_line1: val('address_line1'),
    address_line2: val('address_line2'),
    city: val('city'),
    postal_code: val('postal_code'),
    country: val('country'),
  };
  if (values.signed_name.length < 3 || !values.signed_name.includes(' ')) return { errorKey: 'sign.err.name' };
  if (!values.signing_capacity) return { errorKey: 'sign.err.capacity' };
  if (values.signing_capacity === 'company' && !values.company) return { errorKey: 'sign.err.company' };
  if (!values.address_line1 || !values.city || !values.country) return { errorKey: 'sign.err.address' };
  if (looksLikePoBox(values.address_line1) || looksLikePoBox(values.address_line2)) return { errorKey: 'sign.err.poBox' };
  return { values };
}

/** The newest published Terms version, in the member's language if it
 *  exists in it. null when none is published (before sql/031's text). */
async function latestPublishedTerms() {
  const { data, error } = await jericho
    .from('terms_versions').select('version, language, published_at')
    .order('published_at', { ascending: false });
  if (error || !data || !data.length) return null;
  const newest = data[0].version;
  const mine = data.find(r => r.version === newest && r.language === currentLang());
  return mine || data[0];
}

/** The sign-in gate. Resolves true when the member may carry on, false when
 *  the gate is showing. A database without sql/031 has no such function;
 *  that is "nothing to sign", not a reason to lock everyone out. */
async function checkTermsGate() {
  const { data, error } = await jericho.rpc('has_accepted_current_terms');
  if (error) {
    // Failing open is deliberate while the gate is the interface's alone (see
    // sql/031): a broken check must not lock every member out.
    if (error.code !== 'PGRST202' && error.code !== '42883') console.error('has_accepted_current_terms failed:', error);
    return true;
  }
  if (data === true) return true;
  await showTermsGate();
  return false;
}

async function showTermsGate() {
  const gate = document.getElementById('terms-gate');
  const terms = await latestPublishedTerms();
  if (!gate || !terms) return;
  document.querySelectorAll('[data-gate-hides]').forEach(el => el.classList.add('hidden'));
  renderSigningFields(document.getElementById('gate-fields'), 'gate-');
  document.getElementById('gate-name').innerHTML = signedNameHtml('gate-');
  applyTranslations(document.getElementById('gate-name'));
  gate.classList.remove('hidden');
  document.getElementById('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitTermsGate(terms);
  });
}

async function submitTermsGate(terms) {
  const read = readSignature('gate-');
  if (read.errorKey) { showError(t(read.errorKey)); return; }
  const v = read.values;
  await withButtonBusy('gate-btn', t('sign.signing'), async () => {
    const { error } = await jericho.rpc('accept_terms', {
      p_version: terms.version, p_language: terms.language,
      p_signed_name: v.signed_name, p_capacity: v.signing_capacity,
      p_company: v.company || null,
      p_address_line1: v.address_line1, p_address_line2: v.address_line2 || null,
      p_city: v.city, p_postal_code: v.postal_code || null, p_country: v.country,
    });
    if (error) { showError(errorMessage(error)); return; }
    window.location.reload();
  });
}
