import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const production = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const appSecret = process.env.META_APP_SECRET || '';
const verifyToken = process.env.META_VERIFY_TOKEN || 'nivaas-verify';
const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:4100').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL;
const port = Number(process.env.PORT || 4100);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 60);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
const baseDomain = String(process.env.BASE_DOMAIN || 'nivaas.space').trim().toLowerCase();
const webhookSetting = String(process.env.WHATSAPP_WEBHOOK_ENABLED || 'false').trim().toLowerCase();
if (!['true', 'false'].includes(webhookSetting)) {
  throw new Error('[config] WHATSAPP_WEBHOOK_ENABLED must be true or false.');
}
const whatsappWebhookEnabled = webhookSetting === 'true';

if (production) {
  if (!databaseUrl) throw new Error('[config] DATABASE_URL is required in production.');
  let parsedDatabaseUrl;
  try { parsedDatabaseUrl = new URL(databaseUrl); } catch {}
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl?.protocol) || !parsedDatabaseUrl.hostname || parsedDatabaseUrl.pathname.length < 2) {
    throw new Error('[config] DATABASE_URL must be a valid PostgreSQL connection URL with a database name.');
  }
  if (jwtSecret.length < 32 || jwtSecret === 'change-me-to-a-long-random-string' || jwtSecret === 'dev-secret-change-me') {
    throw new Error('[config] Set JWT_SECRET to a unique random value of at least 32 characters before production startup.');
  }
  let parsedPublicUrl;
  try { parsedPublicUrl = new URL(publicUrl); } catch {}
  if (parsedPublicUrl?.protocol !== 'https:' || !parsedPublicUrl.hostname) {
    throw new Error('[config] PUBLIC_URL must be a valid HTTPS URL in production.');
  }
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(baseDomain)) {
    throw new Error('[config] BASE_DOMAIN must be a valid hostname for tenant links and routing.');
  }
  if (whatsappWebhookEnabled) {
    if (appSecret.length < 32) throw new Error('[config] META_APP_SECRET with at least 32 characters is required when WhatsApp webhooks are enabled.');
    if (verifyToken.length < 24 || ['nivaas-verify', 'nivaas-verify-123'].includes(verifyToken)) {
      throw new Error('[config] Set META_VERIFY_TOKEN to a unique value of at least 24 characters when WhatsApp webhooks are enabled.');
    }
  }
}

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('[config] PORT must be an integer from 1 to 65535.');
if (!Number.isFinite(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 1024) throw new Error('[config] MAX_UPLOAD_MB must be between 1 and 1024.');

export const config = {
  port,
  publicUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRY || '30d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRY || '30d',
  databaseUrl,
  uploadDir,
  maxUploadMb,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
  baseDomain,
  smtp: {
    host: process.env.SMTP_HOST || process.env.MAIL_HOST || '',
    port: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || process.env.MAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.MAIL_PASS || '',
    from: process.env.SMTP_FROM || process.env.MAIL_FROM || 'Nivaas Real Estate OS <hostingdigiink@gmail.com>',
  },
  meta: {
    whatsappWebhookEnabled,
    appSecret,
    graph: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`,
    verifyToken,
    introTemplate: process.env.WA_INTRO_TEMPLATE || '',
    templateLang: process.env.WA_TEMPLATE_LANG || 'hi',
  },
};
