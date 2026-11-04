// Finds a PostgreSQL login that works on this computer, creates the "nivaas" database if needed,
// and prints its DATABASE_URL. Used by "Start Nivaas.command". Exit code 1 = no database found.
import pg from 'pg';
import fs from 'node:fs';
const user = process.env.USER || 'postgres';
const tries = [];
try { const m = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(\S+)/m); if (m) tries.push(m[1]); } catch {}
const typed = process.env.PG_TRY_PASSWORD;
if (typed) for (const u of ['postgres', user]) tries.push(`postgres://${encodeURIComponent(u)}:${encodeURIComponent(typed)}@localhost:5432/postgres`);
for (const auth of [`${user}`, 'postgres', 'postgres:postgres', 'postgres:password', 'postgres:admin', 'postgres:root', 'leadsathi:leadsathi', 'nivaas:nivaas'])
  tries.push(`postgres://${auth}@localhost:5432/postgres`);
async function ok(url) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try { await c.connect(); return c; } catch { try { await c.end(); } catch {} return null; }
}
for (const url of tries) {
  const c = await ok(url);
  if (!c) continue;
  const u = new URL(url);
  if (u.pathname !== '/nivaas') {
    const has = await c.query(`SELECT 1 FROM pg_database WHERE datname = 'nivaas'`);
    if (!has.rowCount) { try { await c.query('CREATE DATABASE nivaas'); } catch (e) { await c.end(); continue; } }
    u.pathname = '/nivaas';
  }
  await c.end();
  if (await ok(u.toString()).then(x => x && x.end().then(() => true))) { console.log(u.toString()); process.exit(0); }
}
process.exit(1);
