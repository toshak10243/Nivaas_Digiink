import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Pill, Seg, Avatar, useLoad, Loading, Empty } from '../components/ui.jsx';
import { money, inr, date } from '../lib/format.js';

export default function Earnings({ me, say }) {
  const admin = me.user.role === 'admin';
  const [tab, setTab] = useState(admin ? 'payroll' : 'mine');
  return (
    <div className="page wide">
      <div className="pagehead"><div style={{ flex: 1 }}><h2>{admin ? 'Payouts' : me.user.role === 'broker' ? 'My commission' : 'My earnings'}</h2>
        <p>{admin ? 'Salaries, sales incentives and broker commissions. Every booking creates the right entries automatically.' : 'Every booking you close adds an entry here. Pending → approved → paid.'}</p></div>
        {admin && <Seg value={tab} onChange={setTab} label="View" options={[['payroll', 'Monthly payroll'], ['ledger', 'Commission ledger']]} />}</div>
      {tab === 'payroll' ? <Payroll /> : <Ledger admin={admin} say={say} me={me} />}
    </div>
  );
}

function Payroll() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [d] = useLoad(() => api.get('/api/payroll?month=' + month), [month]);
  if (!d) return <Loading />;
  const sales = d.rows.filter(r => r.role === 'sales'), brokers = d.rows.filter(r => r.role === 'broker');
  const sum = rs => rs.reduce((a, r) => a + r.total, 0);
  return (
    <>
      <div className="invbar"><label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><span className="eyebrow">Month</span><input type="month" className="input" style={{ width: 170 }} value={month} onChange={e => setMonth(e.target.value)} /></label>
        <span className="muted">Sales team {inr(sum(sales))} · Brokers {inr(sum(brokers))} · Total <b>{inr(sum(d.rows))}</b></span></div>
      <div className="card tablewrap"><table>
        <thead><tr><th>Sales agent</th><th>Homes sold</th><th>Target</th><th>Sales value</th><th>Fixed salary</th><th>Incentive</th><th>Total payout</th></tr></thead>
        <tbody>{sales.map(r => (
          <tr key={r.id}><td><div className="who"><Avatar name={r.name} size="sm" /><b>{r.name}</b></div></td><td className="num">{r.units}</td>
            <td><div className="paybar" style={{ width: 80 }}><i style={{ width: `${r.target ? Math.min(100, (r.units / r.target) * 100) : 0}%` }} /></div><span className="muted num" style={{ fontSize: 12 }}>{r.units}/{r.target || '—'}</span></td>
            <td className="num">{money(r.sales_value)}</td><td className="num">{inr(r.salary)}</td><td className="num">{inr(r.variable)}<div className="muted" style={{ fontSize: 12 }}>{r.profile?.incentive?.type === 'flat' ? `${inr(r.profile.incentive.value)} / home` : `${r.profile?.incentive?.value || 0}% of value`}</div></td><td className="num"><b>{inr(r.total)}</b></td></tr>
        ))}</tbody>
      </table></div>
      <div className="card tablewrap"><table>
        <thead><tr><th>Broker</th><th>Homes sold</th><th>Sales value</th><th>Commission rule</th><th>Commission earned</th><th>Paid</th></tr></thead>
        <tbody>{brokers.map(r => (
          <tr key={r.id}><td><div className="who"><Avatar name={r.name} size="sm" /><div><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.profile?.firm}</div></div></div></td><td className="num">{r.units}</td><td className="num">{money(r.sales_value)}</td>
            <td>{r.profile?.commission?.type === 'flat' ? `${inr(r.profile.commission.value)} per home` : `${r.profile?.commission?.value || 0}% of deal`}</td><td className="num"><b>{inr(r.variable)}</b></td><td className="num">{inr(r.variable_paid)}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Ledger({ admin, say, me }) {
  const [rows, reload] = useLoad(() => api.get('/api/commissions'), []);
  const [f, setF] = useState('all');
  if (!rows) return <Loading />;
  const shown = rows.filter(r => f === 'all' || r.status === f);
  const tot = s => rows.filter(r => r.status === s).reduce((a, r) => a + r.amount, 0);
  const set = async (r, status) => { await api.patch('/api/commissions/' + r.id, { status }); say(status === 'paid' ? `${inr(r.amount)} marked paid to ${r.name}` : 'Updated'); reload(); };
  const downloadStatement = () => {
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const data = [
      ['Booking date', 'Project', 'Unit', 'Deal value', 'Commission basis', 'Commission amount', 'Status', 'Paid date'],
      ...rows.map(r => [r.booking_date ? new Date(r.booking_date).toLocaleDateString('en-IN') : '', r.project_name, r.unit_no, r.deal_value, r.basis, r.amount, r.status, r.paid_on ? new Date(r.paid_on).toLocaleDateString('en-IN') : '']),
    ].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${data}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `nivaas-commission-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <section className="kpis three">
        <div className="card kpi"><span className="eyebrow">Pending</span><b className="num">{money(tot('pending'))}</b></div>
        <div className="card kpi"><span className="eyebrow">Approved, to pay</span><b className="num">{money(tot('approved'))}</b></div>
        <div className="card kpi"><span className="eyebrow">Paid</span><b className="num">{money(tot('paid'))}</b></div>
      </section>
      <div className="invbar"><Seg value={f} onChange={setF} label="Status" options={[['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['void', 'Void']]} />
        {me.user.role === 'broker' && <button className="btn" onClick={downloadStatement} disabled={!rows.length}>Download commission statement</button>}
      </div>
      {shown.length === 0 ? <Empty icon="rupee" title="Nothing here yet" /> : (
        <div className="card tablewrap"><table>
          <thead><tr>{admin && <th>Person</th>}<th>Unit</th><th>Type</th><th>Basis</th><th>Amount</th><th>Status</th><th>Booked</th>{admin && <th />}</tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id} style={{ cursor: 'default' }}>{admin && <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.role === 'broker' ? 'Broker' : 'Sales'}</div></td>}
              <td><b>{r.unit_no}</b><div className="muted" style={{ fontSize: 12 }}>{r.project_name} · {money(r.deal_value)}</div></td><td>{r.kind === 'broker_commission' ? 'Commission' : 'Incentive'}</td><td className="muted">{r.basis}</td>
              <td className="num"><b>{inr(r.amount)}</b></td><td><Pill s={r.status} />{r.paid_on && <div className="muted" style={{ fontSize: 12 }}>{date(r.paid_on)}</div>}</td><td className="time">{date(r.booking_date)}</td>
              {admin && <td style={{ whiteSpace: 'nowrap' }}>{r.status === 'pending' && <button className="btn sm" onClick={() => set(r, 'approved')}>Approve</button>}{r.status === 'approved' && <button className="btn sm sun" onClick={() => set(r, 'paid')}>Mark paid</button>}</td>}
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
