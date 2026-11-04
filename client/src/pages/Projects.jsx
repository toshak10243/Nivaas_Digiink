import React, { useRef, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Modal, Field, Seg, Switch, useLoad, Loading, Empty } from '../components/ui.jsx';
import { money, inr, sqft, date } from '../lib/format.js';
import ShareModal from '../components/ShareModal.jsx';

export default function Projects({ say, go, params }) {
  const [list, reload] = useLoad(() => api.get('/api/projects'), []);
  const [adding, setAdding] = useState(false);
  const [share, setShare] = useState(null);

  const shareProject = async (p, e) => {
    if (e) e.stopPropagation();
    try {
      const s = await api.post('/api/share', { project_id: p.id });
      setShare({
        url: s.url,
        title: p.name,
        project: p,
        text: `Namaste! Here are the details, photos, floor plans and prices for ${p.name}:`,
      });
    } catch (err) {
      say(err.message);
    }
  };

  if (params[0]) return <ProjectEditor id={params[0]} say={say} go={go} onShare={setShare} shareModal={share} onCloseShare={() => setShare(null)} />;
  if (!list) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <div className="pagehead"><div style={{ flex: 1 }}><h2>Projects</h2><p>Everything your team shares with buyers comes from here: photos, videos, floor plans, prices and payment plans.</p></div>
        <button className="btn sun" onClick={() => setAdding(true)}><Icon name="plus" />New project</button></div>
      {list.length === 0 && <Empty icon="building" title="Add your first project" />}
      <div className="projgrid">{list.map(p => (
        <div key={p.id} className="projcard" onClick={() => go('projects/' + p.id)} style={{ cursor: 'pointer', position: 'relative' }}>
          <div className="pc-img">{p.cover_url ? <img src={api.media(p.cover_url)} alt="" /> : <Icon name="building" />}<span className="pc-status">{p.status.replace('_', ' ')}</span></div>
          <div className="pc-b">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <div><b>{p.name}</b><span className="muted" style={{ display: 'block' }}>{p.location || p.city}</span></div>
              <button
                type="button"
                className="btn sm sun"
                onClick={e => shareProject(p, e)}
                title="Share on WhatsApp"
                style={{ padding: '4px 8px', fontSize: 12, flexShrink: 0 }}
              >
                <Icon name="share" style={{ width: 14, height: 14 }} /> Share
              </button>
            </div>
            <div className="pc-stats"><span><b className="num">{p.available}</b> available</span><span><b className="num">{p.sold}</b> sold</span><span><b className="num">{p.total}</b> total</span></div>
            <div className="paybar"><i style={{ width: `${p.total ? (p.sold / p.total) * 100 : 0}%` }} /></div>
            <span className="muted" style={{ fontSize: 13 }}>{p.bhks ? `${p.bhks} BHK · ` : ''}from {money(p.from_price)} basic</span>
          </div>
        </div>
      ))}</div>
      {adding && <NewProject say={say} onClose={() => setAdding(false)} onDone={p => { setAdding(false); reload(); go('projects/' + p.id); }} />}
      {share && <ShareModal {...share} say={say} onClose={() => setShare(null)} />}
    </div>
  );
}

function NewProject({ say, onClose, onDone }) {
  const [f, setF] = useState({ name: '', city: 'Jaipur', rate_sqft: '' });
  const save = async () => { try { onDone(await api.post('/api/projects', { ...f, rate_sqft: Number(f.rate_sqft) })); say('Project created. Add unit types, then towers.'); } catch (e) { say(e.message); } };
  return (
    <Modal title="New project" onClose={onClose} footer={<button className="btn sun" disabled={!f.name} onClick={save}>Create</button>}>
      <Field label="Project name" id="np-n"><input id="np-n" className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div className="kgrid"><Field label="City" id="np-c"><input id="np-c" className="input" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Basic rate (₹ per sq ft, super area)" id="np-r"><input id="np-r" className="input" inputMode="numeric" value={f.rate_sqft} onChange={e => setF({ ...f, rate_sqft: e.target.value })} /></Field></div>
    </Modal>
  );
}

