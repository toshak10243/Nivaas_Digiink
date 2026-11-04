import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Avatar, Pill, Modal, Field, Seg, useLoad, Loading, Empty } from '../components/ui.jsx';
import { inr, phone, ago } from '../lib/format.js';

const TABS = [['sales', 'Sales team'], ['broker', 'Brokers'], ['maintenance', 'Maintenance'], ['admin', 'Admins'], ['customer', 'Home owners']];

export default function Team({ say }) {
  const [tab, setTab] = useState('sales');
  const [rows, reload] = useLoad(() => api.get('/api/team'), []);
  const [edit, setEdit] = useState(null);
  const [created, setCreated] = useState(null);
  if (!rows) return <div className="page"><Loading /></div>;
  const list = rows.filter(u => u.role === tab);
  const reset = async u => { const r = await api.post(`/api/team/${u.id}/reset-password`); setCreated({ ...u, temp_password: r.temp_password, reset: true }); };
  const toggle = async u => { await api.patch('/api/team/' + u.id, { active: !u.active }); say(u.active ? `${u.name} can no longer log in` : `${u.name} re-activated`); reload(); };

  return (
    <div className="page wide">
      <div className="pagehead"><div style={{ flex: 1 }}><h2>Team</h2><p>Create logins for your sales team, brokers and maintenance staff, and set salaries, incentives and commission.</p></div>
        {tab !== 'customer' && <button className="btn sun" onClick={() => setEdit({ role: tab })}><Icon name="userPlus" />Add {TABS.find(t => t[0] === tab)[1].replace(/s$/, '').replace('team', 'agent').toLowerCase()}</button>}</div>
      <div className="invbar"><Seg value={tab} onChange={setTab} label="Role" options={TABS.map(([k, l]) => [k, `${l} · ${rows.filter(u => u.role === k).length}`])} /></div>
      {list.length === 0 ? <Empty icon="users" title="Nobody here yet" /> : (
        <div className="card tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th>
            {tab === 'sales' && <><th>Salary</th><th>Incentive</th><th>Target</th><th>Status</th><th>AI twin</th><th>Open leads</th></>}
            {tab === 'broker' && <><th>Firm</th><th>RERA no.</th><th>Commission</th></>}
            {tab === 'maintenance' && <th>Handles</th>}
            <th>Sold</th><th>Last login</th><th /></tr></thead>
          <tbody>{list.map(u => (
            <tr key={u.id} style={{ cursor: 'default', opacity: u.active ? 1 : 0.5 }}>
              <td><div className="who"><Avatar name={u.name} size="sm" /><div><b>{u.name}</b>{!u.active && <div className="muted" style={{ fontSize: 12 }}>Deactivated</div>}</div></div></td>
              <td><div style={{ fontSize: 13 }}>{u.email}</div><div className="muted mono" style={{ fontSize: 12 }}>{phone(u.phone)}{u.whatsapp ? ` · WA ${u.whatsapp}` : ''}</div></td>
              {tab === 'sales' && <><td className="num">{inr(u.profile.salary)}</td><td>{rule(u.profile.incentive)}</td><td className="num">{u.profile.target_units || '—'}/mo</td>
                <td><Pill s={u.profile.availability || 'available'} label={(u.profile.availability || 'available')[0].toUpperCase() + (u.profile.availability || 'available').slice(1)} /></td>
                <td>{({ off: 'Off', away: 'Covers when away', always: 'Always on' })[u.profile.ai_twin?.mode || 'away']}</td><td className="num">{u.open_leads}</td></>}
              {tab === 'broker' && <><td>{u.profile.firm || '—'}</td><td className="mono" style={{ fontSize: 12 }}>{u.profile.rera_agent_no || '—'}</td><td>{rule(u.profile.commission)}</td></>}
              {tab === 'maintenance' && <td>{(u.profile.skills || []).join(', ') || '—'}</td>}
              <td className="num">{u.units_sold || '—'}</td><td className="time">{u.last_login ? ago(u.last_login) + ' ago' : 'never'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{tab !== 'customer' && <button className="btn sm" onClick={() => setEdit(u)}><Icon name="edit" />Edit</button>}
                <button className="btn sm ghost" onClick={() => reset(u)}>Reset password</button><button className="btn sm ghost" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {edit && <MemberModal user={edit} say={say} onClose={() => setEdit(null)} onDone={r => { setEdit(null); reload(); if (r?.temp_password) setCreated(r); }} />}
      {created && <Modal title={created.reset ? 'New password' : 'Login created'} onClose={() => setCreated(null)} footer={<button className="btn sun" onClick={() => setCreated(null)}>Done</button>}>
        <p style={{ margin: 0 }}>Share these with <b>{created.name}</b> privately. They can change the password after logging in.</p>
        <div className="sharebox"><span>Email <b className="mono">{created.email}</b></span><span>Password <b className="mono">{created.temp_password}</b></span></div>
      </Modal>}
    </div>
  );
}

const rule = r => (!r?.value ? '—' : r.type === 'flat' ? `${inr(r.value)} per home` : `${r.value}% of deal`);

function MemberModal({ user, say, onClose, onDone }) {
  const isNew = !user.id;
  const p = user.profile || {};
  const [f, setF] = useState({
    name: user.name || '', email: user.email || '', phone: user.phone || '',
    salary: p.salary ?? 25000, target_units: p.target_units ?? 2, inc_type: p.incentive?.type || 'percent', inc_value: p.incentive?.value ?? 0.25,
    firm: p.firm || '', rera_agent_no: p.rera_agent_no || '', com_type: p.commission?.type || 'percent', com_value: p.commission?.value ?? 2, skills: (p.skills || []).join(', '),
  });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const role = user.role;
  const profile = role === 'sales' ? { salary: Number(f.salary), target_units: Number(f.target_units), incentive: { type: f.inc_type, value: Number(f.inc_value) } }
    : role === 'broker' ? { firm: f.firm, rera_agent_no: f.rera_agent_no, commission: { type: f.com_type, value: Number(f.com_value) } }
      : role === 'maintenance' ? { skills: f.skills.split(',').map(s => s.trim()).filter(Boolean) } : {};
  const save = async () => {
    try {
      const r = isNew ? await api.post('/api/team', { role, name: f.name, email: f.email, phone: f.phone, profile }) : await api.patch('/api/team/' + user.id, { name: f.name, email: f.email, phone: f.phone, profile });
      say(isNew ? `${f.name} added` : 'Saved'); onDone(r);
    } catch (e) { say(e.message); }
  };
  return (
    <Modal title={isNew ? `Add ${role === 'sales' ? 'sales agent' : role}` : `Edit ${user.name}`} onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={!f.name || !f.email} onClick={save}>{isNew ? 'Create login' : 'Save'}</button></>}>
      <div className="kgrid">
        <Field label="Full name" id="tm-n"><input id="tm-n" className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email (login)" id="tm-e"><input id="tm-e" type="email" className="input" value={f.email} onChange={set('email')} /></Field>
        <Field label="Mobile / WhatsApp" id="tm-p"><input id="tm-p" className="input" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      {role === 'sales' && <>
        <div className="eyebrow">Salary & incentive</div>
        <div className="kgrid">
          <Field label="Fixed salary per month (₹)" id="tm-s"><input id="tm-s" className="input" inputMode="numeric" value={f.salary} onChange={set('salary')} /></Field>
          <Field label="Monthly target (homes)" id="tm-t"><input id="tm-t" className="input" inputMode="numeric" value={f.target_units} onChange={set('target_units')} /></Field>
          <Field label="Incentive" id="tm-it"><div style={{ display: 'flex', gap: 6 }}><select id="tm-it" className="select" style={{ width: 150 }} value={f.inc_type} onChange={set('inc_type')}><option value="percent">% of deal</option><option value="flat">₹ per home</option></select>
            <input aria-label="Incentive value" className="input" inputMode="decimal" value={f.inc_value} onChange={set('inc_value')} /></div></Field>
        </div>
        <p className="hint" style={{ margin: 0 }}>Example: 0.3% of a ₹1 Cr flat = {inr(1e7 * 0.003)} per booking. Incentives are created automatically on every booking.</p>
      </>}
      {role === 'broker' && <>
        <div className="eyebrow">Channel partner details</div>
        <div className="kgrid">
          <Field label="Firm name" id="tm-f"><input id="tm-f" className="input" value={f.firm} onChange={set('firm')} /></Field>
          <Field label="RERA agent no." id="tm-r"><input id="tm-r" className="input" value={f.rera_agent_no} onChange={set('rera_agent_no')} /></Field>
          <Field label="Commission" id="tm-ct"><div style={{ display: 'flex', gap: 6 }}><select id="tm-ct" className="select" style={{ width: 150 }} value={f.com_type} onChange={set('com_type')}><option value="percent">% of deal</option><option value="flat">₹ per home</option></select>
            <input aria-label="Commission value" className="input" inputMode="decimal" value={f.com_value} onChange={set('com_value')} /></div></Field>
        </div>
      </>}
      {role === 'maintenance' && <Field label="Handles (comma separated)" id="tm-sk" hint="e.g. plumbing, seepage, electrical"><input id="tm-sk" className="input" value={f.skills} onChange={set('skills')} /></Field>}
      {isNew && <div className="note">A temporary password is generated. You will see it once, on the next screen.</div>}
    </Modal>
  );
}
