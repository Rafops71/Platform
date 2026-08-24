// Jericho Platform — operator dashboard logic.

let CURRENT_PROFILE = null;
let ALL_PROFILES_BY_ID = {}; // cache for owner-name lookups
let FORWARD_TARGET = null;   // { messageId, listingId, toUserId, refLabel }
let REPLY_TARGET = null;     // { originalMessage }

document.addEventListener('DOMContentLoaded', async () => {
  CURRENT_PROFILE = await requireAuth('operator');
  if (!CURRENT_PROFILE) return;

  document.getElementById('user-name').textContent =
    `${CURRENT_PROFILE.first_name} ${CURRENT_PROFILE.last_name}`;
  document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  wireTabs();
  wireInvitations();
  wireCommodities();
  wireDocRequests();
  wireForwardModal();
  wireReplyModal();
  populateStatusFilter();

  await loadApprovals();
});

function wireTabs() {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`nav.tabs button[data-screen="${name}"]`).classList.add('active');

  if (name === 'approvals') loadApprovals();
  if (name === 'listings') loadListings();
  if (name === 'invitations') loadInvitations();
  if (name === 'users') loadUsers();
  if (name === 'commodities') loadCommodities();
  if (name === 'doc-requests') { loadListingsForDocRequest(); loadDocRequests(); }
  if (name === 'mailbox') loadOperatorMailbox();
  if (name === 'matches') loadMatches();
  if (name === 'activity') loadActivityLog();
}

async function logOpActivity(action, details = null) {
  try { await jericho.from('activity_log').insert({ user_id: CURRENT_PROFILE.id, action, details }); }
  catch (e) { console.warn('activity log failed (non-fatal):', e); }
}

// --------------------------------------------------------- APPROVALS ----
async function loadApprovals() {
  const container = document.getElementById('approvals-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.from('profiles').select('*').eq('status', 'pending').order('created_at');
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  document.getElementById('approvals-dot').classList.toggle('hidden', data.length === 0);

  if (!data.length) { container.innerHTML = '<p class="empty-state">No pending approvals.</p>'; return; }

  container.innerHTML = '';
  data.forEach(p => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</span>
        <span class="badge badge-amber">Pending</span>
      </div>
      <div class="list-row-meta">${escapeHtml(p.email)} · ${escapeHtml(p.company || 'No company')} · ${escapeHtml(p.country)} · ${escapeHtml(p.phone)}</div>
      <div class="list-row-meta">Registered ${formatDateTime(p.created_at)}</div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-primary btn-small" data-approve="${p.id}">Approve</button>
        <button class="btn btn-danger btn-small" data-reject="${p.id}">Reject</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-approve]').forEach(b =>
    b.addEventListener('click', () => setUserStatus(b.dataset.approve, 'approved')));
  container.querySelectorAll('[data-reject]').forEach(b =>
    b.addEventListener('click', () => setUserStatus(b.dataset.reject, 'rejected')));
}

async function setUserStatus(profileId, status) {
  const { error } = await jericho.from('profiles').update({ status }).eq('id', profileId);
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('user_status_changed', { profile_id: profileId, status });
  if (status === 'approved') {
    await jericho.from('notifications').insert({
      user_id: profileId, type: 'registration_approved',
      message: 'Your registration has been approved. You can now sign in.'
    });
  }
  showSuccess(`User ${status}.`);
  loadApprovals();
  loadUsers();
}

// ----------------------------------------------------------- LISTINGS ----
function populateStatusFilter() {
  const select = document.getElementById('listing-filter-status');
  ['available', 'under_review', 'negotiation', 'closed', 'archived'].forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = statusLabel(s);
    select.appendChild(opt);
  });
  document.getElementById('listing-search-btn').addEventListener('click', loadListings);
}

