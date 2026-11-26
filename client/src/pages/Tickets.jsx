import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, Drawer, Modal, Field, Seg, Avatar, useLoad, Loading, Empty } from '../components/ui.jsx';
import { ago, until, dateTime, phone, titleCase } from '../lib/format.js';

const CATS = [['seepage', 'Seepage / damp'], ['plumbing', 'Plumbing'], ['electrical', 'Electrical'], ['carpentry', 'Doors & wood'], ['paint', 'Paint'], ['tiles', 'Tiles & floor'], ['lift', 'Lift'], ['parking', 'Parking'], ['other', 'Other']];
const catLabel = c => (CATS.find(x => x[0] === c) || [c, titleCase(c)])[1];

export default function Tickets({ me, say, go, params }) {
  const role = me.user.role;
  const [rows, reload] = useLoad(() => api.get('/api/tickets'), []);
  const [f, setF] = useState('active');
  const [raise, setRaise] = useState(false);
  if (!rows) return <div className="page ticket-loading" aria-busy="true" aria-label="Loading complaints"><Loading /></div>;
  const shown = rows.filter(t => f === 'all' || (f === 'active' ? ['open', 'in_progress'].includes(t.status) : f === 'late' ? ['open', 'in_progress'].includes(t.status) && new Date(t.sla_due_at) < Date.now() : f === 'mine' ? t.assigned_to === me.user.id : t.status === f));
  const late = rows.filter(t => ['open', 'in_progress'].includes(t.status) && new Date(t.sla_due_at) < Date.now()).length;

  return (
    <div className="page wide">
      <div className="pagehead"><div style={{ flex: 1 }}><h2>{role === 'customer' ? 'My complaints' : 'Complaints'}</h2>
        <p>{role === 'customer' ? 'Raise any problem with your home, with photos. Our team responds within 24 hours.' : `Every complaint has a 24-hour SLA (6 h if urgent). ${late ? late + ' past SLA right now.' : 'All within SLA.'}`}</p></div>
        {role === 'customer' && <button className="btn sun" onClick={() => setRaise(true)}><Icon name="camera" />Raise a complaint</button>}</div>
      {role !== 'customer' && <div className="invbar"><Seg value={f} onChange={setF} label="Filter" options={[['active', 'Active'], ['late', `Past SLA · ${late}`], ...(role === 'maintenance' ? [['mine', 'Mine']] : []), ['resolved', 'Resolved'], ['all', 'All']]} /></div>}
      {shown.length === 0 ? <Empty icon="wrench" title={role === 'customer' ? 'No complaints yet' : 'Nothing in this list'}>{role === 'customer' ? 'If you need help with your home, raise a complaint and track the response here.' : 'Try a different complaint filter.'}</Empty> : (
        <div className="tklist">{shown.map(t => {
          const active = ['open', 'in_progress'].includes(t.status), lateNow = active && new Date(t.sla_due_at) < Date.now();
          const lastUpdate = String(t.last_update || '').replace(/\s+/g, ' ').slice(0, 110);
          return (
            <button key={t.id} className={'tkcard' + (lateNow ? ' late' : '')} onClick={() => go('tickets/' + t.id)}>
              {t.thumb ? <img src={api.media(t.thumb)} alt="" /> : <span className="tkicon"><Icon name="wrench" /></span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tk-top"><span className="mono muted">#{t.number}</span><b>{t.title}</b></div>
                <div className="muted" style={{ fontSize: 13 }}>{catLabel(t.category)} · {t.unit_no} {t.project_name}{role !== 'customer' ? ` · ${t.customer_name}` : ''}</div>
                {role === 'customer' && <div className="ticket-card-meta">
                  <span>{t.assigned_name ? `Assigned to ${t.assigned_name}` : 'Waiting for a team member'}</span>
                  <span>Updated {t.last_update_at ? dateTime(t.last_update_at) : dateTime(t.created_at)}{lastUpdate ? ` · ${lastUpdate}` : ''}</span>
                  {active && <span>Expected response by {dateTime(t.sla_due_at)}</span>}
                </div>}
                {role !== 'customer' && t.assigned_name && <small className="muted">Assigned to {t.assigned_name}</small>}
              </div>
              <div className="tk-right"><Pill s={t.status} />{t.priority === 'urgent' && <Pill s="urgent" />}{active ? <span className={'sla' + (lateNow ? ' late' : '')}><Icon name="clock" />{until(t.sla_due_at)}</span> : <span className="time">{ago(t.created_at)} ago</span>}</div>
            </button>
          );
        })}</div>
      )}
      {params[0] && <TicketDrawer id={params[0]} me={me} say={say} onClose={() => go('tickets')} onChange={reload} />}
      {raise && <Raise say={say} onClose={() => setRaise(false)} onDone={t => { setRaise(false); reload(); go('tickets/' + t.id); }} />}
    </div>
  );
}

function Photos({ files, setFiles }) {
  const input = useRef(null);
  const [urls, setUrls] = useState([]);
  useEffect(() => { const u = files.map(f => URL.createObjectURL(f)); setUrls(u); return () => u.forEach(URL.revokeObjectURL); }, [files]);
  return (
    <div className="photos">
      {urls.map((u, i) => <span key={u} className="ph"><img src={u} alt={`Photo ${i + 1}`} /><button type="button" aria-label="Remove photo" onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="x" /></button></span>)}
      {files.length < 6 && <button type="button" className="phadd" onClick={() => input.current.click()}><Icon name="camera" /><span>Add photo</span></button>}
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { setFiles([...files, ...Array.from(e.target.files)].slice(0, 6)); e.target.value = ''; }} />
    </div>
  );
}

