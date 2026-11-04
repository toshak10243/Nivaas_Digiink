import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Avatar, Pill, Drawer, Modal, Seg, Field, useLoad, Loading, Empty } from '../components/ui.jsx';
import { STAGES, stageLabel, SOURCES, ago, dateTime, phone, money } from '../lib/format.js';
import { ShareModal } from './Inventory.jsx';

export default function Leads({ me, say, go, params }) {
  const role = me.user.role;
  const [view, setView] = useState('board');
  const [q, setQ] = useState('');
  const [temp, setTemp] = useState('all');
  const [followFilter, setFollowFilter] = useState('all');
  const [who, setWho] = useState('all');
  const [leads, reload] = useLoad(() => api.get('/api/leads'), []);
  const [team] = useLoad(() => (role === 'admin' ? api.get('/api/team') : Promise.resolve([])), [role]);
  const [projects] = useLoad(() => api.get('/api/projects'), []);
  const [adding, setAdding] = useState(false);
  const openId = params[0];
  if (!leads) return <div className="page"><Loading /></div>;

  const isToday = d => d && new Date(d).toDateString() === new Date().toDateString();
  const isOverdue = d => d && new Date(d) < new Date() && !isToday(d);
  const isFuture = d => d && new Date(d) > new Date() && !isToday(d);

  const shown = leads.filter(l => {
    if (temp !== 'all' && l.temperature !== temp) return false;
    if (who !== 'all' && (who === 'none' ? !!l.assigned_to : l.assigned_to !== who)) return false;
    if (followFilter === 'today' && !isToday(l.followup_at)) return false;
    if (followFilter === 'overdue' && !isOverdue(l.followup_at)) return false;
    if (followFilter === 'upcoming' && !isFuture(l.followup_at)) return false;
    if (q && !`${l.name} ${l.phone} ${l.unit_no || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const sellers = (team || []).filter(u => ['sales', 'broker'].includes(u.role));

  return (
    <div className="page wide">
      <div className="pagehead">
        <div style={{ flex: 1 }}><h2>{role === 'broker' ? 'My clients' : role === 'sales' ? 'My leads' : 'All leads'}</h2>
          <p>{role === 'broker' ? 'Register your clients here first. The first registration of a phone number is protected for you.' : 'Leads from LeadSathi, shared links, brokers and walk-ins land here and are routed to the least-busy agent.'}</p></div>
        {api.mode === 'demo' && role === 'admin' && <button className="btn" onClick={async () => { const r = await api.post('/demo/leadsathi'); say(`LeadSathi sent ${r.lead.name} → assigned to ${r.assigned}`); reload(); }}><Icon name="spark" />Simulate LeadSathi lead</button>}
        <button className="btn sun" onClick={() => setAdding(true)}><Icon name="userPlus" />{role === 'broker' ? 'Register client' : 'Add lead'}</button>
      </div>

      <div className="invbar">
        <Seg value={view} onChange={setView} label="View" options={[['board', 'Board'], ['list', 'List']]} />
        <Seg value={temp} onChange={setTemp} label="Temperature" options={[['all', 'All'], ['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']]} />
        <Seg value={followFilter} onChange={setFollowFilter} label="Follow-ups" options={[['all', 'All'], ['today', 'Today'], ['overdue', 'Overdue'], ['upcoming', 'Future']]} />
        {role === 'admin' && <select className="select" style={{ width: 180 }} value={who} onChange={e => setWho(e.target.value)} aria-label="Assigned to"><option value="all">Everyone</option><option value="none">Unassigned</option>{sellers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <label className="search" style={{ flex: '1 1 200px', maxWidth: 260 }}><Icon name="search" /><span className="sr">Search</span><input placeholder="Name, phone or unit" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>

      {shown.length === 0 ? <Empty icon="funnel" title="No leads here yet" /> : view === 'board' ? (
        <div className="board">
          {STAGES.map(([k, l]) => {
            const col = shown.filter(x => x.stage === k);
            return (
              <div key={k} className={'bcol ' + k}>
                <div className="bcol-h"><b>{l}</b><span className="num">{col.length}</span></div>
                <div className="bcol-b">{col.map(x => <LeadCard key={x.id} l={x} onOpen={() => go('leads/' + x.id)} showOwner={role === 'admin'} />)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card tablewrap"><table>
          <thead><tr><th>Name</th><th>Phone</th><th>Stage</th><th>Interest</th><th>Budget</th><th>Source</th>{role === 'admin' && <th>Owner</th>}<th>Next visit</th><th>Updated</th></tr></thead>
          <tbody>{shown.map(l => (
            <tr key={l.id} onClick={() => go('leads/' + l.id)}>
              <td><div className="who"><span className={'tdot ' + l.temperature} /><b>{l.name || '—'}</b></div></td><td className="mono" style={{ fontSize: 13 }}>{phone(l.phone)}</td>
              <td>{stageLabel(l.stage)}</td><td>{[l.config_pref, l.unit_no, l.project_name].filter(Boolean).join(' · ')}</td><td>{l.budget || '—'}</td><td>{SOURCES[l.source] || l.source}{l.broker_name ? ` · ${l.broker_name}` : ''}</td>
              {role === 'admin' && <td>{l.assigned_name || <span className="pill hot">Unassigned</span>}</td>}<td>{l.next_visit ? dateTime(l.next_visit) : '—'}</td><td className="time">{ago(l.updated_at)}</td>
            </tr>))}</tbody>
        </table></div>
      )}

      {openId && <LeadDrawer id={openId} me={me} say={say} go={go} sellers={sellers} projects={projects || []} onClose={() => go('leads')} onChange={reload} />}
      {adding && <AddLead me={me} projects={projects || []} say={say} onClose={() => setAdding(false)} onDone={l => { setAdding(false); reload(); go('leads/' + l.id); }} />}
    </div>
  );
}

function LeadCard({ l, onOpen, showOwner }) {
  const isToday = l.followup_at && new Date(l.followup_at).toDateString() === new Date().toDateString();
  const isOverdue = l.followup_at && new Date(l.followup_at) < new Date() && !isToday;

  return (
    <button className="lcard" onClick={onOpen}>
      <div className="lc-top"><span className={'tdot ' + l.temperature} title={l.temperature} /><b>{l.name || phone(l.phone)}</b><span className="time">{ago(l.updated_at)}</span></div>
      <div className="lc-mid">{[l.config_pref, l.budget].filter(Boolean).join(' · ') || 'Requirement not known yet'}</div>
      {l.unit_no && <div className="lc-unit"><Icon name="grid" />{l.unit_no}</div>}
      {l.followup_at && (
        <div style={{ margin: '4px 0' }}>
          <span className={`followup-tag ${isOverdue ? 'overdue' : isToday ? 'today' : 'upcoming'}`}>
            <Icon name="clock" style={{ width: 11, height: 11 }} />
            {isOverdue ? `Overdue: ${dateTime(l.followup_at)}` : isToday ? `Today: ${dateTime(l.followup_at)}` : dateTime(l.followup_at)}
          </span>
        </div>
      )}
      <div className="lc-foot">
        <span className={'src ' + l.source}>{SOURCES[l.source] || l.source}</span>
        {l.next_visit && <span className="lc-visit"><Icon name="calendar" />{dateTime(l.next_visit)}</span>}
        {showOwner && (l.assigned_name ? <span className="lc-owner" title={l.assigned_name}><Avatar name={l.assigned_name} size="sm" /></span> : <span className="pill hot">Unassigned</span>)}
      </div>
    </button>
  );
}

function LeadDrawer({ id, me, say, go, sellers, projects, onClose, onChange }) {
  const role = me.user.role;
  const [l, reload] = useLoad(() => api.get('/api/leads/' + id), [id]);
  const [note, setNote] = useState('');
  const [visit, setVisit] = useState('');
  const [share, setShare] = useState(null);
  const [pick, setPick] = useState(false);
  const [fDate, setFDate] = useState('');
  const [fType, setFType] = useState('call');
  const [fNote, setFNote] = useState('');
  if (!l) return <Drawer title="Loading…" onClose={onClose}><Loading /></Drawer>;
  const refresh = () => { reload(); onChange(); };
  const patch = async b => { try { await api.patch('/api/leads/' + l.id, b); refresh(); } catch (e) { say(e.message); } };
  const assign = async user_id => { try { const r = await api.post(`/api/leads/${l.id}/assign`, { user_id: user_id || null }); say(`Assigned to ${r.name}`); refresh(); } catch (e) { say(e.message); } };
  const addEvent = async kind => { if (!note.trim()) return; await api.post(`/api/leads/${l.id}/events`, { kind, body: note }); setNote(''); refresh(); };
  const book = async () => { if (!visit) return; try { await api.post(`/api/leads/${l.id}/visits`, { scheduled_at: new Date(visit).toISOString() }); setVisit(''); say('Site visit booked'); refresh(); } catch (e) { say(e.message); } };

  const scheduleFollowup = async (isoDate, type, noteText) => {
    try {
      await patch({
        followup_at: isoDate || new Date(fDate).toISOString(),
        followup_type: type || fType,
        followup_note: noteText || fNote || 'Follow-up call scheduled',
      });
      say('Follow-up reminder set');
      setFDate('');
      setFNote('');
    } catch (e) {
      say(e.message);
    }
  };

  const clearFollowup = async () => {
    try {
      await patch({ followup_at: null, followup_type: null, followup_note: null });
      await api.post(`/api/leads/${l.id}/events`, { kind: 'note', body: 'Follow-up marked completed' });
      say('Follow-up marked completed');
    } catch (e) {
      say(e.message);
    }
  };

  const applyPreset = (preset) => {
    const d = new Date();
    if (preset === '2h') {
      d.setTime(d.getTime() + 2 * 3600e3);
    } else if (preset === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
    } else if (preset === '3d') {
      d.setDate(d.getDate() + 3);
      d.setHours(11, 0, 0, 0);
    }
    const tzOffset = d.getTimezoneOffset() * 60000;
    setFDate(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
  };

  const isToday = l.followup_at && new Date(l.followup_at).toDateString() === new Date().toDateString();
  const isOverdue = l.followup_at && new Date(l.followup_at) < new Date() && !isToday;
  const shareUnit = async unit => {
    const proj = projects.find(p => p.id === l.project_id) || projects[0];
    const s = await api.post('/api/share', { project_id: l.project_id || projects[0]?.id, unit_id: unit?.id, lead_id: l.id });
    setShare({
      url: s.url,
      title: unit ? `Flat ${unit.unit_no} · ${proj?.name || 'Project'}` : (proj?.name || 'Project'),
      lead: l,
      unit,
      project: proj,
      clientPhone: l.phone,
      text: `Namaste ${l.name?.split(' ')[0] || ''}! As discussed, here are the details${unit ? ` of flat ${unit.unit_no}` : ''}:`,
    });
    setPick(false);
    refresh();
  };

  const startLeadChat = async () => {
    try {
      const ch = await api.post('/api/chats', { lead_id: l.id });
      go('chats/' + ch.id);
    } catch (e) {
      window.open(`https://wa.me/${String(l.phone).replace(/\D/g, '')}`, '_blank');
    }
  };

  return (
    <Drawer title={l.name || phone(l.phone)} sub={`${SOURCES[l.source] || l.source} · added ${ago(l.created_at)} ago${l.broker ? ` · broker ${l.broker.name}${l.broker.firm ? ' (' + l.broker.firm + ')' : ''}` : ''}`} onClose={onClose} actions={<Pill s={l.temperature} />}>
      <div className="callbar">
        <a className="btn sun" href={`tel:+${String(l.phone).replace(/\D/g, '')}`}><Icon name="phone" />{phone(l.phone)}</a>
        <a className="btn wa-btn" href={`https://wa.me/${String(l.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Icon name="wa" />WhatsApp Web</a>
        {role !== 'broker' && (
          l.chats?.[0]
            ? <button className="btn" onClick={() => go('chats/' + l.chats[0].id)}><Icon name="chat" />Open In-app Chat</button>
            : <button className="btn" onClick={startLeadChat}><Icon name="chat" />Start WhatsApp Chat</button>
        )}
      </div>

      <div className="stagepick" role="group" aria-label="Stage">
        {STAGES.filter(([k]) => k !== 'lost').map(([k, s]) => <button key={k} aria-pressed={l.stage === k} className={STAGES.findIndex(x => x[0] === k) <= STAGES.findIndex(x => x[0] === l.stage) && l.stage !== 'lost' ? 'past' : ''} onClick={() => patch({ stage: k })}>{s}</button>)}
      </div>
      {l.stage === 'lost' ? <div className="note">Marked lost{l.lost_reason ? `: ${l.lost_reason}` : ''}. <button className="linkbtn" onClick={() => patch({ stage: 'contacted' })}>Re-open</button></div>
        : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['Budget mismatch', 'Bought elsewhere', 'Not reachable', 'Not interested'].map(r => <button key={r} className="chipbtn" onClick={() => patch({ stage: 'lost', lost_reason: r })}>Lost: {r}</button>)}</div>}

      {/* Follow-up Reminder & Tracker Card */}
      <div className="followup-card">
        <div className="followup-card-h">
          <b>Follow-up & Next Action</b>
          {l.followup_at && (
            <span className={`followup-tag ${isOverdue ? 'overdue' : isToday ? 'today' : 'upcoming'}`}>
              <Icon name="clock" style={{ width: 12, height: 12 }} />
              {isOverdue ? 'Overdue Follow-up' : isToday ? 'Due Today' : 'Scheduled'}
            </span>
          )}
        </div>

        {l.followup_at ? (
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>
              <b>{dateTime(l.followup_at)}</b> · <span style={{ textTransform: 'capitalize' }}>{l.followup_type || 'Call'}</span>
              {l.followup_note && <span className="muted"> — “{l.followup_note}”</span>}
            </div>
            <div className="followup-actions">
              <a className="btn sm sun" href={`tel:+${String(l.phone).replace(/\D/g, '')}`}><Icon name="phone" />Call Now</a>
              <a className="btn sm wa-btn" href={`https://wa.me/${String(l.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${l.name?.split(' ')[0] || ''}! Following up as discussed regarding our property.`)}`} target="_blank" rel="noreferrer"><Icon name="wa" />WhatsApp</a>
              <button className="btn sm" onClick={clearFollowup}><Icon name="checkCircle" />Mark Done</button>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>No follow-up reminder scheduled for this lead.</p>
        )}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Schedule Follow-up</span>
            <div className="preset-chips">
              <button type="button" className="chipbtn" onClick={() => applyPreset('2h')}>+2 Hrs</button>
              <button type="button" className="chipbtn" onClick={() => applyPreset('tomorrow')}>Tomorrow 11 AM</button>
              <button type="button" className="chipbtn" onClick={() => applyPreset('3d')}>In 3 Days</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <select className="select" style={{ minWidth: 140, flex: '0 0 auto' }} value={fType} onChange={e => setFType(e.target.value)} aria-label="Follow-up Mode">
              <option value="call">Phone Call</option>
              <option value="whatsapp">WhatsApp Message</option>
              <option value="meeting">In-person Meeting</option>
              <option value="doc">Documentation / KYC</option>
            </select>
            <input type="datetime-local" className="input" style={{ flex: '1 1 200px' }} value={fDate} onChange={e => setFDate(e.target.value)} aria-label="Follow-up Date & Time" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 220px' }} placeholder="Note: e.g. Present payment schedule" value={fNote} onChange={e => setFNote(e.target.value)} aria-label="Follow-up Agenda Note" />
            <button className="btn sun" style={{ flex: '0 0 auto' }} disabled={!fDate} onClick={() => scheduleFollowup()}><Icon name="calendar" />Save Reminder</button>
          </div>
        </div>
      </div>

      {/* Feature 7: AI Buyer Objection Resolver */}
      <AiObjectionCard l={l} say={say} />

      {/* Feature 9: AI Sales Handover Memory */}
      <AiHandoverCard l={l} sellers={sellers} say={say} refresh={refresh} />

      {l.ai_summary && <div className="aisum"><Icon name="spark" /><div><b>AI summary</b>{l.ai_summary}</div></div>}

      <div className="kgrid">
        <Edit label="Looking for" value={l.config_pref} onSave={v => patch({ config_pref: v })} />
        <Edit label="Budget" value={l.budget} onSave={v => patch({ budget: v })} />
        <Edit label="Purpose" value={l.purpose} onSave={v => patch({ purpose: v })} />
        <Edit label="Timeline" value={l.timeline} onSave={v => patch({ timeline: v })} />
      </div>
      <div className="kgrid">
        <Field label="Project" id="ld-p"><select id="ld-p" className="select" value={l.project_id || ''} onChange={e => patch({ project_id: e.target.value })}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Assigned to" id="ld-a">
          {role === 'admin' ? <select id="ld-a" className="select" value={l.assigned_to || ''} onChange={e => assign(e.target.value)}>
            <option value="">{l.assigned_to ? 'Auto-assign again' : 'Unassigned · auto-assign'}</option>{sellers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role === 'broker' ? 'broker' : `${u.open_leads} open`})</option>)}
          </select> : <div className="input" style={{ background: 'var(--panel-2)' }}>{l.assigned?.name || '—'}</div>}
        </Field>
      </div>

      <div className="drawer-actions">
        <button className="btn" onClick={() => setPick(true)}><Icon name="share" />Share a flat</button>
        <div className="inline"><input type="datetime-local" className="input" aria-label="Visit date and time" value={visit} onChange={e => setVisit(e.target.value)} /><button className="btn ink" disabled={!visit} onClick={book}><Icon name="calendar" />Book visit</button></div>
        {['admin', 'sales'].includes(role) && <button className="btn" onClick={() => go('inventory')}><Icon name="receipt" />Book a flat</button>}
      </div>

      {l.visits.length > 0 && <div><div className="eyebrow" style={{ marginBottom: 8 }}>Site visits</div>
        {l.visits.map(v => <VisitRow key={v.id} v={v} say={say} onDone={refresh} />)}</div>}
      {l.shares.length > 0 && <div><div className="eyebrow" style={{ marginBottom: 8 }}>Links shared</div>
        {l.shares.map(s => <div key={s.token} className="minirow"><Icon name="link" /><span style={{ flex: 1 }}>{s.unit_no || 'Project page'}</span><span className="muted"><Icon name="eye" style={{ width: 14, height: 14, verticalAlign: -2 }} /> {s.views} views{s.last_viewed ? ` · last ${ago(s.last_viewed)} ago` : ''}</span></div>)}</div>}

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Activity</div>
        <div className="noteform"><textarea className="textarea" rows={2} placeholder="What happened? e.g. Called, wants park-facing 3 BHK" value={note} onChange={e => setNote(e.target.value)} aria-label="Note" />
          <div style={{ display: 'flex', gap: 8 }}><button className="btn sm" onClick={() => addEvent('call')} disabled={!note.trim()}><Icon name="phone" />Log call</button><button className="btn sm" onClick={() => addEvent('note')} disabled={!note.trim()}>Add note</button></div></div>
        <div className="timeline">{l.events.map(e => (
          <div key={e.id} className="tl"><i className={['assigned', 'reassigned', 'stage', 'visit'].includes(e.kind) ? 's' : ''} /><span><b>{e.body}</b><small className="muted">{e.actor ? e.actor + ' · ' : ''}{ago(e.created_at)} ago</small></span></div>
        ))}</div>
      </div>
      {pick && <PickUnit projectId={l.project_id || projects[0]?.id} onPick={shareUnit} onClose={() => setPick(false)} />}
      {share && <ShareModal {...share} say={say} onClose={() => setShare(null)} />}
    </Drawer>
  );
}

