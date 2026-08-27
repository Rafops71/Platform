// Jericho Platform — operator dashboard logic.

let CURRENT_PROFILE = null;
let ALL_PROFILES_BY_ID = {}; // cache for owner-name lookups
let FORWARD_TARGET = null;   // { messageId, listingId, toUserId, refLabel }
let REPLY_TARGET = null;     // { originalMessage }
// Set when the Listings screen was opened from the Overview's stale tile, so
// the table shows the same rows the count promised. Any Search or Clear on the
// screen itself drops it — the operator's own filtering wins over the tile's.
let LISTINGS_STALE_ONLY = false;

// STALE_LISTING_DAYS / staleListingCutoff() live in utils.js, shared with the
// participant dashboard: the listings this screen counts as stale are exactly
// the ones their owners are being asked to renew.

document.addEventListener('DOMContentLoaded', async () => {
  CURRENT_PROFILE = await requireAuth('operator');
  if (!CURRENT_PROFILE) return;

  document.getElementById('user-name').textContent =
    `${CURRENT_PROFILE.first_name} ${CURRENT_PROFILE.last_name}`;
  document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  wireTabs();
  wireOverview();
  wireAnalytics();
  wireInvitations();
  wireCommodities();
  wireDocRequests();
  wireForwardModal();
  wireReplyModal();
  populateStatusFilter();

  // The overview is the landing screen, and its approvals count is the same
  // query the Approvals tab runs, so the tab's dot is set from here too.
  await loadOverview();
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

  if (name === 'overview') loadOverview();
  if (name === 'approvals') loadApprovals();
  if (name === 'listings') { populateCommodityFilter(); loadListings(); }
  if (name === 'invitations') loadInvitations();
  if (name === 'users') loadUsers();
  if (name === 'commodities') loadCommodities();
  if (name === 'doc-requests') { loadListingsForDocRequest(); loadDocRequests(); }
  if (name === 'mailbox') loadOperatorMailbox();
  if (name === 'matches') loadMatches();
  if (name === 'analytics') loadAnalytics();
  if (name === 'activity') loadActivityLog();
}

async function logOpActivity(action, details = null) {
  try { await jericho.from('activity_log').insert({ user_id: CURRENT_PROFILE.id, action, details }); }
  catch (e) { console.warn('activity log failed (non-fatal):', e); }
}

// --------------------------------------------------------- ANALYTICS ----
//
// Counts over time, straight from operator_analytics() (sql/015). The function
// does the bucketing, including the empty periods, so this is a table renderer
// and nothing else - no arithmetic here that the database has not already done,
// because two places computing the same numbers is two numbers.

const ANALYTICS_COLUMNS = [
  'registrations', 'listings', 'messages_reviewed', 'introductions', 'matches_reviewed',
];

function wireAnalytics() {
  document.getElementById('analytics-bucket').addEventListener('change', loadAnalytics);
  document.getElementById('analytics-periods').addEventListener('change', loadAnalytics);
}

/** How a period is labelled depends on how long it is: a week and a day are a
 *  date, a month is a month. */
function analyticsPeriodLabel(isoDate, bucket) {
  const date = new Date(isoDate + 'T00:00:00');
  if (bucket === 'month') {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }
  return formatDate(isoDate);
}

async function loadAnalytics() {
  const tbody = document.querySelector('#analytics-table tbody');
  const tfoot = document.querySelector('#analytics-table tfoot');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
  tfoot.innerHTML = '';

  const bucket = document.getElementById('analytics-bucket').value;
  const periods = Number(document.getElementById('analytics-periods').value);

  const { data, error } = await jericho.rpc('operator_analytics', {
    p_bucket: bucket, p_periods: periods,
  });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(errorMessage(error))}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No activity yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  const totals = Object.fromEntries(ANALYTICS_COLUMNS.map(c => [c, 0]));

  data.forEach(row => {
    ANALYTICS_COLUMNS.forEach(c => { totals[c] += Number(row[c]); });
    const busy = ANALYTICS_COLUMNS.some(c => Number(row[c]) > 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Period">${escapeHtml(analyticsPeriodLabel(row.period_start, bucket))}</td>
      ${ANALYTICS_COLUMNS.map(c => `<td data-label="${c}">${Number(row[c])}</td>`).join('')}
    `;
    // A period where nothing happened is information, not noise - but it should
    // not compete with the periods where something did.
    if (!busy) tr.classList.add('row-quiet');
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `
    <tr>
      <th>Total</th>
      ${ANALYTICS_COLUMNS.map(c => `<th>${totals[c]}</th>`).join('')}
    </tr>
  `;
}

// ---------------------------------------------------------- OVERVIEW ----
// Five counts of work waiting, each linked to the screen where that work is
// done. Read-only throughout: every query is head-only with an exact count, so
// no rows cross the wire, and RLS decides what is counted exactly as it decides
// what the corresponding tab would show. Nothing here needs a permission the
// operator did not already have.

/** The five counts, in tile order. `where` receives the table query and
 *  narrows it to the rows that represent outstanding work. */
const OVERVIEW_TILES = [
  { id: 'approvals',    screen: 'approvals',    table: 'profiles',
    where: (q) => q.eq('status', 'pending') },
  { id: 'messages',     screen: 'mailbox',      table: 'messages',
    where: (q) => q.eq('status', 'pending_review') },
  { id: 'doc-requests', screen: 'doc-requests', table: 'document_requests',
    where: (q) => q.eq('status', 'requested') },
  { id: 'matches',      screen: 'matches',      table: 'matches',
    where: (q) => q.eq('status', 'new') },
  { id: 'stale',        screen: 'listings',     table: 'listings',
    where: (q) => q.eq('status', 'available').lt('updated_at', staleListingCutoff()) },
];

function wireOverview() {
  document.getElementById('overview-refresh-btn').addEventListener('click', loadOverview);

  document.querySelectorAll('.stat-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      // The stale tile is the one whose screen cannot show its own rows
      // unaided - "not updated in 30 days" is not one of the filters on the
      // Listings screen - so the flag is set before the screen loads.
      LISTINGS_STALE_ONLY = tile.dataset.goto === 'listings';
      showScreen(tile.dataset.goto);
    });
  });

  document.getElementById('listing-stale-clear').addEventListener('click', (e) => {
    e.preventDefault();
    LISTINGS_STALE_ONLY = false;
    loadListings();
  });
}

async function loadOverview() {
  const results = await Promise.all(OVERVIEW_TILES.map(async (tile) => {
    const { count, error } = await tile.where(
      jericho.from(tile.table).select('id', { count: 'exact', head: true })
    );
    return { tile, count, error };
  }));

  for (const { tile, count, error } of results) {
    const el = document.getElementById(`stat-${tile.id}-value`);
    const box = document.getElementById(`stat-${tile.id}`);
    // A failed count must not read as zero work waiting. Show that it is
    // unknown instead, and leave the tile clickable so the screen itself can
    // report whatever went wrong.
    el.textContent = error ? '—' : String(count);
    box.classList.toggle('stat-zero', !error && count === 0);
    box.title = error ? errorMessage(error) : '';
  }

  document.getElementById('overview-updated').textContent =
    `Updated ${formatDateTime(new Date().toISOString())}`;

  // The Approvals tab dot means the same thing as the first tile, so it is set
  // here rather than only when that tab is opened.
  const approvals = results.find(r => r.tile.id === 'approvals');
  document.getElementById('approvals-dot')
    .classList.toggle('hidden', !!approvals.error || approvals.count === 0);
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
  // The audit entry and the "approved" notification are written by database
  // triggers (trg_log_profile_change / trg_notify_profile_approved), so they
  // cannot be lost if this browser drops the follow-up request.
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

  const incotermSelect = document.getElementById('listing-filter-incoterm');
  INCOTERMS.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i;
    incotermSelect.appendChild(opt);
  });

  document.getElementById('listing-search-btn').addEventListener('click', () => {
    LISTINGS_STALE_ONLY = false;
    loadListings();
  });
  document.getElementById('listing-clear-btn').addEventListener('click', () => {
    LISTINGS_STALE_ONLY = false;
    ['listing-filter-type','listing-filter-status','listing-filter-commodity',
     'listing-filter-incoterm','listing-filter-region','listing-filter-qty-min',
     'listing-filter-qty-max','listing-filter-date-from','listing-filter-date-to',
     'listing-filter-docs'].forEach(id => { document.getElementById(id).value = ''; });
    loadListings();
  });
}

/** Fill the commodity filter dropdown from the Operator-managed list. */
async function populateCommodityFilter() {
  const select = document.getElementById('listing-filter-commodity');
  const { data } = await jericho.from('commodities').select('name');
  select.innerHTML = '<option value="">All commodities</option>';
  sortCommodities(data).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    select.appendChild(opt);
  });
}

async function loadListings() {
  const tbody = document.querySelector('#listings-table tbody');
  tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Loading…</td></tr>';

  let query = jericho.from('listings')
    .select('*, profiles!listings_user_id_fkey(first_name,last_name,company)')
    .order('created_at', { ascending: false });

  // Arrived here from the Overview's stale tile: same predicate as the count,
  // announced above the table so the operator can see why rows are missing.
  document.getElementById('listing-stale-note').classList.toggle('hidden', !LISTINGS_STALE_ONLY);
  if (LISTINGS_STALE_ONLY) query = query.eq('status', 'available').lt('updated_at', staleListingCutoff());

  const type = document.getElementById('listing-filter-type').value;
  const status = document.getElementById('listing-filter-status').value;
  const commodity = document.getElementById('listing-filter-commodity').value;
  const incoterm = document.getElementById('listing-filter-incoterm').value;
  const region = document.getElementById('listing-filter-region').value.trim();
  const qtyMin = document.getElementById('listing-filter-qty-min').value;
  const qtyMax = document.getElementById('listing-filter-qty-max').value;
  const dateFrom = document.getElementById('listing-filter-date-from').value;
  const dateTo = document.getElementById('listing-filter-date-to').value;
  const docsFilter = document.getElementById('listing-filter-docs').value;

  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  if (commodity) query = query.eq('commodity', commodity);
  if (incoterm) query = query.eq('incoterm', incoterm);
  if (qtyMin) query = query.gte('quantity', qtyMin);
  if (qtyMax) query = query.lte('quantity', qtyMax);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  // Date inputs are a plain day; extend "to" to the end of that day so the
  // final day is included rather than cut off at 00:00.
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
  // Region lives in origin (sell) or destination (buy), so match either.
  if (region) query = query.or(`origin.ilike.%${region}%,destination.ilike.%${region}%`);

  const { data, error } = await query;
  if (error) { tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${escapeHtml(errorMessage(error))}</td></tr>`; return; }

  // Which listings have at least one ticked document — fetched in one query
  // rather than per row.
  const withDocs = new Set();
  if (data.length) {
    const { data: checked } = await jericho
      .from('document_checklist').select('listing_id')
      .eq('indicated', true).in('listing_id', data.map(l => l.id));
    (checked || []).forEach(c => withDocs.add(c.listing_id));
  }

  let rows = data;
  if (docsFilter === 'yes') rows = rows.filter(l => withDocs.has(l.id));
  if (docsFilter === 'no') rows = rows.filter(l => !withDocs.has(l.id));

  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No listings match.</td></tr>'; return; }

  tbody.innerHTML = '';
  rows.forEach(l => {
    const owner = l.profiles
      ? `${l.profiles.first_name} ${l.profiles.last_name}${l.profiles.company ? ' (' + l.profiles.company + ')' : ''}`
      : 'Unknown';
    const hasDocs = withDocs.has(l.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Ref">${escapeHtml(l.reference_number)}</td>
      <td data-label="Owner">${escapeHtml(owner)}</td>
      <td data-label="Type">${l.type === 'sell' ? 'Sell' : 'Buy'}</td>
      <td data-label="Commodity">${escapeHtml(l.commodity)}</td>
      <td data-label="Qty">${l.quantity ? escapeHtml(String(l.quantity)) + ' ' + escapeHtml(l.unit || '') : '—'}</td>
      <td data-label="Incoterm">${escapeHtml(l.incoterm)}</td>
      <td data-label="Docs">${hasDocs ? 'Yes' : '<strong>None</strong>'}</td>
      <td data-label="Status">
        <select data-status-for="${l.id}">
          ${['available','under_review','negotiation','closed','archived'].map(st =>
            `<option value="${st}" ${st === l.status ? 'selected' : ''}>${statusLabel(st)}</option>`).join('')}
        </select>
      </td>
      <td data-label="Updated">${formatDate(l.updated_at)}</td>
      <td data-label="">
        <button class="btn btn-secondary btn-small" data-remind="${l.id}">Remind</button>
        <button class="btn btn-danger btn-small" data-remove-listing="${l.id}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-status-for]').forEach(sel =>
    sel.addEventListener('change', async () => {
      const { error } = await jericho.from('listings').update({ status: sel.value }).eq('id', sel.dataset.statusFor);
      if (error) { showError(errorMessage(error)); return; }
      // Logging + owner notification happen in the database.
      showSuccess('Status updated.');
    }));

  tbody.querySelectorAll('[data-remind]').forEach(b =>
    b.addEventListener('click', async () => {
      const { error } = await jericho.rpc('send_manual_reminder', { p_listing_id: b.dataset.remind });
      if (error) { showError(errorMessage(error)); return; }
      showSuccess('Reminder sent to the listing owner.');
    }));

  tbody.querySelectorAll('[data-remove-listing]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Remove this listing?')) return;
      const { error } = await jericho.from('listings').delete().eq('id', b.dataset.removeListing);
      if (error) { showError(errorMessage(error)); return; }
      showSuccess('Listing removed.');
      loadListings();
    }));
}

