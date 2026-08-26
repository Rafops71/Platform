// Jericho Platform — participant dashboard logic.

let CURRENT_PROFILE = null;
let COMMODITIES = [];
let EDITING_LISTING_ID = null;
let CONTACT_TARGET = null; // { listingId, referenceNumber }

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
  populateSelect('unit', UNITS, true);
  populateSelect('price_unit', UNITS, true);
  populateSelect('location', COUNTRIES, true);
  await loadCommodities();
  renderDocChecklist();

  await loadMyListings();
  await refreshNotificationDot();
  await refreshDocRequestDot();
});

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

  if (name === 'my-listings') loadMyListings();
  if (name === 'browse') loadBrowseListings();
  if (name === 'doc-requests') loadDocRequests();
  if (name === 'mailbox') loadMailbox();
  if (name === 'notifications') loadNotifications();
  if (name === 'new-listing' && !EDITING_LISTING_ID) resetListingForm();
}

// populateSelect() now lives in utils.js (shared with register's country dropdown).

// ---------------------------------------------------------- MY LISTINGS ----
async function loadMyListings() {
  const container = document.getElementById('my-listings-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho
    .from('listings')
    .select('*')
    .eq('user_id', CURRENT_PROFILE.id)
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">You have no listings yet.</p>'; return; }

  container.innerHTML = '';
  for (const listing of data) {
    const { count } = await jericho
      .from('document_checklist')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .eq('indicated', true);

    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(listing.reference_number)} — ${escapeHtml(listing.commodity)}</span>
        <span class="badge ${statusBadgeClass(listing.status)}">${escapeHtml(statusLabel(listing.status))}</span>
      </div>
      <div class="list-row-meta">
        ${listing.type === 'sell' ? 'Sell Offer' : 'Buy Request'} ·
        ${listing.quantity ? escapeHtml(String(listing.quantity)) + ' ' + escapeHtml(listing.unit || '') : 'Qty n/a'} ·
        ${escapeHtml(listing.incoterm)} ·
        Updated ${formatDate(listing.updated_at)}
      </div>
      <div class="list-row-meta">${count > 0 ? `${count} document(s) indicated` : '<strong>No documents indicated</strong>'}</div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-edit="${listing.id}">Edit</button>
        <button class="btn btn-danger btn-small" data-remove="${listing.id}">Remove</button>
      </div>
    `;
    container.appendChild(row);
  }

  container.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => editListing(b.dataset.edit)));
  container.querySelectorAll('[data-remove]').forEach(b =>
    b.addEventListener('click', () => removeListing(b.dataset.remove)));
}

function statusBadgeClass(status) {
  return { available: 'badge-green', under_review: 'badge-amber', negotiation: 'badge-blue',
           closed: 'badge-grey', archived: 'badge-grey' }[status] || 'badge-grey';
}

async function removeListing(id) {
  if (!confirm('Remove this listing? This cannot be undone.')) return;
  const { error } = await jericho.from('listings').delete().eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  // Activity logging happens in the database (trg_log_listing_change).
  showSuccess('Listing removed.');
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
    heading.textContent = group.title;
    container.appendChild(heading);

    group.docs.forEach(doc => {
      const row = document.createElement('label');
      row.className = 'checkbox-row';
      row.innerHTML = `<input type="checkbox" value="${escapeHtml(doc)}" ${selected[doc] ? 'checked' : ''}> ${escapeHtml(doc)}`;
      container.appendChild(row);
    });
  });
}

async function loadCommodities() {
  const { data, error } = await jericho.from('commodities').select('*');
  const select = document.getElementById('commodity-select');
  if (error) { console.error(error); return; }

  COMMODITIES = sortCommodities(data);
  select.innerHTML = '<option value="">Select commodity…</option>';
  COMMODITIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    select.appendChild(opt);
  });
  const otherOpt = document.createElement('option');
  otherOpt.value = '__other__'; otherOpt.textContent = 'Other (specify)';
  select.appendChild(otherOpt);

  // The Browse filter offers the same curated list, plus whatever free-text
  // commodities actually exist on listings (added via "Other").
  const browseFilter = document.getElementById('browse-filter-commodity');
  if (browseFilter) {
    browseFilter.innerHTML = '<option value="">All commodities</option>';
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
      document.getElementById('location-label').textContent = r.value === 'sell' ? 'Origin' : 'Destination';
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
  document.getElementById('listing-form-title').textContent = 'New Listing';
  document.getElementById('listing-form').reset();
  document.getElementById('commodity-other').classList.add('hidden');
  document.getElementById('location-label').textContent = 'Origin';
  // Drop any "(existing entry)" options setSelectValue() appended while editing.
  populateSelect('unit', UNITS, true);
  populateSelect('price_unit', UNITS, true);
  populateSelect('location', COUNTRIES, true);
  renderDocChecklist();
}

async function editListing(id) {
  const { data: listing, error } = await jericho.from('listings').select('*').eq('id', id).maybeSingle();
  if (error || !listing) { showError('Could not load listing.'); return; }

  const { data: checklist } = await jericho.from('document_checklist').select('*').eq('listing_id', id);
  const selected = {};
  (checklist || []).forEach(c => { if (c.indicated) selected[c.doc_type] = true; });

  EDITING_LISTING_ID = id;
  document.getElementById('listing-form-title').textContent = `Edit ${listing.reference_number}`;
  document.querySelector(`input[name="type"][value="${listing.type}"]`).checked = true;
  document.getElementById('location-label').textContent = listing.type === 'sell' ? 'Origin' : 'Destination';

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
  btn.disabled = true; btn.textContent = 'Saving…';

  const typeInput = document.querySelector('input[name="type"]:checked');
  if (!typeInput) { showError('Choose Sell Offer or Buy Request.'); btn.disabled = false; btn.textContent = 'Save Listing'; return; }
  const type = typeInput.value;

  const commoditySelect = document.getElementById('commodity-select').value;
  const commodity = commoditySelect === '__other__'
    ? document.getElementById('commodity-other').value.trim()
    : commoditySelect;
  if (!commodity) { showError('Choose or specify a commodity.'); btn.disabled = false; btn.textContent = 'Save Listing'; return; }

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
    if (error) { showError(errorMessage(error)); btn.disabled = false; btn.textContent = 'Save Listing'; return; }
  } else {
    const { data: refData, error: refError } = await jericho.rpc('next_reference', { p_type: type });
    if (refError) { showError(errorMessage(refError)); btn.disabled = false; btn.textContent = 'Save Listing'; return; }

    const { data: inserted, error } = await jericho
      .from('listings')
      .insert({ ...payload, user_id: CURRENT_PROFILE.id, reference_number: refData })
      .select('id').single();
    if (error) { showError(errorMessage(error)); btn.disabled = false; btn.textContent = 'Save Listing'; return; }
    listingId = inserted.id;
  }

  // Sync document checklist: upsert one row per doc type.
  const checked = new Set(Array.from(document.querySelectorAll('#doc-checklist input:checked')).map(i => i.value));
  const rows = DOCUMENT_TYPES.map(doc => ({ listing_id: listingId, doc_type: doc, indicated: checked.has(doc) }));
  const { error: checklistError } = await jericho
    .from('document_checklist')
    .upsert(rows, { onConflict: 'listing_id,doc_type' });
  if (checklistError) console.error('Checklist save failed:', checklistError);

  showSuccess('Listing saved.');
  resetListingForm();
  showScreen('my-listings');
  btn.disabled = false; btn.textContent = 'Save Listing';
}

// -------------------------------------------------------------- BROWSE ----
function wireBrowse() {
  document.getElementById('browse-refresh-btn').addEventListener('click', loadBrowseListings);
}

async function loadBrowseListings() {
  const container = document.getElementById('browse-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.rpc('get_public_listings');
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  const typeFilter = document.getElementById('browse-filter-type').value;
  const commodityFilter = document.getElementById('browse-filter-commodity').value.trim().toLowerCase();
  const regionFilter = document.getElementById('browse-filter-region').value.trim().toLowerCase();
  const statusFilter = document.getElementById('browse-filter-status').value;

  let listings = data || [];
  if (typeFilter) listings = listings.filter(l => l.type === typeFilter);
  if (commodityFilter) listings = listings.filter(l => l.commodity.toLowerCase().includes(commodityFilter));
  if (regionFilter) listings = listings.filter(l => (l.region || '').toLowerCase().includes(regionFilter));
  if (statusFilter) listings = listings.filter(l => l.status === statusFilter);
  listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!listings.length) { container.innerHTML = '<p class="empty-state">No listings match.</p>'; return; }

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
        ${l.type === 'sell' ? 'Sell Offer' : 'Buy Request'} ·
        ${l.quantity ? escapeHtml(String(l.quantity)) + ' ' + escapeHtml(l.unit || '') : 'Qty n/a'} ·
        ${escapeHtml(l.incoterm)} ·
        ${l.type === 'sell' ? 'Origin' : 'Destination'}: ${escapeHtml(l.region || 'n/a')}
      </div>
      ${l.specification ? `<div class="list-row-meta">Specification / Grade: ${escapeHtml(l.specification)}</div>` : ''}
      ${l.price_conditions ? `<div class="list-row-meta">Price: ${escapeHtml(l.price_conditions)}${l.currency ? ' ' + escapeHtml(l.currency) : ''}${l.price_unit ? ' per ' + escapeHtml(l.price_unit) : ''}</div>` : ''}
      ${l.notes ? `<div class="list-row-meta">Notes: ${escapeHtml(l.notes)}</div>` : ''}
      <div class="list-row-meta">
        ${l.has_documents ? 'Documents indicated' : '<strong>No documents indicated</strong>'} · Posted ${formatDate(l.created_at)}
      </div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-contact="${l.id}" data-ref="${escapeHtml(l.reference_number)}">Contact</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-contact]').forEach(b =>
    b.addEventListener('click', () => openContactModal(b.dataset.contact, b.dataset.ref)));
}

// ------------------------------------------------------------- MAILBOX ----
async function loadMailbox() {
  const container = document.getElementById('mailbox-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data: messages, error } = await jericho
    .from('messages').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  const { data: forwardsToMe } = await jericho
    .from('message_forward_log').select('message_id').eq('to_user_id', CURRENT_PROFILE.id);
  const forwardedIds = new Set((forwardsToMe || []).map(f => f.message_id));

  if (!messages.length) { container.innerHTML = '<p class="empty-state">No messages yet.</p>'; return; }

  container.innerHTML = '';
  for (const m of messages) {
    const mine = m.sender_id === CURRENT_PROFILE.id;
    let refLabel = '';
    if (m.listing_id) {
      const { data: l } = await jericho.from('listings').select('reference_number').eq('id', m.listing_id).maybeSingle();
      if (l) refLabel = l.reference_number;
    }
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${mine ? 'You → Operators' : 'Forwarded to you'} ${refLabel ? '· ' + escapeHtml(refLabel) : ''}</span>
        <span class="badge badge-grey">${escapeHtml(statusLabel(m.status))}</span>
      </div>
      ${m.subject ? `<div class="list-row-meta"><em>${escapeHtml(m.subject)}</em></div>` : ''}
      <div>${escapeHtml(m.body)}</div>
      <div class="list-row-meta">${formatDateTime(m.created_at)}</div>
      ${!mine ? `<div class="row" style="margin-top:4px;"><button class="btn btn-secondary btn-small" data-reply="${m.listing_id || ''}">Reply</button></div>` : ''}
    `;
    container.appendChild(row);
    if (!mine) {
      row.querySelector('[data-reply]').addEventListener('click', () =>
        openContactModal(m.listing_id, refLabel || '(listing)'));
    }
  }
}