function Edit({ label, value, onSave }) {
  const [v, setV] = useState(value || '');
  return <Field label={label}><input className="input" value={v} placeholder="—" onChange={e => setV(e.target.value)} onBlur={() => v !== (value || '') && onSave(v)} aria-label={label} /></Field>;
}

function VisitRow({ v, say, onDone }) {
  const set = async (status) => {
    let feedback = '';
    let rating = 5;
    if (status === 'done') {
      const resp = window.prompt?.('How did the site visit go? Enter feedback:') ?? '';
      feedback = resp;
    }
    await api.patch('/api/visits/' + v.id, { status, feedback });
    say('Visit updated');
    onDone();
  };

  const sendPass = () => {
    const projName = v.project_name || 'Project';
    const msg = `*VIP SITE VISIT PASS*\nNamaste *${v.name || 'Client'}*!\nYour site visit to *${projName}* is scheduled for *${dateTime(v.scheduled_at)}*.\nGoogle Maps: ${v.project_map_url || 'https://maps.google.com'}\nHost: ${v.agent || 'Site Manager'}`;
    const ph = String(v.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="minirow" style={{ flexWrap: 'wrap', gap: 6 }}>
      <Icon name="calendar" />
      <span style={{ flex: 1, minWidth: 160 }}>
        {dateTime(v.scheduled_at)}{v.agent ? ` · ${v.agent}` : ''}
        {v.visitors_count > 1 ? ` · 👥 ${v.visitors_count} visitors` : ''}
        {v.transport === 'cab' ? ' · 🚖 Cab' : ''}
        {v.feedback ? ` · “${v.feedback}”` : ''}
        {v.rating ? ` · ★${v.rating}/5` : ''}
      </span>
      <Pill s={v.status} />
      <button className="btn sm wa-btn" title="Send WhatsApp Pass" onClick={sendPass}><Icon name="wa" />Pass</button>
      {['scheduled', 'confirmed'].includes(v.status) && (
        <>
          <button className="btn sm" onClick={() => set('done')}>Done</button>
          <button className="btn sm ghost" onClick={() => set('no_show')}>No-show</button>
        </>
      )}
    </div>
  );
}

function PickUnit({ projectId, onPick, onClose }) {
  const [units] = useLoad(() => api.get(`/api/units?project_id=${projectId}&status=available`), [projectId]);
  return (
    <Modal title="Which flat?" onClose={onClose} wide footer={<button className="btn" onClick={() => onPick(null)}>Share the whole project instead</button>}>
      {!units ? <Loading /> : <div className="pickgrid">{units.map(u => <button key={u.id} className="ucell available" onClick={() => onPick(u)}><b>{u.unit_no}</b><span>{u.type_name}</span><span className="num">{money(u.price)}</span></button>)}</div>}
    </Modal>
  );
}

function AddLead({ me, projects, say, onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', project_id: projects[0]?.id || '', config_pref: '', budget: '', purpose: '', notes: '', auto_assign: true });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async () => { setBusy(true); try { const l = await api.post('/api/leads', f); say(me.user.role === 'broker' ? 'Client registered and protected for you' : 'Lead added'); onDone(l); } catch (e) { say(e.message); } setBusy(false); };
  return (
    <Modal title={me.user.role === 'broker' ? 'Register a client' : 'Add a lead'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn sun" disabled={busy || !f.name || f.phone.replace(/\D/g, '').length < 10} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="kgrid">
        <Field label="Name" id="al-n"><input id="al-n" className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Mobile" id="al-p"><input id="al-p" className="input" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="98290 12345" /></Field>
        <Field label="Project" id="al-pr"><select id="al-pr" className="select" value={f.project_id} onChange={set('project_id')}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Looking for" id="al-c"><select id="al-c" className="select" value={f.config_pref} onChange={set('config_pref')}><option value="">Not sure yet</option><option>2 BHK</option><option>3 BHK</option><option>4 BHK</option></select></Field>
        <Field label="Budget" id="al-b"><input id="al-b" className="input" value={f.budget} onChange={set('budget')} placeholder="₹90 L – 1 Cr" /></Field>
        <Field label="Purpose" id="al-u"><select id="al-u" className="select" value={f.purpose} onChange={set('purpose')}><option value="">—</option><option>Self use</option><option>Investment</option></select></Field>
      </div>
      <Field label="Notes" id="al-no"><textarea id="al-no" className="textarea" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {me.user.role === 'broker' && <div className="note">The first registration of a mobile number is protected for you. If someone else already registered this client, you will see who.</div>}
    </Modal>
  );
}

function AiObjectionCard({ l, say }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('pitch'); // 'pitch' | 'wa'

  const presets = [
    { label: "Location & Distance", q: "Location bahut door hai, commute me time lagega", icon: "pin" },
    { label: "Maintenance Charges", q: "Monthly maintenance charges bahut costly lag rahe hain", icon: "rupee" },
    { label: "Possession Risk", q: "Possession time par milega ya project delay ho jayega?", icon: "clock" },
    { label: "Competitor Price", q: "Nearby competitors sasta rate de rahe hain, discount chahiye", icon: "chart" },
    { label: "Bank Loan & Approvals", q: "Kya sabhi major banks se approved hai? Loan process smooth hoga?", icon: "shield" }
  ];

  const solve = async (objectionText) => {
    const q = (objectionText || custom || '').trim();
    if (!q) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/leads/${l.id}/ai-objection`, { objection: q, language: 'hinglish' });
      setResult(res);
      say('AI Objection resolution generated!');
    } catch (e) {
      say(e.message || 'Failed to resolve objection');
    }
    setBusy(false);
  };

  const pitchText = result
    ? (result.pitch_script || result.responseScript || result.script || (typeof result === 'string' ? result : ''))
    : '';
  const waText = result
    ? (result.whatsapp_message || result.whatsappMessage || pitchText)
    : '';
  const factsList = result
    ? (Array.isArray(result.key_facts) ? result.key_facts : Array.isArray(result.keyFacts) ? result.keyFacts : [])
    : [];

  const copyCurrent = () => {
    const textToCopy = activeTab === 'wa' ? waText : pitchText;
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy);
    say(activeTab === 'wa' ? 'WhatsApp message copied!' : 'Calling script copied!');
  };

  const shareWhatsApp = () => {
    if (!waText && !pitchText) return;
    const ph = String(l.phone || '').replace(/\D/g, '');
    const url = `https://wa.me/${ph}?text=${encodeURIComponent(waText || pitchText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="ai-copilot-card">
      <div className="ai-copilot-h" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-badge">
            <Icon name="spark" style={{ width: 12, height: 12 }} />
            AI Copilot
          </span>
          <b style={{ fontSize: 13 }}>Buyer Objection Resolver</b>
        </div>
        <button className="linkbtn" type="button">{open ? 'Hide' : 'Resolve Objection'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Select an objection category or type what the customer said:
          </p>
          <div className="preset-grid">
            {presets.map((p, i) => (
              <button key={i} type="button" className="preset-btn" disabled={busy} onClick={() => solve(p.q)}>
                <Icon name={p.icon} style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--sun)' }} />
                <span><b>{p.label}:</b> <i>"{p.q}"</i></span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input className="input" placeholder="Or type customer objection..." value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && solve()} />
            <button className="btn sun" disabled={busy || !custom.trim()} onClick={() => solve()}>
              {busy ? 'Solving…' : 'Resolve'}
            </button>
          </div>

          {result && (
            <div className="ai-script-box" style={{ marginTop: 12, border: '1px solid var(--sun-line, rgba(249,115,22,0.3))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn sm"
                    style={{
                      background: activeTab === 'pitch' ? 'var(--sun)' : 'var(--panel-2)',
                      color: activeTab === 'pitch' ? '#fff' : 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      fontWeight: 600
                    }}
                    onClick={() => setActiveTab('pitch')}
                  >
                    <Icon name="phone" style={{ width: 12, height: 12 }} />
                    Calling Script
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    style={{
                      background: activeTab === 'wa' ? '#16a34a' : 'var(--panel-2)',
                      color: activeTab === 'wa' ? '#fff' : 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      fontWeight: 600
                    }}
                    onClick={() => setActiveTab('wa')}
                  >
                    <Icon name="wa" style={{ width: 12, height: 12 }} />
                    WhatsApp Ready
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm ghost" onClick={copyCurrent}>
                    <Icon name="copy" />Copy
                  </button>
                  <button className="btn sm wa-btn" onClick={shareWhatsApp}>
                    <Icon name="wa" />Send WhatsApp
                  </button>
                </div>
              </div>

              <div style={{
                background: 'var(--panel-2)',
                padding: '12px 14px',
                borderRadius: 8,
                whiteSpace: 'pre-line',
                marginBottom: 10,
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--ink)',
                border: '1px solid var(--line)'
              }}>
                {activeTab === 'wa' ? (waText || pitchText) : (pitchText || waText)}
              </div>

              {factsList.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-2)', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.04em', color: '#10b981' }}>
                    <Icon name="check" style={{ width: 13, height: 13 }} />
                    Verified Project Facts:
                  </b>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 }}>
                    {factsList.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>•</span>
                        <span>{typeof f === 'string' ? f : JSON.stringify(f)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AiHandoverCard({ l, sellers, say, refresh }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState(l.handover_summary || null);
  const [targetAgent, setTargetAgent] = useState('');

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/leads/${l.id}/ai-handover`, {
        new_agent_name: sellers.find(s => s.id === targetAgent)?.name || 'Next Executive',
        reason: 'Sales team handover / Staff vacation'
      });
      setMemo(res);
      say('Handover dossier generated');
      refresh();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  const memoObj = typeof memo === 'object' && memo !== null ? memo : (typeof memo === 'string' && memo.trim().startsWith('{') ? (() => { try { return JSON.parse(memo); } catch { return null; } })() : null);
  const memoText = typeof memo === 'string' && !memoObj ? memo : (memoObj?.summary || '');

  const copyMemo = () => {
    const textToCopy = memoObj
      ? `EXECUTIVE CLIENT BRIEFING DOSSIER\n\nClient: ${l.name} (${l.phone})\nSummary:\n${memoObj.summary || ''}\n\nKey Interest: ${memoObj.keyInterest || '—'}\nOffered Price: ${memoObj.offeredPrice || '—'}\n\nCritical Notes:\n${Array.isArray(memoObj.criticalNotes) ? memoObj.criticalNotes.map(n => '• ' + n).join('\n') : ''}\n\nRecommended Action:\n${memoObj.recommendedAction || '—'}`
      : String(memoText || '');
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy);
    say('Dossier copied to clipboard');
  };

  return (
    <div className="ai-copilot-card" style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
      <div className="ai-copilot-h" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#059669' }}>
            <Icon name="file" style={{ width: 12, height: 12 }} />
            Handover Memory
          </span>
          <b style={{ fontSize: 13 }}>Sales Handover Memory</b>
        </div>
        <button className="linkbtn" type="button">{open ? 'Hide' : (memo ? 'View Dossier' : 'Generate Brief')}</button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Staff on leave or reassigning lead? Synthesizes visits, quotes, objections, and promises into an actionable briefing dossier:
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <select className="select" style={{ minWidth: 160 }} value={targetAgent} onChange={e => setTargetAgent(e.target.value)} aria-label="Incoming Agent">
              <option value="">Select Incoming Agent</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn sun" disabled={busy} onClick={generate}>
              {busy ? 'Synthesizing…' : memo ? 'Regenerate Brief' : 'Generate Handover Memo'}
            </button>
          </div>

          {memo && (
            <div className="ai-script-box" style={{ background: 'var(--panel-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <b style={{ color: '#059669', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" style={{ width: 14, height: 14 }} />
                  EXECUTIVE CLIENT HANDOVER DOSSIER
                </b>
                <button className="btn sm ghost" onClick={copyMemo}>
                  <Icon name="copy" />Copy Dossier
                </button>
              </div>

              {memoObj ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div>
                    <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>Summary:</span>
                    <p style={{ margin: '2px 0 0', lineHeight: 1.5 }}>{memoObj.summary}</p>
                  </div>
                  {memoObj.keyInterest && (
                    <div style={{ background: 'var(--panel)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <b>Key Interest:</b> {memoObj.keyInterest}
                    </div>
                  )}
                  {memoObj.offeredPrice && (
                    <div style={{ background: 'var(--panel)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <b>Quoted Commercials:</b> {memoObj.offeredPrice}
                    </div>
                  )}
                  {Array.isArray(memoObj.criticalNotes) && memoObj.criticalNotes.length > 0 && (
                    <div>
                      <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>Critical Notes:</span>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {memoObj.criticalNotes.map((n, i) => (
                          <li key={i}>{typeof n === 'string' ? n : JSON.stringify(n)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {memoObj.recommendedAction && (
                    <div className="note" style={{ margin: '4px 0 0' }}>
                      <b>Recommended Next Step:</b> {memoObj.recommendedAction}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-line', fontSize: 12.5, lineHeight: 1.5 }}>{memoText}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