// --------------------------------------------------------- INVITATIONS ----
function wireInvitations() {
  document.getElementById('create-invite-btn').addEventListener('click', createInvitation);
}

/** Rebuild the registration link for an invitation token. */
function invitationLink(token) {
  return `${window.location.origin}${window.location.pathname.replace('operator.html', 'register.html')}?token=${token}`;
}

/** Queue the invitation email. The outbox is not writable by any client
 *  session (RLS with no policies), so this goes through a security-definer
 *  RPC — see sql/005_invitation_emails.sql. The link is built here because
 *  only the browser knows the origin the platform is served from. */
async function emailInvitation(email, token, lang) {
  const { error } = await jericho.rpc('queue_invitation_email', {
    p_to_email: email,
    p_link: invitationLink(token),
    p_lang: lang,
  });
  if (error) { showError(`Invitation saved, but the email could not be queued: ${errorMessage(error)}`); return false; }
  return true;
}

async function createInvitation() {
  const email = document.getElementById('invite-email').value.trim().toLowerCase() || null;
  const language = document.getElementById('invite-language').value || 'en';
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const { error } = await jericho.from('invitations').insert({ token, email, language, created_by: CURRENT_PROFILE.id });
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('invitation_created', { email, language });

  const link = invitationLink(token);
  let emailNote = '';
  if (email) {
    if (await emailInvitation(email, token, language)) {
      const langName = language === 'es' ? 'Spanish' : 'English';
      emailNote = `<br><span class="text-muted">Invitation email queued to ${escapeHtml(email)} in ${langName}.</span>`;
    }
  } else {
    emailNote = '<br><span class="text-muted">No email address given — nothing was sent. Copy the link and pass it on yourself.</span>';
  }

  const resultBox = document.getElementById('invite-result');
  resultBox.innerHTML = `<strong>Invitation link (valid 5 days, single use):</strong><br><code style="word-break:break-all;">${escapeHtml(link)}</code>${emailNote}`;
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
    // A used invitation is spent — its link cannot be redeemed again, so only
    // deletion (tidying the list) still makes sense for it.
    const actions = inv.used_at
      ? `<button class="btn btn-secondary btn-small" data-inv-delete="${inv.id}">Delete</button>`
      : `<button class="btn btn-secondary btn-small" data-inv-copy="${escapeHtml(inv.token)}">Copy link</button>
         <button class="btn btn-secondary btn-small" data-inv-edit="${inv.id}">Edit</button>
         <button class="btn btn-secondary btn-small" data-inv-resend="${inv.id}">Resend email</button>
         <button class="btn btn-secondary btn-small" data-inv-delete="${inv.id}">Delete</button>`;

    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(inv.email || 'No email noted')}</span>
        ${badge}
      </div>
      <div class="list-row-meta">Created ${formatDate(inv.created_at)} · Expires ${formatDate(inv.expires_at)}${inv.used_at ? ' · Used ' + formatDate(inv.used_at) : ''}</div>
      <div class="row" style="margin-top:6px;">${actions}</div>
      <div class="hidden" data-inv-editor="${inv.id}" style="margin-top:8px;">
        <label>Email</label>
        <input type="email" data-inv-email="${inv.id}" value="${escapeHtml(inv.email || '')}">
        <label>Expires</label>
        <input type="date" data-inv-expires="${inv.id}" value="${new Date(inv.expires_at).toISOString().slice(0, 10)}">
        <div class="row" style="margin-top:8px;">
          <button class="btn btn-primary btn-small" data-inv-save="${inv.id}">Save</button>
          <button class="btn btn-secondary btn-small" data-inv-cancel="${inv.id}">Cancel</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  wireInvitationActions(container, data);
}

