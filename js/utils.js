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

/** Dates are shown in European format, DD/MM/YYYY, everywhere in the platform.
 *  Built from the parts rather than toLocaleDateString() so the result cannot
 *  drift with the viewer's machine locale — a US-configured browser would
 *  otherwise render 03/04/2026 as March 4th to one participant and April 3rd
 *  to another, which is worse than being in the wrong language. */
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DD/MM/YYYY HH:MM, 24-hour — European convention, no AM/PM. */
function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${formatDate(isoString)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Numbers in the active language's convention: 1.234,5 in Spanish,
 *  1,234.5 in English. Both are European-style (en-GB, not en-US).
 *  Falls back to the raw value where i18n is not loaded (operator.html). */
function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const locale = typeof i18nLocale === 'function' ? i18nLocale() : 'en-GB';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);
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
  const raw = err.message || err.error_description || String(err);

  // Supabase Auth turns an exception raised inside the on_auth_user_created
  // trigger into "Database error saving new user" with a 500. Verified
  // against the live project on 2026-10-13: an uninvited registration now
  // answers exactly that, because sql/024's handle_new_user() refuses it.
  // Correct, and meaningless to the person reading it - so it is translated
  // here into the one sentence that is true and useful. Deliberately no hint
  // about WHICH address would have worked: the prohibition in Item55 applies
  // to this form too.
  if (/database error saving new user/i.test(raw) && typeof t === 'function') {
    return t('register.inviteOnly');
  }

  // WHAT A MEMBER IS ALLOWED TO BE SHOWN
  //
  // PostgREST hands back the database's own words. Captured from the live
  // project on 2026-10-13, an action a member is not permitted answers:
  //
  //   new row violates row-level security policy for table "listings"
  //
  // Three things wrong with putting that on a screen. It reads as a crash
  // when the system is in fact working exactly as intended; it means nothing
  // to a commodity trader; and it names an internal table to somebody who was
  // just told they may not do something - which on a platform whose product
  // is controlled disclosure is a free look at how the walls are built.
  //
  // So the codes are translated and the raw text goes to the console, where
  // it is still there for whoever has to diagnose it.
  //
  // 42501 and PGRST204 were read off the live API. The 23xxx codes are the
  // SQL standard's own constraint-violation classes, not something read from
  // a vendor's screen.
  const code = err.code || '';
  const byCode = {
    '42501': 'err.notAllowed',      // row-level security refused it
    '23505': 'err.alreadyExists',   // unique constraint
    '23503': 'err.gone',            // foreign key: the other row is not there
    '23502': 'err.missingField',    // not null
    '23514': 'err.notAllowedValue', // check constraint
    'PGRST301': 'err.sessionEnded', // JWT no longer valid
  };

  // A browser that cannot reach Supabase at all throws a TypeError whose
  // message differs per browser, so this matches the shape rather than the
  // wording of any one of them.
  const offline = err instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(raw);

  const key = offline ? 'err.offline' : byCode[code];
  if (key && typeof t === 'function') {
    console.error('[jericho]', code || 'network', raw);
    return t(key);
  }

  return raw;
}

/** A value safe to drop into a PostgREST filter string.
 *
 *  WHY THIS EXISTS
 *
 *  The Operator's region box was spliced straight into a filter:
 *
 *    query.or(`origin.ilike.%${region}%,destination.ilike.%${region}%`)
 *
 *  A comma in that box is not text, it is punctuation. Proven against the
 *  live API on 2026-10-13: searching for `zzzz,role.eq.operator` returns the
 *  operator rows - the typed text became an extra condition on the query.
 *
 *  Nothing escapes through it today, because every such query still runs
 *  under Row Level Security and an Operator may already read what it reaches.
 *  It is fixed anyway, for one reason: the pattern. The same two lines on a
 *  member-facing screen would be a way for a member to rewrite their own
 *  query, and this platform's product is that members cannot see each other.
 *  A habit that is only safe where it currently sits is not safe.
 *
 *  PostgREST reads a double-quoted value as one literal, which is what the
 *  live API confirmed: quoted, the same string matches nothing instead of
 *  changing the query. Inner quotes and backslashes are escaped so the
 *  quoting itself cannot be closed early. */
