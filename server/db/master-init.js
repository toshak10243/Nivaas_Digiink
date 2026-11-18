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

