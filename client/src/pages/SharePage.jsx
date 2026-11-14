// Public page a sales agent / broker shares on WhatsApp. No login.
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Logo, Loading } from '../components/ui.jsx';
import { inr, money, sqft, phone } from '../lib/format.js';
import { emi } from '../lib/pricing.js';

export default function SharePage({ token, say }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/p/' + token).then(setD).catch(e => setError(e.message)); }, [token]);
  if (error) return <div className="sp-error"><Logo /><h2>{error}</h2><p className="muted">Ask your advisor to send a fresh link.</p></div>;
  if (!d) return <div className="boot"><Loading /></div>;
  return <Share d={d} token={token} say={say} />;
}

function Share({ d, token, say }) {
  const p = d.project;
  const types = d.unit_types;
  const startUnit = d.units.find(u => u.id === d.unit_id) || null;
  const [unitId, setUnitId] = useState(startUnit?.id || null);
  const unit = d.units.find(u => u.id === unitId) || null;
  const [typeId, setTypeId] = useState(startUnit?.unit_type_id || types[0]?.id);
  const type = types.find(t => t.id === (unit?.unit_type_id || typeId));
  const gallery = useMemo(() => {
    const g = d.media.filter(m => ['image', 'video', 'youtube'].includes(m.kind));
    const plan = d.media.find(m => m.kind === 'floorplan' && m.unit_type_id === type?.id);
    return plan ? [g[0], plan, ...g.slice(1)].filter(Boolean) : g;
  }, [d.media, type?.id]);
  const [shot, setShot] = useState(0);
  useEffect(() => { setShot(0); }, [type?.id]);
  const cost = unit?.cost || d.units.find(u => u.unit_type_id === type?.id && u.status === 'available')?.cost || d.units.find(u => u.unit_type_id === type?.id)?.cost;
  const avail = d.units.filter(u => u.unit_type_id === type?.id && u.status === 'available');
  const cur = gallery[shot];
  const agentPhone = String(d.agent?.phone || d.org.phone || '').replace(/\D/g, '');

  return (
    <div className="sp">
      <div style={{ background: 'linear-gradient(90deg, #4f46e5, #7c3aed)', color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>VERIFIED DEVELOPER PROJECT KIT · REAL-TIME PRICING & AVAILABILITY</span>
        <span style={{ fontSize: 11, opacity: 0.9 }}>Live Developer Synced</span>
      </div>
      <header className="sp-top">
        <div className="sp-brand"><span className="sp-org">{d.org.name}</span><span className="muted">· {p.name}</span></div>
        {d.agent && <a className="btn sun sm" href={`https://wa.me/${agentPhone}?text=${encodeURIComponent(`Hi ${d.agent.name.split(' ')[0]}, I saw ${unit ? 'flat ' + unit.unit_no : p.name} and want to know more.`)}`} target="_blank" rel="noreferrer"><Icon name="wa" />Chat with {d.agent.name.split(' ')[0]}</a>}
      </header>

      <section className="sp-hero">
        <div className="sp-stage">
          {cur?.kind === 'video' ? <video key={cur.url} src={api.media(cur.url)} controls autoPlay muted playsInline poster={api.media(gallery.find(g => g.kind === 'image')?.url)} />
            : cur?.kind === 'youtube' ? <a className="sp-yt" href={cur.url} target="_blank" rel="noreferrer"><Icon name="play" /><span>Watch on YouTube</span></a>
              : cur ? <img src={api.media(cur.url)} alt={cur.title} /> : null}
          {cur?.title && <span className="sp-cap">{cur.title}</span>}
        </div>
        <div className="sp-thumbs">{gallery.map((m, i) => (
          <button key={m.url + i} aria-label={m.title} aria-pressed={i === shot} onClick={() => setShot(i)}>
            {m.kind === 'video' || m.kind === 'youtube' ? <span className="sp-play"><Icon name="play" />Video</span> : <img src={api.media(m.url)} alt="" />}
          </button>
        ))}</div>
      </section>

      <div className="sp-body">
        <main className="sp-main">
          <div>
            <div className="sp-tags"><span>{p.status === 'ready' ? 'Ready to move' : p.status === 'pre_launch' ? 'Pre-launch' : 'Under construction'}</span><span>Possession {p.possession}</span>{p.rera_no && <span>RERA {p.rera_no}</span>}</div>
            <h1 className="sp-title">{unit ? <>Flat {unit.unit_no} <em>at</em> {p.name}</> : p.name}</h1>
            <p className="sp-lede">{p.tagline}</p>
            <p className="sp-loc"><Icon name="pin" />{p.location}, {p.city}{p.map_url && <> · <a href={p.map_url} target="_blank" rel="noreferrer">Open map</a></>}</p>
          </div>

          {unit && unit.status !== 'available' && <div className="note">Flat {unit.unit_no} has just been booked. Here are similar homes that are still available.</div>}

          <section>
            <h2 className="sp-h">Choose a home</h2>
            <div className="sp-types">{types.map(t => (
              <button key={t.id} aria-pressed={t.id === type?.id} onClick={() => { setTypeId(t.id); if (unit && unit.unit_type_id !== t.id) setUnitId(null); }}>
                <b>{t.name}</b><span>{sqft(t.carpet_sqft)} carpet</span><span className="num">{d.units.filter(u => u.unit_type_id === t.id && u.status === 'available').length} available</span>
              </button>
            ))}</div>
            {type && <div className="sp-specs"><div><span>Carpet</span><b>{sqft(type.carpet_sqft)}</b></div><div><span>Built-up</span><b>{sqft(type.builtup_sqft)}</b></div><div><span>Super built-up</span><b>{sqft(type.super_sqft)}</b></div><div><span>Bath / balcony</span><b>{type.bathrooms} / {type.balconies}</b></div></div>}
            <div className="sp-units">{avail.length === 0 ? <span className="muted">All {type?.name} homes are booked. Ask your advisor about upcoming releases.</span> : avail.map(u => (
              <button key={u.id} aria-pressed={u.id === unitId} onClick={() => setUnitId(u.id)}><b>{u.unit_no}</b><span>Floor {u.floor}{u.facing ? ` · ${u.facing}` : ''}</span><span className="num">{money(u.cost.total)}</span></button>
            ))}</div>
          </section>

          {p.description && <section><h2 className="sp-h">About the project</h2><p className="sp-text">{p.description}</p>
            {p.highlights?.length > 0 && <ul className="sp-hl">{p.highlights.map(h => <li key={h}><Icon name="check" />{h}</li>)}</ul>}</section>}
          {p.amenities?.length > 0 && <section><h2 className="sp-h">Amenities</h2><div className="sp-amen">{p.amenities.map(a => <span key={a}>{a}</span>)}</div></section>}
          {p.payment_plan?.length > 0 && <section><h2 className="sp-h">Payment plan</h2>
            <div className="sp-plan">{p.payment_plan.map((m, i) => <div key={i}><span className="num">{m.pct}%</span><span>{m.milestone}</span>{cost && <b className="num">{money(cost.total * m.pct / 100)}</b>}</div>)}</div></section>}
          <Enquire token={token} unit={unit} agent={d.agent} say={say} />
        </main>

        <aside className="sp-side">
          {cost && <CostCard cost={cost} unit={unit} type={type} />}
          {cost && <Emi price={cost.total} defaults={d.emi} />}
        </aside>
      </div>

      <footer className="sp-foot">
        <b>{d.org.name}</b><span>{d.org.address}</span>{d.org.rera_promoter && <span>Promoter RERA {d.org.rera_promoter}</span>}
        <span className="muted">Prices and charges are indicative and may change. Please confirm the final cost sheet with the developer before booking.</span>
        <span className="muted">Shared by {d.agent?.name}{d.agent?.firm ? `, ${d.agent.firm}` : ''} · Powered by Nivaas</span>
      </footer>
    </div>
  );
}

function CostCard({ cost, unit, type }) {
  const rows = [[`Basic price (${sqft(cost.sqft)} × ${inr(cost.rate)})`, cost.base], ...(cost.plc ? [['Premium location charge', cost.plc]] : []), ['Covered parking', cost.parking], ['Club membership', cost.club], [`Registry (${cost.registry_pct}%)`, cost.registry], ['Maintenance deposit', cost.deposit]];
  return (
    <div className="sp-card">
      <span className="eyebrow">{unit ? `Flat ${unit.unit_no}` : `${type?.name}, starting`}</span>
      <div className="sp-price num">{money(cost.total)}</div>
      <span className="muted" style={{ fontSize: 13 }}>All-inclusive · stamp duty & registration extra</span>
      <details className="sp-break"><summary>See cost breakdown</summary>
        {rows.map(([l, v]) => <div key={l} className="csrow"><span>{l}</span><b className="num">{inr(v)}</b></div>)}
        <div className="csrow strong"><span>All-inclusive</span><b className="num">{inr(cost.total)}</b></div>
        <div className="csrow muted"><span>Stamp duty ({cost.stamp_pct}%) + registration</span><b className="num">{inr(cost.stamp + cost.registration)}</b></div>
      </details>
    </div>
  );
}

function Emi({ price, defaults }) {
  const [down, setDown] = useState(defaults?.down_pct ?? 20);
  const [rate, setRate] = useState(defaults?.rate ?? 8.6);
  const [years, setYears] = useState(defaults?.tenure_years ?? 20);
  const loan = Math.round(price * (1 - down / 100));
  const m = emi(loan, rate, years);
  const interest = m * years * 12 - loan;
  const pPct = loan / (loan + interest) * 100;
  return (
    <div className="sp-card">
      <span className="eyebrow"><Icon name="calc" style={{ width: 14, height: 14, verticalAlign: -2 }} /> EMI calculator</span>
      <div className="sp-emi num">{inr(m)}<small>/month</small></div>
      <div className="emibar" role="img" aria-label={`Principal ${Math.round(pPct)}%, interest ${Math.round(100 - pPct)}%`}><i style={{ width: `${pPct}%` }} /></div>
      <div className="emileg"><span><i className="pr" />Loan {money(loan)}</span><span><i className="in" />Interest {money(interest)}</span></div>
      <label className="slider"><span>Down payment <b className="num">{down}% · {money(price * down / 100)}</b></span><input type="range" min="10" max="60" step="5" value={down} onChange={e => setDown(Number(e.target.value))} /></label>
      <label className="slider"><span>Loan tenure <b className="num">{years} years</b></span><input type="range" min="5" max="30" value={years} onChange={e => setYears(Number(e.target.value))} /></label>
      <label className="slider"><span>Interest rate <b className="num">{rate}% p.a.</b></span><input type="range" min="7" max="12" step="0.1" value={rate} onChange={e => setRate(Number(e.target.value))} /></label>
      <span className="muted" style={{ fontSize: 12 }}>Estimate only. Your bank decides the final rate and eligibility.</span>
    </div>
  );
}

function Enquire({ token, unit, agent, say }) {
  const [f, setF] = useState({ name: '', phone: '', visit: '', message: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/p/${token}/enquire`, { ...f, unit_no: unit?.unit_no }); setSent(true); } catch (x) { say(x.message); }
    setBusy(false);
  };
  if (sent) return <section className="sp-enq done"><Icon name="checkCircle" /><h2 className="sp-h">Thank you, {f.name.split(' ')[0]}!</h2><p>{agent?.name || 'Our advisor'} will call you shortly{f.visit ? ` to confirm your visit on ${new Date(f.visit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.</p></section>;
  return (
    <section className="sp-enq">
      <h2 className="sp-h">{unit ? `Interested in ${unit.unit_no}?` : 'Visit the site'}</h2>
      <p className="muted" style={{ marginTop: -6 }}>Leave your number and {agent?.name?.split(' ')[0] || 'our advisor'} will call you back, usually within the hour.</p>
      <form onSubmit={submit} className="sp-form">
        <input className="input" aria-label="Your name" placeholder="Your name" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className="input" aria-label="Mobile number" placeholder="Mobile number" inputMode="tel" required value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <label className="field" style={{ gap: 4 }}><span className="hint">Preferred visit date (optional)</span><input type="date" className="input" value={f.visit} onChange={e => setF({ ...f, visit: e.target.value })} /></label>
        <button className="btn sun" disabled={busy}>{busy ? 'Sending…' : 'Request a call back'}</button>
      </form>
      {agent?.phone && <p className="muted" style={{ fontSize: 13 }}>Or call {agent.name} directly: <span className="mono">{phone(agent.phone)}</span></p>}
    </section>
  );
}
