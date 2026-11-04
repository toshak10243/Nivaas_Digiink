import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, Drawer, Modal, Seg, Field, useLoad, Loading, Empty, copyText } from '../components/ui.jsx';
import { money, inr, sqft, date } from '../lib/format.js';
import { costSheet } from '../lib/pricing.js';
import ShareModal from '../components/ShareModal.jsx';
import EmiCalculatorModal from '../components/EmiCalculatorModal.jsx';
import DocPreviewModal from '../components/DocPreviewModal.jsx';

export { ShareModal };

const ST = [['all', 'All'], ['available', 'Available'], ['hold', 'On hold'], ['booked', 'Booked'], ['sold', 'Sold'], ['blocked', 'Blocked']];

export default function Inventory({ me, say, go }) {
  const [projects] = useLoad(() => api.get('/api/projects'), []);
  const [pid, setPid] = useState(null);
  useEffect(() => { if (projects && !pid) setPid(projects[0]?.id); }, [projects, pid]);
  const [units, reload] = useLoad(() => (pid ? api.get('/api/units?project_id=' + pid) : Promise.resolve(null)), [pid]);
  const [project] = useLoad(() => (pid ? api.get('/api/projects/' + pid) : Promise.resolve(null)), [pid]);
  const [status, setStatus] = useState('all');
  const [bhk, setBhk] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [share, setShare] = useState(null);
  const [emiModal, setEmiModal] = useState(null);
  const [costSheetModal, setCostSheetModal] = useState(null);

  const towers = useMemo(() => {
    if (!units) return [];
    const by = {};
    for (const u of units) (by[u.tower || '—'] ||= []).push(u);
    return Object.entries(by).map(([name, us]) => {
      const floors = {};
      for (const u of us) (floors[u.floor] ||= []).push(u);
      return { name, floors: Object.entries(floors).sort((a, b) => b[0] - a[0]).map(([f, list]) => [f, list.sort((a, b) => a.unit_no.localeCompare(b.unit_no, undefined, { numeric: true }))]) };
    });
  }, [units]);

  if (!projects) return <div className="page"><Loading /></div>;
  if (!projects.length) return <div className="page"><Empty icon="building" title="No projects yet">{me.user.role === 'admin' ? 'Add your first project under Projects.' : 'Your builder has not added projects yet.'}</Empty></div>;
  if (!units) return <div className="page"><Loading /></div>;

  const counts = Object.fromEntries(ST.map(([k]) => [k, k === 'all' ? units.length : units.filter(u => u.status === k).length]));
  const bhks = [...new Set(units.map(u => u.bhk))].filter(Boolean).sort();
  const match = u => (status === 'all' || u.status === status) && (bhk === 'all' || String(u.bhk) === bhk) && (!q || u.unit_no.toLowerCase().includes(q.toLowerCase()));
  const sel = units.find(u => u.id === open);
  const shareProject = async () => {
    const s = await api.post('/api/share', { project_id: pid });
    setShare({
      url: s.url,
      title: project?.name,
      project,
      text: `Namaste! Here are the details, photos, floor plans and prices for ${project?.name}:`,
    });
  };

  const shareLiveSalesKit = async () => {
    const s = await api.post('/api/share', { project_id: pid });
    setShare({
      url: s.url,
      title: `${project?.name} · Live ${me.user.role === 'broker' ? 'Broker' : 'Sales Person'} Kit`,
      project,
      text: `Namaste! Here is your verified Live Sales Kit for *${project?.name}*.\n⚡ Current approved pricing, live unit availability, payment plans, and brochures are automatically synced in real time:`,
    });
  };

  return (
    <div className="page wide">
      <div className="invhead">
        <div className="projtabs" role="tablist" aria-label="Projects">
          {projects.map(p => (
            <button key={p.id} role="tab" aria-selected={p.id === pid} className="projtab" onClick={() => { setPid(p.id); setOpen(null); }}>
              <img src={api.media(p.cover_url)} alt="" /><span><b>{p.name}</b><small>{p.available} of {p.total} available</small></span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={shareProject}><Icon name="share" />Share project</button>
          <button className="btn" style={{ borderColor: '#6366f1', color: '#4f46e5' }} onClick={shareLiveSalesKit}>
            <Icon name="link" />{me.user.role === 'broker' ? 'Live Broker Kit' : 'Live Sales Kit'}
          </button>
        </div>
      </div>

      <div className="invbar">
        <div className="seg" role="group" aria-label="Status">{ST.map(([k, l]) => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{k !== 'all' && <i className={'sdot ' + k} />}{l} <span className="num muted">{counts[k]}</span></button>)}</div>
        {bhks.length > 1 && <Seg value={bhk} onChange={setBhk} label="Configuration" options={[['all', 'All'], ...bhks.map(b => [String(b), `${b} BHK`])]} />}
        <label className="search" style={{ flex: '0 1 220px' }}><Icon name="search" /><span className="sr">Find unit</span><input placeholder="Unit no., e.g. 302-F" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>

      <div className="towers">
        {towers.map(t => (
          <section key={t.name} className="card tower">
            <div className="card-h"><h3>Tower {t.name}</h3><span className="muted">{t.floors.length} floors · {t.floors.reduce((a, [, l]) => a + l.filter(u => u.status === 'available').length, 0)} available</span></div>
            <div className="tgrid-wrap"><div className="tgrid">
              {t.floors.map(([f, list]) => (
                <div key={f} className="trow">
                  <span className="fl">{f === '0' ? 'G' : `F${f}`}</span>
                  {list.map(u => (
                    <button key={u.id} className={'ucell ' + u.status + (match(u) ? '' : ' dim')} onClick={() => setOpen(u.id)} aria-label={`${u.unit_no}, ${u.type_name}, ${u.status}`}>
                      <b>{u.unit_no}</b><span>{u.type_name}</span>
                      <span className="num">{['available', 'hold'].includes(u.status) ? money(u.price) : u.status === 'blocked' ? 'Blocked' : u.status === 'sold' ? 'Sold' : 'Booked'}</span>
                      {u.plc_pct > 0 && u.status === 'available' && <i className="plc" title={`Premium location +${u.plc_pct}%`}>★</i>}
                    </button>
                  ))}
                </div>
              ))}
            </div></div>
          </section>
        ))}
      </div>
      <div className="legend">{ST.slice(1).map(([k, l]) => <span key={k} className="chip"><i className={'sdot ' + k} />{l}</span>)}<span className="chip">★ Premium location (PLC)</span></div>

      {sel && project && <UnitDrawer unit={sel} project={project} me={me} say={say} go={go} onClose={() => setOpen(null)} reload={reload} onShare={setShare} onOpenEmi={u => setEmiModal({ unit: u, initialPrice: u.price, project })} onOpenCostSheet={(u, cs) => setCostSheetModal({ unit: u, project, cs, org: me.org })} />}
      {share && <ShareModal {...share} say={say} onClose={() => setShare(null)} />}
      {emiModal && <EmiCalculatorModal {...emiModal} say={say} onClose={() => setEmiModal(null)} />}
      {costSheetModal && <DocPreviewModal type="cost_sheet" data={costSheetModal} say={say} onClose={() => setCostSheetModal(null)} />}
    </div>
  );
}

function UnitDrawer({ unit: u, project, me, say, go, onClose, reload, onShare, onOpenEmi, onOpenCostSheet }) {
  const role = me.user.role;
  const type = project.unit_types.find(t => t.id === u.unit_type_id);
  const cs = costSheet(project, type, u);
  const [book, setBook] = useState(false);
  const [edit, setEdit] = useState(false);
  const act = async action => { try { await api.patch('/api/units/' + u.id, { action }); say({ hold: `${u.unit_no} is on hold for you`, release: 'Hold released', block: 'Unit blocked', unblock: 'Unit is available again' }[action]); reload(); } catch (e) { say(e.message); } };
  const share = async () => {
    const s = await api.post('/api/share', { project_id: project.id, unit_id: u.id });
    onShare({
      url: s.url,
      title: `${u.unit_no} · ${project.name}`,
      unit: { ...u, price: cs.total },
      project,
      text: `Namaste! Here is flat ${u.unit_no} (${u.type_name}) at ${project.name} with photos, floor plan, price and EMI calculator:`,
    });
  };
  const mine = u.hold_by === me.user.id;

  return (
    <Drawer title={`${u.unit_no} · ${u.type_name}`} sub={`${project.name} · Tower ${u.tower} · Floor ${u.floor}${u.facing ? ' · ' + u.facing : ''}`} onClose={onClose}
      actions={<Pill s={u.status} />}>
      {type?.floorplan_url && <img className="fpimg" src={api.media(type.floorplan_url)} alt={`${type.name} floor plan`} />}
      <div className="specs">
        <div><span>Carpet</span><b>{sqft(u.carpet_sqft)}</b></div><div><span>Built-up</span><b>{sqft(u.builtup_sqft)}</b></div>
        <div><span>Super built-up</span><b>{sqft(u.super_sqft)}</b></div><div><span>Rate</span><b>{inr(project.rate_sqft)}/sq ft</b></div>
      </div>

      {u.status === 'hold' && <div className="note"><b>On hold</b> by {mine ? 'you' : u.hold_by_name} until {date(u.hold_until)}.</div>}
      {['booked', 'sold'].includes(u.status) && <div className="note"><b>{u.status === 'sold' ? 'Sold' : 'Booked'}</b> {u.booking_date ? 'on ' + date(u.booking_date) : ''}{u.sold_by_name ? ` by ${u.sold_by_name}` : ''}{u.broker_name ? ` with broker ${u.broker_name}` : ''}{u.customer_name ? ` · Buyer: ${u.customer_name}` : ''}
        {u.booking_id && role !== 'broker' && <> · <button className="linkbtn" onClick={() => go('bookings/' + u.booking_id)}>Open booking</button></>}</div>}

      <div className="costsheet">
        <div className="eyebrow">Cost sheet</div>
        <Row l={`Basic (${sqft(cs.sqft)} × ${inr(cs.rate)})`} v={cs.base} />
        {cs.plc > 0 && <Row l={`Premium location (${u.plc_pct}%)`} v={cs.plc} />}
        <Row l="Covered parking" v={cs.parking} /><Row l="Club membership" v={cs.club} />
        <Row l={`GST (${cs.gst_pct}%)`} v={cs.gst} /><Row l="Maintenance deposit" v={cs.deposit} />
        <Row l="All-inclusive price" v={cs.total} strong />
        <Row l={`Stamp duty (${cs.stamp_pct}%) + registration, paid separately`} v={cs.stamp + cs.registration} muted />
      </div>

      <div className="drawer-actions">
        {['available', 'hold'].includes(u.status) && <button className="btn sun" onClick={share}><Icon name="share" />Share with client</button>}
        <button className="btn" onClick={() => onOpenCostSheet(u, cs)}><Icon name="download" />Official Cost Sheet</button>
        <button className="btn" onClick={() => onOpenEmi(u)}><Icon name="calc" />EMI Calculator</button>
        {u.status === 'available' && role !== 'customer' && <button className="btn" onClick={() => act('hold')}><Icon name="lock" />Hold</button>}
        {u.status === 'hold' && (mine || role === 'admin') && <button className="btn" onClick={() => act('release')}>Release hold</button>}
        {['available', 'hold'].includes(u.status) && ['admin', 'sales'].includes(role) && (u.status === 'available' || mine || role === 'admin') && <button className="btn ink" onClick={() => setBook(true)}><Icon name="receipt" />Book this flat</button>}
        {role === 'admin' && u.status === 'available' && <button className="btn ghost" onClick={() => act('block')}>Block</button>}
        {role === 'admin' && u.status === 'blocked' && <button className="btn ghost" onClick={() => act('unblock')}>Unblock</button>}
        {role === 'admin' && <button className="btn ghost" onClick={() => setEdit(true)}><Icon name="edit" />Price & PLC</button>}
      </div>
      {role === 'broker' && u.status === 'available' && <p className="hint">To book for your client, put it on hold and ask the builder’s sales team to raise the booking. Your commission is added automatically.</p>}
      {book && <BookModal unit={u} total={cs.total} me={me} say={say} onClose={() => setBook(false)} onDone={() => { setBook(false); reload(); onClose(); }} />}
      {edit && <EditUnit unit={u} say={say} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
    </Drawer>
  );
}
const Row = ({ l, v, strong, muted }) => <div className={'csrow' + (strong ? ' strong' : '') + (muted ? ' muted' : '')}><span>{l}</span><b className="num">{inr(v)}</b></div>;

function BookModal({ unit, total, me, say, onClose, onDone }) {
  const [leads] = useLoad(() => api.get('/api/leads'), []);
  const [f, setF] = useState({ lead_id: '', customer_name: '', customer_phone: '', customer_email: '', discount: 0, booking_amount: Math.round(total * 0.1), payment_mode: 'NEFT', payment_ref: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const lead = leads?.find(l => l.id === f.lead_id);
  const submit = async () => {
    setBusy(true);
    try { const r = await api.post('/api/bookings', { unit_id: unit.id, ...f, discount: Number(f.discount || 0), booking_amount: Number(f.booking_amount || 0), customer_name: f.customer_name || lead?.name, customer_phone: f.customer_phone || lead?.phone }); setDone(r); say(`${unit.unit_no} booked`); }
    catch (e) { say(e.message); }
    setBusy(false);
  };
  if (done) return (
    <Modal title="Booked" onClose={onDone} footer={<button className="btn sun" onClick={onDone}>Done</button>}>
      <div className="done"><div className="big"><Icon name="checkCircle" /></div><h3>{unit.unit_no} booked for {inr(done.deal_value)}</h3>
        <p className="muted" style={{ margin: 0 }}>Payment schedule, incentive{done.broker_id ? ' and broker commission' : ''} were created automatically.</p></div>
      {done.customer_login && <div className="note"><b>Customer portal login</b> (share privately): <span className="mono">{done.customer_login.email}</span> · password <span className="mono">{done.customer_login.temp_password}</span></div>}
    </Modal>
  );
  return (
    <Modal title={`Book ${unit.unit_no}`} onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy || !f.customer_email || !(f.customer_name || lead)} onClick={submit}>{busy ? 'Booking…' : `Book for ${inr(total - Number(f.discount || 0))}`}</button></>}>
      <Field label="Buyer (from your leads)" id="bk-lead">
        <select id="bk-lead" className="select" value={f.lead_id} onChange={e => { const l = leads.find(x => x.id === e.target.value); setF({ ...f, lead_id: e.target.value, customer_name: l?.name || '', customer_phone: l?.phone || '' }); }}>
          <option value="">New buyer (not in leads)</option>
          {(leads || []).filter(l => !['booked', 'lost'].includes(l.stage)).map(l => <option key={l.id} value={l.id}>{l.name} · {l.phone}</option>)}
        </select>
      </Field>
      <div className="kgrid">
        <Field label="Buyer name" id="bk-n"><input id="bk-n" className="input" value={f.customer_name} onChange={set('customer_name')} /></Field>
        <Field label="Mobile" id="bk-p"><input id="bk-p" className="input" value={f.customer_phone} onChange={set('customer_phone')} /></Field>
        <Field label="Email (portal login)" id="bk-e"><input id="bk-e" type="email" className="input" value={f.customer_email} onChange={set('customer_email')} /></Field>
        <Field label="Discount (₹)" id="bk-d" hint={`List price ${inr(total)}`}><input id="bk-d" className="input" inputMode="numeric" value={f.discount} onChange={set('discount')} /></Field>
        <Field label="Booking amount received (₹)" id="bk-a"><input id="bk-a" className="input" inputMode="numeric" value={f.booking_amount} onChange={set('booking_amount')} /></Field>
        <Field label="Mode / reference" id="bk-m"><div style={{ display: 'flex', gap: 6 }}><select id="bk-m" className="select" style={{ width: 110 }} value={f.payment_mode} onChange={set('payment_mode')}><option>NEFT</option><option>Cheque</option><option>UPI</option><option>RTGS</option></select><input aria-label="Reference" className="input" placeholder="UTR / cheque no." value={f.payment_ref} onChange={set('payment_ref')} /></div></Field>
      </div>
    </Modal>
  );
}

function EditUnit({ unit, say, onClose, onDone }) {
  const [f, setF] = useState({ plc_pct: unit.plc_pct, price_override: unit.price_override || '', facing: unit.facing || '', notes: unit.notes || '' });
  const save = async () => { try { await api.patch('/api/units/' + unit.id, f); say('Saved'); onDone(); } catch (e) { say(e.message); } };
  return (
    <Modal title={`Edit ${unit.unit_no}`} onClose={onClose} footer={<button className="btn sun" onClick={save}>Save</button>}>
      <div className="kgrid">
        <Field label="Premium location charge (%)" id="eu-p"><input id="eu-p" className="input" inputMode="decimal" value={f.plc_pct} onChange={e => setF({ ...f, plc_pct: e.target.value })} /></Field>
        <Field label="Fixed basic price (₹)" id="eu-o" hint="Leave empty to use rate × area"><input id="eu-o" className="input" inputMode="numeric" value={f.price_override} onChange={e => setF({ ...f, price_override: e.target.value })} /></Field>
        <Field label="Facing" id="eu-f"><input id="eu-f" className="input" value={f.facing} onChange={e => setF({ ...f, facing: e.target.value })} /></Field>
      </div>
      <Field label="Internal note" id="eu-n"><input id="eu-n" className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}
