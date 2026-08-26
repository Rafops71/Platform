-- ============================================================================
-- Jericho Platform — Database Schema
-- Run this FIRST in the Supabase SQL Editor, then run rls_policies.sql.
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROFILES
-- One row per registered user. id is the app-level primary key; user_id is the
-- Supabase Auth user this profile belongs to (matches spec's suggested columns).
-- role/status default to the only values a self-registration is allowed to
-- produce ('participant' / 'pending'); escalation is blocked by a trigger below
-- and by RLS, not just by this default.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  company     text,
  email       text not null,
  phone       text not null,
  country     text not null,
  role        text not null default 'participant' check (role in ('participant','operator')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INVITATIONS
-- Direct table reads are Operator-only (see RLS). Participants/anon never
-- query this table directly — they go through get_invitation_by_token(),
-- which returns at most one exact-match row.
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  email       text,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '5 days'),
  used_at     timestamptz,
  used_by     uuid references public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- COMMODITIES
-- Operator-managed list. "Other" free-text fallback is handled in the app —
-- listings.commodity is a plain text column, not an FK, so free text is
-- always valid; the app UI just prefers to offer this list first.
-- ----------------------------------------------------------------------------
create table if not exists public.commodities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer,   -- controls dropdown order; see sql/seed_commodities.sql
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- REFERENCE COUNTERS
-- Backs next_reference(); one row per "TYPE-YY" key, incremented atomically.
-- ----------------------------------------------------------------------------
create table if not exists public.reference_counters (
  key         text primary key,
  last_value  integer not null default 0
);

-- ----------------------------------------------------------------------------
-- LISTINGS
-- user_id is the ONLY link back to the creator. It is never exposed to other
-- participants — see get_public_listings() in rls_policies.sql, which is the
-- sole read path for participants viewing listings that are not their own.
-- ----------------------------------------------------------------------------
create table if not exists public.listings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id),
  type               text not null check (type in ('sell','buy')),
  commodity          text not null,
  quantity           numeric,
  unit               text,
  specification      text,
  incoterm           text not null check (incoterm in
                        ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP')),
  origin             text,       -- used when type = 'sell'
  destination        text,       -- used when type = 'buy'
  price_conditions   text,
  -- Unit the price is quoted per (from UNITS in js/utils.js). Independent of
  -- `unit` above: ore is quantified in metric tons but priced per DMTU.
  price_unit         text,
  currency           text check (currency in ('USD','EUR','GBP','ZAR')),
  notes              text,
  status             text not null default 'available' check (status in
                        ('available','under_review','negotiation','closed','archived')),
  reference_number   text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_reminder_at   timestamptz
);

-- ----------------------------------------------------------------------------
-- DOCUMENT CHECKLIST
-- One row per (listing, doc_type). "indicated" = participant ticked it.
-- Anonymous participants only ever see an aggregate yes/no via
-- get_public_listings(); the per-type breakdown is Operator + owner only.
-- ----------------------------------------------------------------------------
create table if not exists public.document_checklist (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  -- Two fixed categories; see DOCUMENT_GROUPS in js/utils.js. Kept in step
  -- with sql/006_checklist_and_price_unit.sql, which migrates existing
  -- databases to this same vocabulary.
  doc_type     text not null check (doc_type in (
                 -- A) Material / Product Documentation
                 'Certificate of Analysis (COA)','Assay Report',
                 'Certificate of Origin','Photos','Videos',
                 'Warehouse Receipt, where applicable',
                 'Bill of Lading / Shipping Documentation, where applicable',
                 'Packing List, where applicable',
                 'Other relevant product/material documentation',
                 -- B) Company / Compliance & Supporting Documentation
                 'Company Registration / Corporate Documents','KYC Documentation',
                 'CIS (Customer Information Sheet)','Other')),
  indicated    boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (listing_id, doc_type)
);

-- ----------------------------------------------------------------------------
-- DOCUMENT REQUESTS
-- Operator asks a participant for a specific document on a listing.
-- ----------------------------------------------------------------------------
create table if not exists public.document_requests (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid references public.listings(id) on delete cascade,
  requester_id   uuid not null references public.profiles(id),  -- operator
  participant_id uuid not null references public.profiles(id),  -- listing owner
  doc_type       text not null,
  status         text not null default 'requested' check (status in
                    ('requested','confirmed','unavailable')),
  requested_at   timestamptz not null default now(),
  responded_at   timestamptz
);

-- ----------------------------------------------------------------------------
-- MESSAGES  (operator-mediated mailbox)
-- Every message — participant→operator, operator→participant forward, or
-- reply — is a row here. Direct participant-to-participant is never possible
-- because RLS (below) never grants a participant SELECT on another
-- participant's messages; only Operators can read across senders.
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id),
  listing_id  uuid references public.listings(id),
  subject     text,
  body        text not null,
  status      text not null default 'pending_review' check (status in
                ('pending_review','forwarded','replied','ignored')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MESSAGE FORWARD LOG
-- Records an Operator's decision to forward a message to its anonymous
-- counterparty, and to whom (Operator-only visibility).
-- ----------------------------------------------------------------------------
create table if not exists public.message_forward_log (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  operator_id   uuid not null references public.profiles(id),
  to_user_id    uuid not null references public.profiles(id),
  sent_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ACTIVITY LOG  (Operator-only visibility)
-- ----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id),
  action      text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MATCHES  (Operator-only visibility)
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  listing_a_id  uuid not null references public.listings(id) on delete cascade,
  listing_b_id  uuid not null references public.listings(id) on delete cascade,
  score         text not null check (score in ('high','medium','low')),
  status        text not null default 'new' check (status in ('new','reviewed','dismissed')),
  created_at    timestamptz not null default now(),
  unique (listing_a_id, listing_b_id)
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- Not listed in the spec's suggested table list (Section 17), but Section 12
-- requires in-platform notifications, which need somewhere to live. Added as
-- the minimum table needed to implement that requirement.
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  message     text not null,
  related_id  uuid,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes for the lookups the app actually does
-- ----------------------------------------------------------------------------
create index if not exists idx_listings_user_id on public.listings(user_id);
create index if not exists idx_listings_status on public.listings(status);
create index if not exists idx_listings_type_commodity on public.listings(type, commodity);
create index if not exists idx_document_checklist_listing on public.document_checklist(listing_id);
create index if not exists idx_document_requests_participant on public.document_requests(participant_id);
create index if not exists idx_messages_sender on public.messages(sender_id);
create index if not exists idx_messages_listing on public.messages(listing_id);
create index if not exists idx_activity_log_user on public.activity_log(user_id);
create index if not exists idx_activity_log_created on public.activity_log(created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read);
create index if not exists idx_invitations_token on public.invitations(token);
