import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, useLoad, Empty, copyText } from '../components/ui.jsx';
import { money, inr, date, dateTime, sqft, phone } from '../lib/format.js';
import { scheduleWithPaid } from './Bookings.jsx';
import EmiCalculatorModal from '../components/EmiCalculatorModal.jsx';
import DocPreviewModal from '../components/DocPreviewModal.jsx';

export default function Portal({ me, go, say }) {
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
  if (!d) return <div className="page portal-loading" aria-busy="true" aria-label="Loading your buyer portal"><div className="portal-skeleton-hero" /><div className="portal-skeleton-overview">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div><div className="portal-skeleton-panels"><div /><div /></div></div>;
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
        ? d.bookings.map(b => <Home key={b.id} b={b} me={me} go={go} say={say} onChange={reloadD} tickets={(tickets || []).filter(t => t.booking_id === b.id)} />)
        : <Home key={activeBooking.id} b={activeBooking} me={me} go={go} say={say} onChange={reloadD} tickets={(tickets || []).filter(t => t.booking_id === activeBooking.id)} />}
    </div>
  );
}

function Home({ b, me, go, say, onChange, tickets }) {
  const [showEmi, setShowEmi] = useState(false);
  const [docModal, setDocModal] = useState(null);
  const [reschedule, setReschedule] = useState({});
  const [visitBusy, setVisitBusy] = useState('');
  const paymentsList = b.payments || [];
  const updatesList = b.updates || [];
  const paid = paymentsList.reduce((a, p) => a + Number(p.amount || 0), 0);
  const sched = scheduleWithPaid({ ...b, payments: paymentsList, schedule: b.schedule || [], paid });
  const next = sched.find(m => m.state !== 'paid');
  const outstanding = Math.max(0, Number(b.deal_value || 0) - paid);
  const paymentPercent = Number(b.deal_value) > 0 ? Math.min(100, Math.round((paid / Number(b.deal_value)) * 100)) : 0;
  const upcomingVisit = (b.visits || []).filter(visit => ['scheduled', 'confirmed'].includes(visit.status) && new Date(visit.scheduled_at) > new Date()).sort((a, z) => new Date(a.scheduled_at) - new Date(z.scheduled_at))[0];
  const latestUpdate = updatesList[0];
  const documents = b.documents || [];
  const isFloorPlan = document => /floor.?plan|layout/i.test(`${document.title || ''} ${document.file_name || ''}`);
  const floorPlanDocs = documents.filter(isFloorPlan);
  const agreementDocs = documents.filter(document => ['agreement', 'allotment'].includes(document.category) && !isFloorPlan(document));
  const paymentDocs = documents.filter(document => document.category === 'payment' && !isFloorPlan(document));
  const otherDocs = documents.filter(document => !['agreement', 'allotment', 'payment'].includes(document.category) && !isFloorPlan(document));
  const open = (tickets || []).filter(t => ['open', 'in_progress'].includes(t.status));
  const displayName = b.customer_name || me?.user?.name || 'Valued Buyer';
  const visitAction = async (visit, action) => {
    setVisitBusy(visit.id);
    try {
      const draft = reschedule[visit.id] || {};
      const body = action === 'confirm' ? { action } : { action, scheduled_at: new Date(draft.when).toISOString(), reason: draft.reason || '' };
      await api.patch('/api/portal/visits/' + visit.id, body);
      say?.(action === 'confirm' ? 'Site visit confirmed' : 'Site visit rescheduled');
      setReschedule(previous => ({ ...previous, [visit.id]: { ...previous[visit.id], editing: false } }));
      onChange?.();
    } catch (error) { say?.(error.message); }
    setVisitBusy('');
  };
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

      <section className="portal-overview" aria-label="Your home at a glance">
        <article className="portal-overview-card portal-home-card">
          <span className="portal-overview-icon"><Icon name="home" /></span>
          <div><small>Your property</small><b>Flat {b.unit_no} · {b.project_name}</b><span>{b.type_name || 'Home'}{b.floor ? ` · Floor ${b.floor}` : ''}</span></div>
          <Pill s={b.status} />
        </article>
        <article className="portal-overview-card">
          <span className="portal-overview-icon amber"><Icon name="layers" /></span>
          <div><small>Next construction milestone</small><b>{latestUpdate?.next_milestone || 'Not announced yet'}</b><span>{latestUpdate?.next_milestone_date ? `Expected ${date(latestUpdate.next_milestone_date)}` : 'We’ll share the schedule here'}</span></div>
        </article>
        <article className="portal-overview-card">
          <span className="portal-overview-icon blue"><Icon name="receipt" /></span>
          <div><small>Pending payment</small><b>{money(outstanding)}</b><span>{next ? `Next: ${next.milestone}` : 'All scheduled payments are complete'}</span></div>
        </article>
        <article className="portal-overview-card">
          <span className="portal-overview-icon violet"><Icon name="calendar" /></span>
          <div><small>Upcoming site visit</small><b>{upcomingVisit ? dateTime(upcomingVisit.scheduled_at) : 'No visit scheduled'}</b><span>{upcomingVisit ? `${upcomingVisit.project_name || b.project_name} · ${upcomingVisit.status.replaceAll('_', ' ')}` : 'Your visit will appear here'}</span></div>
        </article>
      </section>

      <section className="card" style={{ margin: '0 0 18px' }}>
        <div className="card-h"><div><h3>Site visits</h3><span className="muted">Confirm an upcoming visit or choose another time.</span></div></div>
        <div className="list">
          {(b.visits || []).length === 0 ? <div className="card-b muted">No site visits are linked to this booking.</div> : b.visits.map(visit => {
            const upcoming = ['scheduled', 'confirmed'].includes(visit.status) && new Date(visit.scheduled_at) > new Date();
            const draft = reschedule[visit.id] || {};
            return <div key={visit.id} className="lrow" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Icon name="calendar" />
              <div style={{ flex: 1, minWidth: 180 }}><b>{date(visit.scheduled_at)} · {new Date(visit.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>
                <small className="muted" style={{ display: 'block' }}>{visit.project_name || b.project_name} · {visit.agent_name || 'Sales team'}</small>
                <small className="muted visit-location"><Icon name="pin" />{visit.project_location || b.location || 'Location to be confirmed'}{visit.pickup_address ? ` · Pickup: ${visit.pickup_address}` : ''}</small>
              </div>
              <Pill s={visit.status} />
              <a className="btn sm" href={visit.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.project_location || b.location || visit.project_name || b.project_name)}`} target="_blank" rel="noreferrer"><Icon name="map" />Directions</a>
              {me?.user?.role === 'customer' && upcoming && <>
                {visit.status !== 'confirmed' && <button className="btn sm" disabled={visitBusy === visit.id} onClick={() => visitAction(visit, 'confirm')}>Confirm</button>}
                {!draft.editing && <button className="btn sm" disabled={visitBusy === visit.id} onClick={() => setReschedule(previous => ({ ...previous, [visit.id]: { ...previous[visit.id], editing: true } }))}>Reschedule</button>}
                {draft.editing && <div className="visit-reschedule-form">
                  <input className="input" type="datetime-local" aria-label="New visit date and time" value={draft.when || ''} onChange={event => setReschedule(previous => ({ ...previous, [visit.id]: { ...previous[visit.id], when: event.target.value } }))} />
                  <input className="input" aria-label="Reschedule reason" placeholder="Reason (optional)" maxLength={500} value={draft.reason || ''} onChange={event => setReschedule(previous => ({ ...previous, [visit.id]: { ...previous[visit.id], reason: event.target.value } }))} />
                  <button className="btn sm sun" disabled={visitBusy === visit.id || !draft.when} onClick={() => visitAction(visit, 'reschedule')}>{visitBusy === visit.id ? 'Sending…' : 'Request new time'}</button>
                  <button className="btn sm ghost" onClick={() => setReschedule(previous => ({ ...previous, [visit.id]: { ...previous[visit.id], editing: false } }))}>Cancel</button>
                </div>}
              </>}
            </div>;
          })}
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-h"><h3>Payments</h3><span className="muted">{paymentPercent}% paid</span></div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="specs three"><div><span>Total</span><b>{money(b.deal_value)}</b></div><div><span>Paid</span><b>{money(paid)}</b></div><div><span>Balance</span><b>{money(b.deal_value - paid)}</b></div></div>
            <div className="paybar big"><i style={{ width: `${paymentPercent}%` }} /></div>
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
            <div className="portal-installments" aria-label="Installment timeline">{sched.map((m, i) => {
              const dueLabel = m.due ? (/^\d{4}-\d{2}-\d{2}$/.test(m.due) ? date(m.due) : m.due) : 'Due date to be confirmed';
              return <article key={i} className={`portal-installment ${m.state}`}>
                <span className="portal-installment-dot"><Icon name={m.state === 'paid' ? 'check' : m.state === 'part' ? 'clock' : 'receipt'} /></span>
                <div className="portal-installment-main"><div className="portal-installment-head"><b>{m.milestone}</b><Pill s={m.state === 'due' ? 'pending' : m.state} /></div><span>Due: {dueLabel}</span>{m.got > 0 && <small>Received {inr(m.got)}{m.state === 'paid' ? ' · Complete' : ' · Part payment'}</small>}</div>
                <b className="num portal-installment-amount">{inr(m.amount)}</b>
              </article>;
            })}</div>
            <div className="portal-payment-instructions">
              <div><b>Payment instructions</b><span className="muted">Transfer only to verified project accounts. Contact your advisor if details are not shown.</span></div>
              {b.payment_instructions ? <div className="payment-details-grid">
                <div><small>UPI ID</small><b>{b.payment_instructions.upi_id}</b><button className="btn sm" onClick={() => copyText(b.payment_instructions.upi_id, say)}>Copy UPI</button></div>
                <div><small>Beneficiary</small><b>{b.payment_instructions.account_name}</b></div>
                <div><small>Bank</small><b>{b.payment_instructions.bank_name}</b></div>
                <div><small>Account number</small><b>{b.payment_instructions.account_number}</b><button className="btn sm" onClick={() => copyText(b.payment_instructions.account_number, say)}>Copy account</button></div>
                <div><small>IFSC</small><b>{b.payment_instructions.ifsc_code}</b></div>
                {b.payment_instructions.instructions && <p>{b.payment_instructions.instructions}</p>}
              </div> : <div className="portal-payment-unconfigured">Verified payment instructions haven’t been added yet. Please contact {b.agent_name || 'your sales advisor'}{b.agent_phone ? ` at ${phone(b.agent_phone)}` : ''} before making a transfer.</div>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <div><h3>Construction Progress</h3><span className="muted">A dated record of work at your project</span></div>
            <span className="muted">Possession: {b.possession}</span>
          </div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>{b.tower_name || 'Project Tower'}</span>
                <b style={{ display: 'block', fontSize: 15 }}>{updatesList[0]?.stage_name || (updatesList.length ? 'Construction progress' : 'No updates posted yet')}</b>
                {latestUpdate?.next_milestone && <span className="portal-next-stage">Next: {latestUpdate.next_milestone}{latestUpdate.next_milestone_date ? ` · ${date(latestUpdate.next_milestone_date)}` : ''}</span>}
              </div>
              <span className="visit-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                {updatesList[0]?.progress_pct ?? 0}% Completed
              </span>
            </div>

            <div className="paybar big">
              <i style={{ width: `${updatesList[0]?.progress_pct ?? 0}%` }} />
            </div>

            <div className="timeline" style={{ marginTop: 6 }}>
              {updatesList.length === 0 ? (
                <span className="muted">Construction updates and site photos will appear here when shared.</span>
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
                      {(u.media_urls?.length > 0 || u.media_url) && (
                        <div className="progress-gallery" style={{ marginTop: 6, marginBottom: 4 }}>
                          {(u.media_urls?.length ? u.media_urls : [u.media_url]).map((media, i) => (
                            <div key={i} className="progress-media">
                              {/\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.test(media)
                                ? <video src={api.media(media)} className="progress-thumb" controls playsInline preload="metadata" aria-label={`Construction video update ${i + 1}`} />
                                : <a href={api.media(media)} target="_blank" rel="noreferrer"><img src={api.media(media)} alt={`Construction progress ${i + 1}`} className="progress-thumb" onError={e => { e.target.style.display = 'none'; }} /></a>}
                            </div>
                          ))}
                        </div>
                      )}
                      <small className="muted">Shared {dateTime(u.created_at)}</small>
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
          <span className="muted" style={{ fontSize: 12 }}>Booking records, shared documents, receipts, and registry checklist</span>
            </div>
          </div>
          <Pill s={b.status} />
        </div>

        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="passport-cell"><span>Target possession</span><b>{b.possession || 'Not announced'}</b></div>
          <div className="eyebrow" style={{ marginTop: 4 }}>Registry & Handover Checklist</div>
          <div className="registry-checklist">
            {Object.entries({
              pan_verified: 'PAN verified', aadhar_verified: 'Aadhaar verified', form_26qb_tds: 'Form 26QB',
              tds_26qb: 'TDS 26QB', bank_noc: 'Bank NOC', stamp_duty_paid: 'Stamp duty paid',
              deed_approved: 'Sale deed approved', slot_booked: 'Registry slot booked', signatory_assigned: 'Signatory assigned',
            }).filter(([key]) => b.registry_checklist && b.registry_checklist[key] !== undefined).map(([key, label]) => (
              <div key={key} className={'checklist-row' + (b.registry_checklist[key] ? ' done' : '')}>
                <Icon name={b.registry_checklist[key] ? 'checkCircle' : 'clock'} style={{ width: 16, height: 16 }} />
                <span style={{ flex: 1 }}>{label}</span>
                <span className="visit-badge">{b.registry_checklist[key] ? 'Complete' : 'Pending'}</span>
              </div>
            ))}
            {b.registry_checklist?.appointment_time && <div className="checklist-row"><Icon name="calendar" /><span>Appointment</span><b>{b.registry_checklist.appointment_time}</b></div>}
          </div>

        </div>
      </section>

      <section className="card portal-document-center">
        <div className="card-h"><div><h3>Document center</h3><span className="muted">Agreements, receipts, floor plans, and project files, grouped by type</span></div><Icon name="file" /></div>
        <div className="card-b portal-document-groups">
          <DocumentGroup title="Agreements & allotment" icon="shield" empty="No agreement or allotment files shared yet." documents={agreementDocs} />
          <div className="portal-doc-group"><div className="portal-doc-group-head"><Icon name="receipt" /><b>Receipts</b><span>{b.payments.length + paymentDocs.length}</span></div>
            <div className="portal-doc-items">
              {b.payments.map(payment => <div key={`receipt-${payment.id}`} className="portal-doc-item"><span className="portal-doc-type">Receipt</span><div><b>{payment.milestone || 'Payment'}</b><small>{date(payment.paid_on)} · {payment.mode || 'Payment received'} · {inr(payment.amount)}</small></div><button className="btn sm" onClick={() => setDocModal({ type: 'receipt', data: { booking: { ...b, paid }, payment, org: me.org } })}><Icon name="download" />View receipt</button></div>)}
              {paymentDocs.map(document => <DocumentRow key={document.id} document={document} />)}
              {!b.payments.length && !paymentDocs.length && <span className="muted">No receipts available yet.</span>}
            </div>
          </div>
          <div className="portal-doc-group"><div className="portal-doc-group-head"><Icon name="home" /><b>Floor plans & property files</b><span>{floorPlanDocs.length + otherDocs.length + (b.floorplan_url ? 1 : 0) + (b.brochure_url ? 1 : 0)}</span></div>
            <div className="portal-doc-items">
              {b.floorplan_url && <a className="portal-doc-item" href={api.media(b.floorplan_url)} target="_blank" rel="noreferrer"><span className="portal-doc-type">Floor plan</span><div><b>{b.type_name || 'Approved floor plan'}</b><small>Property layout</small></div><span className="btn sm"><Icon name="download" />Open</span></a>}
              {b.brochure_url && <a className="portal-doc-item" href={api.media(b.brochure_url)} target="_blank" rel="noreferrer"><span className="portal-doc-type">Brochure</span><div><b>Official project brochure</b><small>{b.project_name}</small></div><span className="btn sm"><Icon name="download" />Open</span></a>}
              {floorPlanDocs.map(document => <DocumentRow key={document.id} document={document} />)}
              {otherDocs.map(document => <DocumentRow key={document.id} document={document} />)}
              {!floorPlanDocs.length && !otherDocs.length && !b.floorplan_url && !b.brochure_url && <span className="muted">No property documents have been shared yet.</span>}
            </div>
            <button className="btn sm sun" onClick={() => setDocModal({ type: 'cost_sheet', data: { booking: { ...b, paid }, unit: { unit_no: b.unit_no, price: b.deal_value }, project: { name: b.project_name, location: b.location }, org: me.org } })}><Icon name="download" />Generate cost sheet</button>
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
              <button key={t.id} className="lrow btnrow portal-complaint-row" onClick={() => go('tickets/' + t.id)}><span className="mono muted">#{t.number}</span><div style={{ flex: 1, minWidth: 0 }}><b>{t.title}</b><small className="muted">{t.assigned_name ? `Assigned to ${t.assigned_name}` : 'Waiting for assignment'} · Updated {dateTime(t.last_update_at || t.created_at)}{['open', 'in_progress'].includes(t.status) ? ` · Response by ${dateTime(t.sla_due_at)}` : ''}</small></div><Pill s={t.status} /></button>
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

function DocumentGroup({ title, icon, empty, documents }) {
  return <div className="portal-doc-group">
    <div className="portal-doc-group-head"><Icon name={icon} /><b>{title}</b><span>{documents.length}</span></div>
    <div className="portal-doc-items">
      {documents.map(document => <DocumentRow key={document.id} document={document} />)}
      {!documents.length && <span className="muted">{empty}</span>}
    </div>
  </div>;
}

function DocumentRow({ document }) {
  return <a className="portal-doc-item" href={document.url} target="_blank" rel="noreferrer">
    <span className="portal-doc-type">{document.category.replaceAll('_', ' ')}</span>
    <div><b>{document.title}</b><small>{date(document.created_at)} · {document.file_name}</small></div>
    <span className="btn sm"><Icon name="download" />Download</span>
  </a>;
}
