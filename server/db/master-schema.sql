-- Nivaas Multi-Tenant SaaS Master Database Schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Catalog of all tenant builders (each has their own isolated PostgreSQL database)
CREATE TABLE IF NOT EXISTS tenants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,       -- subdomain prefix: e.g. 'apex' for apex.nivaas.space
  db_name             text NOT NULL UNIQUE,       -- PostgreSQL database name: e.g. 'nivaas_apex'
  custom_domain       text UNIQUE,                -- optional custom domain: e.g. 'crm.apexbuilders.com'
  admin_email         text NOT NULL,              -- primary builder owner email
  admin_name          text NOT NULL,              -- primary builder owner name
  phone               text,
  plan_type           text NOT NULL DEFAULT 'trial' CHECK (plan_type IN ('trial', 'monthly', 'half_yearly', 'yearly', 'lifetime', 'starter', 'professional', 'business', 'enterprise')),
  subscription_status text NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'expired', 'pending_verification', 'suspended')),
  trial_ends_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  subscription_ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Super Admins of the SaaS platform (access to admin.nivaas.space)
CREATE TABLE IF NOT EXISTS super_admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'superadmin',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Payment proofs & renewal requests submitted by tenants
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_type         text NOT NULL CHECK (plan_type IN ('trial', 'monthly', 'half_yearly', 'yearly', 'lifetime', 'starter', 'professional', 'business', 'enterprise')),
  amount            numeric(12, 2) NOT NULL,
  duration_days     int NOT NULL,
  payment_mode      text NOT NULL DEFAULT 'upi',   -- 'upi', 'neft', 'imps', 'card'
  utr_number        text,
  screenshot_url    text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  text,
  reviewed_by       uuid REFERENCES super_admins(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON subscription_payments(status);

-- Subscription Tiers (Editable from Super Admin Console)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  tier_subtitle text NOT NULL DEFAULT 'Monthly Recurring Subscription',
  price         numeric(10, 2) NOT NULL,
  duration_text text NOT NULL DEFAULT '/month',
  duration_days int NOT NULL DEFAULT 30,
  user_limit    text NOT NULL DEFAULT '5 Users',
  leads_limit   text NOT NULL DEFAULT '500 Leads/mo',
  popular       boolean NOT NULL DEFAULT false,
  features      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Master Platform Settings (UPI VPA, Bank Details, Support)
CREATE TABLE IF NOT EXISTS platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);


