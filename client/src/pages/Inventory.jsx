import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, Modal, Seg, Field, useLoad, Loading, Empty } from '../components/ui.jsx';
import { money, inr, sqft, date } from '../lib/format.js';
import { costSheet } from '../lib/pricing.js';
import ShareModal from '../components/ShareModal.jsx';
import EmiCalculatorModal from '../components/EmiCalculatorModal.jsx';
import DocPreviewModal from '../components/DocPreviewModal.jsx';

export { ShareModal };

const ST = [['all', 'All'], ['available', 'Available'], ['hold', 'On hold'], ['booked', 'Booked'], ['sold', 'Sold'], ['blocked', 'Blocked']];

export default function Inventory({ me, say, go, params = [] }) {
  const [projects] = useLoad(() => api.get('/api/projects'), []);
  const [pid, setPid] = useState(params[0] || null);
  useEffect(() => { if (projects && !pid) setPid(projects[0]?.id); }, [projects, pid]);
  const [units, reload] = useLoad(() => (pid ? api.get('/api/units?project_id=' + pid) : Promise.resolve(null)), [pid]);
  const [project, reloadProject] = useLoad(() => (pid ? api.get('/api/projects/' + pid) : Promise.resolve(null)), [pid]);
  const [status, setStatus] = useState('all');
  const [bhk, setBhk] = useState('all');
  const [q, setQ] = useState('');
  const [towerFilter, setTowerFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [share, setShare] = useState(null);
  const [emiModal, setEmiModal] = useState(null);
  const [costSheetModal, setCostSheetModal] = useState(null);
  const [offerApprovals, setOfferApprovals] = useState(false);

  const towerNames = useMemo(() => [...new Set((units || []).map(u => u.tower || '—'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [units]);
  const visibleUnits = useMemo(() => (units || []).filter(u =>
    (towerFilter === 'all' || (u.tower || '—') === towerFilter) &&
    (status === 'all' || u.status === status) &&
    (bhk === 'all' || String(u.bhk) === bhk) &&
    (!q || u.unit_no.toLowerCase().includes(q.toLowerCase()))
  ), [units, towerFilter, status, bhk, q]);
  const towers = useMemo(() => {
    const by = {};
    for (const u of visibleUnits) (by[u.tower || '—'] ||= []).push(u);
    return Object.entries(by).map(([name, us]) => {
      const floors = {};
      for (const u of us) (floors[u.floor] ||= []).push(u);
      return { name, floors: Object.entries(floors).sort((a, b) => b[0] - a[0]).map(([f, list]) => [f, list.sort((a, b) => a.unit_no.localeCompare(b.unit_no, undefined, { numeric: true }))]) };
    });
  }, [visibleUnits]);

  useEffect(() => {
    if (!units) return;
    if (!visibleUnits.some(u => u.id === open)) setOpen(visibleUnits.find(u => u.status === 'available')?.id || visibleUnits[0]?.id || null);
  }, [units, visibleUnits, open]);

  if (!projects) return <div className="page"><Loading /></div>;
  if (!projects.length) return <div className="page"><Empty icon="building" title="No projects yet">{me.user.role === 'admin' ? 'Add your first project under Projects.' : 'Your builder has not added projects yet.'}</Empty></div>;
  if (!units) return <div className="page"><Loading /></div>;

  const counts = Object.fromEntries(ST.map(([k]) => [k, k === 'all' ? units.length : units.filter(u => u.status === k).length]));
  const bhks = [...new Set(units.map(u => u.bhk))].filter(Boolean).sort();
  const sel = visibleUnits.find(u => u.id === open);
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
            <button key={p.id} role="tab" aria-selected={p.id === pid} className="projtab" onClick={() => { setPid(p.id); setOpen(null); setStatus('all'); setBhk('all'); setTowerFilter('all'); setQ(''); }}>
              <img src={api.media(p.cover_url)} alt="" /><span><b>{p.name}</b><small>{p.available} of {p.total} available</small></span>
            </button>
          ))}
        </div>
        <div className="inv-actions">
          {me.user.role === 'admin' && <button className="btn" onClick={() => setOfferApprovals(true)}><Icon name="receipt" />Offer approvals</button>}
          <button className="btn" onClick={shareProject}><Icon name="share" />Share project</button>
          <button className="btn sun" onClick={shareLiveSalesKit}>
            <Icon name="link" />{me.user.role === 'broker' ? 'Live Broker Kit' : 'Live Sales Kit'}
          </button>
        </div>
      </div>

      <section className="inventory-kpis" aria-label="Inventory summary">
        <InventoryKpi icon="grid" tone="blue" label="Total Units" value={units.length} />
        <InventoryKpi icon="checkCircle" tone="green" label="Available" value={counts.available} />
        <InventoryKpi icon="calendar" tone="blue" label="Booked" value={counts.booked} />
        <InventoryKpi icon="check" tone="violet" label="Sold" value={counts.sold} />
      </section>

      <div className="inventory-filterbar">
        <label className="inventory-tower-select"><span>Tower</span><select className="select" value={towerFilter} onChange={e => setTowerFilter(e.target.value)} aria-label="Filter by tower"><option value="all">All towers</option>{towerNames.map(name => <option key={name} value={name}>Tower {name}</option>)}</select></label>
        <div className="inventory-status-scroll"><div className="seg" role="group" aria-label="Filter by status">{ST.map(([k, l]) => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{k !== 'all' && <i className={'sdot ' + k} />}{l}<span className="num muted">{counts[k]}</span></button>)}</div></div>
        {bhks.length > 1 && <Seg value={bhk} onChange={setBhk} label="Configuration" options={[[ 'all', 'BHK: All' ], ...bhks.map(b => [String(b), `${b} BHK`])]} />}
        <label className="search inventory-search"><Icon name="search" /><span className="sr">Find unit</span><input placeholder="Unit no., e.g. 302-F" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>

      <div className="inventory-workspace">
        <div className="inventory-grid-column">
          {towers.length === 0 ? <Empty icon="grid" title="No units match these filters" /> : <div className="towers">
            {towers.map(t => (
              <section key={t.name} className="card tower">
                <div className="card-h"><h3>Tower {t.name}</h3><span className="muted">{t.floors.length} floors · {units.filter(u => (u.tower || '—') === t.name && u.status === 'available').length} available</span></div>
                <div className="tgrid-wrap"><div className="tgrid">
                  {t.floors.map(([f, list]) => (
                    <div key={f} className="trow">
                      <span className="fl">{f === '0' ? 'G' : `F${f}`}</span>
                      <div className="floor-units">{list.map(u => (
                        <button key={u.id} className={'ucell ' + u.status + (open === u.id ? ' selected' : '')} onClick={() => setOpen(u.id)} aria-pressed={open === u.id} aria-label={`${u.unit_no}, ${u.type_name || ''}, ${u.status}`}>
                          <i className="unit-status-dot" aria-hidden="true" /><b>{u.unit_no}</b><span>{u.type_name || (u.bhk ? `${u.bhk} BHK` : '')}</span>
                          <span className="num">{['available', 'hold'].includes(u.status) ? money(u.price) : u.status === 'blocked' ? 'Blocked' : u.status === 'sold' ? 'Sold' : 'Booked'}</span>
                          {u.plc_pct > 0 && u.status === 'available' && <i className="plc" title={`Premium location +${u.plc_pct}%`}>★</i>}
                        </button>
                      ))}</div>
                    </div>
                  ))}
                </div></div>
              </section>
            ))}
          </div>}
          <div className="legend">{ST.slice(1).map(([k, l]) => <span key={k} className="chip"><i className={'sdot ' + k} />{l}</span>)}<span className="chip">★ Premium location (PLC)</span></div>
        </div>
        <div className="inventory-detail-column">
          {sel && project ? <UnitDrawer unit={sel} project={project} me={me} say={say} go={go} reload={reload} reloadProject={reloadProject} onShare={setShare} onOpenEmi={u => setEmiModal({ unit: u, initialPrice: u.price, project })} onOpenCostSheet={(u, cs) => setCostSheetModal({ unit: u, project, cs, org: me.org })} /> : <div className="card inventory-detail-empty"><Icon name="grid" /><b>Select a unit to see its details</b><span>Choose a unit from the floor grid.</span></div>}
        </div>
      </div>
      {share && <ShareModal {...share} say={say} onClose={() => setShare(null)} />}
      {emiModal && <EmiCalculatorModal {...emiModal} say={say} onClose={() => setEmiModal(null)} />}
      {costSheetModal && <DocPreviewModal type="cost_sheet" data={costSheetModal} say={say} onClose={() => setCostSheetModal(null)} />}
      {offerApprovals && <OfferApprovals say={say} onClose={() => setOfferApprovals(false)} />}
    </div>
  );
}

