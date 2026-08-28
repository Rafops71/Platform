// Jericho Platform — participant dashboard logic.

let CURRENT_PROFILE = null;
let COMMODITIES = [];
let EDITING_LISTING_ID = null;
let CONTACT_TARGET = null; // { listingId, referenceNumber, inReplyTo }

// Both dashboard lists clear their container and then await before filling it,
// so two renders overlapping append twice and the screen shows every listing
// twice. That is not hypothetical: switching language while the first render is
// still in flight does exactly this, and it is what an E2E run caught. Each
// render takes a ticket, and only the newest one is allowed to write.
let MY_LISTINGS_RENDER = 0;
let SAVED_SEARCH_RENDER = 0;

document.addEventListener('DOMContentLoaded', async () => {
  CURRENT_PROFILE = await requireAuth('participant');
  if (!CURRENT_PROFILE) return; // requireAuth already redirected

  document.getElementById('user-name').textContent =
    `${CURRENT_PROFILE.first_name} ${CURRENT_PROFILE.last_name}`;
  document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  wireTabs();
  wireListingForm();
  wireBrowse();
  wireProfile();
  wireContactModal();

  populateSelect('incoterm', INCOTERMS);
  populateSelect('currency', CURRENCIES, true);
  // Labels are translated; the stored values stay canonical English.
  populateSelect('unit', UNITS, true, unitLabel);
  populateSelect('price_unit', UNITS, true, unitLabel);
  populateSelect('location', COUNTRIES, true, countryLabel);
  await loadCommodities();
  renderDocChecklist();

  adoptProfileLanguage();
  applyTranslations();
  renderLanguageToggle('lang-toggle');

  await loadMyListings();
  await loadSavedSearches();
  await refreshNotificationDot();
  await refreshDocRequestDot();
});

/** Reconcile the account's stored language with this browser's.
 *
 *  The toggle writes to localStorage, which never leaves the device, but
 *  notification emails are rendered from profiles.language. Without this, a
 *  participant who registered in Spanish would open the app on a second
 *  device to an English interface while still receiving Spanish email.
 *
 *  Which one wins depends on whether this browser has an explicit choice:
 *  no stored value means the account's language is adopted; an explicit local
 *  toggle is the more recent statement of intent and is written back instead.
 *  Note this reads localStorage directly rather than through currentLang(),
 *  which cannot tell "never chose" apart from "chose English". */
function adoptProfileLanguage() {
  const profileLang = CURRENT_PROFILE && CURRENT_PROFILE.language;
  if (!profileLang) return;

  let stored = null;
  try { stored = localStorage.getItem(I18N_STORAGE_KEY); } catch { /* private window */ }

  if (!stored) {
    // Only when it actually differs. setLang() re-renders the dropdowns and
    // the active screen through onLanguageChange, and firing that on every
    // load raced the initialisation already in flight below — two concurrent
    // loadMyListings()/loadCommodities() calls writing the same containers,
    // which showed up as lists intermittently failing to appear in the E2E
    // suite. In the common case the two already agree and this does nothing.
    if (profileLang !== currentLang()) setLang(profileLang);
  } else if (stored !== profileLang) {
    CURRENT_PROFILE.language = stored;
    jericho.from('profiles').update({ language: stored }).eq('id', CURRENT_PROFILE.id)
      .then(({ error }) => { if (error) console.warn('Could not save language preference:', error.message); });
  }
}

/** Called by i18n.js after the participant switches language. Static text is
 *  already handled by applyTranslations(); this re-renders everything drawn
 *  from data — the dropdown labels and whichever screen is on show — so the
 *  page changes language in place rather than needing a reload that would
 *  lose a half-filled form. */
window.onLanguageChange = function (lang) {
  // Persist the choice to the profile as well as localStorage. localStorage
  // only ever reaches this browser, and notification emails are composed in
  // the database (sql/008), which can only read a stored column. Fire and
  // forget: a failure here must not block the UI from switching, and the next
  // toggle will try again.
  if (CURRENT_PROFILE && lang && lang !== CURRENT_PROFILE.language) {
    CURRENT_PROFILE.language = lang;
    jericho.from('profiles').update({ language: lang }).eq('id', CURRENT_PROFILE.id)
      .then(({ error }) => { if (error) console.warn('Could not save language preference:', error.message); });
  }

  populateSelect('unit', UNITS, true, unitLabel);
  populateSelect('price_unit', UNITS, true, unitLabel);
  populateSelect('location', COUNTRIES, true, countryLabel);
  // The Profile country dropdown carries translated labels over canonical
  // English values, so it repopulates like the others - and its own selection
  // has to survive that, or switching language would silently blank the
  // country a participant is about to save.
  const countrySelect = document.getElementById('p_country');
  if (countrySelect) {
    const chosen = countrySelect.value;
    countrySelect.innerHTML = `<option value="">${escapeHtml(t('register.countryPlaceholder'))}</option>`;
    populateSelect('p_country', COUNTRIES, false, countryLabel);
    countrySelect.value = chosen;
  }
  // The header toggle and the Profile select are two views of one setting;
  // whichever was used, both end up showing the same thing.
  const langSelect = document.getElementById('p_language');
  if (langSelect && lang) langSelect.value = lang;
  const roleValue = document.getElementById('p_role_value');
  if (roleValue && CURRENT_PROFILE) {
    roleValue.textContent = roleLabel(CURRENT_PROFILE.role);
    document.getElementById('p_status_value').textContent = statusLabel(CURRENT_PROFILE.status);
  }
  loadCommodities();

  const selectedDocs = {};
  document.querySelectorAll('#doc-checklist input:checked').forEach(i => { selectedDocs[i.value] = true; });
  renderDocChecklist(selectedDocs);

  const active = document.querySelector('.screen.active');
  const screen = active ? active.id.replace('screen-', '') : 'my-listings';
  // Saved searches carry composed labels ("Antimony · Sell Offer · Chile"),
  // which are built at render time precisely so they follow the language - so
  // they have to be rebuilt here, or they stay in whichever language they were
  // first drawn in.
  if (screen === 'my-listings') { loadMyListings(); loadSavedSearches(); }
  if (screen === 'browse') loadBrowseListings();
  if (screen === 'doc-requests') loadDocRequests();
  if (screen === 'mailbox') loadMailbox();
  if (screen === 'notifications') loadNotifications();
  if (screen === 'new-listing' && !EDITING_LISTING_ID) {
    document.getElementById('listing-form-title').textContent = t('form.newListing');
  }
};