function wireInvitationActions(container, invitations) {
  const byId = {};
  invitations.forEach(i => { byId[i.id] = i; });
  const editor = id => container.querySelector(`[data-inv-editor="${id}"]`);

  container.querySelectorAll('[data-inv-copy]').forEach(b =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(invitationLink(b.dataset.invCopy));
        showSuccess('Invitation link copied.');
      } catch {
        // Clipboard access needs a secure context and can be blocked outright;
        // showing the link still lets the operator copy it by hand.
        showError(`Could not copy. Link: ${invitationLink(b.dataset.invCopy)}`);
      }
    }));

  container.querySelectorAll('[data-inv-edit]').forEach(b =>
    b.addEventListener('click', () => editor(b.dataset.invEdit).classList.remove('hidden')));

  container.querySelectorAll('[data-inv-cancel]').forEach(b =>
    b.addEventListener('click', () => editor(b.dataset.invCancel).classList.add('hidden')));

  container.querySelectorAll('[data-inv-save]').forEach(b =>
    b.addEventListener('click', async () => {
      const id = b.dataset.invSave;
      const email = container.querySelector(`[data-inv-email="${id}"]`).value.trim().toLowerCase() || null;
      const expires = container.querySelector(`[data-inv-expires="${id}"]`).value;
      if (!expires) { showError('Give the invitation an expiry date.'); return; }

      // Expiry is a timestamptz; a bare date would land at 00:00 and expire the
      // invitation at the start of the chosen day rather than the end of it.
      const expires_at = new Date(`${expires}T23:59:59`).toISOString();

      const { error } = await jericho.from('invitations').update({ email, expires_at }).eq('id', id);
      if (error) { showError(errorMessage(error)); return; }
      await logOpActivity('invitation_updated', { invitation_id: id, email });
      showSuccess('Invitation updated.');
      loadInvitations();
    }));

  container.querySelectorAll('[data-inv-resend]').forEach(b =>
    b.addEventListener('click', async () => {
      const inv = byId[b.dataset.invResend];
      if (!inv.email) { showError('No email address on this invitation — add one with Edit first.'); return; }
      if (await emailInvitation(inv.email, inv.token)) {
        await logOpActivity('invitation_resent', { invitation_id: inv.id, email: inv.email });
        showSuccess(`Invitation email queued to ${inv.email}.`);
      }
    }));

  container.querySelectorAll('[data-inv-delete]').forEach(b =>
    b.addEventListener('click', async () => {
      const inv = byId[b.dataset.invDelete];
      const who = inv.email || 'this invitation';
      if (!confirm(`Delete the invitation for ${who}? Its link stops working immediately and cannot be undone.`)) return;

      const { error } = await jericho.from('invitations').delete().eq('id', inv.id);
      if (error) { showError(errorMessage(error)); return; }
      await logOpActivity('invitation_deleted', { invitation_id: inv.id, email: inv.email });
      showSuccess('Invitation deleted — its link no longer works.');
      loadInvitations();
    }));
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
  showSuccess('Role updated.');
  loadUsers();
}