const TABS = [['overview', 'Overview'], ['pricing', 'Pricing & plan'], ['types', 'Unit types'], ['towers', 'Towers'], ['media', 'Photos & videos'], ['updates', 'Construction updates'], ['team', 'Sales team']];

function ProjectEditor({ id, say, go, onShare, shareModal, onCloseShare }) {
  const [p, reload] = useLoad(() => api.get('/api/projects/' + id), [id]);
  const [tab, setTab] = useState('overview');
  if (!p) return <div className="page"><Loading /></div>;
  const save = async patch => { try { await api.put('/api/projects/' + id, patch); say('Saved'); reload(); } catch (e) { say(e.message); } };
  const shareThis = async () => {
    try {
      const s = await api.post('/api/share', { project_id: p.id });
      onShare({
        url: s.url,
        title: p.name,
        project: p,
        text: `Namaste! Here are the details, photos, floor plans and prices for ${p.name}:`,
      });
    } catch (err) {
      say(err.message);
    }
  };
  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={() => go('projects')}><Icon name="back" />All projects</button>
        <button className="btn sun sm" onClick={shareThis}><Icon name="share" />Share project on WhatsApp</button>
      </div>
      <div className="pe-head">{p.cover_url && <img src={api.media(p.cover_url)} alt="" />}<div><h2>{p.name}</h2><p className="muted">{p.stats.total} homes · {p.stats.available} available · {p.stats.hold} on hold · {p.stats.sold} sold</p></div>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => go('inventory')}><Icon name="grid" />Inventory</button></div>
      <nav className="settabs row" aria-label="Project sections">{TABS.map(([k, l]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'overview' && <Overview p={p} save={save} />}
      {tab === 'pricing' && <Pricing p={p} save={save} />}
      {tab === 'types' && <Types p={p} say={say} reload={reload} />}
      {tab === 'towers' && <Towers p={p} say={say} reload={reload} />}
      {tab === 'media' && <Media p={p} say={say} reload={reload} save={save} />}
      {tab === 'updates' && <Updates p={p} say={say} reload={reload} />}
      {tab === 'team' && <Pool p={p} save={save} />}
      {shareModal && <ShareModal {...shareModal} say={say} onClose={onCloseShare} />}
    </div>
  );
}

function Overview({ p, save }) {
  const [f, setF] = useState({ name: p.name, tagline: p.tagline || '', description: p.description || '', location: p.location || '', city: p.city || '', map_url: p.map_url || '', rera_no: p.rera_no || '', status: p.status, possession: p.possession || '',
    amenities: (p.amenities || []).join(', '), highlights: (p.highlights || []).join('\n') });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card"><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="kgrid">
        <Field label="Project name" id="po-n"><input id="po-n" className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="One-line pitch" id="po-t"><input id="po-t" className="input" value={f.tagline} onChange={set('tagline')} /></Field>
        <Field label="Location" id="po-l"><input id="po-l" className="input" value={f.location} onChange={set('location')} /></Field>
        <Field label="City" id="po-c"><input id="po-c" className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="RERA registration no." id="po-r"><input id="po-r" className="input" value={f.rera_no} onChange={set('rera_no')} /></Field>
        <Field label="Possession" id="po-p"><input id="po-p" className="input" value={f.possession} onChange={set('possession')} placeholder="Dec 2027" /></Field>
        <Field label="Status" id="po-s"><select id="po-s" className="select" value={f.status} onChange={set('status')}><option value="pre_launch">Pre-launch</option><option value="under_construction">Under construction</option><option value="ready">Ready to move</option></select></Field>
        <Field label="Google Maps link" id="po-m"><input id="po-m" className="input" value={f.map_url} onChange={set('map_url')} /></Field>
      </div>
      <Field label="Description (shown to buyers)" id="po-d"><textarea id="po-d" className="textarea" rows={4} value={f.description} onChange={set('description')} /></Field>
      <div className="kgrid">
        <Field label="Amenities (comma separated)" id="po-a"><textarea id="po-a" className="textarea" rows={3} value={f.amenities} onChange={set('amenities')} /></Field>
        <Field label="Highlights (one per line)" id="po-h"><textarea id="po-h" className="textarea" rows={3} value={f.highlights} onChange={set('highlights')} /></Field>
      </div>
      <button className="btn sun" style={{ alignSelf: 'flex-start' }} onClick={() => save({ ...f, amenities: f.amenities.split(',').map(s => s.trim()).filter(Boolean), highlights: f.highlights.split('\n').map(s => s.trim()).filter(Boolean) })}>Save</button>
    </div></div>
  );
}