function pgLikeValue(value) {
  const escaped = String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/** Run `work` with a button switched off, so a second press cannot start it
 *  again while the first is still in flight.
 *
 *  WHY THIS EXISTS
 *
 *  Several actions on this platform CREATE something: an enquiry to the
 *  Operator, a forward to the listing owner, an invitation, a document
 *  request. None of them disabled their control before awaiting the database,
 *  so two taps sent two. On a phone - which is where the owner uses this -
 *  a double tap is not a mistake anybody notices making.
 *
 *  Two of those duplicates are worse than untidy. A doubled forward means the
 *  listing owner receives the same enquiry twice from an Operator who only
 *  sent it once, and a doubled invitation emails somebody twice before the
 *  platform has said a word to them.
 *
 *  The button is switched back on in a `finally`, so a failure leaves a usable
 *  screen rather than a dead button. */
async function withButtonBusy(buttonOrId, busyText, work) {
  const btn = typeof buttonOrId === 'string'
    ? document.getElementById(buttonOrId)
    : buttonOrId;

  // Already running: the second press does nothing at all, rather than
  // queueing behind the first and firing when it finishes.
  if (btn && btn.disabled) return undefined;

  const original = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    if (busyText) btn.textContent = busyText;
  }
  try {
    return await work();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
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
    titleKey: 'docs.groupMaterial',
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
    titleKey: 'docs.groupCompany',
    docs: [
      'Company Registration / Corporate Documents',
      'KYC Documentation',
      'CIS (Customer Information Sheet)',
      'Other',
    ],
  },
];

/** Flat list of every checklist item, in display order. document_checklist
 *  rows are keyed by these strings, so they are the storage contract too —
 *  which is exactly why the Spanish labels below are display-only. */
const DOCUMENT_TYPES = DOCUMENT_GROUPS.flatMap(g => g.docs);

/** Canonical doc_type -> translation key. Storage never changes language. */
const DOCUMENT_TYPE_KEYS = {
  'Certificate of Analysis (COA)': 'docs.certificateOfAnalysis',
  'Assay Report': 'docs.assayReport',
  'Certificate of Origin': 'docs.certificateOfOrigin',
  'Photos': 'docs.photos',
  'Videos': 'docs.videos',
  'Warehouse Receipt, where applicable': 'docs.warehouseReceipt',
  'Bill of Lading / Shipping Documentation, where applicable': 'docs.billOfLading',
  'Packing List, where applicable': 'docs.packingList',
  'Other relevant product/material documentation': 'docs.otherMaterial',
  'Company Registration / Corporate Documents': 'docs.companyRegistration',
  'KYC Documentation': 'docs.kyc',
  'CIS (Customer Information Sheet)': 'docs.cis',
  'Other': 'docs.other',
};

/** Display label for a stored doc_type. English (the stored value) wherever
 *  i18n is not loaded, so operator.html is unaffected. */