async function loadListings() {
  const tbody = document.querySelector('#listings-table tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';

  let query = jericho.from('listings').select('*, profiles!listings_user_id_fkey(first_name,last_name,company)').order('created_at', { ascending: false });

  const type = document.getElementById('listing-filter-type').value;
  const status = document.getElementById('listing-filter-status').value;
  const commodity = document.getElementById('listing-filter-commodity').value.trim();
  const incoterm = document.getElementById('listing-filter-incoterm').value.trim();
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  if (commodity) query = query.ilike('commodity', `%${commodity}%`);
  if (incoterm) query = query.ilike('incoterm', `%${incoterm}%`);

  const { data, error } = await query;
  if (error) { tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(errorMessage(error))}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No listings match.</td></tr>'; return; }

  tbody.innerHTML = '';
  data.forEach(l => {
    const owner = l.profiles ? `${l.profiles.first_name} ${l.profiles.last_name}${l.profiles.company ? ' (' + l.profiles.company + ')' : ''}` : 'Unknown';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Ref">${escapeHtml(l.reference_number)}</td>
      <td data-label="Owner">${escapeHtml(owner)}</td>
      <td data-label="Type">${l.type === 'sell' ? 'Sell' : 'Buy'}</td>
      <td data-label="Commodity">${escapeHtml(l.commodity)}</td>
      <td data-label="Qty">${l.quantity ? escapeHtml(String(l.quantity)) + ' ' + escapeHtml(l.unit || '') : '—'}</td>
      <td data-label="Incoterm">${escapeHtml(l.incoterm)}</td>
      <td data-label="Status">
        <select data-status-for="${l.id}">
          ${['available','under_review','negotiation','closed','archived'].map(s =>
            `<option value="${s}" ${s === l.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </td>
      <td data-label="Updated">${formatDate(l.updated_at)}</td>
      <td data-label=""><button class="btn btn-danger btn-small" data-remove-listing="${l.id}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-status-for]').forEach(sel =>
    sel.addEventListener('change', async () => {
      const { error } = await jericho.from('listings').update({ status: sel.value }).eq('id', sel.dataset.statusFor);
      if (error) { showError(errorMessage(error)); return; }
      await logOpActivity('listing_status_changed', { listing_id: sel.dataset.statusFor, status: sel.value });
      showSuccess('Status updated.');
    }));
  tbody.querySelectorAll('[data-remove-listing]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Remove this listing?')) return;
      const { error } = await jericho.from('listings').delete().eq('id', b.dataset.removeListing);
      if (error) { showError(errorMessage(error)); return; }
      await logOpActivity('listing_removed', { listing_id: b.dataset.removeListing });
      showSuccess('Listing removed.');
      loadListings();
    }));
}

// --------------------------------------------------------- INVITATIONS ----
function wireInvitations() {
  document.getElementById('create-invite-btn').addEventListener('click', createInvitation);
}

async function createInvitation() {
  const email = document.getElementById('invite-email').value.trim().toLowerCase() || null;
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const { error } = await jericho.from('invitations').insert({ token, email, created_by: CURRENT_PROFILE.id });
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('invitation_created', { email });

  const link = `${window.location.origin}${window.location.pathname.replace('operator.html', 'register.html')}?token=${token}`;
  const resultBox = document.getElementById('invite-result');
  resultBox.innerHTML = `<strong>Invitation link (valid 5 days, single use):</strong><br><code style="word-break:break-all;">${escapeHtml(link)}</code>`;
  resultBox.classList.remove('hidden');
  document.getElementById('invite-email').value = '';
  loadInvitations();
}

async function loadInvitations() {
  const container = document.getElementById('invitations-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.from('invitations').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No invitations yet.</p>'; return; }

  container.innerHTML = '';
  data.forEach(inv => {
    const expired = new Date(inv.expires_at) < new Date();
    let badge = inv.used_at ? '<span class="badge badge-grey">Used</span>'
      : expired ? '<span class="badge badge-red">Expired</span>'
      : '<span class="badge badge-green">Active</span>';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(inv.email || 'No email noted')}</span>
        ${badge}
      </div>
      <div class="list-row-meta">Created ${formatDate(inv.created_at)} · Expires ${formatDate(inv.expires_at)}${inv.used_at ? ' · Used ' + formatDate(inv.used_at) : ''}</div>
    `;
    container.appendChild(row);
  });
}

// -------------------------------------------------------------- USERS ----
async function loadUsers() {
  const container = document.getElementById('users-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  data.forEach(p => ALL_PROFILES_BY_ID[p.id] = p);

  container.innerHTML = '';
  data.forEach(p => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} ${p.role === 'operator' ? '<span class="badge badge-blue">Operator</span>' : ''}</span>
        <span class="badge ${userStatusBadge(p.status)}">${statusLabel(p.status)}</span>
      </div>
      <div class="list-row-meta">${escapeHtml(p.email)} · ${escapeHtml(p.company || 'No company')} · ${escapeHtml(p.country)}</div>
      <div class="row" style="margin-top:4px;">
        ${p.status !== 'approved' ? `<button class="btn btn-primary btn-small" data-approve="${p.id}">Approve</button>` : ''}
        ${p.status !== 'suspended' ? `<button class="btn btn-secondary btn-small" data-suspend="${p.id}">Suspend</button>` : `<button class="btn btn-secondary btn-small" data-reinstate="${p.id}">Reinstate</button>`}
        ${p.role === 'participant' ? `<button class="btn btn-secondary btn-small" data-promote="${p.id}">Make Operator</button>` : `<button class="btn btn-secondary btn-small" data-demote="${p.id}">Make Participant</button>`}
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.approve, 'approved')));
  container.querySelectorAll('[data-suspend]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.suspend, 'suspended')));
  container.querySelectorAll('[data-reinstate]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.reinstate, 'approved')));
  container.querySelectorAll('[data-promote]').forEach(b => b.addEventListener('click', () => setUserRole(b.dataset.promote, 'operator')));
  container.querySelectorAll('[data-demote]').forEach(b => b.addEventListener('click', () => setUserRole(b.dataset.demote, 'participant')));
}

function userStatusBadge(status) {
  return { approved: 'badge-green', pending: 'badge-amber', rejected: 'badge-red', suspended: 'badge-red' }[status] || 'badge-grey';
}

async function setUserRole(profileId, role) {
  if (!confirm(`Change this user's role to ${role}?`)) return;
  const { error } = await jericho.from('profiles').update({ role }).eq('id', profileId);
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('user_role_changed', { profile_id: profileId, role });
  showSuccess('Role updated.');
  loadUsers();
}

// -------------------------------------------------------- COMMODITIES ----
function wireCommodities() {
  document.getElementById('add-commodity-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-commodity-name').value.trim();
    if (!name) return;
    const { error } = await jericho.from('commodities').insert({ name, created_by: CURRENT_PROFILE.id });
    if (error) { showError(errorMessage(error)); return; }
    await logOpActivity('commodity_added', { name });
    document.getElementById('new-commodity-name').value = '';
    loadCommodities();
  });
}

async function loadCommodities() {
  const container = document.getElementById('commodities-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  const { data, error } = await jericho.from('commodities').select('*').order('name');
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No commodities yet.</p>'; return; }

  container.innerHTML = '';
  data.forEach(c => {
    const row = document.createElement('div');
    row.className = 'list-row-top';
    row.innerHTML = `<span>${escapeHtml(c.name)}</span><button class="btn btn-danger btn-small" data-del-commodity="${c.id}">Remove</button>`;
    container.appendChild(row);
  });
  container.querySelectorAll('[data-del-commodity]').forEach(b =>
    b.addEventListener('click', async () => {
      const { error } = await jericho.from('commodities').delete().eq('id', b.dataset.delCommodity);
      if (error) { showError(errorMessage(error)); return; }
      loadCommodities();
    }));
}

// ----------------------------------------------------- DOCUMENT REQUESTS ----
function wireDocRequests() {
  populateSelect('dr-doctype', DOCUMENT_TYPES);
  document.getElementById('create-doc-request-btn').addEventListener('click', createDocRequest);
}
function populateSelect(id, values) {
  const el = document.getElementById(id);
  values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o); });
}

