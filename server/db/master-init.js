// Master Control Plane Database Initialization
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';

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

    // 3. Seed default tenant (existing Shree Ganesh Developers mapped to current 'nivaas' database)
    const existingTenant = await masterClient.query(`SELECT id FROM tenants WHERE slug = 'sgdevelopers'`);
    if (existingTenant.rows.length === 0) {
      await masterClient.query(
        `INSERT INTO tenants (name, slug, db_name, admin_email, admin_name, phone, plan_type, subscription_status, trial_ends_at, subscription_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '365 days', now() + interval '365 days')`,
        [
          'Shree Ganesh Developers',
          'sgdevelopers',
          'nivaas', // Map directly to existing 'nivaas' database
          'admin@sgdevelopers.in',
          'Vikram Khandelwal',
          '9829012345',
          'yearly',
          'active',
        ]
      );
      console.log('[master-db] Seeded initial tenant: Shree Ganesh Developers (slug: sgdevelopers, db: nivaas).');
    }

    // 4. Seed default Super Admin for admin.nivaas.space
    const existingAdmin = await masterClient.query(`SELECT id FROM super_admins WHERE email = 'admin@nivaas.space'`);
    if (existingAdmin.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@123', 10);
      await masterClient.query(
        `INSERT INTO super_admins (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)`,
        ['Super Administrator', 'admin@nivaas.space', hash, 'superadmin']
      );
      console.log('[master-db] Seeded initial Super Admin (admin@nivaas.space / Admin@123).');
    }

    // 5. Seed default Indian SaaS Plans (Starter, Professional, Business, Enterprise)
    const existingPlans = await masterClient.query(`SELECT COUNT(*)::int AS cnt FROM subscription_plans`);
    if ((existingPlans.rows[0]?.cnt || 0) === 0) {
      const plans = [
        {
          id: 'starter',
          name: 'Starter Tier',
          tier_subtitle: 'Monthly Recurring Subscription',
          price: 4999,
          duration_text: '/month',
          duration_days: 30,
          user_limit: '5 Users',
          leads_limit: '500 Leads/mo',
          popular: false,
          features: {
            manager_role: true,
            quotation_invoice: true,
            csv_import_export: true,
            advanced_bi: false,
            push_notifications: false,
            multi_branch: false,
            site_survey: false,
            reports_analytics: false,
            bulk_reassign: false,
            activity_audit_logs: false,
            android_app: false,
            priority_support: false,
          },
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
          features: {
            manager_role: true,
            quotation_invoice: true,
            csv_import_export: true,
            advanced_bi: true,
            push_notifications: true,
            multi_branch: false,
            site_survey: true,
            reports_analytics: true,
            bulk_reassign: false,
            activity_audit_logs: true,
            android_app: false,
            priority_support: false,
          },
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
          features: {
            manager_role: true,
            quotation_invoice: true,
            csv_import_export: true,
            advanced_bi: true,
            push_notifications: true,
            multi_branch: true,
            site_survey: true,
            reports_analytics: true,
            bulk_reassign: true,
            activity_audit_logs: true,
            android_app: true,
            priority_support: true,
          },
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
          features: {
            manager_role: true,
            quotation_invoice: true,
            csv_import_export: true,
            advanced_bi: true,
            push_notifications: true,
            multi_branch: true,
            site_survey: true,
            reports_analytics: true,
            bulk_reassign: true,
            activity_audit_logs: true,
            android_app: true,
            priority_support: true,
          },
        },
      ];

      for (const p of plans) {
        await masterClient.query(
          `INSERT INTO subscription_plans (id, name, tier_subtitle, price, duration_text, duration_days, user_limit, leads_limit, popular, features)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.tier_subtitle, p.price, p.duration_text, p.duration_days, p.user_limit, p.leads_limit, p.popular, JSON.stringify(p.features)]
        );
      }
      console.log('[master-db] Seeded initial 4 subscription plans.');
    }

    // 6. Seed default Platform Settings (UPI VPA, Bank Details)
    const existingSettings = await masterClient.query(`SELECT 1 FROM platform_settings WHERE key = 'bank_upi'`);
    if (existingSettings.rows.length === 0) {
      await masterClient.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1, $2)`,
        [
          'bank_upi',
          JSON.stringify({
            upi_id: 'nivaas@icici',
            bank_name: 'ICICI Bank Ltd',
            account_name: 'Nivaas Real Estate Technologies Pvt Ltd',
            account_number: '50200088991122',
            ifsc_code: 'ICIC0001234',
            support_phone: '+91 98290 12345',
            support_email: 'support@nivaas.space',
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

