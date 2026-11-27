-- Nivaas — Builder OS · PostgreSQL schema
-- Safe to run more than once (IF NOT EXISTS everywhere).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A builder / developer company. Everything else belongs to one org.
CREATE TABLE IF NOT EXISTS orgs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  logo_url      text,
  phone         text,
  email         text,
  address       text,
  rera_promoter text,
  settings      jsonb NOT NULL DEFAULT '{}',     -- routing, SLA, charges defaults (see src/settings.js)
  bridge_secret text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),  -- LeadSathi → Nivaas webhook secret
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Everyone who logs in. role decides what they see.
--   admin       builder owner / office
--   sales       in-house sales agent (salary + incentive, has an AI twin)
--   broker      channel partner (commission)
--   maintenance after-sales team
--   customer    flat buyer (portal + tickets)
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('admin','sales','broker','maintenance','customer')),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text,
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  -- role-specific details:
  --  sales:  {salary, incentive:{type:'flat'|'percent', value}, target_units, availability:'available'|'busy'|'away',
  --           ai_twin:{mode:'off'|'away'|'always', reply_after_min, signature}}
  --  broker: {firm, rera_agent_no, gstin, commission:{type:'percent'|'flat', value}, city}
  --  maintenance: {skills:[...]}
  profile       jsonb NOT NULL DEFAULT '{}',
  last_login    timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS users_org_role ON users(org_id, role);

CREATE TABLE IF NOT EXISTS projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name           text NOT NULL,
  tagline        text,
  description    text,
  location       text,
  city           text,
  map_url        text,
  rera_no        text,
  status         text NOT NULL DEFAULT 'under_construction' CHECK (status IN ('pre_launch','under_construction','ready')),
  possession     text,                 -- "Dec 2027"
  rate_sqft      numeric NOT NULL DEFAULT 0,   -- base rate on super built-up area
  -- {parking, club, maintenance_deposit, gst_pct, stamp_pct, registration}
  charges        jsonb NOT NULL DEFAULT '{}',
  payment_plan   jsonb NOT NULL DEFAULT '[]',  -- [{milestone, pct}]
  amenities      text[] NOT NULL DEFAULT '{}',
  highlights     text[] NOT NULL DEFAULT '{}',
  cover_url      text,
  brochure_url   text,
  sales_pool     uuid[] NOT NULL DEFAULT '{}', -- users who receive this project's leads (empty = all sales)
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS towers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  floors     int  NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS unit_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,         -- "3 BHK Premium"
  bhk           numeric NOT NULL,
  carpet_sqft   numeric NOT NULL,
  builtup_sqft  numeric NOT NULL,
  super_sqft    numeric NOT NULL,
  bathrooms     int NOT NULL DEFAULT 2,
  balconies     int NOT NULL DEFAULT 1,
  floorplan_url text
);

CREATE TABLE IF NOT EXISTS units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tower_id      uuid REFERENCES towers(id) ON DELETE SET NULL,
  unit_type_id  uuid REFERENCES unit_types(id) ON DELETE SET NULL,
  unit_no       text NOT NULL,         -- "302-F"
  floor         int  NOT NULL,
  facing        text,
  plc_pct       numeric NOT NULL DEFAULT 0,   -- preferential location charge (corner, park facing …)
  price_override numeric,                     -- set to fix a unit's price manually
  status        text NOT NULL DEFAULT 'available' CHECK (status IN ('available','hold','booked','sold','blocked')),
  hold_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  hold_until    timestamptz,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, unit_no)
);
CREATE INDEX IF NOT EXISTS units_project ON units(project_id, status);

-- Photos, videos, floor plans, brochures. url = /uploads/... or an external https link (YouTube etc.)
CREATE TABLE IF NOT EXISTS media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES unit_types(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('image','video','floorplan','brochure','youtube')),
  url          text NOT NULL,
  title        text,
  sort         int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tower_id     text,
  stage_name   text,
  progress_pct int NOT NULL DEFAULT 0,
  next_milestone text,
  next_milestone_date date,
  title        text NOT NULL,
  body         text,
  media_url    text,
  media_urls   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Sales pipeline ----------
CREATE TABLE IF NOT EXISTS leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  name          text,
  phone         text,
  email         text,
  source        text NOT NULL DEFAULT 'manual',   -- leadsathi | share_link | broker | walk_in | manual | whatsapp
  source_ref    text,                             -- LeadSathi conversation id, share token …
  campaign_name text,
  adset_name    text,
  ad_name       text,
  whatsapp_consent text NOT NULL DEFAULT 'unknown',
  whatsapp_consent_updated_at timestamptz,
  stage         text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','visit_scheduled','visit_done','negotiation','booked','lost')),
  temperature   text NOT NULL DEFAULT 'warm' CHECK (temperature IN ('hot','warm','cold')),
  budget        text,
  config_pref   text,                             -- "3 BHK"
  purpose       text,                             -- self use / investment
  timeline      text,
  ai_summary    text,
  notes         text,
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,   -- sales agent or broker
  assigned_at   timestamptz,
  first_touch_at timestamptz,                     -- when the assignee (or their AI twin) first replied
  reassign_count int NOT NULL DEFAULT 0,
  broker_id     uuid REFERENCES users(id) ON DELETE SET NULL,   -- broker who registered / sourced it
  unit_id       uuid REFERENCES units(id) ON DELETE SET NULL,   -- unit they are looking at
  lost_reason   text,
  followup_at   timestamptz,
  followup_type text DEFAULT 'call',
  followup_note text,
  handover_summary jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_org_stage ON leads(org_id, stage);
