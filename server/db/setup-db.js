import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function ensureDatabaseSchema(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl) throw new Error('DATABASE_URL is required to initialize the Nivaas database.');
  const u = new URL(rawUrl);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, '') || 'nivaas');
  u.pathname = '/postgres';
  const adminClient = new pg.Client({ connectionString: u.toString() });

  console.log(`Checking database "${dbName}"...`);
  try {
    await adminClient.connect();
    const check = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (check.rows.length === 0) {
      console.log(`Database "${dbName}" not found. Creating it now...`);
      await adminClient.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
      console.log(`Database "${dbName}" created successfully.`);
    } else {
      console.log(`Database "${dbName}" exists.`);
    }
  } catch (err) {
    throw new Error(`Could not connect to PostgreSQL or ensure database "${dbName}": ${err.message}`, { cause: err });
  } finally {
    await adminClient.end().catch(() => {});
  }

  console.log(`Connecting to "${dbName}" to initialize tables...`);
  const targetClient = new pg.Client({ connectionString: rawUrl });
  try {
    await targetClient.connect();
    const schemaSql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
    await targetClient.query(schemaSql);
    console.log('Tables and schema initialized successfully.');
  } catch (err) {
    throw new Error(`Could not initialize schema in "${dbName}": ${err.message}`, { cause: err });
  } finally {
    await targetClient.end().catch(() => {});
  }
}
