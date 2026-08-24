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

const DOCUMENT_TYPES = [
  'Certificate of Analysis', 'Cargo Information Sheet / CIS', 'Past performance record',
  'Proof of product', 'Assay report', 'SGS report', 'Certificate of origin',
  'LOI', 'ICPO', 'SPA', 'Company registration', 'KYC', 'Photographs', 'Videos', 'Other'
];

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR'];

const STATUS_LABELS = {
  available: 'Available', under_review: 'Under Review', negotiation: 'Negotiation',
  closed: 'Closed', archived: 'Archived',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended',
  requested: 'Requested', confirmed: 'Confirmed', unavailable: 'Unavailable',
  new: 'New', reviewed: 'Reviewed', dismissed: 'Dismissed',
  pending_review: 'Pending Review', forwarded: 'Forwarded', replied: 'Replied', ignored: 'Ignored'
};

function statusLabel(status) { return STATUS_LABELS[status] || status; }
