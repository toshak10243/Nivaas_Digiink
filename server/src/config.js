import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT || 4100),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4100').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 60),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5' },
  meta: {
    appSecret: process.env.META_APP_SECRET || '',
    graph: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`,
    verifyToken: process.env.META_VERIFY_TOKEN || 'nivaas-verify',
    introTemplate: process.env.WA_INTRO_TEMPLATE || '',
    templateLang: process.env.WA_TEMPLATE_LANG || 'hi',
  },
};