function Pricing({ p, save }) {
  const [rate, setRate] = useState(p.rate_sqft);
  const [c, setC] = useState({ parking: 0, club: 0, maintenance_deposit: 0, gst_pct: 5, stamp_pct: 6, registration: 0, ...p.charges });
  const [plan, setPlan] = useState(p.payment_plan || []);
  const total = plan.reduce((a, m) => a + Number(m.pct || 0), 0);
  const num = (k, l, hint) => <Field label={l} hint={hint} id={'pc-' + k}><input id={'pc-' + k} className="input" inputMode="decimal" value={c[k]} onChange={e => setC({ ...c, [k]: e.target.value })} /></Field>;
  return (
    <div className="card"><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="kgrid">
        <Field label="Basic rate (₹ / sq ft on super area)" id="pc-rate"><input id="pc-rate" className="input" inputMode="numeric" value={rate} onChange={e => setRate(e.target.value)} /></Field>
        {num('parking', 'Covered parking (₹)')}{num('club', 'Club membership (₹)')}{num('maintenance_deposit', 'Maintenance deposit (₹)')}
        {num('gst_pct', 'GST (%)', 'Under-construction residential is usually 5% (1% affordable). Confirm with your CA.')}{num('stamp_pct', 'Stamp duty (%)', 'Shown to buyers as extra')}{num('registration', 'Registration (₹)')}
      </div>
      <div><div className="eyebrow" style={{ marginBottom: 8 }}>Payment plan · {total}% {total !== 100 && <span style={{ color: 'var(--hot)' }}>(must add up to 100%)</span>}</div>
        <div className="planrows">{plan.map((m, i) => (
          <div key={i} className="editrow" style={{ gridTemplateColumns: '1fr 90px 38px' }}>
            <input className="input" aria-label="Milestone" value={m.milestone} onChange={e => setPlan(plan.map((x, j) => j === i ? { ...x, milestone: e.target.value } : x))} />
            <input className="input" aria-label="Percent" inputMode="decimal" value={m.pct} onChange={e => setPlan(plan.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x))} />
            <button className="iconbtn" aria-label="Remove" onClick={() => setPlan(plan.filter((_, j) => j !== i))}><Icon name="trash" /></button>
          </div>))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPlan([...plan, { milestone: '', pct: 0 }])}><Icon name="plus" />Add milestone</button></div></div>
      <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={total !== 100} onClick={() => save({ rate_sqft: Number(rate), charges: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])), payment_plan: plan })}>Save pricing</button>
      <p className="hint" style={{ margin: 0 }}>Price changes apply to available units immediately. Existing bookings keep their agreed value.</p>
    </div></div>
  );
}

