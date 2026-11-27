// WhatsApp Cloud API (one WABA, many numbers: main + one per sales agent)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const templateCache = new Map();

async function graph(path, token, body) {
  const res = await fetch(config.meta.graph + path, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data?.error?.message || `WhatsApp ${res.status}`);
  return data;
}

async function graphGet(url, token) {
  const target = new URL(url, config.meta.graph + '/');
  if (target.hostname !== 'graph.facebook.com' || !target.pathname.startsWith(new URL(config.meta.graph).pathname)) {
    throw new Error('Meta returned an unexpected template pagination URL');
  }
  const res = await fetch(target, { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data?.error?.message || `WhatsApp ${res.status}`);
  return data;
}

export async function listTemplates(num) {
  if (!num?.waba_id) throw new Error('Add the WhatsApp Business Account ID in Settings before loading templates.');
  const cacheKey = `${num.waba_id}:${num.phone_number_id}`;
  const cached = templateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.templates;
  const first = new URL(`${config.meta.graph}/${encodeURIComponent(num.waba_id)}/message_templates`);
  first.searchParams.set('fields', 'id,name,status,category,language,components,quality_score');
  first.searchParams.set('limit', '100');
  const templates = [];
  let next = first.toString();
  for (let page = 0; next && page < 5; page += 1) {
    const data = await graphGet(next, num.access_token);
    templates.push(...(data.data || []));
    next = data.paging?.next || '';
  }
  templateCache.set(cacheKey, { templates, expiresAt: Date.now() + 60_000 });
  return templates;
}

export function verifySignature(raw, header) {
  if (!config.meta.appSecret || !raw) return false;
  if (!header) return false;
  const exp = 'sha256=' + crypto.createHmac('sha256', config.meta.appSecret).update(raw).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const sendText = (num, to, text) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });

/** Send a photo. Relative /uploads URLs are uploaded to WhatsApp first, so localhost
 * development URLs work too and Meta does not need to fetch from the CRM server. */
export async function sendImage(num, to, url, caption = '') {
  let image = {};
  if (/^https:\/\//i.test(url)) {
    image.link = url;
  } else {
    const match = String(url || '').match(/^\/?uploads\/(.+)$/i);
    if (!match) throw new Error('Photo URL must be an HTTPS link or a CRM upload.');
    const filename = path.resolve(config.uploadDir, match[1]);
    const root = path.resolve(config.uploadDir) + path.sep;
    if (!filename.startsWith(root)) throw new Error('Invalid photo path.');
    const bytes = await fs.readFile(filename);
    const extension = path.extname(filename).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : ['.jpg', '.jpeg'].includes(extension) ? 'image/jpeg' : null;
    if (!mime) throw new Error('WhatsApp photos must be JPG or PNG. Convert this file before sending.');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([bytes], { type: mime }), path.basename(filename));
    const res = await fetch(`${config.meta.graph}/${num.phone_number_id}/media`, {
      method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${num.access_token}` }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.id) throw new Error(data?.error?.message || `WhatsApp media upload ${res.status}`);
    image.id = data.id;
  }
  return graph(`/${num.phone_number_id}/messages`, num.access_token, {
    messaging_product: 'whatsapp', to, type: 'image', image: { ...image, ...(caption ? { caption } : {}) },
  });
}

/** Send a video using an HTTPS source link or upload a CRM MP4 to WhatsApp first. */
export async function sendVideo(num, to, url, caption = '') {
  let video = {};
  if (/^https:\/\//i.test(url)) {
    video.link = url;
  } else {
    const match = String(url || '').match(/^\/?uploads\/(.+)$/i);
    if (!match) throw new Error('Video URL must be an HTTPS link or a CRM upload.');
    const filename = path.resolve(config.uploadDir, match[1]);
    const root = path.resolve(config.uploadDir) + path.sep;
    if (!filename.startsWith(root)) throw new Error('Invalid video path.');
    if (path.extname(filename).toLowerCase() !== '.mp4') throw new Error('WhatsApp videos must be MP4 files.');
    const bytes = await fs.readFile(filename);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'video/mp4');
    form.append('file', new Blob([bytes], { type: 'video/mp4' }), path.basename(filename));
    const res = await fetch(`${config.meta.graph}/${num.phone_number_id}/media`, {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${num.access_token}` }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.id) throw new Error(data?.error?.message || `WhatsApp video upload ${res.status}`);
    video.id = data.id;
  }
  return graph(`/${num.phone_number_id}/messages`, num.access_token, {
    messaging_product: 'whatsapp', to, type: 'video', video: { ...video, ...(caption ? { caption } : {}) },
  });
}

/** First message to someone who has not written to this number in 24 h must be an approved template. */
export const sendTemplate = (num, to, params = []) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name: config.meta.introTemplate, language: { code: config.meta.templateLang },
      components: params.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t) })) }] : [],
    },
  });

export const sendApprovedTemplate = (num, to, name, language, params = []) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name, language: { code: language },
      components: params.length ? [{ type: 'body', parameters: params.map(value => ({ type: 'text', text: String(value) })) }] : [],
    },
  });

export const markRead = (num, id) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, { messaging_product: 'whatsapp', status: 'read', message_id: id }).catch(() => {});

export const normPhone = p => (p || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^(\d{10})$/, '91$1');
