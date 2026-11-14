import 'dotenv/config';
import path from 'node:path';

const production = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const appSecret = process.env.META_APP_SECRET || '';
const verifyToken = process.env.META_VERIFY_TOKEN || 'nivaas-verify';
const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:4100').replace(/\/$/, '');

if (production) {
  if (jwtSecret.length < 32 || jwtSecret.startsWith('change-me') || jwtSecret === 'dev-secret-change-me') {
    console.warn('[config] Warning: Production should use a unique random JWT_SECRET with at least 32 characters.');
  }
  if (!appSecret || appSecret.length < 32) {
    console.warn('[config] Warning: META_APP_SECRET is not configured or too short. WhatsApp webhook signature verification will fail until configured.');
  }
  if (verifyToken.length < 24 || verifyToken === 'nivaas-verify' || verifyToken === 'nivaas-verify-123') {
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
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 60),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
  meta: {
    appSecret,
    graph: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`,
    verifyToken,
    introTemplate: process.env.WA_INTRO_TEMPLATE || '',
    templateLang: process.env.WA_TEMPLATE_LANG || 'hi',
  },
};
