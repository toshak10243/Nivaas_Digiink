import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Avatar, Pill, useLoad, Loading, Empty, copyText } from '../components/ui.jsx';
import { money, inr, dateTime, STAGES, ago, phone } from '../lib/format.js';

const INV = [
  ['available', 'Available', 'var(--ok, #15803d)'],
  ['hold', 'On hold', 'var(--warm, #f59e0b)'],
  ['booked', 'Booked', 'var(--new, #3b82f6)'],
  ['sold', 'Sold', 'var(--ink, #0f172a)'],
  ['blocked', 'Blocked', 'var(--cold, #94a3b8)']
];

export default function Dashboard({ me, go, say }) {
  const [d, reload] = useLoad(() => api.get('/api/dashboard'), []);
  if (!d) return <div className="page"><Loading /></div>;
  if (d.role === 'admin') return <Admin d={d} me={me} go={go} say={say} />;
  if (d.role === 'maintenance') return <Maint d={d} go={go} me={me} />;
  if (d.role === 'broker') return <Broker d={d} me={me} go={go} say={say} reload={reload} />;
  return <Sales d={d} me={me} go={go} say={say} reload={reload} />;
}

/* ==========================================================================
   1. BUILDER ADMIN DASHBOARD
   ========================================================================== */
function Admin({ d, me, go, say }) {
  const inv = Object.fromEntries(d.inventory.map(x => [x.status, x.n]));
  const total = Object.values(inv).reduce((a, b) => a + b, 0);
  const pipe = Object.fromEntries(d.pipeline.map(x => [x.stage, x.n]));
  const maxTrend = Math.max(1, ...d.trend.map(t => t.value));
  const openLeads = Object.entries(pipe).filter(([k]) => !['booked', 'lost'].includes(k)).reduce((a, [, n]) => a + n, 0);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="page">
      {/* Executive Hero Banner */}
      <section className="dash-hero">
        <div className="dash-hero-top">
          <span className="dash-hero-tag">
            <Icon name="building" style={{ width: 14, height: 14 }} />
            {me?.org?.name || 'Real Estate Enterprise'} · {monthName}
          </span>
          <span className="dash-hero-stat-pill">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Live Real Estate Operations
          </span>
        </div>

        <div className="dash-hero-main">
          <h2 className="dash-hero-title">
            {money(d.sales.value)} Booked, <em>{d.sales.units} Homes</em> Sold This Month
          </h2>
          <div className="dash-hero-sub">
            <span className="dash-hero-stat-pill">
              Collections: <b>{money(d.collected)}</b>
            </span>
            <span className="dash-hero-stat-pill">
              Available Units: <b>{inv.available || 0} / {total}</b>
            </span>
            <span className="dash-hero-stat-pill">
              Site Visits Scheduled: <b>{d.visits.length}</b>
            </span>
          </div>
        </div>

        <div className="dash-hero-actions">
          <button className="btn sun" onClick={() => go('inventory')}>
            <Icon name="grid" />Live Inventory &amp; Cost Sheets
          </button>
          <button className="btn" onClick={() => go('leads')}>
            <Icon name="funnel" />Lead Pipeline &amp; Copilot
          </button>
          <button className="btn" onClick={() => go('portal')}>
            <Icon name="shield" />Buyer Handover &amp; Progress
          </button>
          <button className="btn" onClick={() => go('bookings')}>
            <Icon name="receipt" />Registry Day Manager
          </button>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="dash-kpis-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Gross Sales Booked</span>
            <div className="dash-kpi-icon emerald"><Icon name="rupee" /></div>
          </div>
          <div className="dash-kpi-val">{money(d.sales.value)}</div>
          <div className="dash-kpi-sub">
            <span className="dash-kpi-tag ok">{d.sales.units} units</span> this calendar month
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Collections Deposited</span>
            <div className="dash-kpi-icon blue"><Icon name="checkCircle" /></div>
          </div>
          <div className="dash-kpi-val">{money(d.collected)}</div>
          <div className="dash-kpi-sub">
            Milestone payments received in escrow
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Available Inventory</span>
            <div className="dash-kpi-icon amber"><Icon name="grid" /></div>
          </div>
          <div className="dash-kpi-val">{inv.available || 0} <small style={{ fontSize: 16, color: 'var(--ink-3)' }}>/ {total}</small></div>
          <div className="dash-kpi-sub">
            <b>{inv.hold || 0}</b> on hold · <b>{inv.booked || 0}</b> booked
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Open Complaints</span>
            <div className="dash-kpi-icon rose"><Icon name="wrench" /></div>
          </div>
          <div className="dash-kpi-val">{d.tickets.open}</div>
          <div className="dash-kpi-sub">
            {d.tickets.late > 0 ? (
              <span className="dash-kpi-tag warn">{d.tickets.late} past 24h SLA</span>
            ) : (
              <span className="dash-kpi-tag ok">All within 24h SLA</span>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Inventory Status & Pipeline Matrix */}
      <section className="grid2">
        <div className="card">
          <div className="card-h">
            <h3>Inventory Absorption &amp; 6-Month Trend</h3>
            <span className="muted">{total} units across all projects</span>
          </div>
          <div className="card-b">
            <div className="stackbar" role="img" aria-label="Inventory by status">
              {INV.map(([k, , c]) => inv[k] ? <i key={k} style={{ flex: inv[k], background: c }} title={`${k}: ${inv[k]}`} /> : null)}
            </div>
            <div className="legend" style={{ marginTop: 14 }}>
              {INV.map(([k, l, c]) => (
                <span key={k} className="chip">
                  <i style={{ background: c }} />{l} · <b className="num">{inv[k] || 0}</b>
                </span>
              ))}
            </div>
            <div className="eyebrow" style={{ margin: '22px 0 10px' }}>Gross Sales Value, Last 6 Months</div>
            <div className="trend">
              {d.trend.map(t => (
                <div key={t.month} className="tcol">
                  <span className="tval num">{t.value ? money(t.value) : '₹0'}</span>
                  <i style={{ height: `${Math.max(4, (t.value / maxTrend) * 100)}%` }} />
                  <span className="tlab">{new Date(t.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}</span>
                  <span className="tunits">{t.units} units</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Lead Pipeline &amp; Conversion</h3>
            <span className="muted">{openLeads} active prospective buyers</span>
          </div>
          <div className="card-b funnel">
            {STAGES.filter(([k]) => k !== 'lost').map(([k, l]) => {
              const max = Math.max(1, ...Object.values(pipe));
              const count = pipe[k] || 0;
              return (
                <button key={k} className="fstep fbtn" onClick={() => go('leads')}>
                  <span>{l}</span>
                  <b className="num">{count}</b>
                  <div className="fbar">
                    <i style={{ width: `${Math.max(3, (count / max) * 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 3: Operations & Team Grid */}
      <section className="grid2">
        <div className="card">
          <div className="card-h">
            <h3>Top Producers This Month</h3>
            <span className="muted">Sales team &amp; Channel partners</span>
          </div>
          <div className="list">
            {d.leaderboard.length === 0 ? (
              <Empty icon="users" title="No bookings recorded yet this month" />
            ) : (
              d.leaderboard.map((p, i) => (
                <div key={p.id} className="lrow" style={{ alignItems: 'center' }}>
                  <span className="rank">{i + 1}</span>
                  <Avatar name={p.name} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.name}</b>
                    <span className="muted"> · {p.role === 'broker' ? 'Channel Partner' : 'Sales Executive'}</span>
                  </div>
                  <span className="pill" style={{ marginRight: 8 }}>{p.units} {p.units === 1 ? 'unit' : 'units'}</span>
                  <b className="num" style={{ minWidth: 80, textAlign: 'right' }}>{money(p.value)}</b>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Upcoming Site Visits</h3>
            <span className="muted">{d.visits.length} scheduled</span>
          </div>
          <div className="list">
            {d.visits.length === 0 ? (
              <Empty icon="calendar" title="No visits booked in next 7 days" />
            ) : (
              d.visits.map(v => (
                <button key={v.id} className="lrow btnrow" onClick={() => go('leads/' + v.lead_id)}>
                  <span className="when">{dateTime(v.scheduled_at)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{v.name}</b>
                    <span className="muted"> · Advisor: {v.agent || 'Unassigned'}</span>
                    {v.transport === 'cab' && (
                      <span className="visit-badge" style={{ marginLeft: 6, color: '#b45309', background: '#fef3c7' }}>
                        Cab Booked
                      </span>
                    )}
                  </div>
                  <Icon name="arrow" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Section 4: Today's Team Follow-up Agenda */}
      {d.followups && d.followups.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-h">
            <h3>Pending &amp; Today's Follow-up Agenda</h3>
            <span className="muted">{d.followups.length} scheduled client touches</span>
          </div>
          <div className="list">
            {d.followups.map(f => (
              <div key={f.id} className="lrow" style={{ alignItems: 'center' }}>
                <span className="when">{dateTime(f.followup_at)}</span>
                <button className="linkbtn" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => go('leads/' + f.id)}>
                  <b>{f.name}</b>
                  <span className="muted"> · {phone(f.phone)} · Advisor: <b>{f.agent || 'Unassigned'}</b></span>
                  {f.followup_note && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>“{f.followup_note}”</div>}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pill warm" style={{ textTransform: 'capitalize' }}>{f.followup_type || 'Call'}</span>
                  <a className="btn sm sun" href={`tel:+${String(f.phone).replace(/\D/g, '')}`} title="Call"><Icon name="phone" />Call</a>
                  <a className="btn sm wa-btn" href={`https://wa.me/${String(f.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${f.name?.split(' ')[0] || ''}! Following up as discussed regarding our property.`)}`} target="_blank" rel="noreferrer"><Icon name="wa" />WhatsApp</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   2. SALES AGENT DASHBOARD
   ========================================================================== */
function Sales({ d, me, go, say, reload }) {
  const pipe = Object.fromEntries(d.pipeline.map(x => [x.stage, x.n]));
  const open = Object.entries(pipe).filter(([k]) => !['booked', 'lost'].includes(k)).reduce((a, [, n]) => a + n, 0);
  const twin = me.user.profile?.ai_twin?.mode || 'away';

  return (
    <div className="page">
      {/* Sales Hero Banner */}
      <section className="dash-hero">
        <div className="dash-hero-top">
          <span className="dash-hero-tag">
            <Icon name="funnel" style={{ width: 14, height: 14 }} />
            Sales Performance · {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <span className="dash-hero-stat-pill">
            AI WhatsApp Twin: <b>{twin === 'always' ? 'Always Active' : twin === 'off' ? 'Off' : 'Active When Away'}</b>
          </span>
        </div>

        <div className="dash-hero-main">
          <h2 className="dash-hero-title">
            Hi {me.user.name.split(' ')[0]}! {d.sold.units} of {d.target || 3} Homes Closed, <em>{money(d.earnings.month)}</em> Incentive Earned
          </h2>
          <div className="dash-hero-sub">
            <span className="dash-hero-stat-pill">Active Leads: <b>{open}</b></span>
            <span className="dash-hero-stat-pill">Visits Booked: <b>{d.visits.length}</b></span>
            <span className="dash-hero-stat-pill">Pending Incentive: <b>{money(d.earnings.pending)}</b></span>
          </div>
        </div>

        <div className="dash-hero-actions">
          <button className="btn sun" onClick={() => go('inventory')}>
            <Icon name="share" />Share Flat &amp; Sales Kit
          </button>
          <button className="btn" onClick={() => go('leads')}>
            <Icon name="spark" />Objection Copilot &amp; Leads
          </button>
          <button className="btn" onClick={() => go('visits')}>
            <Icon name="calendar" />Site Visits &amp; Passports
          </button>
          {api.mode === 'demo' && (
            <button className="btn" onClick={async () => { const r = await api.post('/demo/leadsathi'); say(`LeadSathi sent a hot lead → assigned to ${r.assigned}`); reload(); }}>
              <Icon name="spark" />Simulate LeadSathi Lead
            </button>
          )}
        </div>
      </section>

      {/* Monthly Target Progress */}
      {d.target > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-b" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div>
                <b style={{ fontSize: 15 }}>Monthly Closing Target</b>
                <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>
                  {Math.round((d.sold.units / d.target) * 100)}% Achieved
                </span>
              </div>
              <span className="num" style={{ fontWeight: 700, fontSize: 15 }}>
                {d.sold.units} / {d.target} Homes Booked · {money(d.sold.value)}
              </span>
            </div>
            <div className="fbar" style={{ height: 10 }}>
              <i style={{ width: `${Math.min(100, (d.sold.units / d.target) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <section className="dash-kpis-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Units Closed</span>
            <div className="dash-kpi-icon emerald"><Icon name="building" /></div>
          </div>
          <div className="dash-kpi-val">{d.sold.units}</div>
          <div className="dash-kpi-sub">
            Target: {d.target || 3} units this month
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Incentive Earned</span>
            <div className="dash-kpi-icon amber"><Icon name="rupee" /></div>
          </div>
          <div className="dash-kpi-val">{money(d.earnings.month)}</div>
          <div className="dash-kpi-sub">
            <b>{money(d.earnings.pending)}</b> pending payout
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Active Prospects</span>
            <div className="dash-kpi-icon blue"><Icon name="funnel" /></div>
          </div>
          <div className="dash-kpi-val">{open}</div>
          <div className="dash-kpi-sub">
            In negotiation &amp; visit pipeline
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Site Visits Scheduled</span>
            <div className="dash-kpi-icon purple"><Icon name="calendar" /></div>
          </div>
          <div className="dash-kpi-val">{d.visits.length}</div>
          <div className="dash-kpi-sub">
            With digital evidence passport
          </div>
        </div>
      </section>

      {/* Section 2: Visits & WhatsApp Grid */}
      <section className="grid2">
        <div className="card">
          <div className="card-h">
            <h3>My Scheduled Site Visits</h3>
            <span className="muted">{d.visits.length} booked</span>
          </div>
          <div className="list">
            {d.visits.length === 0 ? (
              <Empty icon="calendar" title="No visits scheduled yet">Share a project flat link with your prospects to book a visit.</Empty>
            ) : (
              d.visits.map(v => (
                <button key={v.id} className="lrow btnrow" onClick={() => go('leads/' + v.lead_id)}>
                  <span className="when">{dateTime(v.scheduled_at)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{v.name}</b>
                    <span className="muted"> · {phone(v.phone)}</span>
                  </div>
                  <Icon name="arrow" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>WhatsApp Inquiries Waiting</h3>
            <span className="muted">LeadSathi &amp; Direct</span>
          </div>
          <div className="list">
            {d.waiting.length === 0 ? (
              <Empty icon="chat" title="All caught up!">No pending unreplied messages from buyers.</Empty>
            ) : (
              d.waiting.map(c => (
                <button key={c.id} className="lrow btnrow" onClick={() => go('chats/' + c.id)}>
                  <Avatar name={c.name} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{c.name}</b>
                    <span className="muted"> · {ago(c.last_customer_at)} ago</span>
                  </div>
                  <Icon name="chat" style={{ width: 16, height: 16, color: 'var(--sun)' }} />
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Today's Follow-up Agenda */}
      {d.followups && d.followups.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-h">
            <h3>My Follow-up Agenda Today</h3>
            <span className="muted">{d.followups.length} scheduled touches</span>
          </div>
          <div className="list">
            {d.followups.map(f => (
              <div key={f.id} className="lrow" style={{ alignItems: 'center' }}>
                <span className="when">{dateTime(f.followup_at)}</span>
                <button className="linkbtn" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => go('leads/' + f.id)}>
                  <b>{f.name}</b>
                  <span className="muted"> · {phone(f.phone)} · <span style={{ textTransform: 'capitalize' }}>{f.followup_type || 'Call'}</span></span>
                  {f.followup_note && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>“{f.followup_note}”</div>}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a className="btn sm sun" href={`tel:+${String(f.phone).replace(/\D/g, '')}`}><Icon name="phone" />Call</a>
                  <a className="btn sm wa-btn" href={`https://wa.me/${String(f.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${f.name?.split(' ')[0] || ''}! Following up as discussed regarding our property.`)}`} target="_blank" rel="noreferrer"><Icon name="wa" />WhatsApp</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: My Pipeline Stages */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-h">
          <h3>My Active Pipeline</h3>
          <span className="muted">Tap stage to inspect leads</span>
        </div>
        <div className="card-b stages">
          {STAGES.map(([k, l]) => (
            <button key={k} className="stagechip" onClick={() => go('leads')}>
              <b className="num">{pipe[k] || 0}</b>
              <span>{l}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. CHANNEL PARTNER / BROKER DASHBOARD
   ========================================================================== */
function Broker({ d, me, go, say, reload }) {
  const pipe = Object.fromEntries(d.pipeline.map(x => [x.stage, x.n]));
  const open = Object.entries(pipe).filter(([k]) => !['booked', 'lost'].includes(k)).reduce((a, [, n]) => a + n, 0);
  const kitUrl = `${window.location.origin}/#/inventory`;

  const copyKit = () => {
    copyText(kitUrl);
    say('Your Live Broker Sales Kit link copied!');
  };

  const shareKitWhatsApp = () => {
    const text = `Namaste! Explore our latest authorized inventory, live prices, and floor plans:\n${kitUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="page">
      {/* Broker Hero Banner */}
      <section className="dash-hero">
        <div className="dash-hero-top">
          <span className="dash-hero-tag">
            <Icon name="briefcase" style={{ width: 14, height: 14 }} />
            Authorized Channel Partner · {me.org.name}
          </span>
          <span className="dash-hero-stat-pill">
            RERA Agent ID: <b>{me.user.profile?.rera_agent_no || 'Registered Partner'}</b>
          </span>
        </div>

        <div className="dash-hero-main">
          <h2 className="dash-hero-title">
            Welcome, {me.user.name}! <em>{money(d.earnings.month || 0)}</em> Commission Generated This Month
          </h2>
          <div className="dash-hero-sub">
            <span className="dash-hero-stat-pill">Approved Payout: <b>{money(d.earnings.pending)}</b></span>
            <span className="dash-hero-stat-pill">Paid to Date: <b>{money(d.earnings.paid)}</b></span>
            <span className="dash-hero-stat-pill">Active Clients: <b>{open}</b></span>
          </div>
        </div>

        <div className="dash-hero-actions">
          <button className="btn sun" onClick={copyKit}>
            <Icon name="link" />Copy My Live Sales Kit
          </button>
          <button className="btn wa-btn" onClick={shareKitWhatsApp}>
            <Icon name="wa" />Broadcast Live Kit on WhatsApp
          </button>
          <button className="btn" onClick={() => go('leads')}>
            <Icon name="userPlus" />Register New Client
          </button>
        </div>
      </section>

      {/* Live Sales Kit Link Strip */}
      <div className="broker-share-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="dash-kpi-icon blue"><Icon name="grid" /></div>
          <div>
            <b style={{ fontSize: 14, display: 'block' }}>Your Live Broker Sales Kit Link</b>
            <span className="muted" style={{ fontSize: 12 }}>Contains live inventory, current pricing, and official brochures linked to your ID</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm ghost" onClick={copyKit}><Icon name="copy" />Copy Link</button>
          <button className="btn sm" onClick={() => go('inventory')}><Icon name="eye" />Open Live Kit</button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <section className="dash-kpis-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Total Commission Paid</span>
            <div className="dash-kpi-icon emerald"><Icon name="rupee" /></div>
          </div>
          <div className="dash-kpi-val">{money(d.earnings.paid)}</div>
          <div className="dash-kpi-sub">
            Directly credited to your account
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Pending Payout</span>
            <div className="dash-kpi-icon amber"><Icon name="clock" /></div>
          </div>
          <div className="dash-kpi-val">{money(d.earnings.pending)}</div>
          <div className="dash-kpi-sub">
            Under finance clearance
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Registered Clients</span>
            <div className="dash-kpi-icon blue"><Icon name="users" /></div>
          </div>
          <div className="dash-kpi-val">{open}</div>
          <div className="dash-kpi-sub">
            Protected under your channel partner ID
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Site Visits</span>
            <div className="dash-kpi-icon purple"><Icon name="calendar" /></div>
          </div>
          <div className="dash-kpi-val">{d.visits.length}</div>
          <div className="dash-kpi-sub">
            With digital attendance records
          </div>
        </div>
      </section>

      {/* Grid: Visits & Commission Details */}
      <section className="grid2">
        <div className="card">
          <div className="card-h">
            <h3>My Client Site Visits</h3>
            <span className="muted">{d.visits.length} booked</span>
          </div>
          <div className="list">
            {d.visits.length === 0 ? (
              <Empty icon="calendar" title="No visits booked yet">Register your client and schedule their site visit.</Empty>
            ) : (
              d.visits.map(v => (
                <button key={v.id} className="lrow btnrow" onClick={() => go('leads/' + v.lead_id)}>
                  <span className="when">{dateTime(v.scheduled_at)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{v.name}</b>
                    <span className="muted"> · {phone(v.phone)}</span>
                  </div>
                  <Icon name="arrow" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Commission Summary</h3>
            <span className="muted">Monthly breakdown</span>
          </div>
          <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <span className="eyebrow">Pending Clearance</span>
              <div className="big num">{money(d.earnings.pending)}</div>
            </div>
            <div>
              <span className="eyebrow">Total Disbursed</span>
              <div className="big num">{money(d.earnings.paid)}</div>
            </div>
            <button className="btn sun" style={{ gridColumn: '1/-1', marginTop: 8 }} onClick={() => go('earnings')}>
              <Icon name="rupee" />View Commission Invoices &amp; TDS
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   4. MAINTENANCE TEAM DASHBOARD
   ========================================================================== */
function Maint({ d, go, me }) {
  const t = d.tickets;

  return (
    <div className="page">
      {/* Maintenance Hero Banner */}
      <section className="dash-hero">
        <div className="dash-hero-top">
          <span className="dash-hero-tag">
            <Icon name="wrench" style={{ width: 14, height: 14 }} />
            Facility &amp; Maintenance Operations
          </span>
          <span className="dash-hero-stat-pill">
            Standard SLA: <b>24 Hours</b>
          </span>
        </div>

        <div className="dash-hero-main">
          <h2 className="dash-hero-title">
            {t.open} Open Complaints, <em>{t.late > 0 ? `${t.late} Require Urgent Attention` : 'All Within 24-Hour SLA'}</em>
          </h2>
          <div className="dash-hero-sub">
            <span className="dash-hero-stat-pill">Assigned to Me: <b>{t.mine}</b></span>
            <span className="dash-hero-stat-pill">Resolved This Week: <b>{t.resolved_week}</b></span>
          </div>
        </div>

        <div className="dash-hero-actions">
          <button className="btn sun" onClick={() => go('tickets')}>
            <Icon name="wrench" />Open Complaint Queue
          </button>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="dash-kpis-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Total Open Complaints</span>
            <div className="dash-kpi-icon blue"><Icon name="wrench" /></div>
          </div>
          <div className="dash-kpi-val">{t.open}</div>
          <div className="dash-kpi-sub">
            From verified flat owners
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Assigned to Me</span>
            <div className="dash-kpi-icon amber"><Icon name="user" /></div>
          </div>
          <div className="dash-kpi-val">{t.mine}</div>
          <div className="dash-kpi-sub">
            Your active service queue
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Past 24h SLA</span>
            <div className="dash-kpi-icon rose"><Icon name="clock" /></div>
          </div>
          <div className="dash-kpi-val">{t.late}</div>
          <div className="dash-kpi-sub">
            {t.late > 0 ? (
              <span className="dash-kpi-tag warn">Escalation Alert</span>
            ) : (
              <span className="dash-kpi-tag ok">100% SLA Maintained</span>
            )}
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-card-h">
            <span className="dash-kpi-label">Resolved This Week</span>
            <div className="dash-kpi-icon emerald"><Icon name="checkCircle" /></div>
          </div>
          <div className="dash-kpi-val">{t.resolved_week}</div>
          <div className="dash-kpi-sub">
            Successfully closed tickets
          </div>
        </div>
      </section>

      <div className="card">
        <div className="card-h">
          <h3>After-Sales Maintenance Priority Matrix</h3>
          <span className="muted">Standard guidelines</span>
        </div>
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div style={{ background: 'var(--panel-2)', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
            <b style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
              <Icon name="alert" style={{ width: 14, height: 14 }} />Critical (4h SLA)
            </b>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)' }}>Main water seepage, major electrical blackout, elevator malfunction.</p>
          </div>
          <div style={{ background: 'var(--panel-2)', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
            <b style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
              <Icon name="clock" style={{ width: 14, height: 14 }} />Standard (24h SLA)
            </b>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)' }}>Plumbing leakage, fixture repair, carpentry fitting, tile alignment.</p>
          </div>
          <div style={{ background: 'var(--panel-2)', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
            <b style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
              <Icon name="checkCircle" style={{ width: 14, height: 14 }} />Touch-up (48h SLA)
            </b>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)' }}>Minor paint touch-ups, aesthetic adjustments, accessory installation.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