CREATE INDEX IF NOT EXISTS leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_followup ON leads(org_id, followup_at);
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_phone ON leads(org_id, phone) WHERE phone IS NOT NULL AND stage <> 'lost';

CREATE TABLE IF NOT EXISTS lead_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  kind       text NOT NULL,   -- created | assigned | stage | note | visit | share_view | ai | call | reassigned | followup
  body       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events(lead_id, created_at);

CREATE TABLE IF NOT EXISTS site_visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id        uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  agent_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at   timestamptz,
  status         text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('to_confirm','scheduled','confirmed','done','no_show','cancelled','rescheduled')),
  visitors_count int NOT NULL DEFAULT 1,
  transport      text,
  pickup_address text,
  interested_unit text,
  rating         int,
  feedback       text,
  evidence_passport jsonb DEFAULT '{}'::jsonb,
  source         text NOT NULL DEFAULT 'employee',
  scheduled_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  chat_id        uuid,
  confirmation_note text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One link per (sender, project/unit, optional lead). Public page: /s/:token
CREATE TABLE IF NOT EXISTS share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id     uuid REFERENCES units(id) ON DELETE CASCADE,
  lead_id     uuid REFERENCES leads(id) ON DELETE SET NULL,
  views       int NOT NULL DEFAULT 0,
  last_viewed timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Sales → money ----------
CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  unit_id        uuid NOT NULL REFERENCES units(id),
  lead_id        uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  sold_by        uuid REFERENCES users(id) ON DELETE SET NULL,   -- sales agent
  broker_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  deal_value     numeric NOT NULL,
  discount       numeric NOT NULL DEFAULT 0,
  booking_amount numeric NOT NULL DEFAULT 0,
  booking_date   date NOT NULL DEFAULT current_date,
  status         text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','agreement','registered','possession','cancelled')),
  schedule       jsonb NOT NULL DEFAULT '[]',  -- [{milestone, pct, amount, due}]
  handover_status text NOT NULL DEFAULT 'pending',
  handover_docs  jsonb NOT NULL DEFAULT '{}'::jsonb,
  registry_checklist jsonb NOT NULL DEFAULT '{"pan_verified":false,"aadhar_verified":false,"form_26qb_tds":false,"bank_noc":false,"signatory_assigned":false,"status":"pending"}'::jsonb,
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unit_live ON bookings(unit_id) WHERE status <> 'cancelled';

-- Auditable unit price offers. Discounts can only be booked from an approved quote.
CREATE TABLE IF NOT EXISTS price_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  list_price numeric NOT NULL CHECK (list_price >= 0),
  discount numeric NOT NULL CHECK (discount >= 0),
  proposed_price numeric NOT NULL CHECK (proposed_price >= 0),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','converted','expired')),
  expires_at timestamptz NOT NULL,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount <= list_price),
  CHECK (proposed_price = list_price - discount)
);
CREATE INDEX IF NOT EXISTS price_quotes_org_status ON price_quotes(org_id, status, expires_at);
CREATE INDEX IF NOT EXISTS price_quotes_unit_created ON price_quotes(unit_id, created_at DESC);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_quote_id uuid REFERENCES price_quotes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_price_quote_unique ON bookings(price_quote_id) WHERE price_quote_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('allotment','agreement','payment','noc','identity','registry','other')),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_documents_booking ON booking_documents(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount     numeric NOT NULL,
  paid_on    date NOT NULL DEFAULT current_date,
  mode       text,          -- NEFT / cheque / UPI
  ref        text,
  milestone  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Broker commission and sales incentive, one row per person per booking
CREATE TABLE IF NOT EXISTS commissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('broker_commission','sales_incentive')),
  basis      text,          -- "2% of ₹92,40,000"
  amount     numeric NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','void')),
  paid_on    date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- After-sales ----------
CREATE TABLE IF NOT EXISTS tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  number      serial,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  unit_id     uuid REFERENCES units(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  category    text NOT NULL,   -- seepage | plumbing | electrical | carpentry | paint | lift | other
  title       text NOT NULL,
  description text,
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  sla_due_at  timestamptz NOT NULL,
  resolved_at timestamptz,
  rating      int,
  sla_alerted boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  url        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  internal   boolean NOT NULL DEFAULT false,   -- hidden from the customer
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- WhatsApp: main number + one number per sales agent ----------
CREATE TABLE IF NOT EXISTS wa_numbers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,   -- null = builder main number
  phone_number_id text UNIQUE NOT NULL,
  waba_id         text,
  display         text,
  access_token    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Meta Pages used for Facebook Lead Ads. Access tokens are never returned by the API.
CREATE TABLE IF NOT EXISTS meta_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id)
);

CREATE TABLE IF NOT EXISTS meta_lead_events (
  leadgen_id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id          uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  wa_number_id     uuid REFERENCES wa_numbers(id) ON DELETE SET NULL,
  agent_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  ai_enabled       boolean NOT NULL DEFAULT true,
  last_customer_at timestamptz,
  last_agent_at    timestamptz,
  pending_ai_at    timestamptz,     -- AI twin will answer at this time unless the agent replies first
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, wa_number_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender     text NOT NULL CHECK (sender IN ('customer','ai','agent','system')),
  body       text NOT NULL,
  ext_id     text,
  delivery_status text,
  delivery_error text,
  status_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_ext ON chat_messages(ext_id) WHERE ext_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,   -- null = all admins
  kind       text NOT NULL,
  body       text NOT NULL,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(org_id, user_id, read);
