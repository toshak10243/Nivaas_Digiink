import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Logo, Avatar, copyText } from '../../components/ui.jsx';
import logoImg from '../../assets/logo.png';
import { money } from '../../lib/format.js';
import './superadmin-glass.css';

const SA_TOKEN_KEY = 'nivaas_superadmin_token';

const saApi = {
  getToken: () => localStorage.getItem(SA_TOKEN_KEY),
  setToken: (t) => localStorage.setItem(SA_TOKEN_KEY, t),
  logout: () => localStorage.removeItem(SA_TOKEN_KEY),
  isLoggedIn: () => Boolean(localStorage.getItem(SA_TOKEN_KEY)),

  async request(path, opts = {}) {
    const token = this.getToken();
    const headers = {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && !path.includes('/login')) {
        this.logout();
        window.location.reload();
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  },

  login: (email, password) => saApi.request('/api/superadmin/login', { method: 'POST', body: { email, password } }),
  getMetrics: () => saApi.request('/api/superadmin/metrics'),
  getTenants: () => saApi.request('/api/superadmin/tenants'),
  createTenant: (body) => saApi.request('/api/superadmin/tenants', { method: 'POST', body }),
  updateTenant: (id, body) => saApi.request(`/api/superadmin/tenants/${id}`, { method: 'PATCH', body }),
  getPayments: (status) => saApi.request(`/api/superadmin/payments${status ? `?status=${status}` : ''}`),
  approvePayment: (id) => saApi.request(`/api/superadmin/payments/${id}/approve`, { method: 'POST' }),
  rejectPayment: (id, notes) => saApi.request(`/api/superadmin/payments/${id}/reject`, { method: 'POST', body: { notes } }),
};

export default function SuperAdminPortal() {
  const [authed, setAuthed] = useState(saApi.isLoggedIn());
  const [tab, setTab] = useState('tenants'); // 'tenants' | 'payments' | 'health'
  const [metrics, setMetrics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inspectScreenshot, setInspectScreenshot] = useState(null);

  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  const loadData = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const [m, t, p] = await Promise.all([
        saApi.getMetrics(),
        saApi.getTenants(),
        saApi.getPayments(),
      ]);
      setMetrics(m);
      setTenants(t.tenants || []);
      setPayments(p.payments || []);
    } catch (err) {
      say(err.message || 'Failed to sync control plane');
    } finally {
      setLoading(false);
    }
  }, [authed, say]);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  if (!authed) {
    return <SuperAdminLogin onLogin={() => { setAuthed(true); say('Welcome Super Administrator'); }} />;
  }

  const pendingPayments = payments.filter(p => p.status === 'pending');

  const filteredTenants = tenants.filter(t => {
    const q = (search || '').toLowerCase().trim();
    const matchesSearch = !q || (
      (t.name || '').toLowerCase().includes(q) ||
      (t.slug || '').toLowerCase().includes(q) ||
      (t.admin_email || '').toLowerCase().includes(q) ||
      (t.db_name || '').toLowerCase().includes(q)
    );

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return t.subscription_status === 'active';
    if (statusFilter === 'trial') return t.subscription_status === 'trial';
    if (statusFilter === 'expired') {
      const isExp = Date.now() > new Date(t.subscription_ends_at || t.trial_ends_at).getTime();
      return isExp || t.subscription_status === 'expired';
    }
    return true;
  });

  return (
    <div className="sa-glass-canvas">
      {/* Ambient Aurora Glow Blobs */}
      <div className="sa-blob sa-blob-1" />
      <div className="sa-blob sa-blob-2" />
      <div className="sa-blob sa-blob-3" />

      {/* Floating Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(238, 100, 24, 0.5)', color: '#fff',
          padding: '12px 22px', borderRadius: 14, boxShadow: '0 12px 35px rgba(0,0,0,0.5)',
          fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ color: 'var(--sun)' }}>⚡</span>
          <span>{toast}</span>
        </div>
      )}

      <div className="shell" style={{ height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {/* Left Rail: Translucent Frosted Glass Rail */}
        <aside className="rail sa-glass-rail">
          <div className="brand" style={{ paddingBottom: 22, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Logo size={36} />
            <div>
              <b style={{ color: '#fff' }}>Nivaas</b>
              <small style={{ color: 'var(--sun-2)', fontWeight: 800, letterSpacing: '0.08em', textShadow: '0 0 10px rgba(255,174,31,0.4)' }}>
                CONTROL PLANE
              </small>
            </div>
          </div>

          <div className="navlist" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="navbtn"
              aria-current={tab === 'tenants' ? 'page' : undefined}
              onClick={() => setTab('tenants')}
              style={{
                borderRadius: 12,
                background: tab === 'tenants' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                backdropFilter: tab === 'tenants' ? 'blur(10px)' : 'none',
                border: tab === 'tenants' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
              }}
            >
              <Icon name="building" />
              <span>Tenants Fleet</span>
              <span className="count" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                {tenants.length}
              </span>
            </button>

            <button
              className="navbtn"
              aria-current={tab === 'payments' ? 'page' : undefined}
              onClick={() => setTab('payments')}
              style={{
                borderRadius: 12,
                background: tab === 'payments' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                backdropFilter: tab === 'payments' ? 'blur(10px)' : 'none',
                border: tab === 'payments' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
              }}
            >
              <Icon name="rupee" />
              <span>Payment Proofs</span>
              {pendingPayments.length > 0 && (
                <span className="count" style={{ background: 'var(--sun)', boxShadow: '0 0 12px var(--sun)' }}>
                  {pendingPayments.length}
                </span>
              )}
            </button>

            <button
              className="navbtn"
              aria-current={tab === 'health' ? 'page' : undefined}
              onClick={() => setTab('health')}
              style={{
                borderRadius: 12,
                background: tab === 'health' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                backdropFilter: tab === 'health' ? 'blur(10px)' : 'none',
                border: tab === 'health' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
              }}
            >
              <Icon name="shield" />
              <span>Node &amp; DB Fleet</span>
            </button>
          </div>

          {/* Quick Launch Action in Sidebar */}
          <div style={{ marginTop: 24, padding: '0 4px' }}>
            <button
              className="sa-glass-btn sa-glass-btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', borderRadius: 12 }}
              onClick={() => setShowCreateModal(true)}
            >
              <Icon name="plus" />
              <span>+ New Tenant</span>
            </button>
          </div>

          {/* Rail Footer User Chip */}
          <div className="railfoot">
            <div className="bizchip sa-glass-panel" style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="av" style={{ background: 'linear-gradient(135deg, var(--sun-2), var(--sun))', color: '#fff', fontWeight: 800, border: '1px solid rgba(255,255,255,0.3)' }}>
                SA
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>Super Admin</b>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  admin@nivaas.space
                </span>
              </div>
            </div>

            <button
              className="btn ghost"
              style={{ color: '#94a3b8', width: '100%', justifyContent: 'flex-start', padding: '8px 12px', borderRadius: 10 }}
              onClick={() => { saApi.logout(); setAuthed(false); }}
            >
              <Icon name="logout" />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        {/* Main Work Area */}
        <div className="work" style={{ background: 'transparent' }}>
          {/* Glass Topbar */}
          <header className="topbar sa-glass-topbar">
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
                <span>Multi-Tenant Fleet Control Plane</span>
                <span className="sa-glass-pill sa-glass-pill-ok" style={{ fontSize: 10 }}>
                  ● 200.234.46.234 Node Online
                </span>
              </h1>
              <div className="sub" style={{ color: '#94a3b8' }}>Dynamic Database-per-Tenant Infrastructure (*.nivaas.space)</div>
            </div>

            <div className="spacer" />

            <button
              className="sa-glass-btn"
              onClick={loadData}
              disabled={loading}
            >
              <Icon name="spark" />
              <span>{loading ? 'Syncing...' : 'Sync Fleet'}</span>
            </button>

            <button
              className="sa-glass-btn sa-glass-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Icon name="plus" />
              <span>Provision Tenant</span>
            </button>
          </header>

          {/* Page Content */}
          <div className="content">
            <div className="page" style={{ maxWidth: 1340 }}>
              {/* Glass Hero Banner */}
              <section className="sa-glass-hero">
                <div className="dash-hero-top" style={{ marginBottom: 12 }}>
                  <span className="sa-glass-pill" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}>
                    <Icon name="shield" style={{ width: 14, height: 14 }} />
                    Nivaas Master Plane &middot; PostgreSQL 16
                  </span>
                  <span className="live-status" style={{ color: '#34d399' }}>
                    <i style={{ background: '#34d399', boxShadow: '0 0 10px #34d399' }} />
                    All DB Clusters Operational
                  </span>
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 14px 0', letterSpacing: '-0.02em' }}>
                  {tenants.length} Dedicated Client Databases, <em style={{ color: 'var(--sun-2)', fontStyle: 'normal' }}>{metrics?.tenants?.active_tenants || 0} Active</em> Subscriptions
                </h2>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14, color: '#94a3b8' }}>
                  <span>
                    Verified Collections: <b style={{ color: '#34d399' }}>{money(metrics?.totalRevenue || 0)}</b>
                  </span>
                  <span>
                    7-Day Free Trials: <b style={{ color: '#fff' }}>{metrics?.tenants?.trial_tenants || 0}</b>
                  </span>
                  <span>
                    Pending Verifications: <b style={{ color: pendingPayments.length > 0 ? 'var(--sun)' : '#fff' }}>{pendingPayments.length}</b>
                  </span>
                </div>
              </section>

              {/* 4 Frosted Glass KPI Cards */}
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div className="sa-kpi-card" style={{ '--kpi-accent': '#38bdf8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Total Registered</span>
                    <span style={{ color: '#38bdf8' }}><Icon name="building" /></span>
                  </div>
                  <strong style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{tenants.length}</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Independent physical databases</div>
                </div>

                <div className="sa-kpi-card" style={{ '--kpi-accent': '#10b981' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Active Subscriptions</span>
                    <span style={{ color: '#10b981' }}><Icon name="checkCircle" /></span>
                  </div>
                  <strong style={{ fontSize: 32, fontWeight: 900, color: '#34d399' }}>{metrics?.tenants?.active_tenants || 0}</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Paying enterprise builders</div>
                </div>

                <div className="sa-kpi-card" style={{ '--kpi-accent': 'var(--sun)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Free Trial Accounts</span>
                    <span style={{ color: 'var(--sun)' }}><Icon name="clock" /></span>
                  </div>
                  <strong style={{ fontSize: 32, fontWeight: 900, color: 'var(--sun-2)' }}>{metrics?.tenants?.trial_tenants || 0}</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Active 7-day trials</div>
                </div>

                <div className="sa-kpi-card" style={{ '--kpi-accent': pendingPayments.length > 0 ? '#ef4444' : '#64748b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Payment Proofs</span>
                    <span style={{ color: pendingPayments.length > 0 ? '#ef4444' : '#64748b' }}><Icon name="receipt" /></span>
                  </div>
                  <strong style={{ fontSize: 32, fontWeight: 900, color: pendingPayments.length > 0 ? '#f87171' : '#fff' }}>
                    {pendingPayments.length}
                  </strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {pendingPayments.length > 0 ? 'Requires your approval' : 'All proofs verified'}
                  </div>
                </div>
              </section>

              {/* TAB 1: TENANTS FLEET TABLE */}
              {tab === 'tenants' && (
                <section className="sa-glass-card" style={{ overflow: 'hidden' }}>
                  <div style={{
                    padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
                  }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, color: '#fff', fontWeight: 800 }}>Tenants &amp; Isolated Databases</h3>
                      <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                        Physical database plane per tenant. Automatic connection pooling via AsyncLocalStorage.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Status Filter Chips */}
                      <div className="sa-glass-panel" style={{ padding: 4, display: 'flex', gap: 4 }}>
                        {['all', 'active', 'trial', 'expired'].map((st) => (
                          <button
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            style={{
                              border: 0,
                              background: statusFilter === st ? 'rgba(255,255,255,0.18)' : 'transparent',
                              color: statusFilter === st ? '#fff' : '#94a3b8',
                              fontWeight: statusFilter === st ? 700 : 500,
                              padding: '6px 14px',
                              borderRadius: 8,
                              fontSize: 12,
                              textTransform: 'capitalize',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {st}
                          </button>
                        ))}
                      </div>

                      {/* Search Box */}
                      <div style={{ position: 'relative', width: 260 }}>
                        <input
                          type="text"
                          placeholder="Search tenant, slug, email..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="sa-glass-input"
                          style={{ width: '100%', paddingLeft: 34 }}
                        />
                        <span style={{ position: 'absolute', left: 12, top: 12, color: '#64748b' }}>
                          <Icon name="search" style={{ width: 14, height: 14 }} />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="tablewrap" style={{ overflowX: 'auto' }}>
                    <table className="sa-glass-table">
                      <thead>
                        <tr>
                          <th>Company &amp; Subdomain</th>
                          <th>Physical Database</th>
                          <th>Admin Contact</th>
                          <th>Plan</th>
                          <th>Expiry &amp; Countdown</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenants.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                              No tenant databases found matching your query.
                            </td>
                          </tr>
                        ) : (
                          filteredTenants.map((t) => {
                            const expiryDate = new Date(t.subscription_ends_at || t.trial_ends_at);
                            const isExpired = Date.now() > expiryDate.getTime();
                            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                            return (
                              <tr key={t.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: 10,
                                      background: 'linear-gradient(135deg, rgba(238,100,24,0.3), rgba(255,174,31,0.3))',
                                      border: '1px solid rgba(238,100,24,0.4)',
                                      color: '#ffedd5', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13
                                    }}>
                                      {t.name ? t.name.slice(0, 2).toUpperCase() : 'CO'}
                                    </div>
                                    <div>
                                      <b style={{ color: '#fff', fontSize: 14 }}>{t.name}</b>
                                      <a
                                        href={`https://${t.slug}.nivaas.space`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          color: 'var(--sun-2)', fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600, marginTop: 2
                                        }}
                                      >
                                        <span>{t.slug}.nivaas.space</span>
                                        <Icon name="link" style={{ width: 11, height: 11 }} />
                                      </a>
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  <span
                                    className="mono"
                                    onClick={() => copyText(t.db_name, say, 'Database name')}
                                    title="Click to copy DB name"
                                    style={{
                                      background: 'rgba(255,255,255,0.06)',
                                      border: '1px solid rgba(255,255,255,0.12)',
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      color: '#38bdf8',
                                      cursor: 'pointer',
                                      display: 'inline-block'
                                    }}
                                  >
                                    {t.db_name}
                                  </span>
                                </td>

                                <td>
                                  <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{t.admin_name || 'Admin'}</div>
                                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.admin_email}</div>
                                  {t.phone && <div style={{ fontSize: 11, color: '#64748b' }}>{t.phone}</div>}
                                </td>

                                <td>
                                  <span style={{
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    border: '1px solid rgba(99, 102, 241, 0.35)',
                                    color: '#a5b4fc',
                                    padding: '3px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    {t.plan_type || 'trial'}
                                  </span>
                                </td>

                                <td>
                                  <div style={{ fontWeight: 700, color: isExpired ? '#f87171' : '#34d399' }}>
                                    {isExpired ? 'Expired' : `${daysLeft} days remaining`}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>
                                    {expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                </td>

                                <td>
                                  <span className={`sa-glass-pill ${isExpired ? 'sa-glass-pill-danger' : t.subscription_status === 'suspended' ? 'sa-glass-pill-warn' : 'sa-glass-pill-ok'}`}>
                                    {isExpired ? 'EXPIRED' : (t.subscription_status || 'ACTIVE')}
                                  </span>
                                </td>

                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button
                                      className="sa-glass-btn"
                                      style={{ padding: '5px 10px', fontSize: 11 }}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await saApi.updateTenant(t.id, { extendDays: 30 });
                                          say(`Extended ${t.name} by 30 days!`);
                                          loadData();
                                        } catch (err) {
                                          say(err.message);
                                        }
                                      }}
                                      title="Extend subscription by 30 days"
                                    >
                                      +30 Days
                                    </button>

                                    <button
                                      className="sa-glass-btn"
                                      style={{
                                        padding: '5px 10px', fontSize: 11,
                                        color: t.subscription_status === 'suspended' ? '#34d399' : '#f87171',
                                        borderColor: t.subscription_status === 'suspended' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'
                                      }}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const nextStatus = t.subscription_status === 'suspended' ? 'active' : 'suspended';
                                        try {
                                          await saApi.updateTenant(t.id, { status: nextStatus });
                                          say(`Tenant ${t.name} set to ${nextStatus}`);
                                          loadData();
                                        } catch (err) {
                                          say(err.message);
                                        }
                                      }}
                                    >
                                      {t.subscription_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                                    </button>

                                    <a
                                      href={`https://${t.slug}.nivaas.space`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="sa-glass-btn"
                                      style={{ padding: '5px 8px' }}
                                      title="Open tenant workspace"
                                    >
                                      <Icon name="link" style={{ width: 12, height: 12 }} />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* TAB 2: PAYMENT VERIFICATIONS */}
              {tab === 'payments' && (
                <section>
                  {payments.length === 0 ? (
                    <div className="sa-glass-card" style={{ padding: 60, textAlign: 'center' }}>
                      <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
                      <h3 style={{ fontSize: 18, color: '#fff' }}>No Payment Submissions Yet</h3>
                      <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 440, margin: '8px auto 0' }}>
                        When clients transfer via UPI QR or Bank NEFT and upload slips, they will appear here for 1-click verification.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
                      {payments.map((p) => {
                        const isPending = p.status === 'pending';
                        const isApproved = p.status === 'approved';

                        return (
                          <div
                            key={p.id}
                            className="sa-glass-card"
                            style={{
                              padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
                              borderColor: isPending ? 'rgba(238,100,24,0.5)' : 'rgba(255,255,255,0.12)',
                              boxShadow: isPending ? '0 15px 40px rgba(238,100,24,0.2)' : undefined
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <b style={{ fontSize: 17, color: '#fff' }}>{p.tenant_name}</b>
                                <div style={{ fontSize: 12, color: 'var(--sun-2)', fontWeight: 600 }}>
                                  {p.tenant_slug}.nivaas.space
                                </div>
                              </div>
                              <span className={`sa-glass-pill ${isPending ? 'sa-glass-pill-warn' : isApproved ? 'sa-glass-pill-ok' : 'sa-glass-pill-danger'}`}>
                                {p.status}
                              </span>
                            </div>

                            <div className="sa-glass-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#94a3b8' }}>Selected Plan:</span>
                                <b style={{ textTransform: 'uppercase', color: '#fff' }}>{p.plan_type}</b>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#94a3b8' }}>Amount:</span>
                                <b style={{ color: '#34d399', fontSize: 16 }}>{money(p.amount)}</b>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#94a3b8' }}>UTR / Reference:</span>
                                <span
                                  className="mono"
                                  onClick={() => copyText(p.utr_number, say, 'UTR Number')}
                                  style={{
                                    fontWeight: 700, color: 'var(--sun-2)', cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,0.1)'
                                  }}
                                >
                                  {p.utr_number}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                                <span>Submitted:</span>
                                <span>{new Date(p.created_at).toLocaleString('en-IN')}</span>
                              </div>
                            </div>

                            {p.screenshot_url && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                                  Payment Receipt / Screenshot
                                </div>
                                <div
                                  onClick={() => setInspectScreenshot(p.screenshot_url)}
                                  style={{
                                    height: 160,
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    background: '#000'
                                  }}
                                >
                                  <img
                                    src={p.screenshot_url}
                                    alt="Payment Slip"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                  />
                                  <div style={{
                                    position: 'absolute', bottom: 8, right: 8,
                                    background: 'rgba(0,0,0,0.8)', color: '#fff',
                                    fontSize: 11, padding: '4px 10px', borderRadius: 6, fontWeight: 600,
                                    backdropFilter: 'blur(8px)'
                                  }}>
                                    Enlarge Receipt 🔍
                                  </div>
                                </div>
                              </div>
                            )}

                            {isPending ? (
                              <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
                                <button
                                  className="sa-glass-btn sa-glass-btn-success"
                                  style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
                                  onClick={async () => {
                                    try {
                                      const res = await saApi.approvePayment(p.id);
                                      say(res.message || 'Payment approved & unlocked!');
                                      loadData();
                                    } catch (err) {
                                      say(err.message);
                                    }
                                  }}
                                >
                                  <Icon name="check" />
                                  <span>Approve &amp; Activate</span>
                                </button>

                                <button
                                  className="sa-glass-btn sa-glass-btn-danger"
                                  onClick={async () => {
                                    const reason = prompt('Rejection reason (optional):');
                                    if (reason === null) return;
                                    try {
                                      await saApi.rejectPayment(p.id, reason);
                                      say('Payment marked as rejected');
                                      loadData();
                                    } catch (err) {
                                      say(err.message);
                                    }
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                                {isApproved ? '✓ Verified by Super Admin' : '✗ Submission Rejected'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 3: NODE & DB HEALTH */}
              {tab === 'health' && (
                <section className="sa-glass-card" style={{ padding: 28 }}>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 18, color: '#fff', fontWeight: 800 }}>Node Infrastructure &amp; Dynamic Connection Pools</h3>
                    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Live status of the Nivaas multi-tenant execution plane.</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <div className="sa-glass-panel" style={{ padding: 20 }}>
                      <div className="sa-glass-pill sa-glass-pill-ok" style={{ fontSize: 10, marginBottom: 8 }}>
                        MASTER CONTROL PLANE
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>nivaas_master</div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        PostgreSQL 16 &middot; Global tenants catalog &amp; payments registry
                      </div>
                    </div>

                    <div className="sa-glass-panel" style={{ padding: 20 }}>
                      <div className="sa-glass-pill" style={{ background: 'rgba(238,100,24,0.15)', border: '1px solid rgba(238,100,24,0.4)', color: 'var(--sun-2)', fontSize: 10, marginBottom: 8 }}>
                        ASYNC LOCAL STORAGE (ALS)
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Dynamic LRU Routing</div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        Zero query cross-leakage &middot; 15-min idle pool auto-sweeper
                      </div>
                    </div>

                    <div className="sa-glass-panel" style={{ padding: 20 }}>
                      <div className="sa-glass-pill sa-glass-pill-ok" style={{ fontSize: 10, marginBottom: 8 }}>
                        SERVER NODE SPECIFICATION
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>200.234.46.234:4100</div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        PM2 Cluster &middot; Nginx Wildcard *.nivaas.space Proxy
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create New Tenant */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(res) => {
            setShowCreateModal(false);
            say(`Tenant ${res.tenant.name} provisioned successfully!`);
            loadData();
          }}
        />
      )}

      {/* Lightbox: Inspect Screenshot */}
      {inspectScreenshot && (
        <div className="sa-glass-scrim" onClick={() => setInspectScreenshot(null)}>
          <div className="sa-glass-card" style={{ maxWidth: 840, maxHeight: '90vh', overflow: 'hidden', padding: 12 }}>
            <img src={inspectScreenshot} alt="Receipt Fullscreen" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTenantModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [planType, setPlanType] = useState('trial');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleNameChange = (val) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await saApi.createTenant({
        name,
        slug,
        adminName: adminName || name,
        adminEmail,
        phone,
        planType,
      });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Provisioning failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sa-glass-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sa-glass-modal">
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: 19, color: '#fff', fontWeight: 800 }}>
            🏢 Provision Isolated Client Database
          </h3>
          <button className="iconbtn" onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff' }}>
            <Icon name="x" />
          </button>
        </div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🎉</div>
            <h3 style={{ fontSize: 22, color: '#34d399', margin: '0 0 6px 0', fontWeight: 800 }}>Tenant Provisioned Successfully!</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 22px 0' }}>
              Database <b>{result.tenant.db_name}</b> was created, schema migrated, and welcome email dispatched.
            </p>

            <div className="sa-glass-panel" style={{ padding: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, marginBottom: 24 }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Workspace URL: </span>
                <a href={result.loginUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--sun-2)', fontWeight: 700 }}>
                  {result.loginUrl}
                </a>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Admin Email: </span>
                <b style={{ color: '#fff' }}>{result.tenant.admin_email}</b>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Temporary Password: </span>
                <span className="mono" style={{ background: 'rgba(238,100,24,0.2)', border: '1px solid rgba(238,100,24,0.4)', color: '#ffedd5', padding: '3px 10px', borderRadius: 6, fontWeight: 800 }}>
                  {result.tempPassword}
                </span>
              </div>
            </div>

            <button className="sa-glass-btn sa-glass-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 13 }} onClick={() => onSuccess(result)}>
              Done &amp; Return to Fleet
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 24 }}>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                  Builder / Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prestige Estates"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="sa-glass-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                  Subdomain Slug *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(10, 14, 26, 0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0 14px' }}>
                  <input
                    type="text"
                    required
                    placeholder="prestige"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    style={{ flex: 1, border: 0, background: 'transparent', padding: '10px 0', fontSize: 14, fontWeight: 700, color: 'var(--sun-2)', outline: 'none' }}
                  />
                  <span style={{ color: '#64748b', fontWeight: 600, fontSize: 13 }}>.nivaas.space</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                    Admin Name
                  </label>
                  <input
                    type="text"
                    placeholder="Ramesh Sharma"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="sa-glass-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                    Admin Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@prestige.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="sa-glass-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="9829012345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="sa-glass-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                    Initial Plan
                  </label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value)}
                    className="sa-glass-input"
                    style={{ width: '100%' }}
                  >
                    <option value="trial" style={{ background: '#0f172a' }}>7-Day Free Trial</option>
                    <option value="monthly" style={{ background: '#0f172a' }}>Monthly Plan (₹4,999)</option>
                    <option value="6months" style={{ background: '#0f172a' }}>Half-Yearly (₹24,999)</option>
                    <option value="yearly" style={{ background: '#0f172a' }}>Annual Plan (₹44,999)</option>
                    <option value="lifetime" style={{ background: '#0f172a' }}>Lifetime Deal (₹99,999)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <button type="button" className="sa-glass-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="sa-glass-btn sa-glass-btn-primary" disabled={submitting}>
                {submitting ? 'Creating Physical Database...' : 'Provision Tenant ➔'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SuperAdminLogin({ onLogin }) {
  const [email, setEmail] = useState('admin@nivaas.space');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await saApi.login(email, password);
      saApi.setToken(res.token);
      onLogin();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sa-glass-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      {/* Ambient Aurora Glow Blobs */}
      <div className="sa-blob sa-blob-1" style={{ top: '-100px', right: '15%' }} />
      <div className="sa-blob sa-blob-2" style={{ bottom: '-50px', left: '10%' }} />

      <div className="sa-login-glass-card">
        {/* Left Column: Glass Showcase */}
        <div style={{
          padding: '48px 44px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Logo size={46} style={{ boxShadow: '0 0 25px rgba(238,100,24,0.4)', borderRadius: 12 }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Nivaas</div>
                <span className="sa-glass-pill" style={{ background: 'rgba(238,100,24,0.2)', border: '1px solid rgba(238,100,24,0.4)', color: 'var(--sun-2)' }}>
                  MASTER CONTROL PLANE
                </span>
              </div>
            </div>

            <div style={{ marginTop: 40 }}>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                Multi-Tenant Fleet &amp; Physical DB Isolation.
              </h1>
              <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                Enterprise real estate SaaS control plane. Automated database-per-tenant provisioning, UPI payment proof verifications &amp; wildcard subdomain orchestration.
              </p>
            </div>

            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.2)',
                  border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', display: 'grid', placeItems: 'center', flexShrink: 0
                }}>
                  <Icon name="shield" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <b style={{ color: '#fff', fontSize: 14, display: 'block' }}>Dedicated Physical Database</b>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>100% cryptographic &amp; data plane isolation per client.</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(238,100,24,0.2)',
                  border: '1px solid rgba(238,100,24,0.4)', color: 'var(--sun-2)', display: 'grid', placeItems: 'center', flexShrink: 0
                }}>
                  <Icon name="rupee" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <b style={{ color: '#fff', fontSize: 14, display: 'block' }}>UPI QR &amp; 1-Click Verification</b>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Inspect receipt slips and unlock tenant workspaces instantly.</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 36, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
            <span>Master Node: 200.234.46.234 &middot; Active on PostgreSQL 16</span>
          </div>
        </div>

        {/* Right Column: Glass Form */}
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>Super Administrator</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
              Authenticate with your master control plane credentials.
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                Master Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sa-glass-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                Master Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sa-glass-input"
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="submit"
              className="sa-glass-btn sa-glass-btn-primary"
              disabled={loading}
              style={{ padding: '14px', justifyContent: 'center', fontSize: 15, marginTop: 8 }}
            >
              {loading ? 'Authenticating Master...' : 'Access Control Plane ➔'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
