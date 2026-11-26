import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, Drawer, Field, Seg, useLoad, Loading, Empty } from '../components/ui.jsx';
import { money, inr, date, phone } from '../lib/format.js';
import DocPreviewModal from '../components/DocPreviewModal.jsx';

export default function Bookings({ me, say, go, params }) {
  const [rows, reload] = useLoad(() => api.get('/api/bookings'), []);
  const [f, setF] = useState('all');
  if (!rows) return <div className="page"><Loading /></div>;
  const shown = rows.filter(b => f === 'all' || b.status === f);
  const total = shown.reduce((a, b) => a + b.deal_value, 0), paid = shown.reduce((a, b) => a + b.paid, 0);
  return (
    <div className="page wide">
      <div className="pagehead"><div style={{ flex: 1 }}><h2>Bookings</h2><p>{rows.length} homes · {money(total)} sold · {money(paid)} collected ({total ? Math.round((paid / total) * 100) : 0}%)</p></div>
        <Seg value={f} onChange={setF} label="Status" options={[['all', 'All'], ['booked', 'Booked'], ['agreement', 'Agreement'], ['registered', 'Registered'], ['cancelled', 'Cancelled']]} /></div>
      {shown.length === 0 ? <Empty icon="receipt" title="No bookings yet">Book a flat from Inventory.</Empty> : (
        <div className="card tablewrap"><table>
          <thead><tr><th>Unit</th><th>Buyer</th><th>Sold by</th><th>Broker</th><th>Deal value</th><th>Collected</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{shown.map(b => (
            <tr key={b.id} onClick={() => go('bookings/' + b.id)} style={{ cursor: 'pointer' }}>
              <td><b>{b.unit_no}</b><div className="muted" style={{ fontSize: 12 }}>{b.project_name}</div></td>
              <td>{b.customer_name}<div className="muted mono" style={{ fontSize: 12 }}>{phone(b.customer_phone)}</div></td>
              <td>{b.sold_by_name || '—'}</td><td>{b.broker_name || '—'}</td><td className="num">{money(b.deal_value)}</td>
              <td><div className="paybar"><i style={{ width: `${Math.min(100, (b.paid / b.deal_value) * 100)}%` }} /></div><span className="num muted" style={{ fontSize: 12 }}>{money(b.paid)} · {Math.round((b.paid / b.deal_value) * 100)}%</span></td>
              <td><Pill s={b.status} /></td><td className="time">{date(b.booking_date)}</td>
              <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                <button
                  className="btn sm"
                  style={{ whiteSpace: 'nowrap', border: '1px solid rgba(99,102,241,0.35)', color: '#4f46e5', background: 'rgba(99,102,241,0.06)' }}
                  onClick={() => go('bookings/' + b.id)}
                  title="Zero-dispute Sub-Registrar execution workflow & document verification"
                >
                  <Icon name="file" />Registry Day Manager
                </button>
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
      {params[0] && <BookingDrawer id={params[0]} me={me} say={say} onClose={() => go('bookings')} onChange={reload} />}
    </div>
  );
}

export function scheduleWithPaid(b) {
  let left = Number(b.paid ?? b.payments.reduce((a, p) => a + Number(p.amount || 0), 0));
  return b.schedule.map(m => { const got = Math.min(m.amount, Math.max(0, left)); left -= got; return { ...m, got, state: got >= m.amount ? 'paid' : got > 0 ? 'part' : 'due' }; });
}

function BookingDrawer({ id, me, say, onClose, onChange }) {
  const [b, reload] = useLoad(() => api.get('/api/bookings/' + id), [id]);
  const [pay, setPay] = useState({ amount: '', mode: 'NEFT', ref: '', milestone: '' });
  const [docModal, setDocModal] = useState(null);
  const [documentCategory, setDocumentCategory] = useState('agreement');
  const [documentsBusy, setDocumentsBusy] = useState(false);
  if (!b) return <Drawer title="Loading…" onClose={onClose}><Loading /></Drawer>;
  const admin = me.user.role === 'admin';
  const paid = b.payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const sched = scheduleWithPaid({ ...b, paid });
  const next = sched.find(m => m.state !== 'paid');
  const refresh = () => { reload(); onChange(); };
  const record = async () => { try { await api.post(`/api/bookings/${b.id}/payments`, { ...pay, amount: Number(pay.amount), milestone: pay.milestone || next?.milestone }); setPay({ amount: '', mode: 'NEFT', ref: '', milestone: '' }); say('Payment recorded. The buyer is notified.'); refresh(); } catch (e) { say(e.message); } };
  const status = async s => { try { await api.patch('/api/bookings/' + b.id, { status: s }); say('Booking updated'); refresh(); } catch (e) { say(e.message); } };
  const uploadDocuments = async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const form = new FormData();
    form.append('category', documentCategory);
    files.forEach(file => form.append('files', file));
    setDocumentsBusy(true);
    try { await api.post('/api/bookings/' + b.id + '/documents', form); say('Buyer documents shared'); refresh(); }
    catch (error) { say(error.message); }
    setDocumentsBusy(false);
    event.target.value = '';
  };

  return (
    <Drawer title={`${b.unit_no} · ${b.customer_name}`} sub={`${b.project_name} · ${b.type_name} · booked ${date(b.booking_date)}`} onClose={onClose} actions={<Pill s={b.status} />}>
      <div className="specs">
        <div><span>Deal value</span><b>{inr(b.deal_value)}</b></div><div><span>Discount given</span><b>{inr(b.discount)}</b></div>
        <div><span>Collected</span><b>{inr(paid)}</b></div><div><span>Balance</span><b>{inr(b.deal_value - paid)}</b></div>
      </div>
      <div className="paybar big"><i style={{ width: `${Math.min(100, (paid / b.deal_value) * 100)}%` }} /></div>
      <div className="minirow"><Icon name="user" /><span style={{ flex: 1 }}>{b.customer_name} · <span className="mono">{phone(b.customer_phone)}</span>{b.customer_email ? ` · ${b.customer_email}` : ''}</span></div>
      <div className="minirow"><Icon name="briefcase" /><span style={{ flex: 1 }}>Sold by {b.sold_by_name || '—'}{b.broker_name ? ` with broker ${b.broker_name}` : ''}</span></div>

      <div><div className="eyebrow" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Payment schedule</span>
        {next && <button className="btn sm" onClick={() => setDocModal({ type: 'demand_letter', data: { booking: { ...b, paid }, milestone: next, org: me.org } })}><Icon name="download" />Next Demand Letter</button>}
      </div>
        <div className="sched">{sched.map((m, i) => (
          <div key={i} className={'srow ' + m.state}>
            <i />
            <span style={{ flex: 1 }}>{m.milestone}<small className="muted"> · {m.pct}%</small></span>
            <b className="num">{inr(m.amount)}</b>
            <span className="sstate">{m.state === 'paid' ? 'Paid' : m.state === 'part' ? `${money(m.got)} paid` : 'Due'}</span>
            {m.state !== 'paid' && (
              <button className="btn-doc" title="Demand Letter" onClick={() => setDocModal({ type: 'demand_letter', data: { booking: { ...b, paid }, milestone: m, org: me.org } })}>
                <Icon name="download" />Letter
              </button>
            )}
          </div>
        ))}</div></div>

      {admin && b.status !== 'cancelled' && (
        <div className="card" style={{ boxShadow: 'none' }}><div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>Record a payment</b>
          <div className="kgrid">
            <Field label="Amount (₹)" id="py-a"><input id="py-a" className="input" inputMode="numeric" value={pay.amount} placeholder={next ? String(next.amount - next.got) : ''} onChange={e => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Against" id="py-m"><select id="py-m" className="select" value={pay.milestone || next?.milestone || ''} onChange={e => setPay({ ...pay, milestone: e.target.value })}>{b.schedule.map(m => <option key={m.milestone}>{m.milestone}</option>)}</select></Field>
            <Field label="Mode" id="py-o"><select id="py-o" className="select" value={pay.mode} onChange={e => setPay({ ...pay, mode: e.target.value })}><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>UPI</option><option>Home loan disbursal</option></select></Field>
            <Field label="Reference" id="py-r"><input id="py-r" className="input" value={pay.ref} onChange={e => setPay({ ...pay, ref: e.target.value })} placeholder="UTR / cheque no." /></Field>
          </div>
          <button className="btn sun" style={{ alignSelf: 'flex-start' }} disabled={!(Number(pay.amount) > 0)} onClick={record}><Icon name="plus" />Record payment</button>
        </div></div>
      )}

      {b.payments.length > 0 && <div><div className="eyebrow" style={{ marginBottom: 8 }}>Received</div>{b.payments.map(p => (
        <div key={p.id} className="minirow">
          <Icon name="rupee" />
          <span style={{ flex: 1 }}>{date(p.paid_on)} · {p.milestone || 'Payment'}<small className="muted"> · {p.mode}{p.ref ? ' ' + p.ref : ''}</small></span>
          <b className="num">{inr(p.amount)}</b>
          <button className="btn-doc" title="Print Receipt" onClick={() => setDocModal({ type: 'receipt', data: { booking: { ...b, paid }, payment: p, org: me.org } })}>
            <Icon name="receipt" />Receipt
          </button>
        </div>
      ))}</div>}

      <div className="card" style={{ marginTop: 14, boxShadow: 'none' }}>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>Buyer documents</b>
          {b.documents?.length ? b.documents.map(document => <a key={document.id} className="minirow" href={document.url} target="_blank" rel="noreferrer"><Icon name="file" /><span style={{ flex: 1 }}>{document.title}<small className="muted"> · {document.category}</small></span><Icon name="download" /></a>) : <span className="muted">No buyer documents uploaded yet.</span>}
          {admin && <div className="inline-actions">
            <select className="select" aria-label="Document category" value={documentCategory} onChange={event => setDocumentCategory(event.target.value)}>
              <option value="allotment">Allotment</option><option value="agreement">Agreement</option><option value="payment">Payment</option>
              <option value="noc">NOC</option><option value="identity">Identity</option><option value="registry">Registry</option><option value="other">Other</option>
            </select>
            <label className="btn sm" style={{ cursor: documentsBusy ? 'wait' : 'pointer' }}>
              <Icon name="upload" />{documentsBusy ? 'Uploading…' : 'Upload documents'}
              <input type="file" accept="application/pdf,image/*" multiple disabled={documentsBusy} onChange={uploadDocuments} style={{ display: 'none' }} />
            </label>
          </div>}
        </div>
      </div>

      {/* Feature 10: AI Registry Day Manager */}
      <RegistryDayManager b={b} me={me} say={say} refresh={refresh} />

      {b.commissions.length > 0 && <div><div className="eyebrow" style={{ marginBottom: 8 }}>Commission & incentive</div>{b.commissions.map(c => (
        <div key={c.id} className="minirow"><Icon name="briefcase" /><span style={{ flex: 1 }}>{c.name} · {c.kind === 'broker_commission' ? 'Broker commission' : 'Sales incentive'}<small className="muted"> · {c.basis}</small></span><b className="num">{inr(c.amount)}</b><Pill s={c.status} /></div>
      ))}</div>}

      {admin && <div className="drawer-actions">
        {b.status === 'booked' && <button className="btn" onClick={() => status('agreement')}>Agreement signed</button>}
        {['booked', 'agreement'].includes(b.status) && <button className="btn" onClick={() => status('registered')}>Registered</button>}
        {b.status === 'registered' && <button className="btn" onClick={() => status('possession')}>Possession given</button>}
        {['booked', 'agreement'].includes(b.status) && <button className="btn ghost danger" onClick={() => status('cancelled')}>Cancel booking</button>}
      </div>}

      {docModal && (
        <DocPreviewModal
          type={docModal.type}
          data={docModal.data}
          say={say}
          onClose={() => setDocModal(null)}
        />
      )}
    </Drawer>
  );
}

function RegistryDayManager({ b, me, say, refresh }) {
  const [checklist, setChecklist] = useState(b.registry_checklist || {
    pan_verified: true,
    tds_26qb: false,
    bank_noc: false,
    stamp_duty_paid: false,
    deed_approved: false,
    slot_booked: false,
    signatory_assigned: false,
    signatory_name: 'Authorized Director / GPA Holder',
    appointment_time: '',
    accompanying_staff: ''
  });

  const toggle = async (key) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    setChecklist(updated);
    try {
      await api.patch('/api/bookings/' + b.id, { registry_checklist: updated });
      say('Registry checklist updated');
      refresh();
    } catch (e) {
      say(e.message);
    }
  };

  const saveDetails = async () => {
    try {
      await api.patch('/api/bookings/' + b.id, { registry_checklist: checklist });
      say('Registry appointment & staff details saved');
      refresh();
    } catch (e) {
      say(e.message);
    }
  };

  const sendReminder = () => {
    const pending = [];
    if (!checklist.tds_26qb) pending.push('1% TDS Form 26QB Challan');
    if (!checklist.bank_noc) pending.push('Bank Loan Clearance / NOC');
    if (!checklist.stamp_duty_paid) pending.push('Stamp Duty E-Challan');
    if (!checklist.deed_approved) pending.push('Draft Sale Deed approval');

    const msg = `*NIVAAS REGISTRY BRIEFING*\n` +
      `Namaste *${b.customer_name}*!\n\n` +
      `For your property *Flat ${b.unit_no}, ${b.project_name}* registry:\n` +
      `• *Appointment Slot:* ${checklist.appointment_time || 'To be scheduled'}\n` +
      `• *Developer Signatory:* ${checklist.signatory_name || 'Assigned'}\n` +
      `• *Accompanying Executive:* ${checklist.accompanying_staff || 'Legal Desk'}\n\n` +
      (pending.length ? `*Pending Checklist Items:*\n` + pending.map(p => `• ${p}`).join('\n') + `\n\n` : `All documents verified!\n\n`) +
      `Please carry original PAN card, Aadhaar card, and 2 passport size photographs to the Sub-Registrar Office.`;
    const ph = String(b.customer_phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const completedCount = ['pan_verified', 'tds_26qb', 'bank_noc', 'stamp_duty_paid', 'deed_approved', 'slot_booked', 'signatory_assigned'].filter(k => checklist[k]).length;

  return (
    <div className="card" style={{ border: '1px solid rgba(99,102,241,0.25)', background: 'var(--panel-2)', marginTop: 14 }}>
      <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="file" style={{ width: 16, height: 16, color: '#4f46e5' }} />
              Registry Day Manager
            </b>
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              Zero-dispute Sub-Registrar execution workflow & document verification
            </span>
          </div>
          <span className="visit-badge" style={{ background: completedCount >= 6 ? '#dcfce7' : '#fef3c7', color: completedCount >= 6 ? '#15803d' : '#b45309', fontWeight: 700 }}>
            {completedCount}/7 Ready
          </span>
        </div>

        <div className="registry-checklist">
          <label className={`checklist-row ${checklist.pan_verified ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.pan_verified} onChange={() => toggle('pan_verified')} />
            <span style={{ flex: 1 }}>Buyer KYC (PAN, Aadhaar & Legal Name Verified)</span>
          </label>
          <label className={`checklist-row ${checklist.tds_26qb ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.tds_26qb} onChange={() => toggle('tds_26qb')} />
            <span style={{ flex: 1 }}>1% TDS Form 26QB Challan filed & verified</span>
          </label>
          <label className={`checklist-row ${checklist.bank_noc ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.bank_noc} onChange={() => toggle('bank_noc')} />
            <span style={{ flex: 1 }}>Bank NOC / Mortgaged Bank Clearance letter</span>
          </label>
          <label className={`checklist-row ${checklist.stamp_duty_paid ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.stamp_duty_paid} onChange={() => toggle('stamp_duty_paid')} />
            <span style={{ flex: 1 }}>Stamp Duty & Registration Fee Challan generated</span>
          </label>
          <label className={`checklist-row ${checklist.deed_approved ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.deed_approved} onChange={() => toggle('deed_approved')} />
            <span style={{ flex: 1 }}>Draft Sale Deed vetted & approved by Buyer & Legal</span>
          </label>
          <label className={`checklist-row ${checklist.slot_booked ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.slot_booked} onChange={() => toggle('slot_booked')} />
            <span style={{ flex: 1 }}>Sub-Registrar Office Appointment Slot confirmed</span>
          </label>
          <label className={`checklist-row ${checklist.signatory_assigned ? 'done' : ''}`}>
            <input type="checkbox" checked={!!checklist.signatory_assigned} onChange={() => toggle('signatory_assigned')} />
            <span style={{ flex: 1 }}>Builder Authorized Signatory & Witnesses confirmed</span>
          </label>
        </div>

        <div className="kgrid" style={{ marginTop: 6 }}>
          <Field label="Authorized Signatory Name" id="reg-sig">
            <input id="reg-sig" className="input" placeholder="e.g. Rajesh Singhania (Director)" value={checklist.signatory_name || ''} onChange={e => setChecklist({ ...checklist, signatory_name: e.target.value })} onBlur={saveDetails} />
          </Field>
          <Field label="Accompanying Executive" id="reg-exec">
            <input id="reg-exec" className="input" placeholder="e.g. Amit Kumar (Legal Desk)" value={checklist.accompanying_staff || ''} onChange={e => setChecklist({ ...checklist, accompanying_staff: e.target.value })} onBlur={saveDetails} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn sm wa-btn" onClick={sendReminder}>
            <Icon name="wa" />WhatsApp Checklist to Buyer
          </button>
        </div>
      </div>
    </div>
  );
}
