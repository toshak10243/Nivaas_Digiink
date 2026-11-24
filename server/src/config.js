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

if (production) {
  if (!databaseUrl) throw new Error('[config] DATABASE_URL is required in production.');
  if (jwtSecret.length < 32 || jwtSecret === 'change-me-to-a-long-random-string' || jwtSecret === 'dev-secret-change-me') {
    console.warn('[config] Warning: Production should use a unique random JWT_SECRET with at least 32 characters.');
  }
  if (!appSecret || appSecret.length < 32) {
    console.warn('[config] Warning: META_APP_SECRET is not configured or too short. WhatsApp webhook signature verification will fail until configured.');
  }
  if (verifyToken.length < 24 || ['nivaas-verify', 'nivaas-verify-123'].includes(verifyToken)) {
    console.warn('[config] Warning: META_VERIFY_TOKEN is using a default development token.');
  }
  if (!publicUrl.startsWith('https://')) {
    console.warn('[config] Warning: PUBLIC_URL should use HTTPS in production.');
  }
}

export const config = {
  port: Number(process.env.PORT || 4100),
  publicUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRY || '30d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRY || '30d',
  databaseUrl,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 60),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
  baseDomain: process.env.BASE_DOMAIN || 'nivaas.space',
  smtp: {
    host: process.env.SMTP_HOST || process.env.MAIL_HOST || '',
    port: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || process.env.MAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.MAIL_PASS || '',
    from: process.env.SMTP_FROM || process.env.MAIL_FROM || 'Nivaas Real Estate OS <hostingdigiink@gmail.com>',
  },
  meta: {
    appSecret,
    graph: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`,
    verifyToken,
    introTemplate: process.env.WA_INTRO_TEMPLATE || '',
    templateLang: process.env.WA_TEMPLATE_LANG || 'hi',
  },
};
