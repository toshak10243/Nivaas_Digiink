import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth } from './lib/auth.js';
import auth from './routes/auth.js';
import core from './routes/core.js';
import projects from './routes/projects.js';
import sales from './routes/sales.js';
import service from './routes/service.js';
import pub from './routes/public.js';
import webhooks from './routes/webhooks.js';
import billing from './routes/billing.js';
import superadmin from './routes/superadmin.js';
import privateFiles from './routes/private-files.js';
import { tenantResolver } from './middleware/tenant-resolver.js';
import { subscriptionGuard } from './middleware/subscription-guard.js';
import { startJobs } from './services/jobs.js';
import { ensureDatabaseSchema } from '../db/setup-db.js';
import { runMigrations } from '../db/migrations.js';

const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));
app.set('trust proxy', 1);
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
app.use(express.json({ limit: '2mb', verify: (req, _r, buf) => { req.rawBody = buf; } }));

// Resolve tenant context before routes that read or write tenant data.
app.use(tenantResolver);

// uploaded photos / videos (and the bundled sample media)
const uploadHeaders = (res, _filePath) => {
  // Uploaded files are user supplied, so even if one slips through validation
  // it must not execute as a same-origin document.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
};
app.use('/uploads/private', (_req, res) => res.sendStatus(404));
app.use('/private-files', privateFiles);
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: true, setHeaders: uploadHeaders }));
app.use('/uploads/sample', express.static(path.join(dir, '../uploads/sample'), { maxAge: '7d', setHeaders: uploadHeaders }));

app.use('/auth', auth);
app.use('/webhooks', webhooks);
app.use('/', pub);
app.use('/api/superadmin', superadmin);
app.use('/api/billing', requireAuth, billing);
app.use('/api', requireAuth, subscriptionGuard, core, projects, sales, service);
app.get('/health/live', (_req, res) => res.json({ ok: true }));
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'ready' });
  } catch (err) {
    console.error('[health] database readiness check failed:', err.message);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});
app.get('/health', (_req, res) => res.redirect(307, '/health/ready'));
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? `File is larger than ${config.maxUploadMb} MB`
    : status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;
  if (status >= 500) console.error(`[error] request=${req.requestId} ${err.stack || err.message}`);
  res.status(status).json({ error: message, requestId: req.requestId });
});

// The built React app (client/dist), with path routing for /s/:token and every screen
const dist = path.join(dir, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

try {
  await ensureDatabaseSchema();
  await runMigrations();
  console.log('Database migrations applied.');
} catch (err) {
  console.error(`[startup] Database initialization or migrations failed. API was not started: ${err.message}`);
  process.exit(1);
}

const stopJobs = startJobs();
const server = app.listen(config.port, () => {
  console.log(`Nivaas on :${config.port}`);
  console.log(`WhatsApp webhook: ${config.publicUrl}/webhooks/whatsapp`);
});

let shuttingDown = false;
async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}: stopping HTTP server and background jobs`);
  stopJobs();
  const forceTimer = setTimeout(() => {
    console.error('[shutdown] HTTP close timed out; forcing exit');
    process.exit(1);
  }, 10000);
  forceTimer.unref();
  server.close(async (err) => {
    if (err) console.error('[shutdown] HTTP close failed:', err.message);
    try { await pool.end(); } catch (poolErr) { console.error('[shutdown] database pool close failed:', poolErr.message); exitCode = 1; }
    clearTimeout(forceTimer);
    process.exit(err ? 1 : exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err.stack || err.message);
  shutdown('uncaughtException', 1);
});