function Raise({ say, onClose, onDone }) {
  const [portal] = useLoad(() => api.get('/api/portal'), []);
  const [f, setF] = useState({ booking_id: '', category: 'seepage', title: '', description: '', priority: 'normal' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (portal?.bookings?.[0] && !f.booking_id) setF(x => ({ ...x, booking_id: portal.bookings[0].id })); }, [portal]); // eslint-disable-line
  const submit = async () => {
    setBusy(true);
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); files.forEach(x => fd.append('photos', x));
    try { const t = await api.post('/api/tickets', fd); say('Complaint registered. You will hear from us soon.'); onDone(t); } catch (e) { say(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Raise a complaint" onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy || !f.title} onClick={submit}>{busy ? 'Sending…' : 'Submit'}</button></>}>
      {portal?.bookings?.length > 1 && <Field label="Which home?" id="rs-b"><select id="rs-b" className="select" value={f.booking_id} onChange={e => setF({ ...f, booking_id: e.target.value })}>{portal.bookings.map(b => <option key={b.id} value={b.id}>{b.unit_no} · {b.project_name}</option>)}</select></Field>}
      <div className="field"><label>What kind of problem?</label><div className="catgrid">{CATS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.category === k} onClick={() => setF({ ...f, category: k })}>{l}</button>)}</div></div>
      <Field label="In a few words" id="rs-t"><input id="rs-t" className="input" placeholder="e.g. Damp patch on bedroom wall" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Details (where exactly, since when)" id="rs-d"><textarea id="rs-d" className="textarea" rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="field"><label>Photos</label><Photos files={files} setFiles={setFiles} /></div>
      <label className="urgent"><input type="checkbox" checked={f.priority === 'urgent'} onChange={e => setF({ ...f, priority: e.target.checked ? 'urgent' : 'normal' })} /><span><b>This is urgent</b> (water leak, no electricity, safety issue). We respond within 6 hours.</span></label>
    </Modal>
  );
}

