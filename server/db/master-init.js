// Master Control Plane Database Initialization
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { initialSuperAdminCredentials } from '../src/lib/superadmin-bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBaseClient(targetDb = 'postgres') {
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

export async function initMasterDb() {
  console.log('[master-db] Checking master database "nivaas_master"...');
  
  // 1. Connect to default postgres DB to check if nivaas_master exists
  const rootClient = getBaseClient('postgres');
  try {
    await rootClient.connect();
    const checkRes = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = 'nivaas_master'`);
    if (checkRes.rows.length === 0) {
      console.log('[master-db] Creating database "nivaas_master"...');
      await rootClient.query(`CREATE DATABASE nivaas_master`);
    } else {
      console.log('[master-db] Database "nivaas_master" already exists.');
    }
  } catch (err) {
    console.warn('[master-db] Warning during DB creation check:', err.message);
  } finally {
    await rootClient.end().catch(() => {});
  }

  // 2. Connect to nivaas_master and apply master schema
  const masterClient = getBaseClient('nivaas_master');
  try {
    await masterClient.connect();
    const schemaSql = fs.readFileSync(path.join(__dirname, 'master-schema.sql'), 'utf-8');
    await masterClient.query(schemaSql);
    console.log('[master-db] Master schema tables verified & applied.');

    // 4. Seed default Super Admin for admin.nivaas.space
    const legacyAdmin = await masterClient.query(`SELECT id FROM super_admins WHERE lower(email) = 'admin@nivaas.space' LIMIT 1`);
    const anyAdmin = legacyAdmin.rows.length ? legacyAdmin : await masterClient.query(`SELECT id FROM super_admins LIMIT 1`);
    if (legacyAdmin.rows.length || anyAdmin.rows.length === 0) {
      const initialAdmin = initialSuperAdminCredentials();
      const hash = await bcrypt.hash(initialAdmin.password, 10);
      if (legacyAdmin.rows.length) {
        await masterClient.query(
          `UPDATE super_admins SET name = $2, email = $3, password_hash = $4, updated_at = now() WHERE id = $1`,
          [legacyAdmin.rows[0].id, initialAdmin.name, initialAdmin.email, hash]
        );
        console.log(`[master-db] Replaced the legacy bootstrap Super Admin with ${initialAdmin.email}. Remove SUPERADMIN_INITIAL_PASSWORD from the environment now.`);
      } else {
        await masterClient.query(
          `INSERT INTO super_admins (name, email, password_hash, role)
           VALUES ($1, $2, $3, $4)`,
          [initialAdmin.name, initialAdmin.email, hash, 'superadmin']
        );
        console.log(`[master-db] Created initial Super Admin (${initialAdmin.email}). Remove SUPERADMIN_INITIAL_PASSWORD from the environment now.`);
      }
    }

    // 5. Seed default Indian SaaS Plans (Starter, Professional, Business, Enterprise)
    const allFeatures = {
      manager_role: true,
      site_survey: true,
      quotation_invoice: true,
      reports_analytics: true,
      csv_import_export: true,
      bulk_reassign: true,
      advanced_bi: true,
      activity_audit_logs: true,
      push_notifications: true,
      android_app: true,
      multi_branch: true,
      priority_support: true,
    };

    const plans = [
      {
        id: 'starter',
        name: 'Starter Tier',
        tier_subtitle: 'Monthly Recurring Subscription',
        price: 2999,
        duration_text: '/month',
        duration_days: 30,
        user_limit: '5 Users',
        leads_limit: '500 Leads/mo',
        popular: false,
        features: allFeatures,
      },
      {
        id: 'professional',
        name: 'Professional Tier',
        tier_subtitle: 'Half-Yearly Growth Commitment',
        price: 24999,
        duration_text: '/6 months',
        duration_days: 180,
        user_limit: '15 Users',
        leads_limit: '2000 Leads/mo',
        popular: false,
        features: allFeatures,
      },
      {
        id: 'business',
        name: 'Business Tier',
        tier_subtitle: 'Annual Enterprise Subscription',
        price: 44999,
        duration_text: '/year',
        duration_days: 365,
        user_limit: '50 Users',
        leads_limit: '10000 Leads/mo',
        popular: true,
        features: allFeatures,
      },
      {
        id: 'enterprise',
        name: 'Enterprise Tier',
        tier_subtitle: 'Founder Lifetime Access',
        price: 99999,
        duration_text: 'One-Time',
        duration_days: 3650,
        user_limit: 'Unlimited Users',
        leads_limit: 'Unlimited Leads/mo',
        popular: false,
        features: allFeatures,
      },
    ];

    for (const p of plans) {
      await masterClient.query(
        `INSERT INTO subscription_plans (id, name, tier_subtitle, price, duration_text, duration_days, user_limit, leads_limit, popular, features)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           tier_subtitle = EXCLUDED.tier_subtitle,
           price = EXCLUDED.price,
           duration_text = EXCLUDED.duration_text,
           duration_days = EXCLUDED.duration_days,
           user_limit = EXCLUDED.user_limit,
           leads_limit = EXCLUDED.leads_limit,
           popular = EXCLUDED.popular,
           features = EXCLUDED.features,
           updated_at = NOW()`,
        [p.id, p.name, p.tier_subtitle, p.price, p.duration_text, p.duration_days, p.user_limit, p.leads_limit, p.popular, JSON.stringify(p.features)]
      );
    }
    console.log('[master-db] Seeded & synced all 4 subscription plans with full features enabled.');

    // 6. Seed default Platform Settings (UPI VPA, Bank Details)
    const existingSettings = await masterClient.query(`SELECT 1 FROM platform_settings WHERE key = 'bank_upi'`);
    if (existingSettings.rows.length === 0) {
      await masterClient.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1, $2)`,
        [
          'bank_upi',
          JSON.stringify({
            upi_id: '',
            bank_name: '',
            account_name: '',
            account_number: '',
            ifsc_code: '',
            support_phone: '',
            support_email: '',
            payment_details_verified: false,
          })
        ]
      );
      console.log('[master-db] Seeded initial platform settings.');
    }

    console.log('[master-db] Master DB initialization complete.');
  } finally {
    await masterClient.end().catch(() => {});
  }
}

// Allow running directly via `node db/master-init.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initMasterDb().catch(err => {
    console.error('[master-db] Error:', err);
    process.exit(1);
  });
}