function docTypeLabel(docType) {
  const key = DOCUMENT_TYPE_KEYS[docType];
  if (key && typeof t === 'function') {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return docType;
}

// The version of the Terms & Conditions currently in force. It is stored with
// every acceptance (see sql/010), so that what a participant agreed to stays
// identifiable after the text changes.
//
// Bump this whenever the terms.* strings in i18n.js change materially. Leaving
// it alone after a substantive edit is the one thing that breaks the record:
// two people would hold the same version string against different text.
const TERMS_VERSION = '2.4';

// The order the Terms sections are rendered in. Adding a section means adding
// its number here and a terms.sN.title plus either a terms.sN.body or the
// numbered paragraphs below, in both languages. Renumbering means editing the
// numbers inside the title strings too - they are part of the text.
const TERMS_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

// Sections whose body runs to more than one paragraph. A section listed here
// has terms.sN.p1 … p{count} instead of a single terms.sN.body; one that is
// not listed has the single body. Two sections need it. The Privacy Notice,
// because running "what is collected", "why", "who sees it", retention, the
// controller and the complaints route together into one block of text would
// make the part people most need to find the hardest to read. And section 16,
// where each company detail is its own line so that a missing one is visible
// as a gap rather than buried mid-sentence.
const TERMS_SECTION_PARAGRAPHS = { 10: 10, 16: 6 };

// Every legal detail the Terms need but the business does not have yet - the
// operating company name, its registered address, the data controller, and the
// rest - is written into the text as a bracketed PLACEHOLDER rather than left
// blank or omitted, so that reading the document shows what is missing. This
// marker is what the tests count: a placeholder that stops being marked, or a
// section quietly filled in with something invented, is the failure mode worth
// catching. Nothing here may reach real Participants until every occurrence is
// gone and a lawyer has read the result.
const TERMS_PLACEHOLDER_MARKER = 'PLACEHOLDER';

// What counts as a stale listing: still available and untouched for 30 days.
// Lives here rather than on either page because both use it - the Operator
// overview counts them, the participant dashboard offers to renew them - and
// two definitions would mean an Operator chasing a listing its owner was never
// told about.
const STALE_LISTING_DAYS = 30;

function staleListingCutoff() {
  return new Date(Date.now() - STALE_LISTING_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function isStaleListing(listing) {
  return listing.status === 'available' && listing.updated_at < staleListingCutoff();
}

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR'];

/** Commercial weights and volumes. Used for both a listing's Quantity unit
 *  and its "Price per" unit, which are deliberately independent — ore is
 *  quantified in metric tons but priced per DMTU, for instance. */
const UNITS = [
  'Barrels', 'Bushels', 'Cubic meters', 'Dry Metric Ton Units (DMTU)', 'Gallons', 'Grams',
  'Kilograms', 'Liters', 'Metric tons', 'Ounces', 'Pounds',
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
 *  whatever options are already there (e.g. a placeholder in the HTML).
 *
 *  `labelFn` translates what the option *shows* without touching what it
 *  *stores*. Country and unit values stay canonical English in the database,
 *  so a listing created in Spanish and one created in English are identical
 *  records — only the rendering differs. */
function populateSelect(id, values, withBlank = false, labelFn = null) {
  const el = document.getElementById(id);
  if (!el) return;
  const previous = el.value;
  if (withBlank) el.innerHTML = '<option value="">—</option>';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = labelFn ? labelFn(v) : v;
    el.appendChild(opt);
  });
  // Keep the current selection across a language switch, which repopulates.
  if (previous && values.includes(previous)) el.value = previous;
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
  opt.textContent = typeof t === 'function'
    ? t('form.existingEntry', { value })
    : `${value} (existing entry)`;
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

/** Human label for a status. On participant pages this goes through the
 *  translation dictionary; on operator.html, where js/i18n.js is deliberately
 *  not loaded, it falls back to the English table above. */
function statusLabel(status) {
  if (typeof t === 'function') {
    const translated = t(`status.${status}`);
    if (translated !== `status.${status}`) return translated;
  }
  return STATUS_LABELS[status] || status;
}

/** Human label for a platform role, translated on participant pages and
 *  falling back to the stored value everywhere else - same arrangement as
 *  statusLabel above, for the same reason. */
function roleLabel(role) {
  if (typeof t === 'function') {
    const translated = t(`role.${role}`);
    if (translated !== `role.${role}`) return translated;
  }
  return role === 'operator' ? 'Operator' : 'Participant';
}

/** How many ids to put in one `.in(…)` filter.
 *
 *  supabase-js sends a select as a GET, and `.in()` serialises into the query
 *  string as `id=in.(uuid,uuid,…)` — about 37 bytes per UUID. A few hundred
 *  ids and the URL exceeds the proxy's header buffer, which comes back as a
 *  414 rather than as data. PostgREST also caps a response at 1000 rows by
 *  default, silently, so a batch must stay well under that too.
 *
 *  100 keeps the URL near 4 KB and the response far below the row cap, while
 *  still turning N queries into N/100.
 */
const IN_CHUNK_SIZE = 100;

/** Split a list into chunks of at most `size`. */
function chunked(list, size = IN_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Reference numbers for a set of listing ids, batched.
 *
 *  Several screens render a list whose rows each name a listing: document
 *  requests, both mailboxes, matches. Each of them used to resolve that name
 *  with its own `.eq('id', …)` inside the render loop, so a mailbox of forty
 *  messages opened forty round trips and painted its rows one at a time.
 *
 *  Ids may repeat and may be null; both are handled here so callers can pass
 *  a raw column straight in.
 *
 *  Returns the error rather than swallowing it. That matters more than it
 *  looks: an empty Map from a failed query is indistinguishable from "none of
 *  these listings exist", and the caller then tells the operator the listings
 *  were *deleted* when in fact one network call failed. A Map plus an error is
 *  the difference between "gone" and "could not ask".
 *
 *  @param {Array<string|null>} ids
 *  @returns {Promise<{refs: Map<string,string>, error: any}>}
 */
async function referenceNumbersFor(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const refs = new Map();
  for (const part of chunked(unique)) {
    const { data, error } = await jericho
      .from('listings').select('id,reference_number').in('id', part);
    if (error) return { refs, error };
    (data || []).forEach(l => refs.set(l.id, l.reference_number));
  }
  return { refs, error: null };
}

// ------------------------------------------------- RENDER TOKENS ----
//
// Every screen on this platform paints a container from a fetch: clear it,
// await the rows, write them in. That is safe exactly once. Trigger the same
// loader twice - two clicks on a nav button, a filter changed and then a
// period changed, a refresh while the first refresh is still in the air - and
// two requests are in flight at once. The container is then painted by
// whichever ANSWER arrives last, which is not necessarily the question asked
// last, and the screen ends up showing rows for a request the member has
// already moved on from while the controls show the one they chose.
//
// It is not theoretical. It shipped twice: the operator's listings table
// (e03ebf9) and the analytics table, where CI run 50 caught a table holding
// 26 weekly rows after 8 monthly periods were asked for. In both cases the
// screen was confidently wrong, with nothing on it to suggest a disagreement -
// the worst kind of wrong on a page an Operator reads to decide what to act on.
//
// So the guard belongs on the whole class, not on the instances that have been
// caught. Each loader takes a token on entry and checks it after every await,
// before writing anything:
//
//     async function loadThing() {
//       const fresh = renderToken('thing');
//       …
//       const { data, error } = await jericho.rpc('thing');
//       if (!fresh()) return;            // a newer load started; drop this one
//       …
//     }
//
// Dropping the render rather than the request is deliberate. Cancelling the
// in-flight fetch would be tidier but needs an AbortController threaded through
// the Supabase client, and the cost here is one wasted parse, not a wasted
// round trip - the round trip already happened. What matters is that it does
// not reach the DOM.
//
// Keyed by name rather than per-function counters so a loader cannot be given
// a guard that silently shares a counter with another one, which would make
// two independent screens cancel each other.

const RENDER_TOKENS = Object.create(null);

/** Claim the newest render for `name`. The returned function answers "is this
 *  still the newest?" - false once another render of the same name has begun.
 *  @param {string} name
 *  @returns {() => boolean} */
function renderToken(name) {
  const mine = (RENDER_TOKENS[name] = (RENDER_TOKENS[name] || 0) + 1);
  return () => mine === RENDER_TOKENS[name];
}

// ------------------------------------------------- PERSON NAMES ----

/** A person's display name, never blank.
 *
 *  Accounts created before the name fields were collected hold an empty
 *  first_name and last_name, and `${first} ${last}` then renders as a single
 *  space - a row with a status badge, an email and an empty heading, which
 *  reads as a broken screen rather than as missing data. The live Operator
 *  account is exactly this case.
 *
 *  Falls back to the email, then to a plain marker. The email fallback is
 *  safe ONLY because every caller is either an Operator screen - where the
 *  Operator may see both parties by design - or a person's own header. It
 *  must never be used to render one member's name to another member: Browse
 *  and the participant mailbox deliberately name nobody, and this would
 *  undo that.
 *
 *  @param {{first_name?: string, last_name?: string, email?: string}} p
 *  @returns {string} */
function personName(p) {
  if (!p) return 'Unknown';
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return name || p.email || 'No name given';
}