// ------------------------------------------------------------- TAB NAV ----
function wireTabs() {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.goto));
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const tabBtn = document.querySelector(`nav.tabs button[data-screen="${name}"]`);
  if (tabBtn) tabBtn.classList.add('active');

  if (name === 'my-listings') { loadMyListings(); loadSavedSearches(); }
  if (name === 'browse') loadBrowseListings();
  if (name === 'doc-requests') loadDocRequests();
  if (name === 'mailbox') loadMailbox();
  if (name === 'notifications') loadNotifications();
  if (name === 'new-listing' && !EDITING_LISTING_ID) resetListingForm();
}

// populateSelect() now lives in utils.js (shared with register's country dropdown).

// ---------------------------------------------------------- MY LISTINGS ----
async function loadMyListings() {
  const token = ++MY_LISTINGS_RENDER;
  const container = document.getElementById('my-listings-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data, error } = await jericho
    .from('listings')
    .select('*')
    .eq('user_id', CURRENT_PROFILE.id)
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = `<p class="empty-state">${t('listings.none')}</p>`; return; }

  // How many documents each listing indicates, in one query rather than a
  // head-count per row. Counting the returned rows client-side costs one id
  // per ticked document — a listing has at most a handful — and saves a round
  // trip per listing.
  const docCounts = new Map();
  const { data: ticked } = await jericho
    .from('document_checklist')
    .select('listing_id')
    .eq('indicated', true)
    .in('listing_id', data.map(l => l.id));
  (ticked || []).forEach(d => docCounts.set(d.listing_id, (docCounts.get(d.listing_id) || 0) + 1));

  const fragment = document.createDocumentFragment();
  for (const listing of data) {
    const count = docCounts.get(listing.id) || 0;

    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(listing.reference_number)} — ${escapeHtml(listing.commodity)}</span>
        <span class="badge ${statusBadgeClass(listing.status)}">${escapeHtml(statusLabel(listing.status))}</span>
      </div>
      <div class="list-row-meta">
        ${listing.type === 'sell' ? t('form.sellOffer') : t('form.buyRequest')} ·
        ${listing.quantity ? escapeHtml(formatNumber(listing.quantity)) + ' ' + escapeHtml(unitLabel(listing.unit || '')) : t('listings.qtyNa')} ·
        ${escapeHtml(listing.incoterm)} ·
        ${t('listings.updated', { date: formatDate(listing.updated_at) })}
      </div>
      <div class="list-row-meta">${count > 0 ? escapeHtml(t('listings.docsIndicated', { count })) : `<strong>${escapeHtml(t('listings.noDocsIndicated'))}</strong>`}</div>
      ${isStaleListing(listing) ? `
      <div class="stale-notice">
        ${escapeHtml(t('listings.staleNotice', { days: STALE_LISTING_DAYS }))}
        <div class="row" style="margin-top:8px;">
          <button class="btn btn-primary btn-small" data-renew="${listing.id}">${escapeHtml(t('listings.stillAvailable'))}</button>
          <button class="btn btn-secondary btn-small" data-close="${listing.id}">${escapeHtml(t('listings.closeIt'))}</button>
        </div>
      </div>` : ''}
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-edit="${listing.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn btn-danger btn-small" data-remove="${listing.id}">${escapeHtml(t('common.remove'))}</button>
      </div>
    `;
    fragment.appendChild(row);
  }

  // A newer render started while this one was fetching: its rows are the ones
  // that belong on screen, and appending these would double the list.
  if (token !== MY_LISTINGS_RENDER) return;
  container.replaceChildren(fragment);

  container.querySelectorAll('[data-renew]').forEach(b =>
    b.addEventListener('click', () => renewListing(b.dataset.renew)));
  container.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => closeListing(b.dataset.close)));
  container.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => editListing(b.dataset.edit)));
  container.querySelectorAll('[data-remove]').forEach(b =>
    b.addEventListener('click', () => removeListing(b.dataset.remove)));
}

/** "13.850 USD por Toneladas métricas" / "13,850 USD per Metric tons".
 *  Assembled here rather than inline so the number formatting and the "per"
 *  join word both follow the active language. */
function priceLine(l) {
  let out = formatNumber(l.price_conditions) || l.price_conditions || '';
  if (l.currency) out += ` ${l.currency}`;
  if (l.price_unit) out += currentLang() === 'es' ? ` por ${unitLabel(l.price_unit)}` : ` per ${unitLabel(l.price_unit)}`;
  return out;
}

function statusBadgeClass(status) {
  return { available: 'badge-green', under_review: 'badge-amber', negotiation: 'badge-blue',
           closed: 'badge-grey', archived: 'badge-grey' }[status] || 'badge-grey';
}

async function removeListing(id) {
  if (!confirm(t('listings.confirmRemove'))) return;
  const { error } = await jericho.from('listings').delete().eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  // Activity logging happens in the database (trg_log_listing_change).
  showSuccess(t('listings.removed'));
  loadMyListings();
}

/** "Still available": the listing is current, nothing about it has changed.
 *
 *  The renewal is a database function rather than an UPDATE from here because
 *  updated_at is what decides whether a listing is stale, and a browser able to
 *  write it directly could keep a dormant offer looking fresh forever. Editing
 *  the listing renews it too, through the same trigger - this is for the case
 *  where there is nothing to edit. */
async function renewListing(id) {
  const { error } = await jericho.rpc('renew_listing', { p_listing_id: id });
  if (error) { showError(errorMessage(error)); return; }
  showSuccess(t('listings.renewed'));
  loadMyListings();
}

/** The other honest answer to "is this still available": it is not. Closed
 *  rather than deleted, so the reference number and its message history survive
 *  - a counterparty who was talking to this listing should still be able to see
 *  what it was. */
async function closeListing(id) {
  const { error } = await jericho.from('listings').update({ status: 'closed' }).eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  showSuccess(t('listings.closed'));
  loadMyListings();
}

// ------------------------------------------------------- LISTING FORM ----
function renderDocChecklist(selected = {}) {
  const container = document.getElementById('doc-checklist');
  container.innerHTML = '';
  DOCUMENT_GROUPS.forEach(group => {
    const heading = document.createElement('p');
    heading.className = 'text-muted';
    heading.style.cssText = 'font-size:13px;font-weight:600;margin:12px 0 4px;';
    heading.textContent = group.titleKey ? t(group.titleKey) : group.title;
    container.appendChild(heading);

    group.docs.forEach(doc => {
      const row = document.createElement('label');
      row.className = 'checkbox-row';
      row.innerHTML = `<input type="checkbox" value="${escapeHtml(doc)}" ${selected[doc] ? 'checked' : ''}> ${escapeHtml(docTypeLabel(doc))}`;
      container.appendChild(row);
    });
  });
}

async function loadCommodities() {
  const { data, error } = await jericho.from('commodities').select('*');
  const select = document.getElementById('commodity-select');
  if (error) { console.error(error); return; }

  COMMODITIES = sortCommodities(data);
  select.innerHTML = `<option value="">${escapeHtml(t('form.commoditySelect'))}</option>`;
  COMMODITIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    select.appendChild(opt);
  });
  const otherOpt = document.createElement('option');
  otherOpt.value = '__other__'; otherOpt.textContent = t('form.commodityOther');
  select.appendChild(otherOpt);

  // The Browse filter offers the same curated list, plus whatever free-text
  // commodities actually exist on listings (added via "Other").
  const browseFilter = document.getElementById('browse-filter-commodity');
  if (browseFilter) {
    browseFilter.innerHTML = `<option value="">${escapeHtml(t('browse.allCommodities'))}</option>`;
    COMMODITIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name; opt.textContent = c.name;
      browseFilter.appendChild(opt);
    });
  }
}

function wireListingForm() {
  document.querySelectorAll('input[name="type"]').forEach(r =>
    r.addEventListener('change', () => {
      document.getElementById('location-label').textContent = r.value === 'sell' ? t('form.origin') : t('form.destination');
    }));

  document.getElementById('commodity-select').addEventListener('change', (e) => {
    document.getElementById('commodity-other').classList.toggle('hidden', e.target.value !== '__other__');
  });

  document.getElementById('listing-cancel-btn').addEventListener('click', () => {
    resetListingForm();
    showScreen('my-listings');
  });

  document.getElementById('listing-form').addEventListener('submit', submitListingForm);
}

function resetListingForm() {
  EDITING_LISTING_ID = null;
  document.getElementById('listing-form-title').textContent = t('form.newListing');
  document.getElementById('listing-form').reset();
  document.getElementById('commodity-other').classList.add('hidden');
  document.getElementById('location-label').textContent = t('form.origin');
  // Drop any "(existing entry)" options setSelectValue() appended while editing.
  // Labels are translated; the stored values stay canonical English.
  populateSelect('unit', UNITS, true, unitLabel);
  populateSelect('price_unit', UNITS, true, unitLabel);
  populateSelect('location', COUNTRIES, true, countryLabel);
  renderDocChecklist();
}

async function editListing(id) {
  const { data: listing, error } = await jericho.from('listings').select('*').eq('id', id).maybeSingle();
  if (error || !listing) { showError(t('listings.loadFailed')); return; }

  const { data: checklist } = await jericho.from('document_checklist').select('*').eq('listing_id', id);
  const selected = {};
  (checklist || []).forEach(c => { if (c.indicated) selected[c.doc_type] = true; });

  EDITING_LISTING_ID = id;
  document.getElementById('listing-form-title').textContent = t('form.editListing', { ref: listing.reference_number });
  document.querySelector(`input[name="type"][value="${listing.type}"]`).checked = true;
  document.getElementById('location-label').textContent = listing.type === 'sell' ? t('form.origin') : t('form.destination');

  const isKnownCommodity = COMMODITIES.some(c => c.name === listing.commodity);
  document.getElementById('commodity-select').value = isKnownCommodity ? listing.commodity : '__other__';
  document.getElementById('commodity-other').classList.toggle('hidden', isKnownCommodity);
  document.getElementById('commodity-other').value = isKnownCommodity ? '' : listing.commodity;

  document.getElementById('quantity').value = listing.quantity ?? '';
  setSelectValue('unit', listing.unit);
  document.getElementById('specification').value = listing.specification ?? '';
  document.getElementById('incoterm').value = listing.incoterm;
  setSelectValue('location', listing.type === 'sell' ? listing.origin : listing.destination);
  document.getElementById('price_conditions').value = listing.price_conditions ?? '';
  setSelectValue('price_unit', listing.price_unit);
  document.getElementById('currency').value = listing.currency ?? '';
  document.getElementById('notes').value = listing.notes ?? '';
  renderDocChecklist(selected);

  showScreen('new-listing');
}

async function submitListingForm(e) {
  e.preventDefault();
  const btn = document.getElementById('listing-submit-btn');
  btn.disabled = true; btn.textContent = t('common.saving');

  const typeInput = document.querySelector('input[name="type"]:checked');
  if (!typeInput) { showError(t('form.chooseType')); btn.disabled = false; btn.textContent = t('form.saveListing'); return; }
  const type = typeInput.value;

  const commoditySelect = document.getElementById('commodity-select').value;
  const commodity = commoditySelect === '__other__'
    ? document.getElementById('commodity-other').value.trim()
    : commoditySelect;
  if (!commodity) { showError(t('form.chooseCommodity')); btn.disabled = false; btn.textContent = t('form.saveListing'); return; }

  const location = document.getElementById('location').value.trim();

  const payload = {
    type, commodity,
    quantity: document.getElementById('quantity').value || null,
    unit: document.getElementById('unit').value.trim() || null,
    specification: document.getElementById('specification').value.trim() || null,
    incoterm: document.getElementById('incoterm').value,
    origin: type === 'sell' ? (location || null) : null,
    destination: type === 'buy' ? (location || null) : null,
    price_conditions: document.getElementById('price_conditions').value.trim() || null,
    price_unit: document.getElementById('price_unit').value || null,
    currency: document.getElementById('currency').value || null,
    notes: document.getElementById('notes').value.trim() || null,
  };

  let listingId = EDITING_LISTING_ID;

  if (listingId) {
    const { error } = await jericho.from('listings').update(payload).eq('id', listingId);
    if (error) { showError(errorMessage(error)); btn.disabled = false; btn.textContent = t('form.saveListing'); return; }
  } else {
    const { data: refData, error: refError } = await jericho.rpc('next_reference', { p_type: type });
    if (refError) { showError(errorMessage(refError)); btn.disabled = false; btn.textContent = t('form.saveListing'); return; }

    const { data: inserted, error } = await jericho
      .from('listings')
      .insert({ ...payload, user_id: CURRENT_PROFILE.id, reference_number: refData })
      .select('id').single();
    if (error) { showError(errorMessage(error)); btn.disabled = false; btn.textContent = t('form.saveListing'); return; }
    listingId = inserted.id;
  }

  // Sync document checklist: upsert one row per doc type.
  const checked = new Set(Array.from(document.querySelectorAll('#doc-checklist input:checked')).map(i => i.value));
  const rows = DOCUMENT_TYPES.map(doc => ({ listing_id: listingId, doc_type: doc, indicated: checked.has(doc) }));
  const { error: checklistError } = await jericho
    .from('document_checklist')
    .upsert(rows, { onConflict: 'listing_id,doc_type' });
  if (checklistError) console.error('Checklist save failed:', checklistError);

  showSuccess(t('listings.saved'));
  resetListingForm();
  showScreen('my-listings');
  btn.disabled = false; btn.textContent = t('form.saveListing');
}

// -------------------------------------------------------------- BROWSE ----
function wireBrowse() {
  document.getElementById('browse-refresh-btn').addEventListener('click', loadBrowseListings);
  document.getElementById('browse-save-search-btn').addEventListener('click', saveCurrentSearch);
}

async function loadBrowseListings() {
  const container = document.getElementById('browse-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data, error } = await jericho.rpc('get_public_listings');
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  // Same predicate the dashboard counts saved searches with, so a saved search
  // reporting three matches shows those same three when it is opened.
  const criteria = browseFilterCriteria();
  const listings = (data || []).filter(l => listingMatches(l, criteria));
  listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!listings.length) { container.innerHTML = `<p class="empty-state">${t('browse.noMatch')}</p>`; return; }

  container.innerHTML = '';
  listings.forEach(l => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(l.reference_number)} — ${escapeHtml(l.commodity)}</span>
        <span class="badge ${statusBadgeClass(l.status)}">${escapeHtml(statusLabel(l.status))}</span>
      </div>
      <div class="list-row-meta">
        ${l.type === 'sell' ? t('form.sellOffer') : t('form.buyRequest')} ·
        ${l.quantity ? escapeHtml(formatNumber(l.quantity)) + ' ' + escapeHtml(unitLabel(l.unit || '')) : t('listings.qtyNa')} ·
        ${escapeHtml(l.incoterm)} ·
        ${l.type === 'sell' ? escapeHtml(t('browse.originLabel')) : escapeHtml(t('browse.destinationLabel'))}: ${escapeHtml(l.region ? countryLabel(l.region) : t('browse.na'))}
      </div>
      ${l.specification ? `<div class="list-row-meta">${escapeHtml(t('browse.specification', { value: l.specification }))}</div>` : ''}
      ${l.price_conditions ? `<div class="list-row-meta">${escapeHtml(t('browse.price', { value: priceLine(l) }))}</div>` : ''}
      ${l.notes ? `<div class="list-row-meta">${escapeHtml(t('browse.notes', { value: l.notes }))}</div>` : ''}
      <div class="list-row-meta">
        ${l.has_documents ? escapeHtml(t('listings.documentsIndicated')) : `<strong>${escapeHtml(t('listings.noDocsIndicated'))}</strong>`} · ${escapeHtml(t('listings.posted', { date: formatDate(l.created_at) }))}
      </div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-contact="${l.id}" data-ref="${escapeHtml(l.reference_number)}">${escapeHtml(t('browse.contact'))}</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-contact]').forEach(b =>
    b.addEventListener('click', () => openContactModal(b.dataset.contact, b.dataset.ref)));
}

// ------------------------------------------------ ACTIVITY EXPORT ----
//
// The participant's own record of what they have done here, as a CSV they can
// open in a spreadsheet. CSV rather than PDF because the point is a file
// somebody can read, sort and keep - a PDF would need a library, would not sort
// and would not be any more readable.
//
// The rows come from my_activity_export() (sql/013), which filters on the
// caller's own profile and takes no argument, so there is no id for this page
// to get wrong. What the browser does here is formatting and nothing else.

/** One CSV field: quoted always, with embedded quotes doubled.
 *
 *  Quoting everything rather than only what needs it is deliberate - a message
 *  body can contain a comma, a newline, a quote, or all three, and a rule
 *  applied to every field cannot be applied to the wrong one. */
function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  // A BOM, because the audience opens CSVs in Excel, which otherwise reads
  // UTF-8 as the local codepage and turns every accented character in a
  // Spanish message body into mojibake.
  return '﻿' + [headers, ...rows].map(r => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Hand the file to the browser. The link is created, clicked and dropped
 *  rather than left in the page, and the object URL is revoked after, so a
 *  participant exporting twice does not accumulate blobs. */
function downloadFile(filename, contents, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportMyActivity() {
  const button = document.getElementById('export-activity-btn');
  button.disabled = true;
  try {
    const { data, error } = await jericho.rpc('my_activity_export');
    if (error) { showError(errorMessage(error)); return; }
    if (!data || !data.length) { showError(t('export.empty')); return; }

    const headers = [
      t('export.colDate'), t('export.colCategory'), t('export.colReference'),
      t('export.colDetail'), t('export.colStatus'),
    ];
    const rows = data.map(r => [
      formatDateTime(r.occurred_at),
      t(`export.cat.${r.category}`),
      r.reference || '',
      r.detail || '',
      r.status ? statusLabel(r.status) : '',
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`jericho-activity-${stamp}.csv`, toCsv(headers, rows));
    showSuccess(t('export.done'));
  } finally {
    button.disabled = false;
  }
}

// ------------------------------------------------- SAVED SEARCHES ----
//
// A saved search and a watched commodity are one thing: four optional criteria,
// any of which may be empty. "Watch Copper" is a saved search with a commodity
// and nothing else, and the dashboard shows both in the same list rather than
// pretending they are different features.
//
// The criteria are stored; the label is not. A label written at save time would
// be stuck in whichever language was in use then, so searchLabel() composes it
// at render time and it follows the interface.

/** The Browse filters as a saved search would store them: empty means "any",
 *  and empty is always null, never '', so the uniqueness index can compare
 *  them. */
function browseFilterCriteria() {
  const value = (id) => document.getElementById(id).value.trim();
  return {
    commodity: value('browse-filter-commodity') || null,
    listing_type: value('browse-filter-type') || null,
    region: value('browse-filter-region') || null,
    listing_status: value('browse-filter-status') || null,
  };
}

/** One place deciding whether a listing matches a set of criteria, used both by
 *  Browse and by the dashboard's match counts. Two copies of this would be two
 *  answers to "how many listings match", and the count on the dashboard is only
 *  worth anything if it is the same one Browse would show. */
function listingMatches(listing, c) {
  if (c.listing_type && listing.type !== c.listing_type) return false;
  if (c.commodity && !listing.commodity.toLowerCase().includes(c.commodity.toLowerCase())) return false;
  if (c.region && !(listing.region || '').toLowerCase().includes(c.region.toLowerCase())) return false;
  if (c.listing_status && listing.status !== c.listing_status) return false;
  return true;
}

/** What a saved search is called, in the language on screen now. */
function searchLabel(row) {
  const parts = [];
  if (row.commodity) parts.push(row.commodity);
  if (row.listing_type) parts.push(row.listing_type === 'sell' ? t('form.sellOffer') : t('form.buyRequest'));
  if (row.region) parts.push(countryLabel(row.region));
  if (row.listing_status) parts.push(statusLabel(row.listing_status));
  return parts.length ? parts.join(' · ') : t('saved.everything');
}

async function loadSavedSearches() {
  const token = ++SAVED_SEARCH_RENDER;
  const container = document.getElementById('saved-searches-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data, error } = await jericho
    .from('saved_searches').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = `<p class="empty-state">${t('saved.none')}</p>`; return; }

  // One call for every count, against the same anonymised view Browse reads.
  const { data: listings } = await jericho.rpc('get_public_listings');
  const all = listings || [];

  if (token !== SAVED_SEARCH_RENDER) return;
  container.innerHTML = '';
  data.forEach(row => {
    const count = all.filter(l => listingMatches(l, row)).length;
    const el = document.createElement('div');
    el.className = 'list-row';
    el.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(searchLabel(row))}</span>
        <span class="badge ${count ? 'badge-green' : 'badge-grey'}">${escapeHtml(t('saved.matches', { count }))}</span>
      </div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-open-search="${row.id}">${escapeHtml(t('saved.open'))}</button>
        <button class="btn btn-danger btn-small" data-remove-search="${row.id}">${escapeHtml(t('saved.remove'))}</button>
      </div>
    `;
    container.appendChild(el);
  });

  const byId = new Map(data.map(r => [r.id, r]));
  container.querySelectorAll('[data-open-search]').forEach(b =>
    b.addEventListener('click', () => openSavedSearch(byId.get(b.dataset.openSearch))));
  container.querySelectorAll('[data-remove-search]').forEach(b =>
    b.addEventListener('click', () => removeSavedSearch(b.dataset.removeSearch)));
}

