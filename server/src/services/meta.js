// WhatsApp Cloud API (one WABA, many numbers: main + one per sales agent)
import crypto from 'node:crypto';
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
  if (!config.meta.appSecret) return true;
  if (!header) return false;
  const exp = 'sha256=' + crypto.createHmac('sha256', config.meta.appSecret).update(raw).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const sendText = (num, to, text) =>
  graph(`/${num.phone_number_id}/messages`, num.access_token, { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });

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
