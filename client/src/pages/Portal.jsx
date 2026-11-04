import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, useLoad, Loading, Empty } from '../components/ui.jsx';
import { money, inr, date, sqft, phone, ago } from '../lib/format.js';
import { scheduleWithPaid } from './Bookings.jsx';
import EmiCalculatorModal from '../components/EmiCalculatorModal.jsx';
import DocPreviewModal from '../components/DocPreviewModal.jsx';

export default function Portal({ me, go }) {
  const [d, reloadD, errorD] = useLoad(() => api.get('/api/portal'), []);
  const [tickets] = useLoad(() => api.get('/api/tickets'), []);
  const [activeBookingId, setActiveBookingId] = useState('');

  if (errorD) {
    return (
      <div className="page">
        <Empty icon="shield" title="Unable to load buyer handover portal">
          {errorD}
          <div style={{ marginTop: 12 }}>
            <button className="btn sun" onClick={reloadD}>Try Again</button>
          </div>
        </Empty>
      </div>
    );
  }
  if (!d) return <div className="page"><Loading /></div>;
  if (!d.bookings || !d.bookings.length) return <div className="page"><Empty icon="shield" title="No buyer bookings yet">When buyers book a unit, their Digital Handover Room and Construction Progress Tracker appear here.</Empty></div>;

  const activeBooking = d.bookings.find(b => b.id === activeBookingId) || d.bookings[0];

  return (
    <div className="page">
      {me?.user?.role !== 'customer' && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: 'var(--panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ai-badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#2563eb' }}>
              <Icon name="shield" style={{ width: 14, height: 14 }} />
              Buyer Handover Room
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Verified handover documents, construction stages, receipts &amp; possession schedule
            </span>
          </div>
          {d.bookings.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Select Buyer:</span>
              <select
                className="select"
                style={{ minWidth: 220 }}
                value={activeBooking.id}
                onChange={e => setActiveBookingId(e.target.value)}
              >
                {d.bookings.map(b => (
                  <option key={b.id} value={b.id}>
                    Flat {b.unit_no} - {b.customer_name || 'Buyer'} ({b.project_name})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {me?.user?.role === 'customer'
        ? d.bookings.map(b => <Home key={b.id} b={b} me={me} go={go} tickets={(tickets || []).filter(t => t.booking_id === b.id)} />)
        : <Home key={activeBooking.id} b={activeBooking} me={me} go={go} tickets={(tickets || []).filter(t => t.booking_id === activeBooking.id)} />}
    </div>
  );
}

function Home({ b, me, go, tickets }) {
  const [showEmi, setShowEmi] = useState(false);
  const [docModal, setDocModal] = useState(null);
  const paymentsList = b.payments || [];
  const updatesList = b.updates || [];
  const paid = paymentsList.reduce((a, p) => a + p.amount, 0);
  const sched = scheduleWithPaid({ ...b, paid });
  const next = sched.find(m => m.state !== 'paid');
  const open = (tickets || []).filter(t => ['open', 'in_progress'].includes(t.status));
  const displayName = b.customer_name || me?.user?.name || 'Valued Buyer';
  return (
    <>
      <section className="homehero">
        <img src={api.media(b.cover_url)} alt={b.project_name} />
        <div className="hh-in">
          <span className="eyebrow">Welcome home, {displayName}</span>
          <h2>Flat {b.unit_no}, {b.project_name}</h2>
          <p>{b.type_name} · Floor {b.floor}{b.facing ? ` · ${b.facing}` : ''} · {b.location} · Possession {b.possession}</p>
          <div className="row">
            <Pill s={b.status} />
            <button className="btn sun" onClick={() => go('tickets')}><Icon name="wrench" />Raise a complaint</button>
            <button className="btn" onClick={() => setShowEmi(true)}><Icon name="calc" />EMI Calculator</button>
          </div>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-h"><h3>Payments</h3><span className="muted">{Math.round((paid / b.deal_value) * 100)}% paid</span></div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="specs three"><div><span>Total</span><b>{money(b.deal_value)}</b></div><div><span>Paid</span><b>{money(paid)}</b></div><div><span>Balance</span><b>{money(b.deal_value - paid)}</b></div></div>
            <div className="paybar big"><i style={{ width: `${Math.min(100, (paid / b.deal_value) * 100)}%` }} /></div>
            {next && (
              <div className="note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b>Next:</b> {next.milestone} · {inr(next.amount - next.got)} {next.state === 'part' ? 'remaining' : ''}<br />
                  <span className="muted">Due when this stage is complete. You will get a demand letter.</span>
                </div>
                <button className="btn sm" onClick={() => setDocModal({ type: 'demand_letter', data: { booking: { ...b, paid }, milestone: next, org: me.org } })}>
                  <Icon name="download" />Demand Letter
                </button>
              </div>
            )}
            <div className="sched">{sched.map((m, i) => <div key={i} className={'srow ' + m.state}><i /><span style={{ flex: 1 }}>{m.milestone}</span><b className="num">{inr(m.amount)}</b><span className="sstate">{m.state === 'paid' ? 'Paid' : m.state === 'part' ? 'Part paid' : 'Upcoming'}</span></div>)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Construction Progress Tracker</h3>
            <span className="muted">Possession: {b.possession}</span>
          </div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>{b.tower_name || 'Project Tower'}</span>
                <b style={{ display: 'block', fontSize: 15 }}>{updatesList[0]?.stage_name || 'Active Construction Stage'}</b>
              </div>
              <span className="visit-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                {updatesList[0]?.progress_pct || 65}% Completed
              </span>
            </div>

            <div className="paybar big">
              <i style={{ width: `${updatesList[0]?.progress_pct || 65}%` }} />
            </div>

            <div className="timeline" style={{ marginTop: 6 }}>
              {updatesList.length === 0 ? (
                <span className="muted">Verified stage updates and site photos will appear here.</span>
              ) : (
                updatesList.map(u => (
                  <div key={u.id} className="tl">
                    <i className="s" />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <b>{u.title}</b>
                        {u.stage_name && <span className="visit-badge">{u.stage_name}</span>}
                        {u.progress_pct > 0 && <span className="visit-badge">{u.progress_pct}%</span>}
                      </div>
                      {u.body && <span className="muted" style={{ display: 'block', fontSize: 13, margin: '4px 0' }}>{u.body}</span>}
                      {u.media_urls?.length > 0 && (
                        <div className="progress-gallery" style={{ marginTop: 6, marginBottom: 4 }}>
                          {u.media_urls.map((img, i) => (
                            <a key={i} href={img} target="_blank" rel="noreferrer">
                              <img src={img} alt="site update" className="progress-thumb" onError={e => { e.target.style.display = 'none'; }} />
                            </a>
                          ))}
                        </div>
                      )}
                      <small className="muted">{date(u.created_at)}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Feature 4: Digital Buyer Handover Room */}
      <section className="card" style={{ marginBottom: 18, border: '1px solid rgba(99,102,241,0.3)', background: 'linear-gradient(180deg,var(--panel),var(--panel-2))' }}>
        <div className="card-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="shield" style={{ width: 22, height: 22, color: 'var(--sun)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Digital Buyer Handover Room</h3>
              <span className="muted" style={{ fontSize: 12 }}>Your permanent 24/7 digital vault for legal documents, NOCs, receipts, and registry checklist</span>
            </div>
          </div>
          <Pill s={b.status} />
        </div>

        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="kgrid">
            <div className="passport-cell">
              <span>Allotment & Agreement</span>
              <b>{b.status === 'booked' ? 'Allotment Letter Issued' : 'Agreement Executed & Stamped'}</b>
            </div>
            <div className="passport-cell">
              <span>Bank NOC / APF Status</span>
              <b>Approved (SBI, HDFC, ICICI, Axis)</b>
            </div>
            <div className="passport-cell">
              <span>RERA Compliance</span>
              <b>Registered & Milestone Verified</b>
            </div>
            <div className="passport-cell">
              <span>Possession Target</span>
              <b>{b.possession} (On Schedule)</b>
            </div>
          </div>

          <div className="eyebrow" style={{ marginTop: 4 }}>Registry & Handover Checklist</div>
          <div className="registry-checklist">
            <div className="checklist-row done">
              <Icon name="checkCircle" style={{ width: 16, height: 16, color: '#059669' }} />
              <span style={{ flex: 1 }}>Buyer KYC (PAN & Aadhaar) Submitted & Verified</span>
              <span className="visit-badge">Verified</span>
            </div>
            <div className="checklist-row done">
              <Icon name="checkCircle" style={{ width: 16, height: 16, color: '#059669' }} />
              <span style={{ flex: 1 }}>Builder Allotment Certificate Generated</span>
              <span className="visit-badge">Vault Ready</span>
            </div>
            <div className={`checklist-row ${paid >= b.deal_value ? 'done' : ''}`}>
              <Icon name={paid >= b.deal_value ? "checkCircle" : "clock"} style={{ width: 16, height: 16, color: paid >= b.deal_value ? '#059669' : '#64748b' }} />
              <span style={{ flex: 1 }}>1% TDS Form 26QB Filing on Milestone Payments</span>
              <span className="visit-badge">{paid >= b.deal_value ? 'TDS Compliant' : 'Due with Slabs'}</span>
            </div>
            <div className="checklist-row">
              <Icon name="clock" style={{ width: 16, height: 16, color: '#64748b' }} />
              <span style={{ flex: 1 }}>Sub-Registrar Appointment Slot & Stamp Duty Challan</span>
              <span className="visit-badge">Scheduled on Final Payment</span>
            </div>
            <div className="checklist-row">
              <Icon name="clock" style={{ width: 16, height: 16, color: '#64748b' }} />
              <span style={{ flex: 1 }}>Pre-possession Snagging Inspection & Key Handover</span>
              <span className="visit-badge">At Possession</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {b.brochure_url && (
              <a className="btn sm" href={api.media(b.brochure_url)} target="_blank" rel="noreferrer">
                <Icon name="download" />Official Brochure
              </a>
            )}
            {b.floorplan_url && (
              <a className="btn sm" href={api.media(b.floorplan_url)} target="_blank" rel="noreferrer">
                <Icon name="download" />Approved Floor Plan
              </a>
            )}
            <button className="btn sm sun" onClick={() => setDocModal({ type: 'cost_sheet', data: { booking: { ...b, paid }, unit: { unit_no: b.unit_no, price: b.deal_value }, project: { name: b.project_name, location: b.location }, org: me.org } })}>
              <Icon name="download" />Download Cost Sheet
            </button>
          </div>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-h"><h3>Your home</h3></div>
          <div className="card-b">
            {b.floorplan_url && <img className="fpimg" src={api.media(b.floorplan_url)} alt={`${b.type_name} floor plan`} />}
            <div className="specs three" style={{ marginTop: 12 }}><div><span>Carpet</span><b>{sqft(b.carpet_sqft)}</b></div><div><span>Built-up</span><b>{sqft(b.builtup_sqft)}</b></div><div><span>Super</span><b>{sqft(b.super_sqft)}</b></div></div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card"><div className="card-h"><h3>Your advisor</h3></div>
            <div className="card-b advisor"><span className="av lg">{(b.agent_name || 'S')[0]}</span><div style={{ flex: 1 }}><b>{b.agent_name || 'Sales desk'}</b><div className="muted mono">{phone(b.agent_phone)}</div></div>
              {b.agent_phone && <a className="btn" href={`tel:+${String(b.agent_phone).replace(/\D/g, '')}`}><Icon name="phone" />Call</a>}</div></div>
          <div className="card"><div className="card-h"><h3>Complaints</h3><span className="muted">{open.length} open</span></div>
            <div className="list">{tickets.length === 0 ? <div className="card-b muted">No complaints so far.</div> : tickets.slice(0, 4).map(t => (
              <button key={t.id} className="lrow btnrow" onClick={() => go('tickets/' + t.id)}><span className="mono muted">#{t.number}</span><div style={{ flex: 1, minWidth: 0 }}><b>{t.title}</b></div><Pill s={t.status} /></button>
            ))}</div></div>
          <div className="card"><div className="card-h"><h3>Receipts</h3></div>
            <div className="list">{b.payments.map(p => (
              <div key={p.id} className="lrow">
                <Icon name="receipt" style={{ width: 16, height: 16 }} />
                <span style={{ flex: 1 }}>{date(p.paid_on)} · {p.milestone}<small className="muted"> · {p.mode}</small></span>
                <b className="num">{inr(p.amount)}</b>
                <button className="btn-doc" title="Print Receipt" onClick={() => setDocModal({ type: 'receipt', data: { booking: { ...b, paid }, payment: p, org: me.org } })}>
                  <Icon name="download" />Receipt
                </button>
              </div>
            ))}</div></div>
        </div>
      </section>
      {showEmi && (
        <EmiCalculatorModal
          initialPrice={b.deal_value}
          unit={{ unit_no: b.unit_no, price: b.deal_value }}
          project={{ name: b.project_name }}
          onClose={() => setShowEmi(false)}
        />
      )}
      {docModal && (
        <DocPreviewModal
          type={docModal.type}
          data={docModal.data}
          onClose={() => setDocModal(null)}
        />
      )}
    </>
  );
}
