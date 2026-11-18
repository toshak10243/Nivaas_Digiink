import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Logo, copyText } from '../../components/ui.jsx';
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
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'tenants' | 'payments' | 'plans' | 'settings'
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
    <div className="sa-white-canvas">
      {/* Soft Pastel Ambient Blur Blobs */}
      <div className="sa-white-blob sa-white-blob-1" />
      <div className="sa-white-blob sa-white-blob-2" />

      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: '#0f172a', color: '#ffffff', padding: '12px 22px',
          borderRadius: 100, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.25)',
          fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ color: '#ffae1f' }}>⚡</span>
          <span>{toast}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {/* Left Sidebar Rail (White Glass) */}
        <aside className="sa-white-rail" style={{ display: 'flex', flexDirection: 'column', padding: '20px 16px' }}>
          {/* Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <Logo size={40} style={{ borderRadius: 10, boxShadow: '0 4px 12px rgba(238, 100, 24, 0.2)' }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                Nivaas
              </div>
              <span className="sa-white-pill sa-white-pill-blue" style={{ fontSize: 9.5, padding: '2px 8px', marginTop: 3 }}>
                SUPER ADMIN
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className={`sa-white-navbtn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Icon name="home" />
              <span>Dashboard</span>
            </button>

            <button
              className={`sa-white-navbtn ${activeTab === 'tenants' ? 'active' : ''}`}
              onClick={() => setActiveTab('tenants')}
            >
              <Icon name="building" />
              <span style={{ flex: 1 }}>Clients / Tenants</span>
              <span style={{
                background: activeTab === 'tenants' ? '#1a73e8' : '#e2e8f0',
                color: activeTab === 'tenants' ? '#fff' : '#64748b',
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100
              }}>
                {tenants.length}
              </span>
            </button>

            <button
              className={`sa-white-navbtn ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              <Icon name="rupee" />
              <span style={{ flex: 1 }}>Payments &amp; Proofs</span>
              {pendingPayments.length > 0 && (
                <span style={{
                  background: '#d93025', color: '#fff', fontSize: 11,
                  fontWeight: 800, padding: '2px 8px', borderRadius: 100
                }}>
                  {pendingPayments.length}
                </span>
              )}
            </button>

            <button
              className={`sa-white-navbtn ${activeTab === 'plans' ? 'active' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              <Icon name="receipt" />
              <span>Subscription Plans</span>
            </button>

            <button
              className={`sa-white-navbtn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Icon name="gear" />
              <span>Platform Settings</span>
            </button>
          </nav>

          {/* Quick Add Client Button */}
          <div style={{ marginTop: 26, padding: '0 4px' }}>
            <button
              className="sa-white-btn sa-white-btn-saffron"
              style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
              onClick={() => setShowCreateModal(true)}
            >
              <Icon name="plus" />
              <span>+ Create Client</span>
            </button>
          </div>

          {/* Rail Foot User Profile */}
          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <div className="sa-white-panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #ee6418, #ffae1f)',
                color: '#fff', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center'
              }}>
                SA
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Super Admin
                </div>
                <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  admin@nivaas.space
                </div>
              </div>
            </div>

            <button
              onClick={() => { saApi.logout(); setAuthed(false); }}
              className="sa-white-navbtn"
              style={{ marginTop: 8, color: '#d93025', fontSize: 13 }}
            >
              <Icon name="logout" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main View Area */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          {/* White Glass Topbar */}
          <header className="sa-white-topbar" style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {activeTab === 'dashboard' && 'Executive SaaS Dashboard'}
                  {activeTab === 'tenants' && 'Client Fleet & Isolated Databases'}
                  {activeTab === 'payments' && 'Payment Verifications & Approvals'}
                  {activeTab === 'plans' && 'Subscription Plans & Pricing'}
                  {activeTab === 'settings' && 'Platform Infrastructure & Settings'}
                </h1>
                <span className="sa-white-pill sa-white-pill-ok" style={{ fontSize: 10.5 }}>
                  ● 200.234.46.234 Node Live
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                Multi-Tenant Architecture (*.nivaas.space) &middot; PostgreSQL 16
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="sa-white-btn" onClick={loadData} disabled={loading}>
                <Icon name="spark" />
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button className="sa-white-btn sa-white-btn-primary" onClick={() => setShowCreateModal(true)}>
                <Icon name="plus" />
                <span>New Client</span>
              </button>
            </div>
          </header>

          {/* Main Content Body */}
          <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            {/* TAB 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1280, margin: '0 auto' }}>
                {/* Hero Card */}
                <div className="sa-white-hero">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <span className="sa-white-pill sa-white-pill-blue" style={{ marginBottom: 12 }}>
                        ENTERPRISE SAAS MASTER PLANE
                      </span>
                      <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '8px 0 6px 0' }}>
                        {tenants.length} Dedicated Client Instances &middot; {money(metrics?.totalRevenue || 0)} Total Revenue
                      </h2>
                      <p style={{ color: '#64748b', fontSize: 14, margin: 0, maxWidth: 640 }}>
                        Every builder company runs on their own isolated PostgreSQL database with automatic AsyncLocalStorage connection pooling and wildcard subdomains.
                      </p>
                    </div>

                    <button
                      className="sa-white-btn sa-white-btn-saffron"
                      style={{ padding: '10px 20px', fontSize: 14 }}
                      onClick={() => setShowCreateModal(true)}
                    >
                      + Provision New Tenant
                    </button>
                  </div>
                </div>

                {/* 4 White KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  <div className="sa-white-kpi" style={{ '--accent-bar': '#1a73e8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                      <span>Total Clients</span>
                      <span style={{ color: '#1a73e8' }}><Icon name="building" /></span>
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{tenants.length}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Independent physical databases</div>
                  </div>

                  <div className="sa-white-kpi" style={{ '--accent-bar': '#1e8e3e' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                      <span>Active Subscriptions</span>
                      <span style={{ color: '#1e8e3e' }}><Icon name="checkCircle" /></span>
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#1e8e3e', marginTop: 4 }}>
                      {metrics?.tenants?.active_tenants || 0}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Paying active builders</div>
                  </div>

                  <div className="sa-white-kpi" style={{ '--accent-bar': '#f9ab00' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                      <span>Free 7-Day Trials</span>
                      <span style={{ color: '#e37400' }}><Icon name="clock" /></span>
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#e37400', marginTop: 4 }}>
                      {metrics?.tenants?.trial_tenants || 0}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Trial accounts in progress</div>
                  </div>

                  <div className="sa-white-kpi" style={{ '--accent-bar': pendingPayments.length > 0 ? '#d93025' : '#5f6368' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                      <span>Pending Verifications</span>
                      <span style={{ color: pendingPayments.length > 0 ? '#d93025' : '#5f6368' }}><Icon name="receipt" /></span>
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: pendingPayments.length > 0 ? '#d93025' : '#0f172a', marginTop: 4 }}>
                      {pendingPayments.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {pendingPayments.length > 0 ? 'Action required: Review slips' : 'Zero pending verification'}
                    </div>
                  </div>
                </div>

                {/* Quick Client Table in Dashboard */}
                <div className="sa-white-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Recent Builder Clients</h3>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Latest provisioned workspaces</div>
                    </div>
                    <button className="sa-white-btn" onClick={() => setActiveTab('tenants')}>
                      View All Clients &rarr;
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="sa-white-table">
                      <thead>
                        <tr>
                          <th>Company</th>
                          <th>Database</th>
                          <th>Admin Contact</th>
                          <th>Plan</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Workspace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.slice(0, 5).map((t) => (
                          <tr key={t.id}>
                            <td>
                              <b style={{ color: '#0f172a' }}>{t.name}</b>
                              <div style={{ fontSize: 12, color: '#1a73e8', fontWeight: 600 }}>{t.slug}.nivaas.space</div>
                            </td>
                            <td>
                              <span className="mono" style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontSize: 12, color: '#475569' }}>
                                {t.db_name}
                              </span>
                            </td>
                            <td>
                              <div>{t.admin_name || 'Admin'}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{t.admin_email}</div>
                            </td>
                            <td>
                              <span className="sa-white-pill sa-white-pill-blue">{t.plan_type}</span>
                            </td>
                            <td>
                              <span className={`sa-white-pill ${t.subscription_status === 'active' ? 'sa-white-pill-ok' : 'sa-white-pill-warn'}`}>
                                {t.subscription_status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <a
                                href={`https://${t.slug}.nivaas.space`}
                                target="_blank"
                                rel="noreferrer"
                                className="sa-white-btn"
                                style={{ padding: '6px 12px', fontSize: 12 }}
                              >
                                Launch ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TENANTS FLEET */}
            {activeTab === 'tenants' && (
              <div className="sa-white-card" style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Client Fleet Directory</h3>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Manage isolated PostgreSQL databases, subscriptions &amp; subdomains</div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Status Tabs */}
                    <div className="sa-white-panel" style={{ padding: 4, display: 'flex', gap: 4 }}>
                      {['all', 'active', 'trial', 'expired'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          style={{
                            border: 0,
                            background: statusFilter === st ? '#ffffff' : 'transparent',
                            color: statusFilter === st ? '#1a73e8' : '#64748b',
                            fontWeight: statusFilter === st ? 700 : 500,
                            padding: '6px 14px',
                            borderRadius: 100,
                            fontSize: 12,
                            textTransform: 'capitalize',
                            cursor: 'pointer',
                            boxShadow: statusFilter === st ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                          }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative', width: 260 }}>
                      <input
                        type="text"
                        placeholder="Search company, slug, email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="sa-white-input"
                        style={{ width: '100%', paddingLeft: 34 }}
                      />
                      <span style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }}>
                        <Icon name="search" style={{ width: 14, height: 14 }} />
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="sa-white-table">
                    <thead>
                      <tr>
                        <th>Company &amp; Subdomain</th>
                        <th>Physical Database</th>
                        <th>Admin Contact</th>
                        <th>Plan</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                            No clients found matching your filter criteria.
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
                                    background: '#e8f0fe', color: '#1a73e8',
                                    display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13
                                  }}>
                                    {t.name ? t.name.slice(0, 2).toUpperCase() : 'CO'}
                                  </div>
                                  <div>
                                    <b style={{ color: '#0f172a', fontSize: 14 }}>{t.name}</b>
                                    <a
                                      href={`https://${t.slug}.nivaas.space`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ color: '#1a73e8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}
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
                                  style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}
                                >
                                  {t.db_name}
                                </span>
                              </td>

                              <td>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.admin_name || 'Admin'}</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{t.admin_email}</div>
                                {t.phone && <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.phone}</div>}
                              </td>

                              <td>
                                <span className="sa-white-pill sa-white-pill-blue">{t.plan_type || 'trial'}</span>
                              </td>

                              <td>
                                <div style={{ fontWeight: 700, color: isExpired ? '#d93025' : '#1e8e3e' }}>
                                  {isExpired ? 'Expired' : `${daysLeft} days left`}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              </td>

                              <td>
                                <span className={`sa-white-pill ${isExpired ? 'sa-white-pill-danger' : t.subscription_status === 'suspended' ? 'sa-white-pill-warn' : 'sa-white-pill-ok'}`}>
                                  {isExpired ? 'EXPIRED' : (t.subscription_status || 'ACTIVE')}
                                </span>
                              </td>

                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button
                                    className="sa-white-btn"
                                    style={{ padding: '6px 12px', fontSize: 12 }}
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
                                  >
                                    +30 Days
                                  </button>

                                  <button
                                    className="sa-white-btn"
                                    style={{
                                      padding: '6px 12px', fontSize: 12,
                                      color: t.subscription_status === 'suspended' ? '#1e8e3e' : '#d93025'
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
                                    className="sa-white-btn"
                                    style={{ padding: '6px 10px' }}
                                    title="Open workspace"
                                  >
                                    <Icon name="link" style={{ width: 13, height: 13 }} />
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
              </div>
            )}

            {/* TAB 3: PAYMENTS DESK */}
            {activeTab === 'payments' && (
              <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                {payments.length === 0 ? (
                  <div className="sa-white-card" style={{ padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
                    <h3 style={{ fontSize: 18, color: '#0f172a', fontWeight: 800 }}>No Payment Submissions Yet</h3>
                    <p style={{ color: '#64748b', fontSize: 14, maxWidth: 440, margin: '8px auto 0' }}>
                      When clients transfer via UPI QR or Bank NEFT and upload transfer slips, they will appear here for 1-click verification.
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
                          className="sa-white-card"
                          style={{
                            padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
                            borderColor: isPending ? '#ee6418' : '#e2e8f0',
                            boxShadow: isPending ? '0 12px 30px rgba(238, 100, 24, 0.12)' : undefined
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <b style={{ fontSize: 17, color: '#0f172a' }}>{p.tenant_name}</b>
                              <div style={{ fontSize: 12, color: '#1a73e8', fontWeight: 600 }}>{p.tenant_slug}.nivaas.space</div>
                            </div>
                            <span className={`sa-white-pill ${isPending ? 'sa-white-pill-warn' : isApproved ? 'sa-white-pill-ok' : 'sa-white-pill-danger'}`}>
                              {p.status}
                            </span>
                          </div>

                          <div className="sa-white-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>Selected Plan:</span>
                              <b style={{ textTransform: 'uppercase', color: '#0f172a' }}>{p.plan_type}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>Amount:</span>
                              <b style={{ color: '#1e8e3e', fontSize: 16 }}>{money(p.amount)}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#64748b' }}>UTR / Reference:</span>
                              <span
                                className="mono"
                                onClick={() => copyText(p.utr_number, say, 'UTR Number')}
                                style={{
                                  fontWeight: 700, color: '#0f172a', cursor: 'pointer',
                                  background: '#ffffff', padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1'
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
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                                Payment Receipt Slip
                              </div>
                              <div
                                onClick={() => setInspectScreenshot(p.screenshot_url)}
                                style={{
                                  height: 160, borderRadius: 12, overflow: 'hidden',
                                  border: '1px solid #cbd5e1', position: 'relative', cursor: 'pointer', background: '#0f172a'
                                }}
                              >
                                <img src={p.screenshot_url} alt="Payment Slip" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                <div style={{
                                  position: 'absolute', bottom: 8, right: 8,
                                  background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11,
                                  padding: '4px 10px', borderRadius: 6, fontWeight: 600
                                }}>
                                  Click to Enlarge 🔍
                                </div>
                              </div>
                            </div>
                          )}

                          {isPending ? (
                            <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
                              <button
                                className="sa-white-btn sa-white-btn-success"
                                style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
                                onClick={async () => {
                                  try {
                                    const res = await saApi.approvePayment(p.id);
                                    say(res.message || 'Payment approved!');
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
                                className="sa-white-btn sa-white-btn-danger"
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
              </div>
            )}

            {/* TAB 4: SUBSCRIPTION PLANS */}
            {activeTab === 'plans' && (
              <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Subscription Plans (India Real Estate SaaS)</h3>
                  <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Configured pricing tiers for Nivaas Multi-Tenant Builders</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                  {[
                    { id: 'trial', name: '7-Day Free Trial', price: '₹0', dur: '7 Days', desc: 'Instant access with full CRM, AI Copilot, and isolated database.', pop: false },
                    { id: 'monthly', name: 'Monthly Plan', price: '₹4,999', dur: '/ Month', desc: 'Standard plan for growing builders with full sales tracking.', pop: false },
                    { id: '6months', name: 'Half-Yearly', price: '₹24,999', dur: '/ 6 Months', desc: 'Save 17% with 6 months upfront commitment.', pop: false },
                    { id: 'yearly', name: 'Annual Growth', price: '₹44,999', dur: '/ Year', desc: 'Save 25% with complete 365-day access and priority support.', pop: true },
                    { id: 'lifetime', name: 'Founder Lifetime', price: '₹99,999', dur: 'One-Time', desc: 'Full lifetime access for enterprise builders.', pop: false },
                  ].map((plan) => (
                    <div
                      key={plan.id}
                      className="sa-white-card"
                      style={{
                        padding: 24, display: 'flex', flexDirection: 'column',
                        borderColor: plan.pop ? '#1a73e8' : '#e2e8f0',
                        boxShadow: plan.pop ? '0 12px 35px rgba(26,115,232,0.12)' : undefined
                      }}
                    >
                      {plan.pop && (
                        <span className="sa-white-pill sa-white-pill-blue" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
                          MOST POPULAR
                        </span>
                      )}
                      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{plan.name}</h4>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '14px 0 10px' }}>
                        <span style={{ fontSize: 32, fontWeight: 900, color: '#0f172a' }}>{plan.price}</span>
                        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>{plan.dur}</span>
                      </div>
                      <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px 0', flex: 1 }}>{plan.desc}</p>

                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#475569' }}>
                        <div>✓ Isolated Physical Database</div>
                        <div>✓ Unlimited Projects &amp; Units</div>
                        <div>✓ AI WhatsApp &amp; Copilot</div>
                        <div>✓ Instant Cost Sheet Generator</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 5: PLATFORM SETTINGS */}
            {activeTab === 'settings' && (
              <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div className="sa-white-card" style={{ padding: 28 }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    Payment Collection Details (Shown on Renewal Paywall)
                  </h3>
                  <div style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                    Builders see these details when paying for plan renewals via UPI or NEFT.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>UPI ID (VPA)</label>
                      <input type="text" readOnly value="nivaas@icici" className="sa-white-input" style={{ width: '100%', background: '#f8fafc' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Bank Name</label>
                      <input type="text" readOnly value="ICICI Bank Ltd" className="sa-white-input" style={{ width: '100%', background: '#f8fafc' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Beneficiary Account Name</label>
                      <input type="text" readOnly value="Nivaas Real Estate Technologies" className="sa-white-input" style={{ width: '100%', background: '#f8fafc' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Account Number</label>
                      <input type="text" readOnly value="50200088991122" className="sa-white-input" style={{ width: '100%', background: '#f8fafc' }} />
                    </div>
                  </div>
                </div>

                <div className="sa-white-card" style={{ padding: 28 }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    Node &amp; Database Fleet Specifications
                  </h3>
                  <div style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Master Control Plane specifications on VPS</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    <div className="sa-white-panel" style={{ padding: 18 }}>
                      <div className="sa-white-pill sa-white-pill-ok" style={{ fontSize: 10, marginBottom: 6 }}>MASTER CATALOG</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>nivaas_master</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>PostgreSQL 16 &middot; Multi-Tenant Catalog</div>
                    </div>

                    <div className="sa-white-panel" style={{ padding: 18 }}>
                      <div className="sa-white-pill sa-white-pill-blue" style={{ fontSize: 10, marginBottom: 6 }}>ASYNC LOCAL STORAGE</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Dynamic LRU Pools</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>15-min idle sweeper &middot; Zero cross-leakage</div>
                    </div>

                    <div className="sa-white-panel" style={{ padding: 18 }}>
                      <div className="sa-white-pill sa-white-pill-ok" style={{ fontSize: 10, marginBottom: 6 }}>HOST IP &amp; PROXY</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>200.234.46.234:4100</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>Nginx Wildcard *.nivaas.space</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modal: Create Client */}
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

      {/* Lightbox: View Receipt */}
      {inspectScreenshot && (
        <div className="sa-white-scrim" onClick={() => setInspectScreenshot(null)}>
          <div className="sa-white-card" style={{ maxWidth: 840, maxHeight: '90vh', overflow: 'hidden', padding: 14 }}>
            <img src={inspectScreenshot} alt="Receipt Slip" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10 }} />
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
    <div className="sa-white-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sa-white-modal">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>
            🏢 Provision New Client Database
          </h3>
          <button className="iconbtn" onClick={onClose} style={{ border: 0, background: '#f1f5f9' }}>
            <Icon name="x" />
          </button>
        </div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🎉</div>
            <h3 style={{ fontSize: 22, color: '#1e8e3e', margin: '0 0 6px 0', fontWeight: 800 }}>Client Database Created!</h3>
            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 20px 0' }}>
              Database <b>{result.tenant.db_name}</b> was created, schema migrated, and welcome email sent.
            </p>

            <div className="sa-white-panel" style={{ padding: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, marginBottom: 24 }}>
              <div>
                <span style={{ color: '#64748b' }}>Workspace URL: </span>
                <a href={result.loginUrl} target="_blank" rel="noreferrer" style={{ color: '#1a73e8', fontWeight: 700 }}>
                  {result.loginUrl}
                </a>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Admin Email: </span>
                <b style={{ color: '#0f172a' }}>{result.tenant.admin_email}</b>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Temporary Password: </span>
                <span className="mono" style={{ background: '#fef7e0', color: '#b06000', padding: '3px 10px', borderRadius: 6, fontWeight: 800 }}>
                  {result.tempPassword}
                </span>
              </div>
            </div>

            <button className="sa-white-btn sa-white-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 13 }} onClick={() => onSuccess(result)}>
              Done &amp; Return to Clients
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 24 }}>
            {error && (
              <div style={{ background: '#fce8e6', border: '1px solid #fad2cf', color: '#d93025', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Company / Builder Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prestige Estates"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="sa-white-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Subdomain Slug *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0 14px' }}>
                  <input
                    type="text"
                    required
                    placeholder="prestige"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    style={{ flex: 1, border: 0, background: 'transparent', padding: '10px 0', fontSize: 14, fontWeight: 700, color: '#1a73e8', outline: 'none' }}
                  />
                  <span style={{ color: '#64748b', fontWeight: 600, fontSize: 13 }}>.nivaas.space</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Admin Name
                  </label>
                  <input
                    type="text"
                    placeholder="Ramesh Sharma"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="sa-white-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Admin Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@prestige.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="sa-white-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="9829012345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="sa-white-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Initial Plan
                  </label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value)}
                    className="sa-white-input"
                    style={{ width: '100%', background: '#fff' }}
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

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <button type="button" className="sa-white-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="sa-white-btn sa-white-btn-primary" disabled={submitting}>
                {submitting ? 'Creating Physical Database...' : 'Create Client ➔'}
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
    <div className="sa-white-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="sa-white-blob sa-white-blob-1" style={{ top: '-100px', right: '15%' }} />
      <div className="sa-white-blob sa-white-blob-2" style={{ bottom: '-50px', left: '10%' }} />

      <div className="sa-white-login-card">
        {/* Left Column: White Glass Showcase */}
        <div style={{
          padding: '48px 44px',
          background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.9) 100%)',
          borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Logo size={46} style={{ boxShadow: '0 4px 16px rgba(238,100,24,0.25)', borderRadius: 12 }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Nivaas</div>
                <span className="sa-white-pill sa-white-pill-blue" style={{ fontSize: 10 }}>
                  SUPER ADMIN CONTROL PLANE
                </span>
              </div>
            </div>

            <div style={{ marginTop: 40 }}>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                Multi-Tenant SaaS Fleet &amp; Physical DB Isolation.
              </h1>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                Enterprise real estate SaaS management. Dedicated PostgreSQL database per client, UPI payment verification &amp; dynamic subdomain routing across India.
              </p>
            </div>

            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, background: '#e6f4ea',
                  color: '#1e8e3e', display: 'grid', placeItems: 'center', flexShrink: 0
                }}>
                  <Icon name="shield" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <b style={{ color: '#0f172a', fontSize: 14, display: 'block' }}>Dedicated Physical Database</b>
                  <span style={{ color: '#64748b', fontSize: 13 }}>100% cryptographic &amp; data plane isolation per client.</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, background: '#e8f0fe',
                  color: '#1a73e8', display: 'grid', placeItems: 'center', flexShrink: 0
                }}>
                  <Icon name="rupee" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <b style={{ color: '#0f172a', fontSize: 14, display: 'block' }}>UPI QR &amp; 1-Click Verification</b>
                  <span style={{ color: '#64748b', fontSize: 13 }}>Inspect receipt slips and unlock tenant workspaces instantly.</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 36, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e8e3e' }} />
            <span>Node: 200.234.46.234 &middot; Active on PostgreSQL 16</span>
          </div>
        </div>

        {/* Right Column: Form */}
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: '0 0 6px 0' }}>Super Administrator</h2>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              Authenticate with your master control plane credentials.
            </p>
          </div>

          {error && (
            <div style={{ background: '#fce8e6', border: '1px solid #fad2cf', color: '#d93025', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Master Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sa-white-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Master Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sa-white-input"
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="submit"
              className="sa-white-btn sa-white-btn-primary"
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