async function loadListingsForDocRequest() {
  const select = document.getElementById('dr-listing');
  const { data, error } = await jericho.from('listings').select('id,reference_number,user_id,commodity').order('created_at', { ascending: false });
  if (error) return;
  select.innerHTML = '<option value="">Select a listing…</option>';
  data.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id; opt.dataset.userId = l.user_id;
    opt.textContent = `${l.reference_number} — ${l.commodity}`;
    select.appendChild(opt);
  });
}

async function createDocRequest() {
  const select = document.getElementById('dr-listing');
  const listingId = select.value;
  if (!listingId) { showError('Choose a listing.'); return; }
  const participantId = select.selectedOptions[0].dataset.userId;
  const docType = document.getElementById('dr-doctype').value;

  const { error } = await jericho.from('document_requests').insert({
    listing_id: listingId, requester_id: CURRENT_PROFILE.id, participant_id: participantId, doc_type: docType
  });
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('document_requested', { listing_id: listingId, doc_type: docType });

  await jericho.from('notifications').insert({
    user_id: participantId, type: 'document_requested',
    message: `An Operator requested: ${docType}`, related_id: listingId
  });

  showSuccess('Request sent.');
  loadDocRequests();
}

async function loadDocRequests() {
  const container = document.getElementById('doc-requests-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  const { data, error } = await jericho.from('document_requests').select('*').order('requested_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No document requests yet.</p>'; return; }

  container.innerHTML = '';
  for (const r of data) {
    const { data: listing } = await jericho.from('listings').select('reference_number').eq('id', r.listing_id).maybeSingle();
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(r.doc_type)} — ${listing ? escapeHtml(listing.reference_number) : 'listing removed'}</span>
        <span class="badge ${r.status === 'confirmed' ? 'badge-green' : r.status === 'unavailable' ? 'badge-red' : 'badge-amber'}">${statusLabel(r.status)}</span>
      </div>
      <div class="list-row-meta">Requested ${formatDateTime(r.requested_at)}${r.responded_at ? ' · Responded ' + formatDateTime(r.responded_at) : ''}</div>
    `;
    container.appendChild(row);
  }
}

// ------------------------------------------------------------- MAILBOX ----
async function loadOperatorMailbox() {
  const container = document.getElementById('operator-mailbox-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.from('messages').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No messages yet.</p>'; return; }

  container.innerHTML = '';
  for (const m of data) {
    let refLabel = '(no listing)', ownerId = null;
    if (m.listing_id) {
      const { data: l } = await jericho.from('listings').select('reference_number,user_id').eq('id', m.listing_id).maybeSingle();
      if (l) { refLabel = l.reference_number; ownerId = l.user_id; }
    }
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">Re: ${escapeHtml(refLabel)}</span>
        <span class="badge badge-grey">${statusLabel(m.status)}</span>
      </div>
      <div>${escapeHtml(m.body)}</div>
      <div class="list-row-meta">${formatDateTime(m.created_at)}</div>
      ${m.status === 'pending_review' ? `
        <div class="row" style="margin-top:4px;">
          <button class="btn btn-primary btn-small" data-forward="${m.id}" data-listing="${m.listing_id || ''}" data-owner="${ownerId || ''}" data-ref="${escapeHtml(refLabel)}">Forward to Owner</button>
          <button class="btn btn-secondary btn-small" data-reply="${m.id}" data-sender="${m.sender_id}" data-listing2="${m.listing_id || ''}">Reply</button>
          <button class="btn btn-danger btn-small" data-ignore="${m.id}">Ignore</button>
        </div>` : ''}
    `;
    container.appendChild(row);
  }

  container.querySelectorAll('[data-forward]').forEach(b => b.addEventListener('click', () => openForwardModal(b)));
  container.querySelectorAll('[data-reply]').forEach(b => b.addEventListener('click', () => openReplyModal(b)));
  container.querySelectorAll('[data-ignore]').forEach(b => b.addEventListener('click', async () => {
    const { error } = await jericho.from('messages').update({ status: 'ignored' }).eq('id', b.dataset.ignore);
    if (error) { showError(errorMessage(error)); return; }
    await logOpActivity('message_ignored', { message_id: b.dataset.ignore });
    loadOperatorMailbox();
  }));
}

