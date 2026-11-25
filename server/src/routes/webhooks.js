// WhatsApp Cloud API webhook — one URL for the builder's main number and every agent number.
import { Router } from 'express';
import { config } from '../config.js';
import { one } from '../db.js';
import { verifySignature } from '../services/meta.js';
import { inbound } from '../services/twin.js';

const r = Router();

r.use('/whatsapp', (_req, res, next) => config.meta.whatsappWebhookEnabled
  ? next()
  : res.sendStatus(404));

r.get('/whatsapp', (req, res) =>
  req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.meta.verifyToken
    ? res.send(req.query['hub.challenge']) : res.sendStatus(403));

r.post('/whatsapp', async (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    for (const e of req.body.entry || []) for (const ch of e.changes || []) {
      const v = ch.value || {};
      if (!v.messages) continue;
      const num = await one(`SELECT * FROM wa_numbers WHERE phone_number_id = $1`, [v.metadata?.phone_number_id]);
      if (!num) continue;
      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const m of v.messages) {
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || `[${m.type}]`;
        await inbound(num, { from: m.from, name: names[m.from], text, extId: m.id });
      }
    }
  } catch (err) { console.error('[whatsapp]', err); }
});

export default r;