function Types({ p, say, reload }) {
  const [f, setF] = useState({ name: '', bhk: 3, carpet_sqft: '', builtup_sqft: '', super_sqft: '', bathrooms: 2, balconies: 1 });
  const add = async () => { try { await api.post(`/api/projects/${p.id}/unit-types`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === 'name' ? v : Number(v)]))); say('Unit type added'); setF({ ...f, name: '', carpet_sqft: '', builtup_sqft: '', super_sqft: '' }); reload(); } catch (e) { say(e.message); } };
  return (
    <div className="card">
      <div className="tablewrap"><table>
        <thead><tr><th>Type</th><th>BHK</th><th>Carpet</th><th>Built-up</th><th>Super</th><th>Bath / balcony</th><th>Basic price</th><th>Floor plan</th></tr></thead>
        <tbody>{p.unit_types.map(t => <tr key={t.id} style={{ cursor: 'default' }}><td><b>{t.name}</b></td><td>{t.bhk}</td><td>{sqft(t.carpet_sqft)}</td><td>{sqft(t.builtup_sqft)}</td><td>{sqft(t.super_sqft)}</td><td>{t.bathrooms} / {t.balconies}</td><td className="num">{money(t.super_sqft * p.rate_sqft)}</td>
          <td>{t.floorplan_url ? <img src={api.media(t.floorplan_url)} alt="" style={{ height: 44, borderRadius: 6, border: '1px solid var(--line)' }} /> : <span className="muted">Upload under Photos</span>}</td></tr>)}</tbody>
      </table></div>
      <div className="card-b" style={{ borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Add a unit type</b>
        <div className="kgrid">
          <Field label="Name" id="ut-n"><input id="ut-n" className="input" placeholder="3 BHK Premium" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          {[['bhk', 'BHK'], ['carpet_sqft', 'Carpet sq ft'], ['builtup_sqft', 'Built-up sq ft'], ['super_sqft', 'Super built-up sq ft'], ['bathrooms', 'Bathrooms'], ['balconies', 'Balconies']].map(([k, l]) =>
            <Field key={k} label={l} id={'ut-' + k}><input id={'ut-' + k} className="input" inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}
        </div>
        <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={!f.name || !f.super_sqft} onClick={add}><Icon name="plus" />Add type</button>
      </div>
    </div>
  );
}

function Towers({ p, say, reload }) {
  const [f, setF] = useState({ name: '', floors: 10, per_floor: 4 });
  const [types, setTypes] = useState([]);
  const n = Number(f.per_floor) || 0;
  const add = async () => {
    try { await api.post(`/api/projects/${p.id}/towers`, { name: f.name, floors: Number(f.floors), per_floor: n, types: Array.from({ length: n }, (_, i) => types[i] || p.unit_types[0]?.id) }); say(`Tower ${f.name} created with ${f.floors * n} homes`); setF({ ...f, name: '' }); reload(); }
    catch (e) { say(e.message); }
  };
  return (
    <div className="card"><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="list">{p.towers.map(t => <div key={t.id} className="lrow"><Icon name="building" style={{ width: 18, height: 18 }} /><b style={{ flex: 1 }}>Tower {t.name}</b><span className="muted">{t.floors} floors</span></div>)}</div>
      <b>Add a tower</b>
      {!p.unit_types.length ? <div className="note">Add unit types first.</div> : <>
        <div className="kgrid">
          <Field label="Tower name / letter" id="tw-n"><input id="tw-n" className="input" placeholder="C" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Floors" id="tw-f"><input id="tw-f" className="input" inputMode="numeric" value={f.floors} onChange={e => setF({ ...f, floors: e.target.value })} /></Field>
          <Field label="Homes per floor" id="tw-p"><input id="tw-p" className="input" inputMode="numeric" value={f.per_floor} onChange={e => setF({ ...f, per_floor: e.target.value })} /></Field>
        </div>
        <div className="eyebrow">Which type is each position on the floor?</div>
        <div className="kgrid">{Array.from({ length: Math.min(n, 12) }, (_, i) => (
          <Field key={i} label={`Position ${String(i + 1).padStart(2, '0')}`} id={'tw-t' + i}><select id={'tw-t' + i} className="select" value={types[i] || p.unit_types[0].id} onChange={e => { const x = [...types]; x[i] = e.target.value; setTypes(x); }}>{p.unit_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        ))}</div>
        <p className="hint" style={{ margin: 0 }}>Units are numbered floor + position + tower, e.g. {`3${'02'}-${f.name || 'C'}`}. You can set premium-location charges per unit later from Inventory.</p>
        <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={!f.name} onClick={add}><Icon name="plus" />Create {Number(f.floors) * n || 0} homes</button>
      </>}
    </div></div>
  );
}

function Media({ p, say, reload, save }) {
  const input = useRef(null);
  const [kind, setKind] = useState('image');
  const [typeId, setTypeId] = useState(p.unit_types[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const upload = async files => {
    if (!files.length) return; setBusy(true);
    const fd = new FormData(); [...files].forEach(f => fd.append('files', f)); fd.append('kind', kind); if (kind === 'floorplan') fd.append('unit_type_id', typeId);
    try { await api.post(`/api/projects/${p.id}/media`, fd); say(`${files.length} file(s) uploaded`); reload(); } catch (e) { say(e.message); }
    setBusy(false);
  };
  const del = async m => { await api.del('/api/media/' + m.id); say('Removed'); reload(); };
  return (
    <div className="card"><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="uploadbar">
        <Seg value={kind} onChange={setKind} label="Upload as" options={[['image', 'Photos'], ['video', 'Videos'], ['floorplan', 'Floor plan'], ['brochure', 'Brochure PDF']]} />
        {kind === 'floorplan' && <select className="select" style={{ width: 180 }} value={typeId} onChange={e => setTypeId(e.target.value)} aria-label="For unit type">{p.unit_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        <button className="btn sun" disabled={busy} onClick={() => input.current.click()}><Icon name="upload" />{busy ? 'Uploading…' : 'Upload'}</button>
        <input ref={input} type="file" hidden multiple accept={kind === 'video' ? 'video/*' : kind === 'brochure' ? 'application/pdf' : 'image/*'} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="mediagrid">{p.media.map(m => (
        <figure key={m.id} className="mitem">
          {m.kind === 'video' ? <video src={api.media(m.url)} muted controls preload="metadata" /> : m.kind === 'brochure' ? <span className="mdoc"><Icon name="file" />PDF</span> : m.kind === 'youtube' ? <span className="mdoc"><Icon name="play" />YouTube</span> : <img src={api.media(m.url)} alt={m.title} />}
          <figcaption><span>{m.title}</span><span className="muted">{m.kind}</span></figcaption>
          <div className="mact">{m.kind === 'image' && <button className="btn sm" onClick={() => save({ cover_url: m.url })}>{p.cover_url === m.url ? 'Cover ✓' : 'Make cover'}</button>}<button className="iconbtn" aria-label="Delete" onClick={() => del(m)}><Icon name="trash" /></button></div>
        </figure>
      ))}</div>
      <p className="hint" style={{ margin: 0 }}>Photos up to 60 MB each. Videos play right inside the buyer’s link. For long films, upload to YouTube and paste the link via the API, or keep them under 60 MB.</p>
    </div></div>
  );
}

function Updates({ p, say, reload }) {
  const [f, setF] = useState({
    title: '',
    body: '',
    tower_id: '',
    stage_name: 'Superstructure (Slab Casting)',
    progress_pct: 50,
    media_url: ''
  });
  const [busy, setBusy] = useState(false);

  const STAGES = [
    'Excavation & Raft Foundation',
    'Basement & Plinth Level',
    'Superstructure (Slab Casting)',
    'Brickwork & Internal Plastering',
    'Flooring, Electrical & Plumbing (MEP)',
    'External Facade & Paint',
    'Lifts & Clubhouse Amenities',
    'OC Received & Ready for Possession'
  ];

  const post = async () => {
    if (!f.title) return;
    setBusy(true);
    try {
      const urls = f.media_url ? f.media_url.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [];
      await api.post(`/api/projects/${p.id}/updates`, {
        ...f,
        media_urls: urls,
        media_url: urls[0] || null
      });
      say('Construction update posted! Relevant buyers have been notified in their portal.');
      setF({
        title: '',
        body: '',
        tower_id: '',
        stage_name: 'Superstructure (Slab Casting)',
        progress_pct: 50,
        media_url: ''
      });
      reload();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  const removeUpdate = async (uId) => {
    if (!window.confirm('Delete this construction update?')) return;
    try {
      await api.delete(`/api/projects/${p.id}/updates/${uId}`);
      say('Update removed');
      reload();
    } catch (e) {
      say(e.message);
    }
  };

  return (
    <div className="card">
      <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Post Verified Construction Update</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              Publish verified stage milestones, photos, and progress. Buyers see this in their portal tracker automatically.
            </span>
          </div>
        </div>

        <div className="kgrid">
          <Field label="Tower / Phase" id="pu-tw">
            <select id="pu-tw" className="select" value={f.tower_id} onChange={e => setF({ ...f, tower_id: e.target.value })}>
              <option value="">All Towers / Entire Project</option>
              {(p.towers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <Field label="Construction Stage" id="pu-st">
            <select id="pu-st" className="select" value={f.stage_name} onChange={e => setF({ ...f, stage_name: e.target.value })}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label={`Stage Progress: ${f.progress_pct}%`} id="pu-pct">
            <input
              id="pu-pct"
              type="range"
              min="0"
              max="100"
              step="5"
              value={f.progress_pct}
              onChange={e => setF({ ...f, progress_pct: Number(e.target.value) })}
              style={{ width: '100%', marginTop: 8 }}
            />
          </Field>

          <Field label="Headline / Milestone Title" id="pu-t">
            <input id="pu-t" className="input" placeholder="e.g. 7th floor slab cast & water curing begun" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          </Field>
        </div>

        <Field label="Site Inspection Details & Materials Quality" id="pu-b">
          <textarea id="pu-b" className="textarea" rows={2} placeholder="e.g. Cube test strength verified by site engineer. Shuttering started for 8th floor." value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
        </Field>

        <Field label="Verified Photo / Video Links (comma or newline separated)" id="pu-m">
          <input id="pu-m" className="input" placeholder="https://example.com/photo1.jpg, https://example.com/site-video.mp4" value={f.media_url} onChange={e => setF({ ...f, media_url: e.target.value })} />
        </Field>

        <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={busy || !f.title} onClick={post}>
          {busy ? 'Publishing…' : 'Publish Verified Update to Buyers'}
        </button>

        <div className="eyebrow" style={{ marginTop: 14 }}>Published Construction Timeline ({p.updates.length})</div>
        <div className="timeline">
          {p.updates.length === 0 ? (
            <span className="muted">No updates published yet.</span>
          ) : (
            p.updates.map(u => (
              <div key={u.id} className="tl">
                <i className="s" />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b>{u.title}</b>
                    {u.tower_name && <span className="visit-badge">{u.tower_name}</span>}
                    {u.stage_name && <span className="visit-badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', borderColor: 'transparent' }}>{u.stage_name}</span>}
                    {u.progress_pct > 0 && <span className="visit-badge">{u.progress_pct}%</span>}
                  </div>
                  {u.body && <span className="muted" style={{ display: 'block', margin: '4px 0', fontSize: 13 }}>{u.body}</span>}
                  {u.media_urls?.length > 0 && (
                    <div className="progress-gallery" style={{ marginTop: 6, marginBottom: 6 }}>
                      {u.media_urls.map((img, i) => (
                        <a key={i} href={img} target="_blank" rel="noreferrer">
                          <img src={img} alt="site update" className="progress-thumb" onError={e => { e.target.style.display = 'none'; }} />
                        </a>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <small className="muted">{date(u.created_at)}</small>
                    <button className="linkbtn" style={{ color: '#ef4444', fontSize: 11.5 }} onClick={() => removeUpdate(u.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Pool({ p, save }) {
  const [team] = useLoad(() => api.get('/api/team?role=sales'), []);
  const [pool, setPool] = useState(p.sales_pool || []);
  if (!team) return <Loading />;
  return (
    <div className="card"><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0 }}>Who should receive leads for <b>{p.name}</b>? Leave everyone off to share leads across the whole sales team.</p>
      {team.map(u => <div key={u.id} className="setrow"><div><b>{u.name}</b><span>{u.open_leads} open leads · {u.profile?.availability || 'available'}</span></div><Switch on={pool.includes(u.id)} label={u.name} onChange={v => setPool(v ? [...pool, u.id] : pool.filter(x => x !== u.id))} /></div>)}
      <button className="btn sun" style={{ alignSelf: 'flex-start' }} onClick={() => save({ sales_pool: pool })}>Save</button>
    </div></div>
  );
}
