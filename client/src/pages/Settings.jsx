import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Field, Seg, Switch, useLoad, Loading, copyText } from '../components/ui.jsx';

const TABS = [['company', 'Company', 'building'], ['routing', 'Lead routing', 'funnel'], ['service', 'Complaints & holds', 'wrench'], ['visits', 'Site visit reminders', 'calendar'], ['payments', 'Buyer payments', 'receipt'], ['integrations', 'LeadSathi & WhatsApp', 'link'], ['password', 'My password', 'lock']];

export default function Settings({ me, say, reloadMe }) {
  const [tab, setTab] = useState('company');
  const [org, setOrg] = useState(me.org);
  const s = org.settings;
  const setS = (g, k, v) => setOrg(o => ({ ...o, settings: { ...o.settings, [g]: { ...o.settings[g], [k]: v } } }));
  const save = async () => { try { const r = await api.put('/api/org', { name: org.name, phone: org.phone, email: org.email, address: org.address, rera_promoter: org.rera_promoter, settings: org.settings }); setOrg(r); reloadMe(); say('Settings saved'); } catch (e) { say(e.message); } };
  const savable = ['company', 'routing', 'service', 'visits', 'payments'].includes(tab);

  return (
    <div className="page settings">
      <nav className="settabs" aria-label="Settings sections">{TABS.map(([k, l, ic]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Icon name={ic} />{l}</button>)}</nav>
      <div className="setbody">
        {tab === 'company' && <section className="card"><div className="card-h"><h3>Company</h3></div><div className="card-b"><div className="kgrid">
          {[['name', 'Company name'], ['phone', 'Office phone'], ['email', 'Office email'], ['rera_promoter', 'Promoter RERA no.']].map(([k, l]) => <Field key={k} label={l} id={'st-' + k}><input id={'st-' + k} className="input" value={org[k] || ''} onChange={e => setOrg({ ...org, [k]: e.target.value })} /></Field>)}
        </div><div style={{ marginTop: 12 }}><Field label="Address (shown on shared pages)" id="st-ad"><input id="st-ad" className="input" value={org.address || ''} onChange={e => setOrg({ ...org, address: e.target.value })} /></Field></div></div></section>}

        {tab === 'routing' && <section className="card"><div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h3>Lead routing</h3><span className="muted">How leads from LeadSathi, WhatsApp and shared links reach a person.</span></div><div className="card-b setlist">
          <Row l="Hand a lead to a person" d="“When qualified” lets the AI talk first and hands over once it knows budget and configuration, or a visit is booked.">
            <Seg value={s.routing.assign_on} onChange={v => setS('routing', 'assign_on', v)} options={[['qualified', 'When qualified'], ['immediately', 'Immediately']]} /></Row>
          <Row l="Pick the agent by" d="Least busy = fewest open leads right now."><Seg value={s.routing.strategy} onChange={v => setS('routing', 'strategy', v)} options={[['least_loaded', 'Least busy'], ['round_robin', 'Round robin']]} /></Row>
          <Row l="Skip agents marked “Away”" d="If everyone is away, the lead still goes to someone whose AI twin will cover."><Switch on={s.routing.respect_availability} label="Respect availability" onChange={v => setS('routing', 'respect_availability', v)} /></Row>
          <Row l="Include brokers" d="Send some builder-sourced leads to brokers too."><Switch on={s.routing.include_brokers} label="Include brokers" onChange={v => setS('routing', 'include_brokers', v)} /></Row>
          <Row l="Reassign if nobody responds within" d="A call log, a WhatsApp reply or the AI twin’s reply counts as a response. Max 2 reassignments, then you are alerted.">
            <select className="select" style={{ width: 140 }} value={s.routing.first_response_min} onChange={e => setS('routing', 'first_response_min', Number(e.target.value))} aria-label="Minutes">{[5, 10, 15, 30, 60, 120].map(m => <option key={m} value={m}>{m} minutes</option>)}</select></Row>
        </div></section>}

        {tab === 'service' && <section className="card"><div className="card-h"><h3>Complaints, holds & EMI</h3></div><div className="card-b setlist">
          <Row l="Complaint response time (SLA)"><select className="select" style={{ width: 140 }} value={s.tickets.sla_hours} onChange={e => setS('tickets', 'sla_hours', Number(e.target.value))} aria-label="SLA hours">{[12, 24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}</select></Row>
          <Row l="Urgent complaints"><select className="select" style={{ width: 140 }} value={s.tickets.urgent_sla_hours} onChange={e => setS('tickets', 'urgent_sla_hours', Number(e.target.value))} aria-label="Urgent SLA">{[2, 4, 6, 12].map(h => <option key={h} value={h}>{h} hours</option>)}</select></Row>
          <Row l="Tell the sales agent too" d="The agent who sold the flat stays in the loop."><Switch on={s.tickets.notify_sales_agent} label="Notify sales agent" onChange={v => setS('tickets', 'notify_sales_agent', v)} /></Row>
          <Row l="A unit hold lasts"><select className="select" style={{ width: 140 }} value={s.holds.hours} onChange={e => setS('holds', 'hours', Number(e.target.value))} aria-label="Hold hours">{[12, 24, 48, 72, 168].map(h => <option key={h} value={h}>{h < 168 ? h + ' hours' : '7 days'}</option>)}</select></Row>
          <Row l="EMI calculator defaults" d="Shown on shared pages; buyers can change them.">
            <div style={{ display: 'flex', gap: 6 }}><input className="input" style={{ width: 80 }} aria-label="Rate %" value={s.emi.rate} onChange={e => setS('emi', 'rate', Number(e.target.value))} /><input className="input" style={{ width: 80 }} aria-label="Years" value={s.emi.tenure_years} onChange={e => setS('emi', 'tenure_years', Number(e.target.value))} /><input className="input" style={{ width: 80 }} aria-label="Down %" value={s.emi.down_pct} onChange={e => setS('emi', 'down_pct', Number(e.target.value))} /></div></Row>
        </div></section>}

        {tab === 'visits' && <section className="card"><div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h3>Site visit reminders</h3><span className="muted">Choose when the CRM should notify assigned staff and buyers with a portal account. Reminders appear in their CRM notifications.</span></div><div className="card-b setlist">
          {[['168', '1 week before'], ['72', '3 days before'], ['48', '2 days before'], ['24', '1 day before'], ['2', '2 hours before']].map(([hours, label]) => {
            const value = Number(hours);
            const selected = (s.visits?.reminder_hours || []).includes(value);
            return <label key={hours} className="setrow" style={{ cursor: 'pointer' }}><div><b>{label}</b><span>Send a scheduled reminder before the visit date and time.</span></div><div className="ctl"><input type="checkbox" checked={selected} onChange={event => {
              const next = new Set(s.visits?.reminder_hours || []);
              if (event.target.checked) next.add(value); else next.delete(value);
              setS('visits', 'reminder_hours', [...next].sort((a, b) => b - a));
            }} aria-label={label} /></div></label>;
          })}
        </div></section>}

        {tab === 'payments' && <section className="card"><div className="card-h"><div><h3>Buyer payment instructions</h3><span className="muted">Verified instructions are shown to buyers in their payment tracker.</span></div></div><div className="card-b">
          <div className="kgrid">
            <Field label="UPI ID" id="pay-upi"><input id="pay-upi" className="input" placeholder="builder@bank" value={s.payment.upi_id} onChange={e => setS('payment', 'upi_id', e.target.value)} /></Field>
            <Field label="Account / beneficiary name" id="pay-name"><input id="pay-name" className="input" value={s.payment.account_name} onChange={e => setS('payment', 'account_name', e.target.value)} /></Field>
            <Field label="Bank name" id="pay-bank"><input id="pay-bank" className="input" value={s.payment.bank_name} onChange={e => setS('payment', 'bank_name', e.target.value)} /></Field>
            <Field label="Account number" id="pay-account"><input id="pay-account" className="input" inputMode="numeric" value={s.payment.account_number} onChange={e => setS('payment', 'account_number', e.target.value)} /></Field>
            <Field label="IFSC code" id="pay-ifsc"><input id="pay-ifsc" className="input" maxLength={11} value={s.payment.ifsc_code} onChange={e => setS('payment', 'ifsc_code', e.target.value.toUpperCase())} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Field label="Additional payment instructions" id="pay-instructions"><textarea id="pay-instructions" className="textarea" rows={3} maxLength={1000} placeholder="Include escrow name, reference to add, or where to send the payment receipt." value={s.payment.instructions} onChange={e => setS('payment', 'instructions', e.target.value)} /></Field></div>
          <div style={{ marginTop: 12 }}><Switch on={s.payment.payment_details_verified} label="I verified these account details; show them to buyers" onChange={v => setS('payment', 'payment_details_verified', v)} /></div>
          <p className="hint">Only mark the details verified after checking them with your bank. Buyers see these details with a reminder to confirm account information before transferring.</p>
        </div></section>}

        {tab === 'integrations' && <Integrations me={me} say={say} />}
        {tab === 'password' && <Password say={say} />}
        {savable && <div className="savebar"><span className="muted">Changes are saved to your company settings.</span><button className="btn sun" onClick={save}>Save changes</button></div>}
      </div>
    </div>
  );
}
const Row = ({ l, d, children }) => <div className="setrow"><div><b>{l}</b>{d && <span>{d}</span>}</div><div className="ctl">{children}</div></div>;

function Integrations({ say }) {
  const [d, reload] = useLoad(() => api.get('/api/integrations'), []);
  const [team] = useLoad(() => api.get('/api/team?role=sales'), []);
  const [f, setF] = useState({ display: '', phone_number_id: '', waba_id: '', access_token: '', user_id: '' });
  const [metaPage, setMetaPage] = useState({ page_id: '', page_name: '', access_token: '' });
  const [editingNumber, setEditingNumber] = useState(null);
  if (!d) return <Loading />;
  const resetForm = () => { setF({ display: '', phone_number_id: '', waba_id: '', access_token: '', user_id: '' }); setEditingNumber(null); };
  const editNumber = number => {
    setEditingNumber(number.id);
    setF({ display: number.display || '', phone_number_id: number.phone_number_id, waba_id: number.waba_id || '', access_token: '', user_id: number.user_id || '' });
  };
  const add = async () => { try { await api.post('/api/integrations/whatsapp', f); say(editingNumber ? 'WhatsApp number updated' : 'Number connected'); resetForm(); reload(); } catch (e) { say(e.message); } };
  const connectPage = async () => { try { await api.post('/api/integrations/meta-pages', metaPage); setMetaPage({ page_id: '', page_name: '', access_token: '' }); reload(); say('Facebook Page connected for Lead Ads'); } catch (e) { say(e.message); } };
  return (
    <>
      <section className="card"><div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h3>Facebook &amp; Instagram Lead Ads</h3><span className="muted">Connect a Facebook Page that owns your lead forms. Instagram Lead Ads linked to this Page can use the same webhook.</span></div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="kgrid"><Field label="Meta webhook URL"><div className="sharebox"><span className="mono" style={{ wordBreak: 'break-all' }}>{d.meta.webhook_url}</span><button className="btn sm" onClick={() => copyText(d.meta.webhook_url, say)}><Icon name="copy" />Copy</button></div></Field><Field label="Webhook verify token"><div className="sharebox"><span className="mono">{d.meta.verify_token}</span></div></Field></div>
          <p className="hint">Signature validation: {d.meta.app_secret_configured ? 'configured' : 'not configured — set META_APP_SECRET before subscribing the webhook'}. Subscribe the Page to the <b>leadgen</b> webhook field in Meta App Dashboard. The app needs the appropriate Lead Ads permissions and Page access token.</p>
          <div className="list">{d.meta.pages.map(page => <div className="lrow" key={page.id}><Icon name="building" style={{ width: 18, height: 18 }} /><b style={{ flex: 1 }}>{page.page_name || page.page_id}</b><span className="muted">Page {page.page_id} · token {page.token_configured ? 'saved' : 'missing'}</span><button className="iconbtn" aria-label="Disconnect Facebook Page" onClick={async () => { await api.del('/api/integrations/meta-pages/' + page.id); reload(); say('Facebook Page disconnected'); }}><Icon name="trash" /></button></div>)}</div>
          <b>Connect a Facebook Page</b><div className="kgrid"><Field label="Page ID"><input className="input" value={metaPage.page_id} onChange={e => setMetaPage({ ...metaPage, page_id: e.target.value })} /></Field><Field label="Page name"><input className="input" value={metaPage.page_name} onChange={e => setMetaPage({ ...metaPage, page_name: e.target.value })} /></Field><Field label="Page access token"><input className="input" type="password" autoComplete="new-password" value={metaPage.access_token} onChange={e => setMetaPage({ ...metaPage, access_token: e.target.value })} /></Field></div>
          <button className="btn sun" disabled={!metaPage.page_id || !metaPage.access_token} onClick={connectPage}><Icon name="plus" />Connect Page</button>
        </div></section>
      <section className="card"><div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h3>LeadSathi</h3><span className="muted">LeadSathi’s AI talks to new ad leads on your main number, then hands qualified ones to Nivaas.</span></div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ol className="steps-ol"><li>Open LeadSathi → Settings → Integrations.</li><li>Paste this URL in <b>Webhook URL</b> and save.</li><li>In LeadSathi → Settings → Business, set the industry to <b>Real estate</b>. The AI then asks for configuration, budget, area, purpose, timeline and a visit time.</li></ol>
          <div className="sharebox"><span className="mono" style={{ wordBreak: 'break-all' }}>{d.leadsathi.webhook_url}</span><button className="btn sm" onClick={() => copyText(d.leadsathi.webhook_url, say)}><Icon name="copy" />Copy</button></div>
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api.post('/api/integrations/rotate-secret'); reload(); say('New secret created. Update it in LeadSathi.'); }}>Generate a new secret</button>
        </div></section>
      <section className="card"><div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h3>WhatsApp numbers</h3><span className="muted">One WhatsApp Business account, many numbers: a main number plus one per sales agent for their AI twin.</span></div>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="kgrid"><Field label="Webhook URL (Meta → WhatsApp → Configuration)"><div className="sharebox"><span className="mono">{d.whatsapp.webhook_url}</span></div></Field><Field label="Verify token"><div className="sharebox"><span className="mono">{d.whatsapp.verify_token}</span></div></Field><Field label="Webhook endpoint"><div className="sharebox">{d.whatsapp.webhook_enabled ? 'Enabled on server' : 'Disabled — configure server webhook settings'}</div></Field></div>
          <div className="list">{d.whatsapp.numbers.map(n => <div key={n.id} className="lrow"><Icon name="wa" style={{ width: 18, height: 18 }} /><b style={{ flex: 1 }}>{n.display || n.phone_number_id}</b><span className="muted">{n.agent ? `${n.agent} · AI twin` : 'Main number'} · {n.waba_id ? 'WABA ID set' : 'WABA ID missing'}</span><button className="btn sm ghost" onClick={() => editNumber(n)}>Configure</button><button className="iconbtn" aria-label="Remove" onClick={async () => { await api.del('/api/integrations/whatsapp/' + n.id); reload(); }}><Icon name="trash" /></button></div>)}</div>
          <b>{editingNumber ? 'Update WhatsApp number' : 'Connect a number'}</b>
          <div className="kgrid">
            <Field label="Number (display)" id="wa-d"><input id="wa-d" className="input" placeholder="+91 98290 22222" value={f.display} onChange={e => setF({ ...f, display: e.target.value })} /></Field>
            <Field label="Phone number ID" id="wa-p" hint="WhatsApp Manager → Phone numbers"><input id="wa-p" className="input" value={f.phone_number_id} onChange={e => setF({ ...f, phone_number_id: e.target.value })} /></Field>
            <Field label="WhatsApp Business Account ID" id="wa-waba" hint="Required for template sync. Token also needs whatsapp_business_management."><input id="wa-waba" className="input" value={f.waba_id} onChange={e => setF({ ...f, waba_id: e.target.value })} /></Field>
            <Field label="Access token" id="wa-t" hint="System user token with whatsapp_business_messaging and whatsapp_business_management"><input id="wa-t" className="input" type="password" value={f.access_token} onChange={e => setF({ ...f, access_token: e.target.value })} /></Field>
            <Field label="Belongs to" id="wa-u"><select id="wa-u" className="select" value={f.user_id} onChange={e => setF({ ...f, user_id: e.target.value })}><option value="">Builder main number</option>{(team || []).map(u => <option key={u.id} value={u.id}>{u.name} (AI twin)</option>)}</select></Field>
          </div>
          <div className="inline-actions"><button className="btn sun" disabled={!f.phone_number_id || !f.waba_id || !f.access_token} onClick={add}><Icon name="plus" />{editingNumber ? 'Save configuration' : 'Connect'}</button>{editingNumber && <button className="btn ghost" onClick={resetForm}>Cancel</button>}</div>
        </div></section>
    </>
  );
}

function Password({ say }) {
  const [f, setF] = useState({ current: '', next: '' });
  const save = async () => { try { await api.post('/auth/password', f); say('Password changed'); setF({ current: '', next: '' }); } catch (e) { say(e.message); } };
  return <section className="card"><div className="card-h"><h3>Change my password</h3></div><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
    <Field label="Current password" id="pw-c"><input id="pw-c" type="password" className="input" autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></Field>
    <Field label="New password (8+ characters)" id="pw-n"><input id="pw-n" type="password" className="input" autoComplete="new-password" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} /></Field>
    <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={f.next.length < 8} onClick={save}>Change password</button></div></section>;
}