function TicketDrawer({ id, me, say, onClose, onChange }) {
  const role = me.user.role;
  const [t, reload] = useLoad(() => api.get('/api/tickets/' + id), [id]);
  const [techs] = useLoad(() => (role === 'admin' ? api.get('/api/team?role=maintenance').catch(() => []) : Promise.resolve([])), [role]);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState([]);
  const [zoom, setZoom] = useState(null);
  if (!t) return <Drawer title="Loading…" onClose={onClose}><Loading /></Drawer>;
  const refresh = () => { reload(); onChange(); };
  const patch = async b => { try { await api.patch('/api/tickets/' + t.id, b); refresh(); } catch (e) { say(e.message); } };
  const reply = async () => {
    const fd = new FormData(); fd.append('body', body); fd.append('internal', String(internal)); files.forEach(f => fd.append('photos', f));
    try { await api.post(`/api/tickets/${t.id}/comments`, fd); setBody(''); setFiles([]); refresh(); } catch (e) { say(e.message); }
  };
  const active = ['open', 'in_progress'].includes(t.status);

  return (
    <Drawer title={`#${t.number} · ${t.title}`} sub={`${catLabel(t.category)} · ${t.unit_no}, ${t.project_name} · raised ${dateTime(t.created_at)}`} onClose={onClose} actions={<Pill s={t.status} />}>
      {active && <div className={'slabar' + (new Date(t.sla_due_at) < Date.now() ? ' late' : '')}><Icon name="clock" /><span><b>{until(t.sla_due_at)}</b> to respond (SLA {t.priority === 'urgent' ? '6' : '24'} h)</span></div>}
      {role === 'customer' && <div className="ticket-buyer-summary">
        <div><small>Assigned contact</small><b>{t.assigned_name || 'Support team'}</b>{t.assigned_phone && <a href={`tel:+${String(t.assigned_phone).replace(/\D/g, '')}`}>{phone(t.assigned_phone)}</a>}</div>
        <div><small>{active ? 'Expected response' : 'Last updated'}</small><b>{active ? dateTime(t.sla_due_at) : dateTime(t.last_update_at || t.resolved_at || t.created_at)}</b>{active && <span className={'sla' + (new Date(t.sla_due_at) < Date.now() ? ' late' : '')}>{until(t.sla_due_at)}</span>}</div>
        <div><small>Latest update</small><b>{String(t.last_update || 'Complaint received; our team will follow up.').replace(/\s+/g, ' ').slice(0, 180)}</b></div>
      </div>}
      {role !== 'customer' && <div className="minirow"><Icon name="user" /><span style={{ flex: 1 }}>{t.customer_name} · <a className="mono" href={`tel:+${String(t.customer_phone).replace(/\D/g, '')}`}>{phone(t.customer_phone)}</a></span></div>}
      {t.description && <p style={{ margin: 0 }}>{t.description}</p>}
      {t.files.length > 0 && <div className="tkphotos">{t.files.map(f => <button key={f.id} onClick={() => setZoom(api.media(f.url))}><img src={api.media(f.url)} alt="Complaint photo" /></button>)}</div>}

      {role !== 'customer' && (
        <div className="drawer-actions">
          {t.status === 'open' && <button className="btn" onClick={() => patch({ status: 'in_progress' })}>Start work</button>}
          {active && <button className="btn sun" onClick={() => patch({ status: 'resolved' })}><Icon name="check" />Mark resolved</button>}
          {role === 'admin' && <select className="select" style={{ width: 210 }} value={t.assigned_to || ''} onChange={e => patch({ assigned_to: e.target.value })} aria-label="Assign to">
            <option value="">Unassigned</option>{(techs || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          {role === 'admin' && active && t.priority !== 'urgent' && <button className="btn ghost" onClick={() => patch({ priority: 'urgent' })}>Make urgent</button>}
        </div>
      )}
      {role === 'customer' && t.status === 'resolved' && (
        <div className="note rate"><b>Is it fixed?</b> Rate the service:
          <div className="stars">{[1, 2, 3, 4, 5].map(n => <button key={n} aria-label={`${n} stars`} onClick={() => { patch({ rating: n }); say('Thank you for the feedback!'); }}><Icon name="star" /></button>)}</div>
          <button className="linkbtn" onClick={() => patch({ status: 'open' })}>No, it is not fixed. Re-open.</button></div>
      )}
      {t.rating && <div className="minirow"><Icon name="star" /><span>Rated {t.rating}/5 by the home owner</span></div>}

      <div><div className="eyebrow" style={{ marginBottom: 10 }}>Conversation</div>
        <div className="thread">{t.comments.map(c => (
          <div key={c.id} className={'tc' + (c.role === 'customer' ? ' cust' : '') + (c.internal ? ' internal' : '')}>
            <Avatar name={c.name || 'Nivaas'} size="sm" /><div><b>{c.name || 'Support desk'}{c.internal && <span className="pill warm" style={{ marginLeft: 6 }}>Internal</span>}</b><p>{c.body}</p><small className="muted">{ago(c.created_at)} ago</small></div>
          </div>))}</div>
        {t.status !== 'closed' && <div className="noteform">
          <textarea className="textarea" rows={2} placeholder={role === 'customer' ? 'Add details or reply…' : 'Reply to the home owner…'} value={body} onChange={e => setBody(e.target.value)} aria-label="Reply" />
          <Photos files={files} setFiles={setFiles} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn sun sm" disabled={!body.trim() && !files.length} onClick={reply}><Icon name="send" />Send</button>
            {role !== 'customer' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Internal note (customer can’t see)</label>}
          </div>
        </div>}
      </div>
      {zoom && <Modal title="Photo" onClose={() => setZoom(null)} wide><img src={zoom} alt="Complaint" style={{ width: '100%', borderRadius: 12 }} /></Modal>}
    </Drawer>
  );
}
