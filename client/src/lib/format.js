export const inr = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

/** ₹1.04 Cr / ₹85.2 L / ₹45,000 */
export function money(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(v >= 1e8 ? 1 : 2).replace(/\.?0+$/, '') + ' Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(1).replace(/\.0$/, '') + ' L';
  return inr(v);
}
export const sqft = n => Number(n || 0).toLocaleString('en-IN') + ' sq ft';
export const date = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateShort = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
export const dateTime = d => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const time = d => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export function ago(d) {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'now'; if (m < 60) return m + 'm'; if (m < 1440) return Math.round(m / 60) + 'h'; if (m < 43200) return Math.round(m / 1440) + 'd';
  return dateShort(d);
}
export function until(d) {
  const m = Math.round((new Date(d) - Date.now()) / 60000);
  if (m < 0) { const a = -m; return a < 60 ? `${a}m late` : a < 1440 ? `${Math.round(a / 60)}h late` : `${Math.round(a / 1440)}d late`; }
  return m < 60 ? `${m}m left` : m < 1440 ? `${Math.round(m / 60)}h left` : `${Math.round(m / 1440)}d left`;
}
export const phone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : p || '—'; };
export const titleCase = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const STAGES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['visit_scheduled', 'Visit booked'],
  ['visit_done', 'Visited'], ['negotiation', 'Negotiation'], ['booked', 'Booked'], ['lost', 'Lost'],
];
export const stageLabel = s => (STAGES.find(x => x[0] === s) || [s, titleCase(s)])[1];
export const SOURCES = { leadsathi: 'LeadSathi AI', share_link: 'Shared link', broker: 'Broker', walk_in: 'Walk-in', manual: 'Manual', whatsapp: 'WhatsApp', meta_lead_ads: 'Meta Lead Ads' };