function wireForwardModal() {
  document.getElementById('forward-cancel-btn').addEventListener('click', () => document.getElementById('forward-modal').classList.add('hidden'));
  document.getElementById('forward-confirm-btn').addEventListener('click', confirmForward);
}

function openForwardModal(btn) {
  if (!btn.dataset.owner) { showError('This message has no associated listing owner to forward to.'); return; }
  FORWARD_TARGET = { messageId: btn.dataset.forward, listingId: btn.dataset.listing, toUserId: btn.dataset.owner, refLabel: btn.dataset.ref };
  document.getElementById('forward-target-info').textContent = `Forwarding to the owner of ${FORWARD_TARGET.refLabel}.`;
  document.getElementById('forward-modal').classList.remove('hidden');
}

async function confirmForward() {
  const { error: e1 } = await jericho.from('message_forward_log').insert({
    message_id: FORWARD_TARGET.messageId, operator_id: CURRENT_PROFILE.id, to_user_id: FORWARD_TARGET.toUserId
  });
  if (e1) { showError(errorMessage(e1)); return; }
  const { error: e2 } = await jericho.from('messages').update({ status: 'forwarded' }).eq('id', FORWARD_TARGET.messageId);
  if (e2) { showError(errorMessage(e2)); return; }
  await jericho.from('notifications').insert({
    user_id: FORWARD_TARGET.toUserId, type: 'message_forwarded',
    message: `A message was forwarded to you regarding ${FORWARD_TARGET.refLabel}.`, related_id: FORWARD_TARGET.listingId
  });
  await logOpActivity('message_forwarded', { message_id: FORWARD_TARGET.messageId, to_user_id: FORWARD_TARGET.toUserId });
  document.getElementById('forward-modal').classList.add('hidden');
  showSuccess('Message forwarded.');
  loadOperatorMailbox();
}