function UnitDrawer({ unit: u, project, me, say, go, reload, reloadProject, onShare, onOpenEmi, onOpenCostSheet }) {
  const role = me.user.role;
  const type = project.unit_types.find(t => t.id === u.unit_type_id);
  const unitMedia = (project.media || []).filter(m => m.unit_type_id === u.unit_type_id && ['image', 'video', 'floorplan'].includes(m.kind));
  const floorplan = unitMedia.find(m => m.kind === 'floorplan')?.url || type?.floorplan_url;
  const flatGallery = unitMedia.filter(m => m.kind === 'image' || m.kind === 'video');
  const cs = costSheet(project, type, u);
  const [book, setBook] = useState(false);
  const [edit, setEdit] = useState(false);
  const [editCostSheet, setEditCostSheet] = useState(false);
  const [offer, setOffer] = useState(false);
  const act = async action => { try { await api.patch('/api/units/' + u.id, { action }); say({ hold: `${u.unit_no} is on hold for you`, extend: 'Hold extended', release: 'Hold released', block: 'Unit blocked', unblock: 'Unit is available again' }[action]); reload(); } catch (e) { say(e.message); } };
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
  const holdExpired = u.status === 'hold' && (!u.hold_until || new Date(u.hold_until) <= new Date());
  const canBook = u.status === 'available' || (u.status === 'hold' && (mine || role === 'admin' || holdExpired));

  return (
    <section className="inventory-detail-panel" aria-label={`Details for ${u.unit_no}`}>
      <header className="inventory-detail-header">
        <div><span className="eyebrow">Selected unit</span><h3>{u.unit_no} · {type?.name || u.type_name || ''}</h3><p><Icon name="building" /> Tower {u.tower} · {project.name} · Floor {u.floor}{u.facing ? ` · ${u.facing}` : ''}</p></div>
        <Pill s={u.status} />
      </header>
      <div className="inventory-detail-content">
      {role === 'admin' && type && <FlatMediaUploader projectId={project.id} type={type} say={say} onUploaded={() => { reloadProject(); reload(); }} />}
      {floorplan ? <img className="fpimg" src={api.media(floorplan)} alt={`${type.name} floor plan`} /> : <div className="inventory-no-floorplan"><Icon name="image" /><span>No floor plan available</span></div>}
      <div className="specs">
        <div><span>Carpet</span><b>{sqft(u.carpet_sqft)}</b></div><div><span>Built-up</span><b>{sqft(u.builtup_sqft)}</b></div>
        <div><span>Super built-up</span><b>{sqft(u.super_sqft)}</b></div><div><span>Price</span><b>{money(cs.total)}</b></div>
      </div>
      {flatGallery.length > 0 && <div className="inventory-flat-gallery" aria-label={`${type?.name || 'Flat'} photos and videos`}>
        <b>{type?.name} photos & videos</b>
        <div>{flatGallery.map(media => media.kind === 'video'
          ? <video key={media.id} src={api.media(media.url)} controls preload="metadata" aria-label={media.title || `${type?.name} video`} />
          : <img key={media.id} src={api.media(media.url)} alt={media.title || `${type?.name} interior`} loading="lazy" />)}</div>
      </div>}

      {u.status === 'hold' && <div className="note"><b>{holdExpired ? 'Hold expired' : 'On hold'}</b>{!holdExpired && <> by {mine ? 'you' : u.hold_by_name} until {date(u.hold_until)}.</>}</div>}
      {['booked', 'sold'].includes(u.status) && <div className="note"><b>{u.status === 'sold' ? 'Sold' : 'Booked'}</b> {u.booking_date ? 'on ' + date(u.booking_date) : ''}{u.sold_by_name ? ` by ${u.sold_by_name}` : ''}{u.broker_name ? ` with broker ${u.broker_name}` : ''}{u.customer_name ? ` · Buyer: ${u.customer_name}` : ''}
        {u.booking_id && role !== 'broker' && <> · <button className="linkbtn" onClick={() => go('bookings/' + u.booking_id)}>Open booking</button></>}</div>}

      <div className="costsheet">
        <div className="costsheet-heading"><div className="eyebrow">Cost sheet</div>{role === 'admin' && <button className="btn sm ghost" onClick={() => setEditCostSheet(true)}><Icon name="edit" />Edit cost sheet</button>}</div>
        <Row l={`Basic (${sqft(cs.sqft)} × ${inr(cs.rate)})`} v={cs.base} />
        {cs.plc > 0 && <Row l={`Premium location (${u.plc_pct}%)`} v={cs.plc} />}
        <Row l="Covered parking" v={cs.parking} /><Row l="Club membership" v={cs.club} />
        <Row l={`Registry (${cs.registry_pct}%)`} v={cs.registry} /><Row l="Maintenance deposit" v={cs.deposit} />
        <Row l="All-inclusive price" v={cs.total} strong />
        <Row l={`Stamp duty (${cs.stamp_pct}%) + registration, paid separately`} v={cs.stamp + cs.registration} muted />
      </div>

      <div className="drawer-actions">
        {['available', 'hold'].includes(u.status) && <button className="btn sun" onClick={share}><Icon name="share" />Share Unit</button>}
        <button className="btn" onClick={() => onOpenCostSheet(u, cs)}><Icon name="download" />Official Cost Sheet</button>
        <button className="btn" onClick={() => onOpenEmi(u)}><Icon name="calc" />EMI Calculator</button>
        {(u.status === 'available' || (u.status === 'hold' && holdExpired)) && role !== 'customer' && <button className="btn" onClick={() => act('hold')}><Icon name="lock" />{holdExpired ? 'Take expired hold' : 'Hold'}</button>}
        {u.status === 'hold' && !holdExpired && (mine || role === 'admin') && <button className="btn" onClick={() => act('extend')}><Icon name="clock" />Extend hold</button>}
        {u.status === 'hold' && (mine || role === 'admin') && <button className="btn" onClick={() => act('release')}>Release hold</button>}
        {canBook && ['admin', 'sales'].includes(role) && <button className="btn ink" onClick={() => setBook(true)}><Icon name="receipt" />Mark as Booked</button>}
        {canBook && ['admin', 'sales'].includes(role) && <button className="btn" onClick={() => setOffer(true)}><Icon name="edit" />Request offer</button>}
        {role === 'admin' && u.status === 'available' && <button className="btn ghost" onClick={() => act('block')}>Block</button>}
        {role === 'admin' && u.status === 'blocked' && <button className="btn ghost" onClick={() => act('unblock')}>Unblock</button>}
        {role === 'admin' && !['booked', 'sold'].includes(u.status) && <button className="btn ghost" onClick={() => setEdit(true)}><Icon name="edit" />Edit Unit</button>}
      </div>
      {role === 'broker' && u.status === 'available' && <p className="hint">To book for your client, put it on hold and ask the builder’s sales team to raise the booking. Your commission is added automatically.</p>}
      {book && <BookModal unit={u} total={cs.total} me={me} say={say} onClose={() => setBook(false)} onDone={() => { setBook(false); reload(); }} />}
      {offer && <OfferModal unit={u} total={cs.total} say={say} onClose={() => setOffer(false)} />}
      {edit && <EditUnit unit={u} say={say} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
      {editCostSheet && <EditCostSheet project={project} say={say} onClose={() => setEditCostSheet(false)} onDone={() => { setEditCostSheet(false); reloadProject(); reload(); }} />}
      </div>
    </section>
  );
}

function FlatMediaUploader({ projectId, type, say, onUploaded }) {
  const inputs = useRef({});
  const [busyKind, setBusyKind] = useState('');
  const options = [
    { kind: 'image', label: 'Photos', accept: 'image/*' },
    { kind: 'video', label: 'Videos', accept: 'video/*' },
    { kind: 'floorplan', label: 'Layout', accept: 'image/*' },
  ];
  const upload = async (kind, files) => {
    if (!files?.length) return;
    setBusyKind(kind);
    const form = new FormData();
    [...files].forEach(file => form.append('files', file));
    form.append('kind', kind);
    form.append('unit_type_id', type.id);
    try {
      await api.post(`/api/projects/${projectId}/media`, form);
      say(`${type.name} ${kind === 'floorplan' ? 'layout' : kind === 'video' ? 'videos' : 'photos'} uploaded`);
      onUploaded();
    } catch (error) { say(error.message); }
    finally { setBusyKind(''); }
  };
  return <div className="inventory-flat-uploader">
    <b>Media for {type.name}</b>
    <div>{options.map(option => <React.Fragment key={option.kind}>
      <input ref={node => { inputs.current[option.kind] = node; }} type="file" accept={option.accept} multiple hidden onChange={event => { upload(option.kind, event.target.files); event.target.value = ''; }} />
      <button className="btn sm" disabled={!!busyKind} onClick={() => inputs.current[option.kind]?.click()}>
        <Icon name="upload" />{busyKind === option.kind ? 'Uploading…' : `Add ${option.label.toLowerCase()}`}
      </button>
    </React.Fragment>)}</div>
  </div>;
}

function InventoryKpi({ icon, tone, label, value }) {
  return <div className="inventory-kpi card"><span className={'inventory-kpi-icon ' + tone}><Icon name={icon} /></span><div><span>{label}</span><b>{Number(value || 0).toLocaleString('en-IN')}</b></div></div>;
}

const Row = ({ l, v, strong, muted }) => <div className={'csrow' + (strong ? ' strong' : '') + (muted ? ' muted' : '')}><span>{l}</span><b className="num">{inr(v)}</b></div>;

function EditCostSheet({ project, say, onClose, onDone }) {
  const current = project.charges || {};
  const [rate, setRate] = useState(String(project.rate_sqft || 0));
  const [charges, setCharges] = useState({
    parking: String(current.parking ?? 0),
    club: String(current.club ?? 0),
    maintenance_deposit: String(current.maintenance_deposit ?? 0),
    registry_pct: String(current.registry_pct ?? 7.5),
    stamp_pct: String(current.stamp_pct ?? 6),
    registration: String(current.registration ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const set = key => event => setCharges(previous => ({ ...previous, [key]: event.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/api/projects/' + project.id, {
        rate_sqft: Number(rate),
        charges: Object.fromEntries(Object.entries(charges).map(([key, value]) => [key, Number(value)])),
      });
      setBusy(false);
      say('Cost sheet saved');
      onDone();
    } catch (error) { say(error.message); setBusy(false); }
  };
  const items = [
    ['parking', 'Covered parking (₹)'], ['club', 'Club membership (₹)'],
    ['maintenance_deposit', 'Maintenance deposit (₹)'], ['registry_pct', 'Registry (%)'],
    ['stamp_pct', 'Stamp duty (%)'], ['registration', 'Registration charges (₹)'],
  ];
  return <Modal title={`Edit ${project.name} cost sheet`} onClose={onClose} wide footer={<><button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save cost sheet'}</button></>}>
    <div className="kgrid">
      <Field label="Basic rate (₹ / sq ft)" id="cs-rate"><input id="cs-rate" className="input" type="number" min="0" value={rate} onChange={event => setRate(event.target.value)} /></Field>
      {items.map(([key, label]) => <Field key={key} label={label} id={'cs-' + key}><input id={'cs-' + key} className="input" type="number" min="0" step="0.01" value={charges[key]} onChange={set(key)} /></Field>)}
    </div>
    <p className="hint">These project charges update the cost sheet for all units. Per-unit PLC and fixed price overrides remain under Price &amp; PLC.</p>
  </Modal>;
}

function BookModal({ unit, total, me, say, onClose, onDone }) {
  const [leads] = useLoad(() => api.get('/api/leads'), []);
  const [quotes] = useLoad(() => api.get('/api/quotes?unit_id=' + unit.id + '&status=approved'), [unit.id]);
  const [f, setF] = useState({ lead_id: '', customer_name: '', customer_phone: '', customer_email: '', price_quote_id: '', booking_amount: Math.round(total * 0.1), payment_mode: 'NEFT', payment_ref: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const lead = leads?.find(l => l.id === f.lead_id);
  const quote = quotes?.find(q => q.id === f.price_quote_id && (!q.lead_id || q.lead_id === f.lead_id));
  const discount = Number(quote?.discount || 0);
  const submit = async () => {
    setBusy(true);
    try { const r = await api.post('/api/bookings', { unit_id: unit.id, ...f, discount, booking_amount: Number(f.booking_amount || 0), customer_name: f.customer_name || lead?.name, customer_phone: f.customer_phone || lead?.phone }); setDone(r); say(`${unit.unit_no} booked`); }
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
    <Modal title={`Book ${unit.unit_no}`} onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy || !f.customer_email || !(f.customer_name || lead)} onClick={submit}>{busy ? 'Booking…' : `Book for ${inr(total - discount)}`}</button></>}>
      <Field label="Buyer (from your leads)" id="bk-lead">
        <select id="bk-lead" className="select" value={f.lead_id} onChange={e => { const l = leads.find(x => x.id === e.target.value); setF({ ...f, lead_id: e.target.value, price_quote_id: '', customer_name: l?.name || '', customer_phone: l?.phone || '' }); }}>
          <option value="">New buyer (not in leads)</option>
          {(leads || []).filter(l => !['booked', 'lost'].includes(l.stage)).map(l => <option key={l.id} value={l.id}>{l.name} · {l.phone}</option>)}
        </select>
      </Field>
      <div className="kgrid">
        <Field label="Buyer name" id="bk-n"><input id="bk-n" className="input" value={f.customer_name} onChange={set('customer_name')} /></Field>
        <Field label="Mobile" id="bk-p"><input id="bk-p" className="input" value={f.customer_phone} onChange={set('customer_phone')} /></Field>
        <Field label="Email (portal login)" id="bk-e"><input id="bk-e" type="email" className="input" value={f.customer_email} onChange={set('customer_email')} /></Field>
        <Field label="Approved offer" id="bk-offer" hint={`List price ${inr(total)} · Discounts require admin approval`}><select id="bk-offer" className="select" value={f.price_quote_id} onChange={e => setF({ ...f, price_quote_id: e.target.value })}><option value="">No discount</option>{(quotes || []).filter(q => !q.lead_id || q.lead_id === f.lead_id).map(q => <option key={q.id} value={q.id}>{inr(q.discount)} off · {inr(q.proposed_price)} · expires {date(q.expires_at)}</option>)}</select></Field>
        <Field label="Booking amount received (₹)" id="bk-a"><input id="bk-a" className="input" inputMode="numeric" value={f.booking_amount} onChange={set('booking_amount')} /></Field>
        <Field label="Mode / reference" id="bk-m"><div style={{ display: 'flex', gap: 6 }}><select id="bk-m" className="select" style={{ width: 110 }} value={f.payment_mode} onChange={set('payment_mode')}><option>NEFT</option><option>Cheque</option><option>UPI</option><option>RTGS</option></select><input aria-label="Reference" className="input" placeholder="UTR / cheque no." value={f.payment_ref} onChange={set('payment_ref')} /></div></Field>
      </div>
    </Modal>
  );
}

function OfferModal({ unit, total, say, onClose }) {
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const save = async () => {
    setBusy(true);
    try {
      const quote = await api.post('/api/quotes', { unit_id: unit.id, discount: Number(discount), note });
      setResult(quote);
      say(quote.status === 'approved' ? 'Offer approved and ready to use' : 'Offer sent for admin approval');
    } catch (error) { say(error.message); }
    setBusy(false);
  };
  return <Modal title={result ? 'Offer submitted' : `Request offer · ${unit.unit_no}`} onClose={onClose}
    footer={result ? <button className="btn sun" onClick={onClose}>Done</button> : <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy || !Number(discount) || Number(discount) >= total} onClick={save}>{busy ? 'Sending…' : 'Submit offer'}</button></>}>
    {result ? <div className="note">{result.status === 'approved' ? 'Approved immediately.' : 'The builder admin will review this offer.'} It expires {date(result.expires_at)}.</div> : <>
      <p className="muted">List price: <b>{inr(total)}</b>. Discounts are recorded and expire after 7 days.</p>
      <Field label="Requested discount (₹)" id="offer-discount"><input id="offer-discount" className="input" type="number" min="1" max={total - 1} value={discount} onChange={e => setDiscount(e.target.value)} /></Field>
      <Field label="Reason / buyer context" id="offer-note"><textarea id="offer-note" className="input" rows="3" maxLength="1000" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <p className="hint">Proposed price: {inr(total - Number(discount || 0))}</p>
    </>}
  </Modal>;
}

function OfferApprovals({ say, onClose }) {
  const [quotes, reload] = useLoad(() => api.get('/api/quotes?status=pending'), []);
  const [busy, setBusy] = useState(null);
  const decide = async (quote, status) => {
    setBusy(quote.id);
    try {
      await api.patch('/api/quotes/' + quote.id, { status });
      say(`Offer ${status}`);
      reload();
    } catch (error) { say(error.message); }
    setBusy(null);
  };
  return <Modal title="Pending offer approvals" onClose={onClose} wide footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
    {!quotes ? <Loading /> : quotes.length === 0 ? <Empty icon="checkCircle" title="No pending offers" /> :
      <div className="table-wrap"><table><thead><tr><th>Unit</th><th>Requested by</th><th>Discount</th><th>Proposed price</th><th>Expires</th><th>Decision</th></tr></thead><tbody>
        {quotes.map(q => <tr key={q.id}><td><b>{q.unit_no}</b><small className="muted">{q.project_name}{q.lead_name ? ` · ${q.lead_name}` : ''}</small>{q.note && <small>{q.note}</small>}</td><td>{q.created_by_name}</td><td>{inr(q.discount)}</td><td>{inr(q.proposed_price)}</td><td>{date(q.expires_at)}</td><td><div className="inline-actions"><button className="btn sm sun" disabled={busy === q.id} onClick={() => decide(q, 'approved')}>Approve</button><button className="btn sm ghost" disabled={busy === q.id} onClick={() => decide(q, 'rejected')}>Reject</button></div></td></tr>)}
      </tbody></table></div>}
  </Modal>;
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
