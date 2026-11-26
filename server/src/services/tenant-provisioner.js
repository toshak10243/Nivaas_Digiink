// Automated Database-per-Tenant Provisioner
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { masterDb } from '../lib/tenant-db.js';
import { sendTenantWelcomeEmail } from './mailer.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'www', 'mail', 'superadmin', 'billing', 'root',
  'support', 'nivaas', 'static', 'assets', 'public', 'auth', 'webhook',
  'dashboard', 'login', 'signup', 'staging', 'dev', 'test', 'demo',
]);

export function validateSlug(rawSlug) {
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (slug.length < 3 || slug.length > 30) {
    throw new Error('Subdomain must be between 3 and 30 characters long');
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    throw new Error('Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`Subdomain "${slug}" is reserved. Please choose another.`);
  }
  return slug;
}

function getPostgresRootClient(targetDb = 'postgres') {
  const base = config.databaseUrl || 'postgres://postgres:postgres@localhost:5432/nivaas';
  let connStr;
  try {
    const parsed = new URL(base);
    parsed.pathname = '/' + targetDb;
    connStr = parsed.toString();
  } catch {
    connStr = base.replace(/\/[^/?]+(\?.*)?$/, `/${targetDb}$1`);
  }
  return new pg.Client({ connectionString: connStr });
}

export function generateTempPassword() {
  const rand = crypto.randomBytes(4).toString('hex');
  return `Nivaas@${rand}`;
}

export async function ensureTenantSsl(slug) {
  if (process.env.NODE_ENV !== 'production') return;
  try {
    const domain = `${slug}.${config.baseDomain}`;
    // Gather all active subdomains to include in the certbot expand command
    const tenants = await masterDb.manyOrNone(`SELECT slug FROM tenants WHERE subscription_status != 'deleted'`);
    const domainList = ['nivaas.space', 'admin.nivaas.space', 'apex.nivaas.space', 'www.nivaas.space'];
    for (const t of tenants) {
      if (t.slug && !domainList.includes(`${t.slug}.nivaas.space`)) {
        domainList.push(`${t.slug}.nivaas.space`);
      }
    }
    if (slug && !domainList.includes(domain)) {
      domainList.push(domain);
    }
    const dArgs = domainList.map(d => `-d ${d}`).join(' ');
    const cmd = `certbot certonly --webroot -w /var/www/nivaas/client/dist --cert-name nivaas.space --expand ${dArgs} --non-interactive --agree-tos --email admin@nivaas.space && systemctl reload nginx`;
    
    // Run asynchronously without blocking response
    execAsync(cmd).then(() => {
      console.log(`[ssl-provisioner] Successfully expanded SSL certificate for ${domain}`);
    }).catch(err => {
      console.warn(`[ssl-provisioner] SSL expand warning for ${domain}:`, err.message);
    });
  } catch (err) {
    console.warn('[ssl-provisioner] Failed to trigger certbot:', err.message);
  }
}

/**
 * Creates a brand new tenant with an isolated PostgreSQL database,
 * seeds the schema, creates the tenant's admin, records in master catalog,
 * and fires the automated welcome email.
 */
export async function provisionTenant({
  name,
  slug: rawSlug,
  adminEmail,
  adminName,
  phone = '',
  planType = 'trial',
  durationDays = 7,
}) {
  const slug = validateSlug(rawSlug);
  const cleanEmail = String(adminEmail || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanAdminName = String(adminName || cleanName).trim();

  if (!cleanName) throw new Error('Company / builder name is required');
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Valid admin email address is required');
  }

  // 1. Check if slug is already registered in master DB
  const existing = await masterDb.one(
    `SELECT id, slug, admin_email FROM tenants WHERE slug = $1 OR lower(admin_email) = $2`,
    [slug, cleanEmail]
  );
  if (existing) {
    if (existing.slug === slug) throw new Error(`Subdomain "${slug}" is already taken.`);
    throw new Error(`A tenant account with email "${cleanEmail}" already exists.`);
  }

  const dbName = `nivaas_${slug.replace(/[^a-z0-9]/g, '_')}`;
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  console.log(`[provisioner] Provisioning new tenant: "${cleanName}" (${slug}.${config.baseDomain}) -> DB: ${dbName}`);

  // 2. Connect to postgres root and execute CREATE DATABASE
  const rootClient = getPostgresRootClient('postgres');
  try {
    await rootClient.connect();
    // Parameterized identifiers are not supported in CREATE DATABASE, validate sanitized dbName
    if (!/^nivaas_[a-z0-9_]+$/.test(dbName)) throw new Error('Invalid database name generated');
    
    // Check if database already exists
    const dbExists = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (dbExists.rows.length === 0) {
      await rootClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[provisioner] Created physical database "${dbName}"`);
    }
  } finally {
    await rootClient.end().catch(() => {});
  }

  // 3. Connect to the newly created tenant database and apply schema
  const tenantClient = getPostgresRootClient(dbName);
  let tenantOrgId = null;
  let tenantUserId = null;

  try {
    await tenantClient.connect();

    // Read and execute base schema
    const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await tenantClient.query(schemaSql);

    // Apply incremental migrations
    await tenantClient.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_type text DEFAULT 'call';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_note text;
      ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS evidence_passport jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handover_status text DEFAULT 'pending';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handover_docs jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS registry_checklist jsonb DEFAULT '{}'::jsonb;
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
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_summary jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;
    `);

    // Insert root organization in tenant database
    const orgRes = await tenantClient.query(
      `INSERT INTO orgs (name, email, phone) VALUES ($1, $2, $3) RETURNING id`,
      [cleanName, cleanEmail, phone]
    );
    tenantOrgId = orgRes.rows[0].id;

    // Insert primary builder admin in tenant database
    const userRes = await tenantClient.query(
      `INSERT INTO users (org_id, role, name, email, phone, password_hash, must_change_password)
       VALUES ($1, 'admin', $2, $3, $4, $5, true) RETURNING id`,
      [tenantOrgId, cleanAdminName, cleanEmail, phone, passwordHash]
    );
    tenantUserId = userRes.rows[0].id;

    console.log(`[provisioner] Initialized tenant schema, org (${tenantOrgId}), and admin user (${tenantUserId}) in ${dbName}`);
  } finally {
    await tenantClient.end().catch(() => {});
  }

  // 4. Calculate subscription expiry
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + (durationDays || 7) * 24 * 3600 * 1000);
  const subscriptionEndsAt = trialEndsAt;

  // 5. Record tenant in Master Database catalog
  const masterTenant = await masterDb.one(
    `INSERT INTO tenants (
       name, slug, db_name, admin_email, admin_name, phone, plan_type,
       subscription_status, trial_ends_at, subscription_ends_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9) RETURNING *`,
    [cleanName, slug, dbName, cleanEmail, cleanAdminName, phone, planType, trialEndsAt, subscriptionEndsAt]
  );

  // 6. Send automated welcome email with login credentials
  const emailResult = await sendTenantWelcomeEmail({
    email: cleanEmail,
    name: cleanAdminName,
    subdomain: slug,
    tempPassword,
    planType,
    trialEndsAt,
  });

  // 7. Auto-expand SSL cert on production VPS for the new subdomain
  ensureTenantSsl(slug);

  return {
    ok: true,
    tenant: masterTenant,
    subdomain: slug,
    loginUrl: `https://${slug}.${config.baseDomain}`,
    adminEmail: cleanEmail,
    tempPassword,
    emailSent: emailResult?.ok || false,
  };
}