function wireReplyModal() {
  document.getElementById('reply-cancel-btn').addEventListener('click', () => document.getElementById('reply-modal').classList.add('hidden'));
  document.getElementById('reply-send-btn').addEventListener('click', confirmReply);
}

function openReplyModal(btn) {
  REPLY_TARGET = { originalMessageId: btn.dataset.reply, senderId: btn.dataset.sender, listingId: btn.dataset.listing2 };
  document.getElementById('reply-body').value = '';
  document.getElementById('reply-modal').classList.remove('hidden');
}

async function confirmReply() {
  const body = document.getElementById('reply-body').value.trim();
  if (!body) { showError('Write a reply first.'); return; }

  const { data: newMsg, error: e1 } = await jericho.from('messages').insert({
    sender_id: CURRENT_PROFILE.id, listing_id: REPLY_TARGET.listingId || null, body, status: 'pending_review'
  }).select('id').single();
  if (e1) { showError(errorMessage(e1)); return; }

  const { error: e2 } = await jericho.from('message_forward_log').insert({
    message_id: newMsg.id, operator_id: CURRENT_PROFILE.id, to_user_id: REPLY_TARGET.senderId
  });
  if (e2) { showError(errorMessage(e2)); return; }

  await jericho.from('messages').update({ status: 'replied' }).eq('id', REPLY_TARGET.originalMessageId);
  await jericho.from('notifications').insert({
    user_id: REPLY_TARGET.senderId, type: 'message_reply', message: 'An Operator replied to your message.'
  });
  await logOpActivity('message_replied', { original_message_id: REPLY_TARGET.originalMessageId });

  document.getElementById('reply-modal').classList.add('hidden');
  showSuccess('Reply sent.');
  loadOperatorMailbox();
}

// ------------------------------------------------------------- MATCHES ----
async function loadMatches() {
  const container = document.getElementById('matches-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  const { data, error } = await jericho.from('matches').select('*').neq('status', 'dismissed').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No match suggestions.</p>'; return; }

  container.innerHTML = '';
  for (const m of data) {
    const { data: a } = await jericho.from('listings').select('reference_number,commodity,type').eq('id', m.listing_a_id).maybeSingle();
    const { data: b } = await jericho.from('listings').select('reference_number,commodity,type').eq('id', m.listing_b_id).maybeSingle();
    if (!a || !b) continue;
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(a.reference_number)} ↔ ${escapeHtml(b.reference_number)}</span>
        <span class="badge ${m.score === 'high' ? 'badge-green' : m.score === 'medium' ? 'badge-amber' : 'badge-grey'}">${m.score}</span>
      </div>
      <div class="list-row-meta">${escapeHtml(a.commodity)} · ${formatDate(m.created_at)}</div>
      <div class="row" style="margin-top:4px;">
        <button class="btn btn-secondary btn-small" data-review="${m.id}">Mark Reviewed</button>
        <button class="btn btn-danger btn-small" data-dismiss="${m.id}">Dismiss</button>
      </div>
    `;
    container.appendChild(row);
  }
  container.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => updateMatchStatus(b.dataset.review, 'reviewed')));
  container.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', () => updateMatchStatus(b.dataset.dismiss, 'dismissed')));
}

async function updateMatchStatus(id, status) {
  const { error } = await jericho.from('matches').update({ status }).eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('match_' + status, { match_id: id });
  loadMatches();
}

// --------------------------------------------------------- ACTIVITY LOG ----
async function loadActivityLog() {
  const container = document.getElementById('activity-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  const { data, error } = await jericho.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }
  if (!data.length) { container.innerHTML = '<p class="empty-state">No activity yet.</p>'; return; }

  const missingIds = data.map(a => a.user_id).filter(id => id && !ALL_PROFILES_BY_ID[id]);
  if (missingIds.length) {
    const { data: profs } = await jericho.from('profiles').select('id,first_name,last_name').in('id', missingIds);
    (profs || []).forEach(p => ALL_PROFILES_BY_ID[p.id] = p);
  }

  container.innerHTML = '';
  data.forEach(a => {
    const actor = a.user_id && ALL_PROFILES_BY_ID[a.user_id]
      ? `${ALL_PROFILES_BY_ID[a.user_id].first_name} ${ALL_PROFILES_BY_ID[a.user_id].last_name}` : 'System';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(a.action)}</span>
        <span class="list-row-meta">${formatDateTime(a.created_at)}</span>
      </div>
      <div class="list-row-meta">${escapeHtml(actor)}${a.details ? ' · ' + escapeHtml(JSON.stringify(a.details)) : ''}</div>
    `;
    container.appendChild(row);
  });
}
