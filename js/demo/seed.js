// DEMO SEED - fictional data for the demo build only (scripts/build-demo.js).
//
// Every name, company, address, phone number and e-mail address here is
// invented. E-mail addresses use the example.com domain reserved for
// documentation. Phone numbers are in the UK 07700 900xxx range, which is
// reserved for drama and is not allocated to anyone. Nothing here refers to a
// real company or a real person.
//
// Dates are written relative to the moment the page loads, so the demo never
// looks stale. Every page load starts again from this seed: edits made in the
// demo live in memory only and are gone on reload.
//
// The Operator is always called "the Operator" (owner's rule, 2026-10-29), so
// the Operator account is named that way and nothing else.

(function () {
  'use strict';

  const DAY = 86400000;
  const NOW = Date.now();
  const ago = (days, hours) => new Date(NOW - days * DAY - (hours || 0) * 3600000).toISOString();
  const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  const IDS = {
    memberA: uid(1), memberB: uid(2), operator: uid(3),
    authA: uid(101), authB: uid(102), authOperator: uid(103),
  };

  // ------------------------------------------------------------ accounts ----
  const profiles = [
    {
      id: IDS.memberA, user_id: IDS.authA,
      first_name: 'Alex', last_name: 'Morgan', company: 'Harbour Ridge Trading Ltd',
      email: 'member.a@example.com', phone: '+44 7700 900101', country: 'United Kingdom',
      role: 'participant', status: 'approved', language: 'en',
      job_title: 'Head of Trading', address_line1: '1 Example Quay', address_line2: null,
      city: 'Exampleton', postal_code: 'EX1 1AA', signing_capacity: 'company',
      welcome_seen_at: ago(30), created_at: ago(60), updated_at: ago(2),
    },
    {
      id: IDS.memberB, user_id: IDS.authB,
      first_name: 'Sam', last_name: 'Okafor', company: 'Northvale Commodities (Pty) Ltd',
      email: 'member.b@example.com', phone: '+44 7700 900102', country: 'South Africa',
      role: 'participant', status: 'approved', language: 'en',
      job_title: null, address_line1: '22 Sample Road', address_line2: null,
      city: 'Demoville', postal_code: '0001', signing_capacity: 'individual',
      welcome_seen_at: ago(25), created_at: ago(55), updated_at: ago(4),
    },
    {
      id: IDS.operator, user_id: IDS.authOperator,
      first_name: 'The', last_name: 'Operator', company: null,
      email: 'operator@example.com', phone: '+44 7700 900103', country: 'Netherlands',
      role: 'operator', status: 'approved', language: 'en',
      job_title: null, address_line1: null, address_line2: null,
      city: null, postal_code: null, signing_capacity: null,
      welcome_seen_at: ago(90), created_at: ago(90), updated_at: ago(1),
    },
  ];

  // Who the three demo buttons sign in as.
  const enterAs = {
    'member-a': { profileId: IDS.memberA, page: 'app.html' },
    'member-b': { profileId: IDS.memberB, page: 'app.html' },
    'operator': { profileId: IDS.operator, page: 'operator.html' },
  };

  // -------------------------------------------------------------- listings --
  // Owner A posts odd numbers, owner B even ones. origin is used for sell
  // listings and destination for buy listings, as the real form does.
  const L = (n, o) => Object.assign({
    id: uid(1000 + n), user_id: n % 2 ? IDS.memberA : IDS.memberB,
    reference_number: null, type: 'sell', commodity: '', quantity: null, unit: 'Metric tons',
    specification: null, incoterm: 'CIF', origin: null, destination: null,
    price_conditions: null, price_unit: 'Metric tons', currency: 'USD', notes: null,
    status: 'available', poster_role: 'principal', principal_kind: 'producer',
    has_mandate: null, mandate_date: null, broker_via: null,
    docs_seen: 'yes', docs_showable: 'yes', truth_confirmed: true, truth_confirmed_at: ago(n),
    last_reminder_at: null, created_at: ago(n * 1.5), updated_at: ago(n),
  }, o);

  const listings = [
    L(1, { type: 'sell', commodity: 'Copper Cathodes — Grade A', quantity: 500, origin: 'South Africa',
      specification: 'LME Grade A, minimum 99.99% copper', price_conditions: 'LME cash settlement plus premium' }),
    L(2, { type: 'buy', commodity: 'Copper Cathodes — Grade A', quantity: 300, incoterm: 'CIF', destination: 'Netherlands',
      specification: 'LME Grade A', price_conditions: 'LME cash settlement plus premium', poster_role: 'broker',
      principal_kind: null, has_mandate: true, mandate_date: '2026-09-01', broker_via: 'Mandate from the buyer' }),
    L(3, { type: 'sell', commodity: 'Wheat', quantity: 5000, incoterm: 'FOB', origin: 'Romania',
      specification: 'Milling wheat, 12.5% protein, Hagberg 250 minimum', price_conditions: 'Fixed price per ton',
      poster_role: 'mandated', principal_kind: null, has_mandate: true, mandate_date: '2026-10-02',
      status: 'under_review', docs_seen: 'source_says', docs_showable: 'no' }),
    L(4, { type: 'buy', commodity: 'Wheat', quantity: 2000, incoterm: 'CFR', destination: 'Egypt',
      specification: 'Feed or milling grade', price_conditions: 'Fixed price per ton',
      poster_role: 'principal', principal_kind: 'trader', docs_seen: 'no', docs_showable: 'no' }),
    L(5, { type: 'sell', commodity: 'Urea', quantity: 1000, incoterm: 'FOB', origin: 'Nigeria',
      specification: 'Granular, 46% nitrogen, bulk', price_conditions: 'Netback basis',
      status: 'negotiation' }),
    L(6, { type: 'sell', commodity: 'EN590 Diesel', quantity: 3000, incoterm: 'CIF', origin: 'Greece',
      specification: 'EN590, sulphur maximum 10 ppm', price_conditions: 'Platts average plus fixed premium',
      poster_role: 'broker', principal_kind: null, has_mandate: false, broker_via: 'Introduced by a shipping agent',
      docs_seen: 'yes', docs_showable: 'no' }),
    L(7, { type: 'buy', commodity: 'LNG', quantity: 40000, incoterm: 'DAP', destination: 'Italy',
      specification: 'Pipeline-quality LNG', price_conditions: 'Index-linked', poster_role: 'principal',
      principal_kind: 'trader', docs_seen: 'no' }),
    L(8, { type: 'sell', commodity: 'Aluminum Ingots — A7/A8', quantity: 250, incoterm: 'CIF', origin: 'Oman',
      specification: 'A7E, 99.7% aluminium', price_conditions: 'LME cash settlement plus premium' }),
    L(9, { type: 'sell', commodity: 'Thermal Coal', quantity: 20000, incoterm: 'FOB', origin: 'Colombia',
      specification: '6000 kcal/kg NAR, sulphur maximum 0.6%', price_conditions: 'Fixed price per ton',
      status: 'closed', poster_role: 'principal', principal_kind: 'producer' }),
    L(10, { type: 'buy', commodity: 'Sugar', quantity: 1000, incoterm: 'CFR', destination: 'Kenya',
      specification: 'White, ICUMSA 45', price_conditions: 'Fixed price per ton', poster_role: 'principal',
      principal_kind: 'trader', docs_seen: 'no', docs_showable: 'no' }),
    L(11, { type: 'sell', commodity: 'Soybeans', quantity: 2000, incoterm: 'CIF', origin: 'Brazil',
      specification: 'Non-GMO, 13% moisture maximum', price_conditions: 'Fixed price per ton',
      status: 'under_review', poster_role: 'broker', principal_kind: null, has_mandate: true,
      mandate_date: '2026-10-20', broker_via: 'Mandate from the producer', docs_seen: 'source_says' }),
    L(12, { type: 'sell', commodity: 'Iron Ore', quantity: 50000, incoterm: 'CFR', origin: 'Australia',
      specification: '62% Fe fines', price_conditions: 'Index-linked', price_unit: 'Dry Metric Ton Units (DMTU)',
      poster_role: 'principal', principal_kind: 'producer' }),
  ];

  const REF_PREFIX = { sell: 'SELL', buy: 'BUY' };
  const counters = { 'SELL-26': 0, 'BUY-26': 0 };
  listings.forEach((l) => {
    const key = REF_PREFIX[l.type] + '-26';
    counters[key] += 1;
    l.reference_number = `${key}-${String(counters[key]).padStart(3, '0')}`;
  });
  const reference_counters = Object.entries(counters).map(([key, last_value]) => ({ key, last_value }));

  // Which document types each listing has ticked. Anything not listed is unticked.
  const checklistTicks = {
    1: ['Certificate of Analysis (COA)', 'Certificate of Origin', 'Warehouse Receipt, where applicable'],
    3: ['Certificate of Origin', 'Packing List, where applicable'],
    6: ['Certificate of Analysis (COA)', 'Bill of Lading / Shipping Documentation, where applicable'],
    9: ['Certificate of Analysis (COA)', 'Certificate of Origin', 'Packing List, where applicable'],
  };
  const document_checklist = [];
  listings.forEach((l, i) => {
    const n = i + 1;
    const ticked = checklistTicks[n] || [];
    ['Certificate of Analysis (COA)', 'Certificate of Origin', 'Packing List, where applicable'].forEach((doc, j) => {
      document_checklist.push({
        id: uid(2000 + n * 10 + j), listing_id: l.id, doc_type: doc,
        indicated: ticked.indexOf(doc) !== -1, updated_at: l.updated_at,
      });
    });
  });

  // ------------------------------------------------------ mailbox and deals --
  const messages = [
    { id: uid(3001), sender_id: IDS.memberA, listing_id: listings[1].id, in_reply_to: null, subject: null,
      body: 'Our buyer would like to know whether the CIF Rotterdam quote for the copper cathodes is still open, and what the earliest loading window is.',
      status: 'pending_review', created_at: ago(1, 4), reviewed_at: null },
    { id: uid(3002), sender_id: IDS.memberB, listing_id: listings[2].id, in_reply_to: null, subject: null,
      body: 'Can you confirm the protein and Hagberg figures for the milling wheat? The buyer will ask for the certificate before he comes to the table.',
      status: 'pending_review', created_at: ago(0, 9), reviewed_at: null },
    { id: uid(3003), sender_id: IDS.memberA, listing_id: listings[0].id, in_reply_to: null, subject: null,
      body: 'Happy to share the assay report for the copper cathodes once a buyer is named. Please pass that on.',
      status: 'forwarded', created_at: ago(3), reviewed_at: ago(2) },
  ];
  const message_forward_log = [
    { id: uid(3101), message_id: uid(3003), operator_id: IDS.operator, to_user_id: IDS.memberB, sent_at: ago(2) },
  ];

  const deals = [
    { id: uid(4001), listing_id: listings[0].id, listing_ref: listings[0].reference_number,
      owner_id: IDS.memberA, counterparty_id: IDS.memberB, stage: 'agreed',
      opened_at: ago(6), agreed_at: ago(2), introduced_at: null, closed_at: null,
      docs_match: 'matched', docs_genuine: 'genuine', offer_real: 'real', deal_result: 'open',
      note: 'Assay report received and matched. Waiting for both parties to confirm the loading window.',
      updated_at: ago(2) },
    { id: uid(4002), listing_id: listings[8].id, listing_ref: listings[8].reference_number,
      owner_id: IDS.memberB, counterparty_id: IDS.memberA, stage: 'closed',
      opened_at: ago(40), agreed_at: ago(33), introduced_at: ago(31), closed_at: ago(12),
      docs_match: 'matched', docs_genuine: 'genuine', offer_real: 'real', deal_result: 'closed',
      note: null, updated_at: ago(12) },
  ];
  const deal_history = [
    { id: uid(4101), deal_id: uid(4001), field: 'stage', old_value: 'negotiating', new_value: 'agreed',
      changed_at: ago(2), changed_by: IDS.operator },
    { id: uid(4102), deal_id: uid(4001), field: 'docs_match', old_value: null, new_value: 'matched',
      changed_at: ago(3), changed_by: IDS.operator },
    { id: uid(4103), deal_id: uid(4002), field: 'deal_result', old_value: 'open', new_value: 'closed',
      changed_at: ago(12), changed_by: IDS.operator },
  ];

  const matches = [
    { id: uid(5001), listing_a_id: listings[0].id, listing_b_id: listings[1].id, score: 'high',
      status: 'new', created_at: ago(4), reviewed_at: null },
    { id: uid(5002), listing_a_id: listings[2].id, listing_b_id: listings[3].id, score: 'medium',
      status: 'new', created_at: ago(5), reviewed_at: null },
  ];

  const document_requests = [
    { id: uid(6001), listing_id: listings[2].id, requester_id: IDS.operator, participant_id: IDS.memberB,
      doc_type: 'Certificate of Origin', status: 'requested', requested_at: ago(1), responded_at: null },
  ];

  const invitations = [
    { id: uid(7001), token: 'DEMO-INVITE-0001', email: 'new.member@example.com', created_by: IDS.operator,
      created_at: ago(1), expires_at: new Date(NOW + 4 * DAY).toISOString(), used_at: null, used_by: null },
  ];

  const notifications = [
    { id: uid(8001), user_id: IDS.memberA, type: 'message_forwarded', is_read: false, created_at: ago(2),
      message: 'A message was forwarded to you regarding ' + listings[0].reference_number + '.', related_id: listings[0].id },
    { id: uid(8002), user_id: IDS.memberA, type: 'listing_status', is_read: true, created_at: ago(5),
      message: 'Your listing ' + listings[8].reference_number + ' was marked closed.', related_id: listings[8].id },
    { id: uid(8003), user_id: IDS.memberB, type: 'document_requested', is_read: false, created_at: ago(1),
      message: 'An Operator requested: Certificate of Origin', related_id: listings[2].id },
    { id: uid(8004), user_id: IDS.memberB, type: 'message_reply', is_read: true, created_at: ago(4),
      message: 'The Operator replied to your message.', related_id: null },
  ];

  const saved_searches = [
    { id: uid(9001), user_id: IDS.memberA, commodity: 'Copper Cathodes — Grade A', listing_type: 'sell',
      region: null, listing_status: null, created_at: ago(7) },
  ];

  const activity_log = [
    { id: uid(9101), user_id: IDS.memberA, action: 'login', details: null, created_at: ago(0, 2) },
    { id: uid(9102), user_id: IDS.memberB, action: 'login', details: null, created_at: ago(0, 6) },
    { id: uid(9103), user_id: IDS.operator, action: 'match_reviewed', details: { match_id: uid(5001) }, created_at: ago(4) },
    { id: uid(9104), user_id: IDS.memberA, action: 'listing_created', details: { reference: listings[0].reference_number }, created_at: ago(9) },
  ];

  const commodityNames = [
    'Aluminum Ingots — A7/A8', 'Antimony', 'Chrome Concentrate', 'Chrome Ore', 'Copper Cathodes — Grade A',
    'Copper Concentrate', 'Crude Oil', 'EN590 Diesel', 'Ferrochrome', 'HMS 1&2 Scrap',
    'Hot Briquetted Iron (HBI)', 'Iron Ore', 'Jet A-1', 'Lead Concentrate', 'Lead Ingots', 'LNG',
    'Manganese Concentrate', 'Manganese Ore', 'Petroleum Coke', 'Soybeans', 'Steel Billets', 'Sugar',
    'Thermal Coal', 'Urea', 'Wheat', 'Zinc Concentrate', 'Zinc Ingots',
  ];
  const commodities = commodityNames.map((name, i) => ({
    id: uid(10000 + i), name, sort_order: i + 1, created_by: IDS.operator, created_at: ago(90),
  }));

  // The Terms the members have already signed. The text itself lives in
  // js/i18n.js; these rows only tell the page which version is current.
  const terms_versions = [
    { version: '3.4', language: 'en', text: 'Demo copy. The Terms text is in js/i18n.js.', sha256: 'demo',
      published_at: ago(60) },
    { version: '3.4', language: 'es', text: 'Copia de demostración. El texto de las condiciones está en js/i18n.js.',
      sha256: 'demo', published_at: ago(60) },
  ];

  window.DEMO_SEED = {
    IDS,
    enterAs,
    tables: {
      profiles, listings, document_checklist, document_requests, messages, message_forward_log,
      activity_log, matches, notifications, invitations, commodities, reference_counters,
      saved_searches, deals, deal_history, terms_versions, email_outbox: [],
    },
  };
})();
