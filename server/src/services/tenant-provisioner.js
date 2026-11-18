// Automated Database-per-Tenant Provisioner
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { masterDb } from '../lib/tenant-db.js';
import { sendTenantWelcomeEmail } from './mailer.js';

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