// -------------------------------------------------------- COMMODITIES ----
// The commodity list drives the dropdown on every listing form. Deleting one
// does NOT change listings that already reference it: listings.commodity is
// plain text, not a foreign key, so historic listings keep their commodity
// name. The UI warns when a commodity is still in use so an Operator isn't
// surprised by that.

let COMMODITY_CACHE = [];

function wireCommodities() {
  document.getElementById('add-commodity-btn').addEventListener('click', addCommodity);

  // Enter in the name box should add, not submit anything unexpected.
  document.getElementById('new-commodity-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCommodity(); }
  });

  document.getElementById('commodity-search').addEventListener('input', renderCommodities);
}

async function addCommodity() {
  const input = document.getElementById('new-commodity-name');
  const name = input.value.trim();
  if (!name) { showError('Enter a commodity name.'); return; }

  // Case-insensitive duplicate check up front, so the Operator gets a clear
  // message instead of a raw unique-constraint error from Postgres.
  if (COMMODITY_CACHE.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showError(`"${name}" is already in the list.`);
    return;
  }

  // sort_order is left null: the list is alphabetised in the client by
  // sortCommodities(), and a hard 999 here would pin every new commodity to
  // the bottom for anything still ordering by the column.
  const { error } = await jericho.from('commodities')
    .insert({ name, created_by: CURRENT_PROFILE.id, sort_order: null });
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('commodity_added', { name });
  input.value = '';
  showSuccess(`Added "${name}".`);
  loadCommodities();
}

