// WhatsApp Cloud API (one WABA, many numbers: main + one per sales agent)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

async function graph(path, token, body) {
  const res = await fetch(config.meta.graph + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data?.error?.message || `WhatsApp ${res.status}`);
  return data;
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
    const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([bytes], { type: mime }), path.basename(filename));
    const res = await fetch(`${config.meta.graph}/${num.phone_number_id}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${num.access_token}` }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.id) throw new Error(data?.error?.message || `WhatsApp media upload ${res.status}`);
    image.id = data.id;
  }
  return graph(`/${num.phone_number_id}/messages`, num.access_token, {
    messaging_product: 'whatsapp', to, type: 'image', image: { ...image, ...(caption ? { caption } : {}) },
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

export const markRead = (num, id) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, { messaging_product: 'whatsapp', status: 'read', message_id: id }).catch(() => {});

export const normPhone = p => (p || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^(\d{10})$/, '91$1');
