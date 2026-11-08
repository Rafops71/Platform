// DEMO BUILD ONLY - never loaded by the real site.
//
// scripts/build-demo.js puts this file in place of js/supabase-config.js in
// dist-demo/, and removes the Supabase script tag. What remains is `myplatform`,
// the same name the real client uses, with the same surface the app calls
// (every .from(), .rpc() and .auth.* call in js/ and the HTML pages).
//
// Nothing here touches the network. Data lives in memory and is rebuilt from
// js/demo/seed.js on every page load, so a change is lost on reload - which
// is what the ribbon says. The one thing kept between pages is WHO is signed
// in, in sessionStorage for this browser tab, so that moving from the sign-in
// page to the member or Operator page does not sign the demo out.
//
// Row visibility mimics what the real row-level security lets each side see,
// so a member's screens show only that member's rows. The sign-in step does
// not check a password: the demo accounts are a demonstration, not a secret.

const myplatform = (function () {
  'use strict';

  const SEED = window.DEMO_SEED;
  const SESSION_KEY = 'myplatform-demo-session';
  const DAY = 86400000;

  // ------------------------------------------------------------ the store ----
  const db = {};
  Object.keys(SEED.tables).forEach((t) => { db[t] = JSON.parse(JSON.stringify(SEED.tables[t])); });

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  const nowIso = () => new Date().toISOString();
  const err = (message, code) => ({ message, code: code || null, details: null, hint: null });

  // --------------------------------------------------------- the session ----
  let memorySession = null;
  function readSession() {
    try { return sessionStorage.getItem(SESSION_KEY) || memorySession; } catch (e) { return memorySession; }
  }
  function setSession(authId) {
    memorySession = authId || null;
    try {
      if (authId) sessionStorage.setItem(SESSION_KEY, authId);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private window: the memory copy still works on this page */ }
  }
  function authUserFor(authId) {
    const p = db.profiles.find((x) => x.user_id === authId);
    if (!p) return null;
    return { id: authId, aud: 'authenticated', role: 'authenticated', email: p.email,
      app_metadata: { provider: 'email' }, user_metadata: {}, created_at: p.created_at };
  }
  function me() {
    const authId = readSession();
    return authId ? db.profiles.find((p) => p.user_id === authId) || null : null;
  }
  const isOperator = (p) => !!p && p.role === 'operator';

  // -------------------------------------------------------- visibility ----
  // What each side may read. Writes are not policed: the demo is a stage for
  // the screens, and nothing it writes survives a reload anyway.
  function visibleRows(table) {
    const rows = db[table] || [];
    if (table === 'commodities' || table === 'terms_versions') return rows;
    const p = me();
    if (!p) return [];
    if (isOperator(p)) return rows;
    switch (table) {
      case 'profiles': return rows.filter((r) => r.id === p.id);
      case 'listings': return rows.filter((r) => r.user_id === p.id);
      case 'document_checklist': {
        const own = new Set(visibleRows('listings').map((l) => l.id));
        return rows.filter((r) => own.has(r.listing_id));
      }
      case 'document_requests': return rows.filter((r) => r.participant_id === p.id);
      case 'messages': {
        // Mirrors messages_select: own sent messages, plus messages forwarded to you.
        const forwarded = new Set(db.message_forward_log.filter((f) => f.to_user_id === p.id).map((f) => f.message_id));
        return rows.filter((r) => r.sender_id === p.id || forwarded.has(r.id));
      }
      case 'message_forward_log': return rows.filter((r) => r.to_user_id === p.id);
      case 'notifications':
      case 'saved_searches': return rows.filter((r) => r.user_id === p.id);
      default: return []; // Operator-only tables: invitations, activity_log, matches, deals, ...
    }
  }

  // ---------------------------------------------------- query building ----
  const RELATIONS = {
    // listings.user_id points at profiles.id (listings_user_id_fkey).
    listings: { profiles: { fk: 'user_id', table: 'profiles', key: 'id' } },
  };

  const UNIQUE = {
    profiles: [['user_id']],
    listings: [['reference_number']],
    commodities: [['name']],
    invitations: [['token']],
    document_checklist: [['listing_id', 'doc_type']],
    saved_searches: [['user_id', 'commodity', 'listing_type', 'region', 'listing_status']],
  };

  const DEFAULTS = {
    listings: { status: 'available', truth_confirmed: false, updated_at: nowIso, last_reminder_at: null },
    profiles: { updated_at: nowIso, status: 'pending', role: 'participant' },
    messages: { status: 'pending_review', in_reply_to: null, subject: null, listing_id: null, reviewed_at: null },
    notifications: { is_read: false, related_id: null },
    invitations: { used_at: null, used_by: null, expires_at: () => new Date(Date.now() + 5 * DAY).toISOString() },
    document_requests: { status: 'requested', requested_at: nowIso, responded_at: null },
    message_forward_log: { sent_at: nowIso },
    commodities: { sort_order: null },
    saved_searches: { commodity: null, listing_type: null, region: null, listing_status: null },
  };

  const norm = (v) => (v === undefined ? null : v);
  function eqv(a, b) {
    if (a == null || b == null) return a == null && b == null;
    return String(a) === String(b);
  }
  function cmpVals(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const sa = String(a); const sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  function likeToRegex(pattern) {
    const body = String(pattern).split('').map((ch) => {
      if (ch === '%') return '.*';
      if (ch === '_') return '.';
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return new RegExp('^' + body + '$', 'i');
  }

  // "*, profiles!listings_user_id_fkey(first_name,last_name)" -> plain columns + embeds
  function parseSelect(str) {
    const parts = [];
    let depth = 0; let cur = '';
    for (const ch of String(str)) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    const out = { star: false, cols: [], embeds: [] };
    parts.forEach((p) => {
      if (p === '*') { out.star = true; return; }
      const m = p.match(/^([a-z_]+)(![a-z_]+)?\((.*)\)$/i);
      if (m) out.embeds.push({ name: m[1], cols: m[3].split(',').map((s) => s.trim()).filter(Boolean) });
      else out.cols.push(p);
    });
    return out;
  }
  function pick(obj, cols) {
    const o = {};
    cols.forEach((c) => { if (c in obj) o[c] = obj[c]; });
    return o;
  }
  function project(row, parsed, table) {
    const out = parsed.star ? Object.assign({}, row) : {};
    if (!parsed.star) parsed.cols.forEach((c) => { if (c in row) out[c] = row[c]; });
    parsed.embeds.forEach((e) => {
      const rel = (RELATIONS[table] || {})[e.name];
      if (!rel) return;
      const target = (db[rel.table] || []).find((t) => t[rel.key] === row[rel.fk]) || null;
      out[e.name] = target ? pick(target, e.cols) : null;
    });
    return out;
  }

  // "origin.ilike.%x%,destination.ilike.%x%" -> one predicate per term
  function predicateFor(col, op, value) {
    switch (op) {
      case 'eq': return (r) => eqv(r[col], value);
      case 'neq': return (r) => r[col] != null && !eqv(r[col], value);
      case 'ilike': { const re = likeToRegex(value); return (r) => r[col] != null && re.test(String(r[col])); }
      case 'is': return (r) => ((value === null || value === 'null') ? r[col] == null : r[col] === value);
      case 'gt': return (r) => r[col] != null && cmpVals(r[col], value) > 0;
      case 'gte': return (r) => r[col] != null && cmpVals(r[col], value) >= 0;
      case 'lt': return (r) => r[col] != null && cmpVals(r[col], value) < 0;
      case 'lte': return (r) => r[col] != null && cmpVals(r[col], value) <= 0;
      default: throw new Error(`demo: unsupported filter operator "${op}"`);
    }
  }
  function orPredicate(expr) {
    const preds = String(expr).split(',').map((term) => {
      const m = term.match(/^([a-z_]+)\.([a-z]+)\.(.*)$/i);
      if (!m) throw new Error(`demo: cannot read or() term "${term}"`);
      return predicateFor(m[1], m[2], m[3]);
    });
    return (r) => preds.some((p) => p(r));
  }

  class Query {
    constructor(table) {
      this._table = table;
      this._op = 'select';
      this._cols = '*';
      this._opts = {};
      this._filters = [];
      this._orders = [];
      this._limit = null;
      this._payload = null;
      this._returning = false;
      this._single = null;
      this._onConflict = null;
    }
    select(cols, opts) {
      this._cols = cols === undefined ? '*' : cols;
      if (this._op !== 'select') this._returning = true;
      if (opts) this._opts = opts;
      return this;
    }
    insert(payload, opts) { this._op = 'insert'; this._payload = payload; this._opts = opts || {}; return this; }
    upsert(payload, opts) {
      this._op = 'upsert'; this._payload = payload;
      this._onConflict = opts && opts.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : null;
      return this;
    }
    update(patch) { this._op = 'update'; this._payload = patch; return this; }
    delete() { this._op = 'delete'; return this; }
    eq(c, v) { this._filters.push(predicateFor(c, 'eq', v)); return this; }
    neq(c, v) { this._filters.push(predicateFor(c, 'neq', v)); return this; }
    gt(c, v) { this._filters.push(predicateFor(c, 'gt', v)); return this; }
    gte(c, v) { this._filters.push(predicateFor(c, 'gte', v)); return this; }
    lt(c, v) { this._filters.push(predicateFor(c, 'lt', v)); return this; }
    lte(c, v) { this._filters.push(predicateFor(c, 'lte', v)); return this; }
    ilike(c, v) { this._filters.push(predicateFor(c, 'ilike', v)); return this; }
    is(c, v) { this._filters.push(predicateFor(c, 'is', v)); return this; }
    in(c, values) {
      const set = new Set((values || []).map(String));
      this._filters.push((r) => set.has(String(norm(r[c]))));
      return this;
    }
    or(expr) { this._filters.push(orPredicate(expr)); return this; }
    contains(c, values) {
      this._filters.push((r) => Array.isArray(r[c]) && (values || []).every((v) => r[c].includes(v)));
      return this;
    }
    order(c, opts) { this._orders.push({ c, asc: !(opts && opts.ascending === false) }); return this; }
    limit(n) { this._limit = n; return this; }
    single() { this._single = 'single'; return this; }
    maybeSingle() { this._single = 'maybe'; return this; }

    then(resolve, reject) {
      return Promise.resolve().then(() => this._exec()).then(resolve, reject);
    }
    catch(reject) { return this.then(null, reject); }

    _exec() {
      try {
        if (!(this._table in db)) return { data: null, error: err(`relation "${this._table}" does not exist`, '42P01') };
        switch (this._op) {
          case 'select': return this._select();
          case 'insert': return this._insert();
          case 'upsert': return this._upsert();
          case 'update': return this._update();
          case 'delete': return this._delete();
          default: return { data: null, error: err('demo: unknown operation') };
        }
      } catch (e) {
        return { data: null, error: err(String(e && e.message ? e.message : e)) };
      }
    }

    _matching(rows) { return rows.filter((r) => this._filters.every((f) => f(r))); }

    _select() {
      let rows = this._matching(visibleRows(this._table));
      if (this._orders.length) {
        rows = rows.slice().sort((a, b) => {
          for (const o of this._orders) {
            const an = a[o.c] == null; const bn = b[o.c] == null;
            // Postgres treats NULL as larger than any value: last when ascending, first when descending.
            if (an || bn) { if (an && bn) continue; const r = an ? 1 : -1; return o.asc ? r : -r; }
            const c = cmpVals(a[o.c], b[o.c]);
            if (c) return o.asc ? c : -c;
          }
          return 0;
        });
      }
      const total = rows.length;
      if (this._limit != null) rows = rows.slice(0, this._limit);
      if (this._opts && this._opts.head) return { data: null, error: null, count: total };
      const result = this._finish(rows);
      if (this._opts && this._opts.count) result.count = total;
      return result;
    }

    _withDefaults(raw) {
      const row = Object.assign({}, raw);
      if (!row.id) row.id = uuid();
      if (!('created_at' in row)) row.created_at = nowIso();
      const defaults = DEFAULTS[this._table] || {};
      Object.keys(defaults).forEach((k) => {
        if (!(k in row)) row[k] = typeof defaults[k] === 'function' ? defaults[k]() : defaults[k];
      });
      return row;
    }

    _clash(row, except) {
      for (const cols of UNIQUE[this._table] || []) {
        const hit = db[this._table].find((r) => r !== except && cols.every((c) => eqv(norm(r[c]), norm(row[c]))));
        if (hit) return err(`duplicate key value violates unique constraint "${this._table}_${cols.join('_')}_key"`, '23505');
      }
      return null;
    }

    _insert() {
      const payload = Array.isArray(this._payload) ? this._payload : [this._payload];
      const inserted = [];
      for (const raw of payload) {
        const row = this._withDefaults(raw);
        const clash = this._clash(row, null);
        if (clash) return { data: null, error: clash };
        db[this._table].push(row);
        inserted.push(row);
      }
      return this._returning ? this._finish(inserted) : { data: null, error: null };
    }

    _upsert() {
      const payload = Array.isArray(this._payload) ? this._payload : [this._payload];
      const keys = this._onConflict || ['id'];
      const out = [];
      for (const raw of payload) {
        const hit = db[this._table].find((r) => keys.every((c) => eqv(norm(r[c]), norm(raw[c]))));
        if (hit) { Object.assign(hit, raw); out.push(hit); } else {
          const row = this._withDefaults(raw);
          db[this._table].push(row);
          out.push(row);
        }
      }
      return this._returning ? this._finish(out) : { data: null, error: null };
    }

    _update() {
      const rows = this._matching(visibleRows(this._table));
      rows.forEach((r) => {
        Object.assign(r, this._payload);
        if ('updated_at' in r) r.updated_at = nowIso();
      });
      return this._returning ? this._finish(rows) : { data: null, error: null };
    }

    _delete() {
      const rows = this._matching(visibleRows(this._table));
      const gone = new Set(rows);
      db[this._table] = db[this._table].filter((r) => !gone.has(r));
      if (this._table === 'listings') {
        const ids = new Set(rows.map((r) => r.id));
        db.document_checklist = db.document_checklist.filter((d) => !ids.has(d.listing_id));
        db.matches = db.matches.filter((m) => !ids.has(m.listing_a_id) && !ids.has(m.listing_b_id));
        db.deals.forEach((d) => { if (ids.has(d.listing_id)) d.listing_id = null; });
      }
      return { data: null, error: null };
    }

    _finish(rows) {
      const parsed = parseSelect(this._cols || '*');
      const data = rows.map((r) => project(r, parsed, this._table));
      if (this._single === 'single') {
        if (data.length !== 1) return { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
        return { data: data[0], error: null };
      }
      if (this._single === 'maybe') {
        if (data.length > 1) return { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
        return { data: data[0] || null, error: null };
      }
      return { data, error: null };
    }
  }

  // ------------------------------------------------------------ the RPCs ----
  function periodsFor(bucket, n) {
    const size = bucket === 'month' ? 30 : 7;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const out = [];
    for (let k = (Number(n) || 12) - 1; k >= 0; k--) {
      const end = new Date(today.getTime() + DAY - k * size * DAY);
      const start = new Date(end.getTime() - size * DAY);
      out.push({ start: start.toISOString(), end: end.toISOString(), period_start: start.toISOString().slice(0, 10) });
    }
    return out;
  }
  const inPeriod = (iso, p) => !!iso && iso >= p.start && iso < p.end;
  const countIn = (rows, field, p) => rows.filter((r) => inPeriod(r[field], p)).length;

  function requireOperator() {
    const p = me();
    if (!isOperator(p)) throw Object.assign(err('permission denied for function', '42501'));
    return p;
  }

  const RPCS = {
    record_activity(a) {
      const p = me();
      if (p) db.activity_log.push({ id: uuid(), user_id: p.id, action: a.p_action, details: a.p_details || null, created_at: nowIso() });
      return null;
    },
    get_invitation_by_token(a) {
      return db.invitations.filter((i) => i.token === a.p_token)
        .map((i) => ({ id: i.id, email: i.email, expires_at: i.expires_at, used_at: i.used_at }));
    },
    next_reference(a) {
      const prefix = a.p_type === 'sell' ? 'SELL' : a.p_type === 'buy' ? 'BUY' : null;
      if (!prefix) throw err(`Unknown listing type: ${a.p_type}`, 'P0001');
      const yy = String(new Date().getFullYear()).slice(-2);
      const key = `${prefix}-${yy}`;
      let counter = db.reference_counters.find((c) => c.key === key);
      if (!counter) { counter = { key, last_value: 0 }; db.reference_counters.push(counter); }
      counter.last_value += 1;
      return `${key}-${counter.last_value < 1000 ? String(counter.last_value).padStart(3, '0') : counter.last_value}`;
    },
    queue_invitation_email() { return null; },
    send_manual_reminder(a) {
      const l = db.listings.find((x) => x.id === a.p_listing_id);
      if (l) l.last_reminder_at = nowIso();
      return null;
    },
    renew_listing(a) {
      const l = db.listings.find((x) => x.id === a.p_listing_id);
      if (l) l.updated_at = nowIso();
      return null;
    },
    accept_terms() { return null; },
    has_accepted_current_terms() { return !!me(); },
    get_public_listings() {
      const viewer = me();
      if (!viewer || (!isOperator(viewer) && viewer.status !== 'approved')) {
        throw err('permission denied for function get_public_listings', '42501');
      }
      return db.listings.filter((l) => l.status !== 'archived').map((l) => ({
        id: l.id, reference_number: l.reference_number, type: l.type, commodity: l.commodity,
        quantity: l.quantity, unit: l.unit, incoterm: l.incoterm,
        region: l.type === 'sell' ? l.origin : l.destination,
        specification: l.specification, price_conditions: l.price_conditions, price_unit: l.price_unit,
        currency: l.currency, notes: l.notes, status: l.status,
        has_documents: db.document_checklist.some((d) => d.listing_id === l.id && d.indicated),
        created_at: l.created_at, updated_at: l.updated_at,
        poster_role: l.poster_role, docs_seen: l.docs_seen, principal_kind: l.principal_kind,
      }));
    },
    deal_analytics(a) {
      requireOperator();
      return periodsFor(a.p_bucket, a.p_periods).map((p) => ({
        period_start: p.period_start,
        opened: countIn(db.deals, 'opened_at', p),
        agreed: countIn(db.deals, 'agreed_at', p),
        introduced: countIn(db.deals, 'introduced_at', p),
        closed_done: db.deals.filter((d) => d.deal_result === 'closed' && inPeriod(d.closed_at, p)).length,
        fell_through: db.deals.filter((d) => d.deal_result === 'fell_through' && inPeriod(d.closed_at, p)).length,
      }));
    },
    operator_analytics(a) {
      requireOperator();
      return periodsFor(a.p_bucket, a.p_periods).map((p) => ({
        period_start: p.period_start,
        registrations: countIn(db.profiles, 'created_at', p),
        listings: countIn(db.listings, 'created_at', p),
        messages_reviewed: countIn(db.messages, 'reviewed_at', p),
        introductions: countIn(db.deals, 'introduced_at', p),
        matches_reviewed: countIn(db.matches, 'reviewed_at', p),
      }));
    },
    member_scorecard(a) {
      requireOperator();
      return db.profiles
        .filter((p) => p.role === 'participant' && (!a.p_profile_id || p.id === a.p_profile_id))
        .map((p) => {
          const mine = db.deals.filter((d) => d.owner_id === p.id || d.counterparty_id === p.id);
          const count = (fn) => mine.filter(fn).length;
          const last = mine.map((d) => d.updated_at || d.opened_at).sort().pop() || null;
          return {
            profile_id: p.id,
            deals_as_poster: db.deals.filter((d) => d.owner_id === p.id).length,
            deals_as_other: db.deals.filter((d) => d.counterparty_id === p.id).length,
            introduced: count((d) => !!d.introduced_at),
            closed_done: count((d) => d.deal_result === 'closed'),
            fell_through: count((d) => d.deal_result === 'fell_through'),
            docs_matched: count((d) => d.docs_match === 'matched'),
            docs_not_matched: count((d) => d.docs_match === 'not_matched'),
            docs_never_arrived: count((d) => d.docs_match === 'never_arrived'),
            docs_faulty: count((d) => d.docs_genuine === 'faulty'),
            docs_false: count((d) => d.docs_genuine === 'false'),
            offer_real: count((d) => d.offer_real === 'real'),
            offer_did_not_happen: count((d) => d.offer_real === 'did_not_happen'),
            offer_not_genuine: count((d) => d.offer_real === 'not_genuine'),
            last_activity: last,
          };
        });
    },
    my_activity_export() {
      const p = me();
      if (!p) return [];
      const out = [];
      visibleRows('listings').forEach((l) => out.push({
        occurred_at: l.created_at, category: 'Listing', reference: l.reference_number,
        detail: l.commodity, status: l.status,
      }));
      visibleRows('messages').forEach((m) => out.push({
        occurred_at: m.created_at, category: 'Message', reference: null,
        detail: String(m.body).slice(0, 120), status: m.status,
      }));
      return out.sort((a, b) => cmpVals(b.occurred_at, a.occurred_at));
    },
    purge_orphaned_activity() { requireOperator(); return 0; },
  };

  class Rpc {
    constructor(name, args) { this._name = name; this._args = args || {}; }
    then(resolve, reject) {
      return Promise.resolve().then(() => this._exec()).then(resolve, reject);
    }
    catch(reject) { return this.then(null, reject); }
    _exec() {
      const fn = RPCS[this._name];
      if (!fn) return { data: null, error: err(`Could not find the function public.${this._name}`, 'PGRST202') };
      try {
        return { data: fn(this._args), error: null };
      } catch (e) {
        return { data: null, error: e && e.message ? e : err(String(e)) };
      }
    }
  }

  // ---------------------------------------------------------------- auth ----
  const auth = {
    async getSession() {
      const authId = readSession();
      const user = authId ? authUserFor(authId) : null;
      return { data: { session: user ? { access_token: 'demo', token_type: 'bearer', user } : null }, error: null };
    },
    async getUser() {
      const authId = readSession();
      const user = authId ? authUserFor(authId) : null;
      return user ? { data: { user }, error: null } : { data: { user: null }, error: err('Auth session missing!') };
    },
    async signInWithPassword(credentials) {
      const email = String((credentials && credentials.email) || '').toLowerCase();
      const p = db.profiles.find((x) => x.email.toLowerCase() === email);
      // The demo has members only. The Operator account is data, not a way in.
      if (!p || p.role === 'operator') return { data: { user: null, session: null }, error: err('Invalid login credentials', 'invalid_credentials') };
      setSession(p.user_id);
      const user = authUserFor(p.user_id);
      return { data: { user, session: { access_token: 'demo', token_type: 'bearer', user } }, error: null };
    },
    async signOut() { setSession(null); return { error: null }; },
    async signUp(credentials) {
      const email = String((credentials && credentials.email) || '');
      const meta = (credentials && credentials.options && credentials.options.data) || {};
      if (db.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
        return { data: { user: null, session: null }, error: err('User already registered', 'user_already_exists') };
      }
      const authId = uuid();
      db.profiles.push({
        id: uuid(), user_id: authId,
        first_name: meta.first_name || '', last_name: meta.last_name || '', company: meta.company || null,
        email, phone: meta.phone || '', country: meta.country || '',
        role: 'participant', status: 'pending', language: meta.language || 'en',
        job_title: null, address_line1: meta.address_line1 || null, address_line2: meta.address_line2 || null,
        city: meta.city || null, postal_code: meta.postal_code || null,
        signing_capacity: meta.signing_capacity || null, welcome_seen_at: null,
        created_at: nowIso(), updated_at: nowIso(),
      });
      setSession(authId);
      const user = authUserFor(authId);
      return { data: { user, session: { access_token: 'demo', token_type: 'bearer', user } }, error: null };
    },
    async updateUser(attributes) {
      const p = me();
      if (!p) return { data: { user: null }, error: err('Auth session missing!') };
      if (attributes && attributes.email) p.email = attributes.email;
      return { data: { user: authUserFor(p.user_id) }, error: null };
    },
    // The demo sends no e-mail. The screen still says what it says; nothing arrives.
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  };

  // The demo buttons on the sign-in page. Signs the tab in as a seeded account
  // and opens that account's own page.
  window.demoEnterAs = function (key) {
    const entry = SEED.enterAs[key];
    if (!entry) return;
    const p = db.profiles.find((x) => x.id === entry.profileId);
    if (!p) return;
    setSession(p.user_id);
    window.location.href = entry.page;
  };

  return {
    auth,
    from: (table) => new Query(table),
    rpc: (name, args) => new Rpc(name, args),
  };
})();
