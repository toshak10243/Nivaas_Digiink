import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Logo, Avatar, Pill, copyText } from '../../components/ui.jsx';
import logoImg from '../../assets/logo.png';
import { money } from '../../lib/format.js';

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
    <div className="shell" style={{ height: '100vh', overflow: 'hidden' }}>
      {toast && (
        <div className="toast" role="status" style={{ zIndex: 99999 }}>
          {toast}
        </div>
      )}

      {/* Left Rail: Native Dark Ink Rail */}
      <aside className="rail">
        <div className="brand" style={{ paddingBottom: 22, borderBottom: '1px solid var(--rail-hi)' }}>
          <Logo size={36} />
          <div>
            <b>Nivaas</b>
            <small style={{ color: 'var(--sun-2)', fontWeight: 700, letterSpacing: '0.08em' }}>
              CONTROL PLANE
            </small>
          </div>
        </div>

        <div className="navlist" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            className="navbtn"
            aria-current={tab === 'tenants' ? 'page' : undefined}
            onClick={() => setTab('tenants')}
          >
            <Icon name="building" />
            <span>Tenants Fleet</span>
            <span className="count" style={{ background: 'var(--rail-hi)', color: 'var(--rail-ink)' }}>
              {tenants.length}
            </span>
          </button>

          <button
            className="navbtn"
            aria-current={tab === 'payments' ? 'page' : undefined}
            onClick={() => setTab('payments')}
          >
            <Icon name="rupee" />
            <span>Payment Approvals</span>
            {pendingPayments.length > 0 && (
              <span className="count" style={{ background: 'var(--sun)', animation: 'pulse 2s infinite' }}>
                {pendingPayments.length}
              </span>
            )}
          </button>

          <button
            className="navbtn"
            aria-current={tab === 'health' ? 'page' : undefined}
            onClick={() => setTab('health')}
          >
            <Icon name="shield" />
            <span>Node &amp; DB Fleet</span>
          </button>
        </div>

        {/* Quick Launch Action in Sidebar */}
        <div style={{ marginTop: 24, padding: '0 4px' }}>
          <button
            className="btn sun"
            style={{ width: '100%', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}
            onClick={() => setShowCreateModal(true)}
          >
            <Icon name="plus" />
            <span>New Tenant</span>
          </button>
        </div>

        {/* Rail Footer */}
        <div className="railfoot">
          <div className="bizchip" style={{ background: 'var(--rail-hi)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="av" style={{ background: 'linear-gradient(135deg, var(--sun-2), var(--sun))', color: '#fff', fontWeight: 800 }}>
              SA
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Super Admin</b>
              <span style={{ fontSize: 11, color: 'var(--rail-dim)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                admin@nivaas.space
              </span>
            </div>
          </div>

          <button
            className="btn ghost"
            style={{ color: 'var(--rail-dim)', width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
            onClick={() => { saApi.logout(); setAuthed(false); }}
          >
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Porcelain Workspace */}
      <div className="work">
        {/* Topbar */}
        <header className="topbar">
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Multi-Tenant Master Control Plane</span>
              <span className="demobadge" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', fontWeight: 700 }}>
                ● 200.234.46.234
              </span>
            </h1>
            <div className="sub">Automated Database-per-Tenant Architecture (*.nivaas.space)</div>
          </div>

          <div className="spacer" />

          <button
            className="btn sm"
            onClick={loadData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="spark" />
            <span>{loading ? 'Syncing...' : 'Sync Data'}</span>
          </button>

          <button
            className="btn sun sm"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" />
            <span>Provision Tenant</span>
          </button>
        </header>

        {/* Page Content */}
        <div className="content">
          <div className="page">
            {/* Executive Hero Banner */}
            <section className="dash-hero">
              <div className="dash-hero-top">
                <span className="dash-hero-tag">
                  <Icon name="shield" />
                  Nivaas Master Plane &middot; PostgreSQL 16 Fleet
                </span>
                <span className="live-status">
                  <i />
                  All Tenant Clusters Operational
                </span>
              </div>
              <h2 className="dash-hero-title">
                {tenants.length} Dedicated Client Databases, <em>{metrics?.tenants?.active_tenants || 0} Active</em> Subscriptions
              </h2>
              <div className="dash-hero-sub">
                <span>
                  <Icon name="rupee" />
                  Verified Revenue: <b>{money(metrics?.totalRevenue || 0)}</b>
                </span>
                <span>
                  <Icon name="building" />
                  Free 7-Day Trials: <b>{metrics?.tenants?.trial_tenants || 0}</b>
                </span>
                <span>
                  <Icon name="calendar" />
                  Pending Approvals: <b style={{ color: pendingPayments.length > 0 ? 'var(--sun)' : 'inherit' }}>{pendingPayments.length}</b>
                </span>
              </div>
            </section>

            {/* KPI Cards Row */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <article className="admin-kpi warm">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-icon"><Icon name="building" /></span>
                  <span>Registered Tenants</span>
                </div>
                <strong className="admin-kpi-value">{tenants.length}</strong>
                <div className="admin-kpi-detail">Independent physical databases</div>
              </article>

              <article className="admin-kpi ok">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-icon"><Icon name="checkCircle" /></span>
                  <span>Active Subscriptions</span>
                </div>
                <strong className="admin-kpi-value">{metrics?.tenants?.active_tenants || 0}</strong>
                <div className="admin-kpi-detail">Paying enterprise builders</div>
              </article>

              <article className="admin-kpi new">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-icon"><Icon name="clock" /></span>
                  <span>Free Trial Accounts</span>
                </div>
                <strong className="admin-kpi-value">{metrics?.tenants?.trial_tenants || 0}</strong>
                <div className="admin-kpi-detail">Active 7-day onboarding</div>
              </article>

              <article className={'admin-kpi ' + (pendingPayments.length > 0 ? 'hot' : 'cold')}>
                <div className="admin-kpi-top">
                  <span className="admin-kpi-icon"><Icon name="receipt" /></span>
                  <span>Payment Verifications</span>
                </div>
                <strong className="admin-kpi-value">{pendingPayments.length}</strong>
                <div className="admin-kpi-detail">
                  {pendingPayments.length > 0 ? 'Action required: Review slips' : 'Zero pending verification'}
                </div>
              </article>
            </section>

            {/* TAB 1: TENANTS DIRECTORY */}
            {tab === 'tenants' && (
              <section className="card">
                <div className="card-h" style={{ paddingBottom: 16, borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <h3>Tenant Databases &amp; Workspaces</h3>
                    <div className="muted">Each client operates within their isolated database plane.</div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Status Filter Chips */}
                    <div style={{ display: 'flex', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
                      {['all', 'active', 'trial', 'expired'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          style={{
                            border: 0,
                            background: statusFilter === st ? 'var(--panel)' : 'transparent',
                            color: statusFilter === st ? 'var(--ink)' : 'var(--ink-3)',
                            fontWeight: statusFilter === st ? 700 : 500,
                            padding: '5px 12px',
                            borderRadius: 7,
                            fontSize: 12,
                            textTransform: 'capitalize',
                            boxShadow: statusFilter === st ? 'var(--shadow)' : 'none',
                            cursor: 'pointer'
                          }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Search Input */}
                    <div className="search" style={{ width: 260 }}>
                      <Icon name="search" />
                      <input
                        type="text"
                        placeholder="Search company, slug, email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Company &amp; Subdomain</th>
                        <th>Postgres Database</th>
                        <th>Administrator Contact</th>
                        <th>Active Plan</th>
                        <th>Subscription Expiry</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
                            No tenants found matching your filter criteria.
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
                                <div className="who">
                                  <Avatar name={t.name} size="sm" />
                                  <div>
                                    <b style={{ color: 'var(--ink)' }}>{t.name}</b>
                                    <a
                                      href={`https://${t.slug}.nivaas.space`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ color: 'var(--sun-text)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}
                                    >
                                      <span>{t.slug}.nivaas.space</span>
                                      <Icon name="link" style={{ width: 12, height: 12 }} />
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
                                    background: 'var(--panel-2)',
                                    border: '1px solid var(--line)',
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    color: 'var(--ink-2)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {t.db_name}
                                </span>
                              </td>

                              <td>
                                <div style={{ fontWeight: 600 }}>{t.admin_name || 'Admin'}</div>
                                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.admin_email}</div>
                                {t.phone && <div className="phone">{t.phone}</div>}
                              </td>

                              <td>
                                <span className="tag new" style={{ textTransform: 'uppercase' }}>
                                  {t.plan_type || 'trial'}
                                </span>
                              </td>

                              <td>
                                <div style={{ fontWeight: 600, color: isExpired ? 'var(--hot)' : 'var(--ok)' }}>
                                  {isExpired ? 'Expired' : `${daysLeft} days left`}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                                  {expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              </td>

                              <td>
                                <span className={`tag ${isExpired ? 'hot' : t.subscription_status === 'suspended' ? 'warm' : 'ok'}`}>
                                  {isExpired ? 'EXPIRED' : (t.subscription_status || 'ACTIVE')}
                                </span>
                              </td>

                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn sm"
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
                                    title="Add 30 days subscription"
                                  >
                                    +30 Days
                                  </button>

                                  <button
                                    className="btn sm"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const nextStatus = t.subscription_status === 'suspended' ? 'active' : 'suspended';
                                      try {
                                        await saApi.updateTenant(t.id, { status: nextStatus });
                                        say(`Tenant ${t.name} is now ${nextStatus}`);
                                        loadData();
                                      } catch (err) {
                                        say(err.message);
                                      }
                                    }}
                                    style={{ color: t.subscription_status === 'suspended' ? 'var(--ok)' : 'var(--hot)' }}
                                  >
                                    {t.subscription_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                                  </button>

                                  <a
                                    href={`https://${t.slug}.nivaas.space`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn sm ghost"
                                    title="Open tenant workspace"
                                  >
                                    <Icon name="link" />
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
                  <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
                    <h3 style={{ fontSize: 18, color: 'var(--ink)' }}>No Payment Proofs Submitted</h3>
                    <p style={{ color: 'var(--ink-3)', fontSize: 14, maxWidth: 440, margin: '8px auto 0' }}>
                      When clients pay via UPI QR code or Bank NEFT and upload transfer slips, they will appear here for 1-click verification.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18 }}>
                    {payments.map((p) => {
                      const isPending = p.status === 'pending';
                      const isApproved = p.status === 'approved';

                      return (
                        <div key={p.id} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, borderColor: isPending ? 'var(--sun)' : 'var(--line)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <b style={{ fontSize: 16, color: 'var(--ink)' }}>{p.tenant_name}</b>
                              <div style={{ fontSize: 12, color: 'var(--sun-text)', fontWeight: 600 }}>
                                {p.tenant_slug}.nivaas.space
                              </div>
                            </div>
                            <span className={`tag ${isPending ? 'warm' : isApproved ? 'ok' : 'hot'}`}>
                              {p.status}
                            </span>
                          </div>

                          <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className="muted">Selected Plan:</span>
                              <b style={{ textTransform: 'uppercase', color: 'var(--ink)' }}>{p.plan_type}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className="muted">Amount Received:</span>
                              <b style={{ color: 'var(--ok)', fontSize: 16 }}>{money(p.amount)}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="muted">UTR / Reference:</span>
                              <span
                                className="mono"
                                onClick={() => copyText(p.utr_number, say, 'UTR Number')}
                                style={{ fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', background: 'var(--panel)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--line)' }}
                              >
                                {p.utr_number}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <span className="muted">Submitted:</span>
                              <span className="muted">{new Date(p.created_at).toLocaleString('en-IN')}</span>
                            </div>
                          </div>

                          {p.screenshot_url && (
                            <div>
                              <div className="eyebrow" style={{ marginBottom: 6 }}>Payment Slip / UPI Receipt</div>
                              <div
                                onClick={() => setInspectScreenshot(p.screenshot_url)}
                                style={{
                                  height: 160,
                                  borderRadius: 10,
                                  overflow: 'hidden',
                                  border: '1px solid var(--line-2)',
                                  position: 'relative',
                                  cursor: 'pointer',
                                  background: '#0f172a'
                                }}
                              >
                                <img
                                  src={p.screenshot_url}
                                  alt="Payment Slip"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                                <div style={{
                                  position: 'absolute', bottom: 8, right: 8,
                                  background: 'rgba(0,0,0,0.75)', color: '#fff',
                                  fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600
                                }}>
                                  Click to Enlarge 🔍
                                </div>
                              </div>
                            </div>
                          )}

                          {isPending ? (
                            <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
                              <button
                                className="btn sun"
                                style={{ flex: 1, padding: '10px' }}
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
                                className="btn sm"
                                style={{ color: 'var(--hot)' }}
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
                            <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
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
              <section className="card" style={{ padding: 24 }}>
                <div className="card-h" style={{ padding: 0, marginBottom: 18 }}>
                  <h3>Node Infrastructure &amp; Dynamic Connection Pools</h3>
                  <div className="muted">Live status of the Nivaas multi-tenant execution plane.</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
                    <div className="eyebrow" style={{ color: 'var(--ok)' }}>MASTER CONTROL PLANE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: 'var(--ink)' }}>nivaas_master</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                      PostgreSQL 16 &middot; Global tenants directory &amp; audit log
                    </div>
                  </div>

                  <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
                    <div className="eyebrow" style={{ color: 'var(--sun-text)' }}>ASYNC LOCAL STORAGE (ALS)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: 'var(--ink)' }}>Active LRU Dynamic Routing</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                      Zero query leakage &middot; 15-minute automatic idle pool sweeper
                    </div>
                  </div>

                  <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
                    <div className="eyebrow" style={{ color: 'var(--ok)' }}>SERVER NODE SPECIFICATION</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: 'var(--ink)' }}>200.234.46.234:4100</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                      PM2 Cluster &middot; Nginx Wildcard *.nivaas.space Proxy
                    </div>
                  </div>
                </div>
              </section>
            )}
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
        <div className="scrim" onClick={() => setInspectScreenshot(null)}>
          <div style={{ maxWidth: 780, maxHeight: '90vh', background: 'var(--panel)', borderRadius: 16, overflow: 'hidden', padding: 8, boxShadow: 'var(--shadow-lg)' }}>
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
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(580px, 94vw)' }}>
        <div className="modal-h">
          <h3>🏢 Provision Isolated Client Instance</h3>
          <button className="iconbtn" onClick={onClose}><Icon name="x" /></button>
        </div>

        {result ? (
          <div className="modal-b" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h3 style={{ fontSize: 20, color: 'var(--ok)' }}>Tenant Provisioned Successfully!</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '6px 0 18px' }}>
              Database <b>{result.tenant.db_name}</b> was created, schema migrated, and welcome email dispatched.
            </p>

            <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 18, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <span className="muted">Workspace URL: </span>
                <a href={result.loginUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--sun-text)', fontWeight: 700 }}>
                  {result.loginUrl}
                </a>
              </div>
              <div>
                <span className="muted">Admin Email: </span>
                <b style={{ color: 'var(--ink)' }}>{result.tenant.admin_email}</b>
              </div>
              <div>
                <span className="muted">Temporary Password: </span>
                <span className="mono" style={{ background: 'var(--sun-soft)', color: 'var(--sun-text)', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>
                  {result.tempPassword}
                </span>
              </div>
            </div>

            <button className="btn sun" style={{ width: '100%', marginTop: 20, padding: 12 }} onClick={() => onSuccess(result)}>
              Done &amp; Return to Fleet
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-b">
              {error && (
                <div className="alert">
                  <Icon name="alert" />
                  <div><b>Error</b>{error}</div>
                </div>
              )}

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Builder / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prestige Estates"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
                />
              </div>

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Subdomain Slug *</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '0 12px' }}>
                  <input
                    type="text"
                    required
                    placeholder="prestige"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    style={{ flex: 1, border: 0, background: 'transparent', padding: '10px 0', fontSize: 14, fontWeight: 700, color: 'var(--sun-text)', outline: 'none' }}
                  />
                  <span style={{ color: 'var(--ink-3)', fontWeight: 600, fontSize: 13 }}>.nivaas.space</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Admin Name</label>
                  <input
                    type="text"
                    placeholder="Ramesh Sharma"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Admin Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@prestige.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="9829012345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Initial Plan</label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14, background: 'var(--panel)' }}
                  >
                    <option value="trial">7-Day Free Trial</option>
                    <option value="monthly">Monthly Plan (₹4,999)</option>
                    <option value="6months">Half-Yearly (₹24,999)</option>
                    <option value="yearly">Annual Plan (₹44,999)</option>
                    <option value="lifetime">Lifetime Deal (₹99,999)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-f">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn sun" disabled={submitting}>
                {submitting ? 'Creating Physical DB...' : 'Create Tenant Instance ➔'}
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
    <div className="login-page-wrap">
      <div className="login-white-card">
        {/* Left Column: Brand Showcase */}
        <div className="login-showcase-panel">
          <div>
            <div className="login-brand-header">
              <img src={logoImg} alt="Nivaas" className="login-brand-logo" />
              <div>
                <div className="login-brand-title">Nivaas</div>
                <span className="login-brand-tag" style={{ background: 'var(--sun-soft)', color: 'var(--sun-text)', fontWeight: 700 }}>
                  Master Control Plane
                </span>
              </div>
            </div>

            <div className="login-hero-text" style={{ marginTop: 36 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>
                Multi-Tenant Fleet &amp; Database Isolation.
              </h1>
              <p style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>
                High-scale real estate SaaS management. Dedicated PostgreSQL database-per-client provisioning, payment verification &amp; dynamic subdomain routing across India.
              </p>
            </div>

            <div className="login-feature-list" style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="login-feature-item" style={{ display: 'flex', gap: 12 }}>
                <div className="login-feature-icon" style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="shield" />
                </div>
                <div style={{ fontSize: 13 }}>
                  <b style={{ display: 'block', color: 'var(--ink)' }}>Physical Database Isolation</b>
                  <span style={{ color: 'var(--ink-3)' }}>100% data separation with dedicated PostgreSQL schemas.</span>
                </div>
              </div>

              <div className="login-feature-item" style={{ display: 'flex', gap: 12 }}>
                <div className="login-feature-icon" style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--sun-soft)', color: 'var(--sun-text)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="rupee" />
                </div>
                <div style={{ fontSize: 13 }}>
                  <b style={{ display: 'block', color: 'var(--ink)' }}>UPI QR &amp; Instant 1-Click Unlock</b>
                  <span style={{ color: 'var(--ink-3)' }}>Review payment slips and automatically extend tenant subscriptions.</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, fontSize: 12, color: 'var(--ink-3)' }}>
            🔒 Node: 200.234.46.234 &middot; Master Control Plane v2.0
          </div>
        </div>

        {/* Right Column: Super Admin Form */}
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Super Administrator</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: '4px 0 0' }}>
              Sign in with your master credentials to manage tenants.
            </p>
          </div>

          {error && (
            <div className="alert" style={{ marginBottom: 18 }}>
              <Icon name="alert" />
              <div><b>Authentication Error</b>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Super Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
              />
            </div>

            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--line-2)', fontSize: 14 }}
              />
            </div>

            <button
              type="submit"
              className="btn sun"
              disabled={loading}
              style={{ padding: '12px', marginTop: 8, fontSize: 14, fontWeight: 700 }}
            >
              {loading ? 'Authenticating...' : 'Access Master Plane ➔'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