/** Put the saved criteria back into Browse and run it. */
function openSavedSearch(row) {
  if (!row) return;
  document.getElementById('browse-filter-commodity').value = row.commodity || '';
  document.getElementById('browse-filter-type').value = row.listing_type || '';
  document.getElementById('browse-filter-region').value = row.region || '';
  document.getElementById('browse-filter-status').value = row.listing_status || '';
  showScreen('browse');
}

async function saveCurrentSearch() {
  const criteria = browseFilterCriteria();

  const { error } = await jericho.from('saved_searches')
    .insert({ ...criteria, user_id: CURRENT_PROFILE.id });

  if (error) {
    // 23505 is the uniqueness index: the same search is already saved, which is
    // not a failure worth a red toast full of Postgres.
    if (error.code === '23505') { showError(t('saved.duplicate')); return; }
    showError(errorMessage(error));
    return;
  }
  showSuccess(t('saved.saved'));
  loadSavedSearches();
}

async function removeSavedSearch(id) {
  const { error } = await jericho.from('saved_searches').delete().eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  showSuccess(t('saved.removed'));
  loadSavedSearches();
}

// ------------------------------------------------------------- MAILBOX ----
async function loadMailbox() {
  const container = document.getElementById('mailbox-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data: messages, error } = await jericho
    .from('messages').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  const { data: forwardsToMe } = await jericho
    .from('message_forward_log').select('message_id').eq('to_user_id', CURRENT_PROFILE.id);
  const forwardedIds = new Set((forwardsToMe || []).map(f => f.message_id));

  if (!messages.length) { container.innerHTML = `<p class="empty-state">${t('mailbox.none')}</p>`; return; }

  // Reference numbers in one query rather than one per message.
  const refByListing = await referenceNumbersFor(messages.map(m => m.listing_id));

  container.innerHTML = '';
  for (const m of messages) {
    const mine = m.sender_id === CURRENT_PROFILE.id;
    const refLabel = refByListing.get(m.listing_id) || '';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(mine ? t('mailbox.fromYou') : t('mailbox.toYou'))} ${refLabel ? '· ' + escapeHtml(refLabel) : ''}</span>
        <span class="badge badge-grey">${escapeHtml(statusLabel(m.status))}</span>
      </div>
      ${m.subject ? `<div class="list-row-meta"><em>${escapeHtml(m.subject)}</em></div>` : ''}
      <div>${escapeHtml(m.body)}</div>
      <div class="list-row-meta">${formatDateTime(m.created_at)}</div>
      ${!mine ? `<div class="row" style="margin-top:4px;"><button class="btn btn-secondary btn-small" data-reply="${m.listing_id || ''}">${escapeHtml(t('common.reply'))}</button></div>` : ''}
    `;
    container.appendChild(row);
    if (!mine) {
      // Passing the message being answered is what lets the operator route
      // the reply back to whoever wrote it. Without it the forward target
      // falls back to the listing owner, which on a reply is the sender.
      row.querySelector('[data-reply]').addEventListener('click', () =>
        openContactModal(m.listing_id, refLabel || t('mailbox.listingFallback'), m.id));
    }
  }
}

// ---------------------------------------------------------- CONTACT ----
function wireContactModal() {
  document.getElementById('contact-cancel-btn').addEventListener('click', closeContactModal);
  document.getElementById('contact-send-btn').addEventListener('click', sendContactMessage);
}

/** `inReplyTo` is the message being answered, or null for an opening enquiry
 *  from the browse screen. */
function openContactModal(listingId, refLabel, inReplyTo = null) {
  CONTACT_TARGET = { listingId, referenceNumber: refLabel, inReplyTo };
  document.getElementById('contact-ref').textContent = refLabel;
  document.getElementById('contact-body').value = '';
  document.getElementById('contact-modal').classList.remove('hidden');
}
function closeContactModal() { document.getElementById('contact-modal').classList.add('hidden'); }

async function sendContactMessage() {
  const body = document.getElementById('contact-body').value.trim();
  if (!body) { showError(t('contact.empty')); return; }
  const { error } = await jericho.from('messages').insert({
    sender_id: CURRENT_PROFILE.id,
    listing_id: CONTACT_TARGET.listingId || null,
    in_reply_to: CONTACT_TARGET.inReplyTo || null,
    body, status: 'pending_review'
  });
  if (error) { showError(errorMessage(error)); return; }
  showSuccess(t('contact.sent'));
  closeContactModal();
  loadMailbox();
}

// --------------------------------------------------------- NOTIFICATIONS ----
async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data, error } = await jericho
    .from('notifications').select('*')
    .eq('user_id', CURRENT_PROFILE.id)
    .order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  if (!data.length) { container.innerHTML = `<p class="empty-state">${t('notifications.none')}</p>`; return; }

  container.innerHTML = '';
  data.forEach(n => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${n.is_read ? '' : '● '}${escapeHtml(n.message)}</span>
      </div>
      <div class="list-row-meta">${formatDateTime(n.created_at)}</div>
    `;
    container.appendChild(row);
    if (!n.is_read) {
      row.addEventListener('click', async () => {
        await jericho.from('notifications').update({ is_read: true }).eq('id', n.id);
        loadNotifications();
        refreshNotificationDot();
      });
    }
  });

  const unread = data.filter(n => !n.is_read).length;
  if (unread === 0) document.getElementById('notif-dot').classList.add('hidden');
}