// ---------------------------------------------------------- CONTACT ----
function wireContactModal() {
  document.getElementById('contact-cancel-btn').addEventListener('click', closeContactModal);
  document.getElementById('contact-send-btn').addEventListener('click', sendContactMessage);
}

function openContactModal(listingId, refLabel) {
  CONTACT_TARGET = { listingId, referenceNumber: refLabel };
  document.getElementById('contact-ref').textContent = refLabel;
  document.getElementById('contact-body').value = '';
  document.getElementById('contact-modal').classList.remove('hidden');
}
function closeContactModal() { document.getElementById('contact-modal').classList.add('hidden'); }

async function sendContactMessage() {
  const body = document.getElementById('contact-body').value.trim();
  if (!body) { showError('Write a message first.'); return; }
  const { error } = await jericho.from('messages').insert({
    sender_id: CURRENT_PROFILE.id,
    listing_id: CONTACT_TARGET.listingId || null,
    body, status: 'pending_review'
  });
  if (error) { showError(errorMessage(error)); return; }
  showSuccess('Message sent to Operators.');
  closeContactModal();
  loadMailbox();
}

// --------------------------------------------------------- NOTIFICATIONS ----
async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho
    .from('notifications').select('*')
    .eq('user_id', CURRENT_PROFILE.id)
    .order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  if (!data.length) { container.innerHTML = '<p class="empty-state">No notifications.</p>'; return; }

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
function wireProfile() {
  document.getElementById('p_first_name').value = CURRENT_PROFILE.first_name;
  document.getElementById('p_last_name').value = CURRENT_PROFILE.last_name;
  document.getElementById('p_company').value = CURRENT_PROFILE.company || '';
  document.getElementById('p_email').value = CURRENT_PROFILE.email;
  document.getElementById('p_country').value = CURRENT_PROFILE.country;
  document.getElementById('p_phone').value = CURRENT_PROFILE.phone;

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await jericho.from('profiles').update({
      first_name: document.getElementById('p_first_name').value.trim(),
      last_name: document.getElementById('p_last_name').value.trim(),
      company: document.getElementById('p_company').value.trim() || null,
      country: document.getElementById('p_country').value.trim(),
      phone: document.getElementById('p_phone').value.trim(),
    }).eq('id', CURRENT_PROFILE.id);
    if (error) { showError(errorMessage(error)); return; }
    showSuccess('Profile updated.');
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new_password').value;
    const { error } = await jericho.auth.updateUser({ password: newPassword });
    if (error) { showError(errorMessage(error)); return; }
    showSuccess('Password updated.');
    document.getElementById('password-form').reset();
  });
}