async function loadCommodities() {
  const container = document.getElementById('commodities-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await jericho.from('commodities').select('*');
  if (error) { container.innerHTML = `<p class="empty-state">${escapeHtml(errorMessage(error))}</p>`; return; }

  COMMODITY_CACHE = sortCommodities(data);

  // How many listings currently use each commodity name, so the Operator can
  // see what a deletion would leave behind.
  const { data: listings } = await jericho.from('listings').select('commodity');
  const usage = {};
  (listings || []).forEach(l => {
    const key = (l.commodity || '').toLowerCase();
    usage[key] = (usage[key] || 0) + 1;
  });
  COMMODITY_CACHE.forEach(c => { c.usage = usage[c.name.toLowerCase()] || 0; });

  renderCommodities();
}

function renderCommodities() {
  const container = document.getElementById('commodities-list');
  const filter = document.getElementById('commodity-search').value.trim().toLowerCase();
  const rows = filter
    ? COMMODITY_CACHE.filter(c => c.name.toLowerCase().includes(filter))
    : COMMODITY_CACHE;

  document.getElementById('commodity-count').textContent =
    `${rows.length} of ${COMMODITY_CACHE.length} shown`;

  if (!COMMODITY_CACHE.length) {
    container.innerHTML = '<p class="empty-state">No commodities yet. Add one above, or run sql/seed_commodities.sql to load the standard list.</p>';
    return;
  }
  if (!rows.length) { container.innerHTML = '<p class="empty-state">No commodity matches that filter.</p>'; return; }

  container.innerHTML = '';
  rows.forEach(c => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="list-row-top">
        <span class="list-row-title">${escapeHtml(c.name)}</span>
        <span class="row" style="gap:6px;">
          ${c.usage > 0 ? `<span class="badge badge-blue">${c.usage} listing${c.usage === 1 ? '' : 's'}</span>` : ''}
          <button class="btn btn-danger btn-small" data-del-commodity="${c.id}" data-name="${escapeHtml(c.name)}" data-usage="${c.usage}">Remove</button>
        </span>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-del-commodity]').forEach(b =>
    b.addEventListener('click', () => deleteCommodity(b.dataset.delCommodity, b.dataset.name, Number(b.dataset.usage))));
}

