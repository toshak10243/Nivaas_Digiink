// WhatsApp Cloud API webhook — one URL for the builder's main number and every agent number.
import { Router } from 'express';
import { config } from '../config.js';
import { one } from '../db.js';
import { verifySignature } from '../services/meta.js';
import { inbound } from '../services/twin.js';
import { notifyAdminsOnce, logLead } from '../services/notify.js';
import { assignLead } from '../services/routing.js';
import { phone as validPhone } from '../lib/validate.js';

const r = Router();

// Facebook Lead Ads webhook verification (the same app-level verification token as WhatsApp).
r.get('/meta', (req, res) =>
  req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.meta.verifyToken
    ? res.send(req.query['hub.challenge']) : res.sendStatus(403));

async function graphLead(leadgenId, token) {
  const url = new URL(`https://graph.facebook.com/${config.meta.graph.split('/').at(-1)}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set('fields', 'id,created_time,field_data,ad_id,form_id,campaign_id,adset_id');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `Meta lead fetch failed (${response.status})`);
  const fields = Object.fromEntries((data.field_data || []).map(field => [String(field.name || '').toLowerCase(), Array.isArray(field.values) ? field.values[0] : field.values]));
  return { data, fields };
}

async function graphAd(adId, token) {
  if (!adId) return {};
  try {
    const url = new URL(`https://graph.facebook.com/${config.meta.graph.split('/').at(-1)}/${encodeURIComponent(adId)}`);
    url.searchParams.set('fields', 'name,adset{name,campaign{name}}');
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) return {};
    return { ad_name: data.name || null, adset_name: data.adset?.name || null, campaign_name: data.adset?.campaign?.name || null };
  } catch { return {}; }
}

async function receiveLeadAd(pageId, leadgenId) {
  const page = await one(`SELECT * FROM meta_pages WHERE page_id=$1`, [String(pageId)]);
  if (!page) return;
  const { data, fields } = await graphLead(leadgenId, page.access_token);
  const ad = await graphAd(data.ad_id, page.access_token);
  const campaignName = ad.campaign_name || (data.campaign_id ? `Campaign ${data.campaign_id}` : null);
  const adsetName = ad.adset_name || (data.adset_id ? `Ad set ${data.adset_id}` : null);
  const adName = ad.ad_name || (data.ad_id ? `Ad ${data.ad_id}` : null);
  let phone = null;
  const rawPhone = fields.phone_number || fields.phone || fields.mobile_number || fields.mobile;
  if (rawPhone) {
    try { phone = validPhone(String(rawPhone), 'Phone', { optional: false }).replace(/\D/g, '').replace(/^0+/, ''); } catch {}
    if (phone && /^\d{10}$/.test(phone)) phone = `91${phone}`;
    if (phone && (phone.length < 10 || phone.length > 15)) phone = null;
  }
  if (!phone) {
    await notifyAdminsOnce(page.org_id, 'integration_error', `Meta Lead Ad ${leadgenId} did not include a valid phone number; it needs manual review.`, '/leads');
    await one(`INSERT INTO meta_lead_events (leadgen_id,org_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [String(leadgenId), page.org_id]);
    return;
  }
  const event = await one(`INSERT INTO meta_lead_events (leadgen_id,org_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING leadgen_id`, [String(leadgenId), page.org_id]);
  if (!event) return;
  try {
    let lead = await one(`SELECT id FROM leads WHERE org_id=$1 AND phone=$2 AND stage <> 'lost' ORDER BY created_at LIMIT 1`, [page.org_id, phone]);
    if (lead) {
      await one(`UPDATE leads SET campaign_name=COALESCE(campaign_name,$2), adset_name=COALESCE(adset_name,$3), ad_name=COALESCE(ad_name,$4),
        source_ref=COALESCE(source_ref,$2), updated_at=now() WHERE id=$1 RETURNING id`, [lead.id, campaignName, adsetName, adName]);
      await notifyAdminsOnce(page.org_id, 'duplicate_lead', `Meta lead matched an existing customer (${phone}). Review the existing lead for campaign attribution.`, `/leads/${lead.id}`);
    } else {
      const name = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || fields.name || null;
      const email = fields.email || fields.email_address || null;
      lead = await one(`INSERT INTO leads (org_id,name,phone,email,source,source_ref,campaign_name,adset_name,ad_name,stage,temperature,notes)
        VALUES ($1,$2,$3,$4,'meta_lead_ads',$5,$5,$6,$7,'new','warm',$8) RETURNING id`,
      [page.org_id, name ? String(name).slice(0,160) : null, phone, email ? String(email).slice(0,254) : null, campaignName || (data.campaign_id ? String(data.campaign_id) : null), adsetName, adName, `Received from Facebook Lead Ads · Page: ${page.page_name || page.page_id} · Form: ${data.form_id || 'unknown'}`]);
      await logLead(lead.id, null, 'created', `Imported from Facebook Lead Ads${campaignName ? ` campaign ${campaignName}` : ''}`);
      await assignLead(lead.id, { reason: 'meta_lead_ads' });
    }
    await one(`UPDATE meta_lead_events SET lead_id=$2 WHERE leadgen_id=$1`, [String(leadgenId), lead.id]);
  } catch (error) {
    await one(`DELETE FROM meta_lead_events WHERE leadgen_id=$1`, [String(leadgenId)]);
    throw error;
  }
}

r.post('/meta', async (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  const events = [];
  for (const entry of req.body.entry || []) for (const change of entry.changes || []) {
    if (change.field === 'leadgen' && change.value?.leadgen_id && change.value?.page_id) events.push([change.value.page_id, change.value.leadgen_id]);
  }
  res.sendStatus(200);
  for (const [pageId, leadgenId] of events) {
    try { await receiveLeadAd(pageId, leadgenId); }
    catch (error) {
      const page = await one(`SELECT org_id FROM meta_pages WHERE page_id=$1`, [String(pageId)]).catch(() => null);
      if (page) await notifyAdminsOnce(page.org_id, 'integration_error', `Facebook Lead Ads import failed: ${String(error.message).slice(0,350)}`, '/settings').catch(() => {});
      console.error('[meta leadgen]', error.message);
    }
  }
});

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
      for (const status of v.statuses || []) {
        const delivery = String(status.status || '').toLowerCase();
        if (!status.id || !['sent', 'delivered', 'read', 'failed', 'deleted'].includes(delivery)) continue;
        const error = (status.errors || []).map(item => [item.code, item.title || item.message].filter(Boolean).join(': ')).join('; ').slice(0, 1000) || null;
        const updated = await one(`UPDATE chat_messages m SET delivery_status = $2, delivery_error = $3, status_updated_at = now()
          FROM chats c WHERE m.chat_id = c.id AND m.ext_id = $1 RETURNING c.org_id, m.chat_id`, [status.id, delivery, error]);
        if (delivery === 'failed' && updated) {
          await notifyAdminsOnce(updated.org_id, 'integration_error', `WhatsApp reported a failed message${error ? `: ${error}` : '.'}`, `/chats/${updated.chat_id}`);
        }
      }
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