async function refreshNotificationDot() {
  const { count } = await jericho
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', CURRENT_PROFILE.id).eq('is_read', false);
  document.getElementById('notif-dot').classList.toggle('hidden', !count);
}

// -------------------------------------------------------------- PROFILE ----
//
// Three forms rather than one, because they are three different things. The
// details are the participant's own row and save in a single UPDATE. The email
// and the password belong to Supabase Auth, and each needs the current password
// before it will move - so neither can ride along on a Save of the details, and
// somebody who walks away from an unlocked screen cannot have their sign-in
// taken over by whoever sits down next.

function wireProfile() {
  populateSelect('p_country', COUNTRIES, false, countryLabel);
  fillProfileForm();

  document.getElementById('profile-form').addEventListener('submit', saveProfileDetails);
  document.getElementById('email-form').addEventListener('submit', changeEmail);
  document.getElementById('password-form').addEventListener('submit', changePassword);
  document.getElementById('export-activity-btn').addEventListener('click', exportMyActivity);

  // The Profile select and the header toggle are two views of one setting, so
  // choosing here goes through the same path the toggle uses: setLang fires
  // onLanguageChange, which re-renders the UI and writes the choice to the
  // profile. Nothing is saved twice and nothing waits for Save Profile.
  document.getElementById('p_language').addEventListener('change', (e) => {
    if (e.target.value !== currentLang()) setLang(e.target.value);
  });
}