async function deleteCommodity(id, name, usage) {
  const warning = usage > 0
    ? `"${name}" is used by ${usage} existing listing${usage === 1 ? '' : 's'}.\n\n` +
      `Those listings keep the name "${name}" — nothing is deleted from them — but ` +
      `it will no longer appear in the dropdown for new listings.\n\nRemove it from the list?`
    : `Remove "${name}" from the commodity list?`;
  if (!confirm(warning)) return;

  const { error } = await jericho.from('commodities').delete().eq('id', id);
  if (error) { showError(errorMessage(error)); return; }
  await logOpActivity('commodity_removed', { name });
  showSuccess(`Removed "${name}".`);
  loadCommodities();
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
  // Audit entry is written by trg_log_doc_request_change; the participant
  // notification is written here because it is addressed to a specific user
  // chosen by this Operator action.
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

  // Who wrote each message, so a reply's target can be resolved without a
  // round trip: the operator's own query above already returned every row.
  const senderOf = new Map(data.map(m => [m.id, m.sender_id]));

  // Names for the forward modal. One query for every profile the mailbox
  // might forward to, rather than one per message.
  const targetIds = new Set();
  for (const m of data) if (m.in_reply_to && senderOf.has(m.in_reply_to)) targetIds.add(senderOf.get(m.in_reply_to));
  if (targetIds.size) {
    const { data: profs } = await jericho.from('profiles')
      .select('id,first_name,last_name').in('id', [...targetIds]);
    (profs || []).forEach(p => ALL_PROFILES_BY_ID[p.id] = p);
  }

  container.innerHTML = '';
  for (const m of data) {
    let refLabel = '(no listing)', ownerId = null;
    if (m.listing_id) {
      const { data: l } = await jericho.from('listings').select('reference_number,user_id').eq('id', m.listing_id).maybeSingle();
      if (l) { refLabel = l.reference_number; ownerId = l.user_id; }
    }

    // An opening enquiry goes to the listing owner. A reply goes to whoever
    // wrote the message it answers — which on a reply is NOT the owner, since
    // the owner is the one replying. Deriving this from the listing was the
    // bug: it sent a reply back to its own author. See sql/009.
    let targetId = ownerId;
    let targetKind = 'owner';
    if (m.in_reply_to && senderOf.has(m.in_reply_to)) {
      targetId = senderOf.get(m.in_reply_to);
      targetKind = 'sender';
    }
    const targetProfile = targetId ? ALL_PROFILES_BY_ID[targetId] : null;
    const targetName = targetProfile
      ? `${targetProfile.first_name} ${targetProfile.last_name}` : null;

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
          <button class="btn btn-primary btn-small" data-forward="${m.id}" data-listing="${m.listing_id || ''}" data-owner="${targetId || ''}" data-sender="${m.sender_id}" data-target-kind="${targetKind}" data-target-name="${escapeHtml(targetName || '')}" data-ref="${escapeHtml(refLabel)}">${targetKind === 'sender' ? 'Forward Reply' : 'Forward to Owner'}</button>
          <button class="btn btn-secondary btn-small" data-reply="${m.id}" data-sender="${m.sender_id}" data-listing2="${m.listing_id || ''}">Reply</button>
          <button class="btn btn-danger btn-small" data-ignore="${m.id}">Ignore</button>
        </div>` : ''}
    `;
    container.appendChild(row);

    // Wire the row now rather than after the loop. Every iteration awaits a
    // listing lookup, so rows land on screen one at a time - wiring at the end
    // leaves each of them visible, enabled and not yet listening, and a click
    // in that window is swallowed with no feedback at all. It is the nav race
    // the specs guard against, one layer down: the operator sees a button and
    // presses it, and nothing happens.
    row.querySelectorAll('[data-forward]').forEach(b => b.addEventListener('click', () => openForwardModal(b)));
    row.querySelectorAll('[data-reply]').forEach(b => b.addEventListener('click', () => openReplyModal(b)));
    row.querySelectorAll('[data-ignore]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await jericho.from('messages').update({ status: 'ignored' }).eq('id', b.dataset.ignore);
      if (error) { showError(errorMessage(error)); return; }
      loadOperatorMailbox();
    }));
  }
}

