import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const dir = path.dirname(fileURLToPath(import.meta.url));
const rawUrl = process.env.DATABASE_URL || 'postgres://postgres:Root%40123@localhost:5432/nivaas';

// Parse DB url to connect to default 'postgres' database first
const u = new URL(rawUrl);
const dbName = u.pathname.replace(/^\//, '') || 'nivaas';
u.pathname = '/postgres';
const adminUrl = u.toString();

console.log(`Checking database "${dbName}"...`);
const adminClient = new pg.Client({ connectionString: adminUrl });

try {
  await adminClient.connect();
  const check = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (check.rows.length === 0) {
    console.log(`Database "${dbName}" not found. Creating it now...`);
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✓ Database "${dbName}" created successfully!`);
  } else {
    console.log(`✓ Database "${dbName}" exists.`);
  }
} catch (err) {
  console.error('Error connecting to PostgreSQL:', err.message);
  process.exit(1);
} finally {
  await adminClient.end();
}

// Now connect to the new database and initialize schema
console.log(`Connecting to "${dbName}" to initialize tables...`);
const targetClient = new pg.Client({ connectionString: rawUrl });
try {
  await targetClient.connect();
  const schemaSql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await targetClient.query(schemaSql);
  console.log('✓ Tables & schema initialized successfully!');
} catch (err) {
  console.error('Error initializing schema:', err.message);
  process.exit(1);
} finally {
  await targetClient.end();
}