/** Everything the page shows about the account, from CURRENT_PROFILE. */
function fillProfileForm() {
  document.getElementById('p_first_name').value = CURRENT_PROFILE.first_name;
  document.getElementById('p_last_name').value = CURRENT_PROFILE.last_name;
  document.getElementById('p_company').value = CURRENT_PROFILE.company || '';
  document.getElementById('p_job_title').value = CURRENT_PROFILE.job_title || '';
  document.getElementById('p_email').value = CURRENT_PROFILE.email;
  document.getElementById('p_country').value = CURRENT_PROFILE.country || '';
  document.getElementById('p_phone').value = CURRENT_PROFILE.phone;
  document.getElementById('p_language').value = currentLang();

  document.getElementById('p_role_value').textContent = roleLabel(CURRENT_PROFILE.role);
  document.getElementById('p_status_value').textContent = statusLabel(CURRENT_PROFILE.status);
}

async function saveProfileDetails(e) {
  e.preventDefault();
  const updates = {
    first_name: document.getElementById('p_first_name').value.trim(),
    last_name: document.getElementById('p_last_name').value.trim(),
    company: document.getElementById('p_company').value.trim() || null,
    job_title: document.getElementById('p_job_title').value.trim() || null,
    country: document.getElementById('p_country').value,
    phone: document.getElementById('p_phone').value.trim(),
  };

  const { error } = await jericho.from('profiles').update(updates).eq('id', CURRENT_PROFILE.id);
  if (error) { showError(errorMessage(error)); return; }

  // Role, status and email are absent from `updates` on purpose: the database
  // refuses them from this side (protect_profile_columns), and sending them
  // anyway would make a rejected write look like a successful one.
  Object.assign(CURRENT_PROFILE, updates);
  document.getElementById('user-name').textContent =
    `${CURRENT_PROFILE.first_name} ${CURRENT_PROFILE.last_name}`;
  showSuccess(t('profile.saved'));
}

