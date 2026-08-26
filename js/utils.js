// Jericho Platform — shared frontend helpers.
// Depends on `jericho` (the Supabase client) from supabase-config.js.

/** Escape text before inserting into innerHTML, to avoid stored-XSS from
 *  user-entered fields (notes, company name, etc.) rendered back into the DOM. */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Simple toast notification, top of screen, auto-dismisses. */
function showToast(message, kind = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

/** Human-readable message from a Supabase/Postgres error. */
function errorMessage(err) {
  if (!err) return 'Unknown error';
  return err.message || err.error_description || String(err);
}

/** Fetch the profile row for the currently authenticated user.
 *  Returns null if not logged in or no profile exists yet. */
async function getCurrentProfile() {
  const { data: { session } } = await jericho.auth.getSession();
  if (!session) return null;
  const { data, error } = await jericho
    .from('profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) {
    console.error('getCurrentProfile failed:', error);
    return null;
  }
  return data;
}

/** Guard a page: redirect to index.html if not logged in, or if logged in
 *  but not approved, or if role doesn't match what the page requires.
 *  requiredRole: 'operator' | 'participant' | null (any approved user). */
async function requireAuth(requiredRole = null) {
  const profile = await getCurrentProfile();
  if (!profile) {
    window.location.href = 'index.html';
    return null;
  }
  if (profile.status === 'pending') {
    window.location.href = 'index.html?pending=1';
    return null;
  }
  if (profile.status !== 'approved') {
    await jericho.auth.signOut();
    window.location.href = 'index.html?blocked=1';
    return null;
  }
  if (requiredRole && profile.role !== requiredRole) {
    window.location.href = profile.role === 'operator' ? 'operator.html' : 'app.html';
    return null;
  }
  return profile;
}

async function logout() {
  await jericho.auth.signOut();
  window.location.href = 'index.html';
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** The "Documents you have" checklist, in two fixed categories.
 *
 *  Scope (set 2026-08-26): this records what the seller/broker actually holds
 *  about the *material* and about the *legitimacy/compliance* of the offering.
 *  Documents that only come into existence later, in the negotiation between a
 *  specific buyer and seller — LOI, ICPO, SPA, Proof of Funds, Past
 *  Performance — were deliberately removed; they say nothing about the goods
 *  and inviting them here mixed two different stages of a deal. */
const DOCUMENT_GROUPS = [
  {
    title: 'Material / Product Documentation',
    docs: [
      'Certificate of Analysis (COA)',
      'Assay Report',
      'Certificate of Origin',
      'Photos',
      'Videos',
      // Shipping paperwork sits here rather than under Compliance: it evidences
      // the goods themselves — that they exist, are stored, and are in transit.
      'Warehouse Receipt, where applicable',
      'Bill of Lading / Shipping Documentation, where applicable',
      'Packing List, where applicable',
      'Other relevant product/material documentation',
    ],
  },
  {
    title: 'Company / Compliance & Supporting Documentation',
    docs: [
      'Company Registration / Corporate Documents',
      'KYC Documentation',
      'CIS (Customer Information Sheet)',
      'Other',
    ],
  },
];

/** Flat list of every checklist item, in display order. document_checklist
 *  rows are keyed by these strings, so they are the storage contract too. */
const DOCUMENT_TYPES = DOCUMENT_GROUPS.flatMap(g => g.docs);

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR'];

/** Commercial weights and volumes. Used for both a listing's Quantity unit
 *  and its "Price per" unit, which are deliberately independent — ore is
 *  quantified in metric tons but priced per DMTU, for instance. */
const UNITS = [
  'Grams', 'Kilograms', 'Metric tons', 'Pounds', 'Ounces',
  'Liters', 'Cubic meters', 'Barrels', 'Gallons', 'Bushels',
  'Dry Metric Ton Units (DMTU)',
];

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana',
  'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon',
  'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo (Republic of the)', 'Congo (Democratic Republic of the)', 'Costa Rica', "Cote d'Ivoire",
  'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini',
  'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana',
  'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras',
  'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
  'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste',
  'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

/** Populate a <select> with plain string options. If withBlank, first resets
 *  the select and inserts a leading empty option; otherwise appends to
 *  whatever options are already there (e.g. a placeholder in the HTML). */
function populateSelect(id, values, withBlank = false) {
  const el = document.getElementById(id);
  if (withBlank) el.innerHTML = '<option value="">—</option>';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  });
}

/** Sort commodity rows alphabetically by name, with "Other" pinned last.
 *
 *  Sorting client-side rather than in the query keeps the list alphabetical
 *  even when sort_order has not caught up — a commodity an Operator adds
 *  through the UI has no sort_order until the seed is re-run, and ordering by
 *  that column alone would drop it at the bottom instead of under its own
 *  letter. localeCompare is case-insensitive and accent-aware, so "LNG" files
 *  under L with "Lead" rather than ahead of every lowercase name. */
function sortCommodities(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aOther = a.name.toLowerCase() === 'other';
    const bOther = b.name.toLowerCase() === 'other';
    if (aOther !== bOther) return aOther ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Set a <select> to `value`, keeping values that predate the dropdown.
 *
 *  Unit and Origin/Destination used to be free-text inputs, so existing rows
 *  hold things like "mt" or "belgium" that match no option. Assigning those to
 *  a <select> silently selects nothing, and the next save would write the
 *  blank back — quietly destroying data the user never chose to clear. So an
 *  unrecognised value is appended as its own option (matched case-insensitively
 *  first, since "belgium" and "Belgium" are the same place) and selected. */
function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!value) { el.value = ''; return; }

  const match = Array.from(el.options).find(o => o.value.toLowerCase() === String(value).toLowerCase());
  if (match) { el.value = match.value; return; }

  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = `${value} (existing entry)`;
  el.appendChild(opt);
  el.value = value;
}

const STATUS_LABELS = {
  available: 'Available', under_review: 'Under Review', negotiation: 'Negotiation',
  closed: 'Closed', archived: 'Archived',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended',
  requested: 'Requested', confirmed: 'Confirmed', unavailable: 'Unavailable',
  new: 'New', reviewed: 'Reviewed', dismissed: 'Dismissed',
  pending_review: 'Pending Review', forwarded: 'Forwarded', replied: 'Replied', ignored: 'Ignored'
};

function statusLabel(status) { return STATUS_LABELS[status] || status; }
