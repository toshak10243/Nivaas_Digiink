import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAuth } from './lib/auth.js';
import auth from './routes/auth.js';
import core from './routes/core.js';
import projects from './routes/projects.js';
import sales from './routes/sales.js';
import service from './routes/service.js';
import pub from './routes/public.js';
import webhooks from './routes/webhooks.js';
import { startJobs } from './services/jobs.js';
import { runMigrations } from '../db/migrations.js';

const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb', verify: (req, _r, buf) => { req.rawBody = buf; } }));

// uploaded photos / videos (and the bundled sample media)
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: true }));
app.use('/uploads/sample', express.static(path.join(dir, '../uploads/sample'), { maxAge: '7d' }));

app.use('/auth', auth);
app.use('/webhooks', webhooks);
app.use('/', pub);                                   // /p/:token, /bridge/leadsathi/:org
app.use('/api', requireAuth, core, projects, sales, service);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => res.status(err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500)).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${config.maxUploadMb} MB` : err.message }));

// The built React app (client/dist), with path routing for /s/:token and every screen
const dist = path.join(dir, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

await runMigrations().catch(e => console.warn('[migrations]', e.message));
startJobs();
app.listen(config.port, () => {
  console.log(`Nivaas on :${config.port}`);
  console.log(`WhatsApp webhook → ${config.publicUrl}/webhooks/whatsapp (verify token: ${config.meta.verifyToken})`);
});