/** Prove the person at the keyboard knows the current password.
 *
 *  signInWithPassword is the only way to check it: Supabase has no "verify
 *  password" call, and a wrong password here fails without disturbing the
 *  session that is already open. A correct one issues a fresh session for the
 *  same user, which is what the updateUser() that follows then uses. */
async function reauthenticate(password) {
  const { error } = await jericho.auth.signInWithPassword({
    email: CURRENT_PROFILE.email,
    password,
  });
  return !error;
}

async function changeEmail(e) {
  e.preventDefault();
  const newEmail = document.getElementById('p_new_email').value.trim();
  const password = document.getElementById('p_email_password').value;

  if (newEmail.toLowerCase() === CURRENT_PROFILE.email.toLowerCase()) {
    showError(t('profile.emailUnchanged')); return;
  }
  if (!await reauthenticate(password)) { showError(t('profile.wrongPassword')); return; }

  const { error } = await jericho.auth.updateUser({ email: newEmail });
  if (error) { showError(errorMessage(error)); return; }

  // Nothing has moved yet. This project requires an email change to be
  // confirmed from the new address: Auth holds it as pending and applies it
  // when the link is followed. So the page keeps showing the address that
  // still signs in, and says what has to happen next - telling someone their
  // email is changed when it is not is how people lock themselves out.
  //
  // public.profiles.email is deliberately never written from here either. It
  // mirrors auth.users through a trigger (sql/011), so whenever the change does
  // land, the address a participant signs in with and the address they are
  // mailed at move together.
  // Clearing the two entered fields rather than form.reset(): the current
  // address is displayed by a disabled input inside this same form, and reset()
  // returns it to its (empty) HTML default, leaving the participant looking at
  // a blank where their sign-in address should be.
  document.getElementById('p_new_email').value = '';
  document.getElementById('p_email_password').value = '';
  showSuccess(t('profile.emailPending'));
}