function wireForwardModal() {
  document.getElementById('forward-cancel-btn').addEventListener('click', () => document.getElementById('forward-modal').classList.add('hidden'));
  document.getElementById('forward-confirm-btn').addEventListener('click', confirmForward);
}

function openForwardModal(btn) {
  if (!btn.dataset.owner) {
    showError('There is nobody to forward this message to — it has no listing owner and is not a reply to anyone.');
    return;
  }
  // A message must never be forwarded to the person who wrote it. This is the
  // exact failure the old listing-derived target produced on every reply, so
  // it is guarded rather than merely avoided.
  if (btn.dataset.owner === btn.dataset.sender) {
    showError('That would send this message back to the person who wrote it.');
    return;
  }

  FORWARD_TARGET = {
    messageId: btn.dataset.forward,
    listingId: btn.dataset.listing,
    toUserId: btn.dataset.owner,
    refLabel: btn.dataset.ref,
  };

  const who = btn.dataset.targetName || 'the recipient';
  document.getElementById('forward-target-info').textContent =
    btn.dataset.targetKind === 'sender'
      ? `Forwarding this reply to ${who}, who wrote the message it answers (${FORWARD_TARGET.refLabel}).`
      : `Forwarding to the owner of ${FORWARD_TARGET.refLabel}.`;
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

  // The operator's own reply answers a specific message, so it carries the
  // same in_reply_to link a participant's reply does. Leaving it null was the
  // listing-derived target coming back through a different door: the reply
  // would land in this very mailbox offering "Forward to Owner", and the owner
  // is not who it was written for. See sql/009.
  const { data: newMsg, error: e1 } = await jericho.from('messages').insert({
    sender_id: CURRENT_PROFILE.id, listing_id: REPLY_TARGET.listingId || null,
    in_reply_to: REPLY_TARGET.originalMessageId || null,
    body, status: 'pending_review'
  }).select('id').single();
  if (e1) { showError(errorMessage(e1)); return; }

  const { error: e2 } = await jericho.from('message_forward_log').insert({
    message_id: newMsg.id, operator_id: CURRENT_PROFILE.id, to_user_id: REPLY_TARGET.senderId
  });
  if (e2) { showError(errorMessage(e2)); return; }

  // Delivered in the same action, so it is not pending anything. Marked only
  // after the forward log succeeded, the way confirmForward does it, so a
  // failed log never leaves a message claiming to have been forwarded.
  await jericho.from('messages').update({ status: 'forwarded' }).eq('id', newMsg.id);
  await jericho.from('messages').update({ status: 'replied' }).eq('id', REPLY_TARGET.originalMessageId);
  await jericho.from('notifications').insert({
    user_id: REPLY_TARGET.senderId, type: 'message_reply', message: 'An Operator replied to your message.'
  });
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