// ------------------------------------------------- DOCUMENT REQUESTS ----
// Section 14: the participant responds by confirming they have the document
// or marking it unavailable. No file upload at this stage.

async function loadDocRequests() {
  const container = document.getElementById('doc-requests-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho
    .from('document_requests')
    .select('*')
    .eq('participant_id', CURRENT_PROFILE.id)
    .order('requested_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No document requests.</p>'; return; }

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
        <span class="list-row-title">${escapeHtml(r.doc_type)}</span>
        <span class="badge ${badgeClass}">${escapeHtml(statusLabel(r.status))}</span>
      </div>
      <div class="list-row-meta">
        ${r.listing_id && refByListing[r.listing_id] ? escapeHtml(refByListing[r.listing_id]) + ' · ' : ''}
        Requested ${formatDateTime(r.requested_at)}
        ${r.responded_at ? ' · Responded ' + formatDateTime(r.responded_at) : ''}
      </div>
      ${r.status === 'requested' ? `
        <div class="row" style="margin-top:4px;">
          <button class="btn btn-primary btn-small" data-confirm="${r.id}">I have this document</button>
          <button class="btn btn-secondary btn-small" data-unavailable="${r.id}">Not available</button>
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
  showSuccess('Response recorded.');
  loadDocRequests();
  refreshDocRequestDot();
}

async function refreshDocRequestDot() {
  const { count } = await jericho
    .from('document_requests').select('id', { count: 'exact', head: true })
    .eq('participant_id', CURRENT_PROFILE.id).eq('status', 'requested');
  document.getElementById('docreq-dot').classList.toggle('hidden', !count);
}