async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('current_password').value;
  const next = document.getElementById('new_password').value;

  if (next === current) { showError(t('profile.passwordSame')); return; }
  if (!await reauthenticate(current)) { showError(t('profile.wrongPassword')); return; }

  const { error } = await jericho.auth.updateUser({ password: next });
  if (error) { showError(errorMessage(error)); return; }
  document.getElementById('password-form').reset();
  showSuccess(t('profile.passwordUpdated'));
}

// ------------------------------------------------- DOCUMENT REQUESTS ----
// Section 14: the participant responds by confirming they have the document
// or marking it unavailable. No file upload at this stage.

async function loadDocRequests() {
  const container = document.getElementById('doc-requests-list');
  container.innerHTML = `<p class="empty-state">${t('common.loading')}</p>`;

  const { data, error } = await jericho
    .from('document_requests')
    .select('*')
    .eq('participant_id', CURRENT_PROFILE.id)
    .order('requested_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = `<p class="empty-state">${t('docreq.none')}</p>`; return; }

  // Resolve reference numbers in one query rather than one per row.
  const listingIds = [...new Set(data.map(r => r.listing_id).filter(Boolean))];
  const refByListing = {};
  if (listingIds.length) {
    const { data: listings } = await jericho
      .from('listings').select('id,reference_number').in('id', listingIds);
    (listings || []).forEach(l => { refByListing[l.id] = l.reference_number; });
  }

  container.innerHTML = '';
  data.forEach(r => {
    const badgeClass = r.status === 'confirmed' ? 'badge-green'
      : r.status === 'unavailable' ? 'badge-red' : 'badge-amber';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(docTypeLabel(r.doc_type))}</span>
        <span class="badge ${badgeClass}">${escapeHtml(statusLabel(r.status))}</span>
      </div>
      <div class="list-row-meta">
        ${r.listing_id && refByListing[r.listing_id] ? escapeHtml(refByListing[r.listing_id]) + ' · ' : ''}
        ${escapeHtml(t('docreq.requested', { date: formatDateTime(r.requested_at) }))}
        ${r.responded_at ? ' · ' + escapeHtml(t('docreq.responded', { date: formatDateTime(r.responded_at) })) : ''}
      </div>
      ${r.status === 'requested' ? `
        <div class="row" style="margin-top:4px;">
          <button class="btn btn-primary btn-small" data-confirm="${r.id}">${escapeHtml(t('docreq.haveIt'))}</button>
          <button class="btn btn-secondary btn-small" data-unavailable="${r.id}">${escapeHtml(t('docreq.notAvailable'))}</button>
        </div>` : ''}
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-confirm]').forEach(b =>
    b.addEventListener('click', () => respondToDocRequest(b.dataset.confirm, 'confirmed')));
  container.querySelectorAll('[data-unavailable]').forEach(b =>
    b.addEventListener('click', () => respondToDocRequest(b.dataset.unavailable, 'unavailable')));
}

async function respondToDocRequest(requestId, status) {
  const { error } = await jericho
    .from('document_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) { showError(errorMessage(error)); return; }
  // The database notifies Operators and writes the audit entry
  // (trg_notify_doc_request_response / trg_log_doc_request_change).
  showSuccess(t('docreq.recorded'));
  loadDocRequests();
  refreshDocRequestDot();
}

async function refreshDocRequestDot() {
  const { count } = await jericho
    .from('document_requests').select('id', { count: 'exact', head: true })
    .eq('participant_id', CURRENT_PROFILE.id).eq('status', 'requested');
  document.getElementById('docreq-dot').classList.toggle('hidden', !count);
}
