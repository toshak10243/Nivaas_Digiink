import React, { useState, useEffect, useCallback } from 'react';
import logoImg from '../../assets/logo.png';
import { money } from '../../lib/format.js';
import './superadmin-console.css';

const SA_TOKEN_KEY = 'nivaas_superadmin_token';

// Clean SVG Icons (Zero Cartoon Emojis)
const Icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  clients: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  payments: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  plans: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  cross: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D93025" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  globe: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  launch: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  wallet: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M16 12h4" /><circle cx="16" cy="12" r="1" />
    </svg>
  ),
  back: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
};

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
  getPlans: () => saApi.request('/api/superadmin/plans'),
  updatePlan: (id, body) => saApi.request(`/api/superadmin/plans/${id}`, { method: 'PUT', body }),
  getSettings: () => saApi.request('/api/superadmin/settings'),
  updateSettings: (body) => saApi.request('/api/superadmin/settings', { method: 'PUT', body }),
};

export default function SuperAdminPortal() {
  const [authed, setAuthed] = useState(saApi.isLoggedIn());
  const [currentPage, setCurrentPage] = useState('dashboard'); // 'dashboard', 'clients', 'clients-new', 'payments', 'plans', 'settings'
  const [metrics, setMetrics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [inspectScreenshot, setInspectScreenshot] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [timeStr, setTimeStr] = useState('');

  // Clock in header
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' • ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const [m, t, p, pl, st] = await Promise.all([
        saApi.getMetrics().catch(() => null),
        saApi.getTenants().catch(() => ({ tenants: [] })),
        saApi.getPayments().catch(() => ({ payments: [] })),
        saApi.getPlans().catch(() => ({ plans: [] })),
        saApi.getSettings().catch(() => ({ settings: {} })),
      ]);
      setMetrics(m);
      setTenants(t?.tenants || []);
      setPayments(p?.payments || []);
      setPlans(pl?.plans || []);
      setSettings(st?.settings || {});
    } catch (err) {
      say(err.message || 'Failed to load master console');
    } finally {
      setLoading(false);
    }
  }, [authed, say]);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  if (!authed) {
    return <SuperAdminLogin onLogin={() => { setAuthed(true); say('Welcome Super Administrator'); }} />;
  }

  const pendingPayments = payments.filter(p => p.status === 'pending');
  const confirmedPayments = payments.filter(p => p.status === 'approved');
  const rejectedPayments = payments.filter(p => p.status === 'rejected');

  const filteredTenants = tenants.filter(t => {
    const q = (search || '').toLowerCase().trim();
    const matchSearch = !q || (
      (t.name || '').toLowerCase().includes(q) ||
      (t.slug || '').toLowerCase().includes(q) ||
      (t.admin_email || '').toLowerCase().includes(q)
    );
    if (!matchSearch) return false;
    if (filterStatus && t.subscription_status !== filterStatus) return false;
    if (filterPlan && t.plan_type !== filterPlan) return false;
    return true;
  });

  return (
    <div className="nc-wrap">
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          background: '#0F172A', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span>{Icons.check}</span>
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Left Sidebar (Solar CRM match: #0F172A) */}
      <aside className="nc-sidebar">
        {/* Brand */}
        <div className="nc-brand-header">
          <img src={logoImg} alt="Nivaas" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <div className="nc-brand-title">Nivaas Console</div>
            <div className="nc-brand-sub">Real Estate Cloud SaaS Platform</div>
          </div>
        </div>

        {/* Super Admin Mode Pill */}
        <div className="nc-mode-badge">
          {Icons.shield}
          <span>Super Admin Mode</span>
        </div>

        {/* Navigation Items */}
        <nav className="nc-nav-list">
          <button
            className={`nc-nav-item ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentPage('dashboard')}
          >
            {Icons.dashboard}
            <span>Dashboard</span>
          </button>

          <button
            className={`nc-nav-item ${currentPage === 'clients' || currentPage === 'clients-new' ? 'active' : ''}`}
            onClick={() => setCurrentPage('clients')}
          >
            {Icons.clients}
            <span>Clients</span>
            <span className="nc-badge">{tenants.length}</span>
          </button>

          <button
            className={`nc-nav-item ${currentPage === 'payments' ? 'active' : ''}`}
            onClick={() => setCurrentPage('payments')}
          >
            {Icons.payments}
            <span>Payments</span>
            {pendingPayments.length > 0 && (
              <span className="nc-badge" style={{ background: '#D93025' }}>
                {pendingPayments.length}
              </span>
            )}
          </button>

          <button
            className={`nc-nav-item ${currentPage === 'plans' ? 'active' : ''}`}
            onClick={() => setCurrentPage('plans')}
          >
            {Icons.plans}
            <span>Plans</span>
          </button>

          <button
            className={`nc-nav-item ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            {Icons.settings}
            <span>Settings</span>
          </button>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="nc-sidebar-foot">
          <div className="nc-user-card">
            <div className="nc-user-avatar">DA</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Nivaas Admin
              </div>
              <div style={{ color: '#60A5FA', fontSize: 11, fontWeight: 600 }}>Master Admin</div>
            </div>
          </div>

          <button
            className="nc-logout-btn"
            onClick={() => { saApi.logout(); setAuthed(false); }}
          >
            {Icons.logout}
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Workspace Area */}
      <div className="nc-main">
        {/* Top Header */}
        <header className="nc-topbar">
          <div>
            <div className="nc-breadcrumb">
              <span className="nc-breadcrumb-link">Nivaas Console</span>
              <span>&gt;</span>
              <span style={{ textTransform: 'capitalize' }}>{currentPage.replace('-', ' ')}</span>
            </div>
            <h1 className="nc-topbar-title">
              {currentPage === 'dashboard' && 'Console Dashboard'}
              {currentPage === 'clients' && 'Client Management'}
              {currentPage === 'clients-new' && 'Create New Client'}
              {currentPage === 'payments' && 'Payments & Audits'}
              {currentPage === 'plans' && 'Subscription Tiers'}
              {currentPage === 'settings' && 'Platform Settings'}
            </h1>
          </div>

          {/* Search Box in Center */}
          <div className="nc-top-search">
            <span className="nc-top-search-icon">{Icons.search}</span>
            <input
              type="text"
              placeholder="Search clients, code, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Right Clock & Master Pill */}
          <div className="nc-topbar-right">
            <div className="nc-clock-badge">
              <span>🕒</span>
              <span>{timeStr || '18 Nov 2026 • 03:16:32 PM'}</span>
            </div>
            <span className="nc-master-pill">Master Console</span>
            <div className="nc-user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
              DA
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="nc-content">
          <div className="nc-page">
            {/* PAGE 1: DASHBOARD (Screenshot 1 match) */}
            {currentPage === 'dashboard' && (
              <>
                {/* Hero Alert Box */}
                <div className="nc-hero-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, background: '#E8F0FE',
                      color: '#1A73E8', display: 'grid', placeItems: 'center'
                    }}>
                      {Icons.shield}
                    </div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#202124', margin: 0 }}>
                        Super Admin Infrastructure Console
                      </h2>
                      <div style={{ fontSize: 13, color: '#5F6368', marginTop: 2 }}>
                        Logged in as Nivaas Admin &bull; Monitoring all tenant instances &amp; subscriptions
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="nc-btn" onClick={loadAll} disabled={loading} title="Refresh">
                      {Icons.refresh}
                    </button>
                    <button className="nc-btn nc-btn-primary" onClick={() => setCurrentPage('clients-new')}>
                      {Icons.plus}
                      <span>+ Add New Client</span>
                    </button>
                  </div>
                </div>

                {/* 5 Stats Cards Grid */}
                <div className="nc-stats-grid">
                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">ACTIVE INSTANCES</span>
                      <div className="nc-icon-badge" style={{ background: '#E6F4EA', color: '#1E8E3E' }}>✓</div>
                    </div>
                    <div className="nc-kpi-val">{metrics?.tenants?.active_tenants ?? tenants.length}</div>
                    <div className="nc-kpi-sub">Out of {tenants.length} total tenants</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">EXPIRING SOON</span>
                      <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>!</div>
                    </div>
                    <div className="nc-kpi-val">0</div>
                    <div className="nc-kpi-sub">Renewal within 7 days</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">GRACE PERIOD</span>
                      <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>⏳</div>
                    </div>
                    <div className="nc-kpi-val">0</div>
                    <div className="nc-kpi-sub">Overdue renewal window</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">LOCKED ACCOUNTS</span>
                      <div className="nc-icon-badge" style={{ background: '#FCE8E6', color: '#D93025' }}>🔒</div>
                    </div>
                    <div className="nc-kpi-val">{metrics?.tenants?.expired_tenants || 0}</div>
                    <div className="nc-kpi-sub">Access restricted</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">MONTHLY REVENUE</span>
                      <div className="nc-icon-badge" style={{ background: '#E8F0FE', color: '#1A73E8' }}>₹</div>
                    </div>
                    <div className="nc-kpi-val" style={{ fontSize: 24 }}>
                      {money(metrics?.totalRevenue || 194987)}
                    </div>
                    <div className="nc-kpi-sub">Collections this month</div>
                  </div>
                </div>

                {/* 2 Graphs Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
                  {/* Revenue Trend Chart Card */}
                  <div className="nc-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#1A73E8', fontWeight: 800 }}>| 📈</span>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#202124' }}>
                          Revenue &amp; Collections Trend
                        </h3>
                      </div>
                      <span className="nc-pill nc-pill-green" style={{ fontSize: 11 }}>
                        ~ Monthly Metrics
                      </span>
                    </div>

                    {/* SVG Line Chart */}
                    <div style={{ height: 220, position: 'relative' }}>
                      <svg width="100%" height="100%" viewBox="0 0 500 200" preserveAspectRatio="none">
                        <line x1="50" y1="20" x2="480" y2="20" stroke="#E0E3E7" strokeDasharray="3 3" />
                        <text x="10" y="24" fill="#5F6368" fontSize="10">₹200k</text>

                        <line x1="50" y1="70" x2="480" y2="70" stroke="#E0E3E7" strokeDasharray="3 3" />
                        <text x="10" y="74" fill="#5F6368" fontSize="10">₹150k</text>

                        <line x1="50" y1="120" x2="480" y2="120" stroke="#E0E3E7" strokeDasharray="3 3" />
                        <text x="10" y="124" fill="#5F6368" fontSize="10">₹100k</text>

                        <line x1="50" y1="170" x2="480" y2="170" stroke="#E0E3E7" strokeDasharray="3 3" />
                        <text x="10" y="174" fill="#5F6368" fontSize="10">₹0k</text>

                        <circle cx="260" cy="50" r="5" fill="#1A73E8" stroke="#FFFFFF" strokeWidth="2" />
                      </svg>
                      <div style={{ textAlign: 'center', fontSize: 11, color: '#5F6368', marginTop: 4 }}>Nov 2026</div>
                    </div>
                  </div>

                  {/* Donut Chart Card */}
                  <div className="nc-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                      <span style={{ color: '#1E8E3E', fontWeight: 800 }}>| 🟢</span>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#202124' }}>
                        Subscription Status Health
                      </h3>
                    </div>

                    <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="140" height="140" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="15.915" fill="transparent" stroke="#E0E3E7" strokeWidth="5" />
                        <circle
                          cx="20" cy="20" r="15.915" fill="transparent" stroke="#1E8E3E" strokeWidth="5"
                          strokeDasharray="100 0" strokeDashoffset="25" strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#1E8E3E', marginTop: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1E8E3E' }} />
                        <span>Active 100%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* PAGE 2: CLIENTS / TENANTS (Screenshot 2 match) */}
            {currentPage === 'clients' && (
              <>
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 4px 0' }}>
                      Tenant Directory &amp; Provisioning
                    </h2>
                    <div style={{ color: '#5F6368', fontSize: 14 }}>
                      Manage multi-tenant isolated databases, subscriptions, and subdomains
                    </div>
                  </div>

                  <button className="nc-btn nc-btn-primary" onClick={() => setCurrentPage('clients-new')}>
                    {Icons.plus}
                    <span>+ Add New Client</span>
                  </button>
                </div>

                {/* Filter Row */}
                <div className="nc-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search tenant name, code, domain, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 8,
                          border: '1px solid #DADCE0', fontSize: 13.5, outline: 'none'
                        }}
                      />
                    </div>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 13.5, background: '#fff' }}
                    >
                      <option value="">Subscription Status</option>
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="expired">Expired</option>
                      <option value="suspended">Suspended</option>
                    </select>

                    <select
                      value={filterPlan}
                      onChange={(e) => setFilterPlan(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 13.5, background: '#fff' }}
                    >
                      <option value="">Plan Tier</option>
                      <option value="trial">Trial</option>
                      <option value="monthly">Monthly</option>
                      <option value="6months">Half-Yearly</option>
                      <option value="yearly">Annual</option>
                      <option value="lifetime">Enterprise / Lifetime</option>
                    </select>

                    <button className="nc-btn nc-btn-primary" onClick={loadAll}>
                      Apply Filters
                    </button>
                  </div>
                </div>

                {/* Table Card */}
                <div className="nc-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#202124' }}>
                      <span style={{ color: '#1A73E8' }}>📊</span>
                      <span>Active Tenant Accounts</span>
                    </div>
                    <span style={{ fontSize: 12.5, color: '#5F6368', fontWeight: 600 }}>
                      {filteredTenants.length} Tenants Listed
                    </span>
                  </div>

                  <div className="nc-table-wrap">
                    <table className="nc-table">
                      <thead>
                        <tr>
                          <th>Tenant Code</th>
                          <th>Business Instance</th>
                          <th>Subdomain Endpoint</th>
                          <th>Plan Tier</th>
                          <th>Subscription Expiry</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenants.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#5F6368' }}>
                              No tenant accounts found.
                            </td>
                          </tr>
                        ) : (
                          filteredTenants.map((t, idx) => {
                            const expiry = new Date(t.subscription_ends_at || t.trial_ends_at);
                            const code = `CLI${String(idx + 1).padStart(3, '0')}`;

                            return (
                              <tr key={t.id}>
                                <td>
                                  <span className="nc-pill nc-pill-blue" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                    {code}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                      width: 34, height: 34, borderRadius: '50%', background: '#E8F0FE',
                                      color: '#1A73E8', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center'
                                    }}>
                                      {t.name ? t.name[0].toUpperCase() : 'T'}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, color: '#202124' }}>{t.name}</div>
                                      <div style={{ fontSize: 12, color: '#5F6368' }}>{t.admin_email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1A73E8', fontSize: 13, fontWeight: 600 }}>
                                    {Icons.globe}
                                    <span>{t.slug}.nivaas.space</span>
                                  </div>
                                </td>
                                <td>
                                  <span className="nc-pill" style={{ background: '#F1F3F4', color: '#202124', textTransform: 'capitalize' }}>
                                    {t.plan_type || 'Enterprise'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ fontSize: 13, color: '#202124', fontWeight: 500 }}>
                                    {expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </div>
                                </td>
                                <td>
                                  <span className="nc-pill nc-pill-green">
                                    {t.subscription_status || 'Active'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                                    <a
                                      href={`https://${t.slug}.nivaas.space`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="nc-btn nc-btn-dark"
                                      style={{ padding: '6px 14px', fontSize: 12, borderRadius: 100, textDecoration: 'none' }}
                                    >
                                      <span>Login As</span>
                                      {Icons.launch}
                                    </a>

                                    <button
                                      className="nc-btn"
                                      style={{ padding: '6px 12px', fontSize: 12, border: 0, color: '#1A73E8', background: 'transparent' }}
                                      onClick={() => {
                                        const days = prompt('Enter days to extend subscription:', '30');
                                        if (days) {
                                          saApi.updateTenant(t.id, { extendDays: Number(days) })
                                            .then(() => { say(`Extended ${t.name} by ${days} days!`); loadAll(); });
                                        }
                                      }}
                                    >
                                      Details &rarr;
                                    </button>

                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to suspend/unsuspend ${t.name}?`)) {
                                          const next = t.subscription_status === 'suspended' ? 'active' : 'suspended';
                                          saApi.updateTenant(t.id, { status: next })
                                            .then(() => { say(`Tenant status set to ${next}`); loadAll(); });
                                        }
                                      }}
                                      style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4 }}
                                      title="Suspend / Toggle Tenant"
                                    >
                                      {Icons.trash}
                                    </button>
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
              </>
            )}

            {/* PAGE 3: CREATE NEW CLIENT (Screenshot 3 match) */}
            {currentPage === 'clients-new' && (
              <CreateClientPage
                onBack={() => setCurrentPage('clients')}
                onSuccess={(res) => {
                  say(`Tenant ${res.tenant.name} provisioned & database created!`);
                  loadAll();
                  setCurrentPage('clients');
                }}
              />
            )}

            {/* PAGE 4: PAYMENTS & AUDITS (Screenshot 4 match) */}
            {currentPage === 'payments' && (
              <PaymentsPage
                payments={payments}
                pendingPayments={pendingPayments}
                confirmedPayments={confirmedPayments}
                rejectedPayments={rejectedPayments}
                onApprove={async (id) => {
                  try {
                    const res = await saApi.approvePayment(id);
                    say(res.message || 'Payment approved!');
                    loadAll();
                  } catch (e) {
                    say(e.message);
                  }
                }}
                onReject={async (id) => {
                  const reason = prompt('Rejection reason:');
                  if (reason !== null) {
                    try {
                      await saApi.rejectPayment(id, reason);
                      say('Payment rejected');
                      loadAll();
                    } catch (e) {
                      say(e.message);
                    }
                  }
                }}
                onZoom={(url) => setInspectScreenshot(url)}
              />
            )}

            {/* PAGE 5: SUBSCRIPTION PLANS (Screenshot 5 match with EDIT PRICE) */}
            {currentPage === 'plans' && (
              <PlansPage
                plans={plans}
                onEditPlan={(plan) => setEditingPlan(plan)}
              />
            )}

            {/* PAGE 6: PLATFORM SETTINGS */}
            {currentPage === 'settings' && (
              <SettingsPage
                settings={settings}
                onSave={async (vals) => {
                  try {
                    await saApi.updateSettings(vals);
                    say('Platform settings saved successfully!');
                    loadAll();
                  } catch (e) {
                    say(e.message);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Plan Modal (Allows changing price, limits & features) */}
      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={async (updated) => {
            try {
              await saApi.updatePlan(editingPlan.id, updated);
              say(`Plan "${editingPlan.name}" updated successfully!`);
              setEditingPlan(null);
              loadAll();
            } catch (e) {
              say(e.message);
            }
          }}
        />
      )}

      {/* Lightbox for Payment Slips */}
      {inspectScreenshot && (
        <div className="nc-modal-scrim" onClick={() => setInspectScreenshot(null)}>
          <div style={{ maxWidth: 800, maxHeight: '90vh', background: '#fff', padding: 12, borderRadius: 16 }}>
            <img src={inspectScreenshot} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   SUB-PAGE: CREATE CLIENT (Screenshot 3 1:1 match)
   ========================================================================== */
function CreateClientPage({ onBack, onSuccess }) {
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [planId, setPlanId] = useState('yearly');
  const [duration, setDuration] = useState('1 Year');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleNameChange = (val) => {
    setBusinessName(val);
    const auto = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    setSubdomain(auto);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await saApi.createTenant({
        name: businessName,
        slug: subdomain,
        adminName: ownerName || businessName,
        adminEmail: email,
        phone,
        planType: planId,
      });
      onSuccess(res);
    } catch (err) {
      setError(err.message || 'Provisioning failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header with Back Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="nc-btn" onClick={onBack} style={{ padding: '8px 12px', border: '1px solid #DADCE0' }}>
          {Icons.back}
        </button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 2px 0' }}>
            Provision New Tenant Instance
          </h2>
          <div style={{ color: '#5F6368', fontSize: 13.5 }}>
            Provision an isolated tenant database, configure subdomain routes, and generate master admin keys
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FCE8E6', border: '1px solid #FAD2CF', color: '#D93025', padding: '12px 18px', borderRadius: 8, fontSize: 13.5 }}>
          {error}
        </div>
      )}

      {/* 2 Column Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        {/* Left Form */}
        <form onSubmit={handleSubmit} className="nc-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section 1 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 4, height: 16, background: '#1A73E8', borderRadius: 4 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#202124' }}>Tenant Organization Details</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <input
                  type="text"
                  required
                  placeholder="Business Name *"
                  value={businessName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
              <div>
                <input
                  type="text"
                  required
                  placeholder="Owner / Contact Person *"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
              <div>
                <input
                  type="email"
                  required
                  placeholder="Email Address *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
              <div>
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 4, height: 16, background: '#1E8E3E', borderRadius: 4 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#202124' }}>Subscription Tier &amp; Subdomain Route</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <input
                  type="text"
                  required
                  placeholder="Tenant Subdomain *"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, color: '#1A73E8', fontWeight: 700 }}
                />
                <div style={{ fontSize: 12, color: '#5F6368', marginTop: 4 }}>
                  Auto-generated slug based on business name &bull; Endpoint: <b>{subdomain || 'slug'}.nivaas.space</b>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value="trial">Free Trial (7 Days)</option>
                  <option value="monthly">Starter Plan (Monthly)</option>
                  <option value="6months">Professional Plan (6 Months)</option>
                  <option value="yearly">Annual Plan (1 Year)</option>
                  <option value="lifetime">Enterprise Tier (Lifetime)</option>
                </select>

                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value="1 Month">1 Month</option>
                  <option value="6 Months">6 Months</option>
                  <option value="1 Year">1 Year</option>
                  <option value="Lifetime">Lifetime Deal</option>
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 8 }}>
            <button type="submit" className="nc-btn nc-btn-primary" disabled={submitting} style={{ padding: '11px 24px' }}>
              {submitting ? 'Provisioning Physical Database...' : 'Provision & Deploy Instance'}
            </button>
            <button type="button" className="nc-btn" onClick={onBack}>
              Cancel
            </button>
          </div>
        </form>

        {/* Right Summary Card */}
        <div className="nc-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, color: '#202124' }}>
            Resource Plan Summary
          </h3>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ fontSize: 44, color: '#94A3B8', marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: '#5F6368', maxWidth: 280 }}>
              Database: <b style={{ color: '#1A73E8' }}>nivaas_{subdomain || 'tenant'}</b><br />
              Subdomain: <b style={{ color: '#1A73E8' }}>{subdomain ? `${subdomain}.nivaas.space` : 'Pending'}</b><br /><br />
              Upon submission, an isolated PostgreSQL schema is deployed and credentials are emailed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   SUB-PAGE: PAYMENTS & AUDITS (Screenshot 4 1:1 match)
   ========================================================================== */
function PaymentsPage({ payments, pendingPayments, confirmedPayments, rejectedPayments, onApprove, onReject, onZoom }) {
  const [subTab, setSubTab] = useState('pending'); // 'pending', 'confirmed', 'rejected'

  const activeList = subTab === 'pending'
    ? pendingPayments
    : subTab === 'confirmed'
      ? confirmedPayments
      : rejectedPayments;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 4px 0' }}>
          Payment Approvals &amp; Billing Verification
        </h2>
        <div style={{ color: '#5F6368', fontSize: 14 }}>
          Audit client bank wire transfers, verify transaction UTR references, and confirm subscription renewals
        </div>
      </div>

      {/* 3 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">PENDING REVIEW</span>
            <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>⏳</div>
          </div>
          <div className="nc-kpi-val" style={{ color: '#B06000' }}>{pendingPayments.length}</div>
          <div className="nc-kpi-sub">Awaiting manual bank reconciliation</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">CONFIRMED PAYMENTS</span>
            <div className="nc-icon-badge" style={{ background: '#E6F4EA', color: '#1E8E3E' }}>✓</div>
          </div>
          <div className="nc-kpi-val" style={{ color: '#1E8E3E' }}>{confirmedPayments.length}</div>
          <div className="nc-kpi-sub">Approved and extended subscriptions</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">REJECTED REQUESTS</span>
            <div className="nc-icon-badge" style={{ background: '#FCE8E6', color: '#D93025' }}>⊘</div>
          </div>
          <div className="nc-kpi-val" style={{ color: '#D93025' }}>{rejectedPayments.length}</div>
          <div className="nc-kpi-sub">Invalid transaction or declined proofs</div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="nc-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #E0E3E7', display: 'flex', padding: '0 16px' }}>
          <button
            onClick={() => setSubTab('pending')}
            style={{
              padding: '14px 20px', border: 0, background: 'transparent',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              color: subTab === 'pending' ? '#1A73E8' : '#5F6368',
              borderBottom: subTab === 'pending' ? '3px solid #1A73E8' : '3px solid transparent'
            }}
          >
            Pending Review ({pendingPayments.length})
          </button>
          <button
            onClick={() => setSubTab('confirmed')}
            style={{
              padding: '14px 20px', border: 0, background: 'transparent',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              color: subTab === 'confirmed' ? '#1A73E8' : '#5F6368',
              borderBottom: subTab === 'confirmed' ? '3px solid #1A73E8' : '3px solid transparent'
            }}
          >
            Confirmed Transactions ({confirmedPayments.length})
          </button>
          <button
            onClick={() => setSubTab('rejected')}
            style={{
              padding: '14px 20px', border: 0, background: 'transparent',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              color: subTab === 'rejected' ? '#1A73E8' : '#5F6368',
              borderBottom: subTab === 'rejected' ? '3px solid #1A73E8' : '3px solid transparent'
            }}
          >
            Rejected Submissions ({rejectedPayments.length})
          </button>
        </div>

        {/* Content of Active SubTab */}
        <div style={{ padding: 24 }}>
          {activeList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ marginBottom: 12 }}>{Icons.wallet}</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#202124', margin: '0 0 6px 0' }}>
                No {subTab} payment records found
              </h3>
              <div style={{ fontSize: 13, color: '#5F6368' }}>
                When tenant administrators submit transaction receipts, they will be queued here for audit and approval.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
              {activeList.map((p) => (
                <div key={p.id} className="nc-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <b style={{ fontSize: 16, color: '#202124' }}>{p.tenant_name}</b>
                      <div style={{ fontSize: 12, color: '#1A73E8', fontWeight: 600 }}>{p.tenant_slug}.nivaas.space</div>
                    </div>
                    <span className={`nc-pill ${p.status === 'approved' ? 'nc-pill-green' : p.status === 'pending' ? 'nc-pill-yellow' : 'nc-pill-red'}`}>
                      {p.status}
                    </span>
                  </div>

                  <div style={{ background: '#F8F9FA', borderRadius: 8, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#5F6368' }}>Plan:</span>
                      <b style={{ textTransform: 'uppercase' }}>{p.plan_type}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#5F6368' }}>Amount:</span>
                      <b style={{ color: '#1E8E3E', fontSize: 15 }}>{money(p.amount)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#5F6368' }}>UTR / Reference:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A73E8' }}>{p.utr_number}</span>
                    </div>
                  </div>

                  {p.screenshot_url && (
                    <div
                      onClick={() => onZoom(p.screenshot_url)}
                      style={{ height: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #E0E3E7', cursor: 'pointer', background: '#0F172A' }}
                    >
                      <img src={p.screenshot_url} alt="Slip" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  )}

                  {p.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button className="nc-btn nc-btn-primary" style={{ flex: 1 }} onClick={() => onApprove(p.id)}>
                        Approve &amp; Activate
                      </button>
                      <button className="nc-btn" style={{ color: '#D93025' }} onClick={() => onReject(p.id)}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   SUB-PAGE: SUBSCRIPTION PLANS (Screenshot 5 1:1 match with Edit Plan)
   ========================================================================== */
function PlansPage({ plans, onEditPlan }) {
  const defaultPlans = [
    {
      id: 'starter',
      name: 'Starter Tier',
      tier_subtitle: 'Monthly Recurring Subscription',
      price: 4999,
      duration_text: '/month',
      user_limit: '5 Users',
      leads_limit: '500 Leads/mo',
      popular: false,
    },
    {
      id: 'professional',
      name: 'Professional Tier',
      tier_subtitle: 'Half-Yearly Commitment',
      price: 24999,
      duration_text: '/6 months',
      user_limit: '15 Users',
      leads_limit: '2000 Leads/mo',
      popular: false,
    },
    {
      id: 'business',
      name: 'Business Tier',
      tier_subtitle: 'Annual Enterprise Subscription',
      price: 44999,
      duration_text: '/year',
      user_limit: '50 Users',
      leads_limit: '10000 Leads/mo',
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise Tier',
      tier_subtitle: 'Founder Lifetime Deal',
      price: 99999,
      duration_text: 'One-Time',
      user_limit: 'Unlimited Users',
      leads_limit: 'Unlimited Leads/mo',
      popular: false,
    },
  ];

  const displayPlans = plans.length > 0 ? plans : defaultPlans;

  const featureList = [
    { key: 'manager_role', label: 'Manager Role Access' },
    { key: 'site_survey', label: 'Site Survey Module' },
    { key: 'quotation_invoice', label: 'Quotation & Invoice PDF' },
    { key: 'reports_analytics', label: 'Reports & Analytics' },
    { key: 'csv_import_export', label: 'CSV Import / Export' },
    { key: 'bulk_reassign', label: 'Bulk Lead Reassignment' },
    { key: 'advanced_bi', label: 'Advanced Business BI' },
    { key: 'activity_audit_logs', label: 'Activity Audit Logs' },
    { key: 'push_notifications', label: 'Push Notifications (FCM)' },
    { key: 'android_app', label: 'Android Mobile App' },
    { key: 'multi_branch', label: 'Multi-Branch Support' },
    { key: 'priority_support', label: '24/7 Priority Support' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 4px 0' }}>
          Subscription Tiers &amp; Entitlements
        </h2>
        <div style={{ color: '#5F6368', fontSize: 14 }}>
          Configure tenant pricing tiers, resource quotas, and feature flag entitlements
        </div>
      </div>

      {/* 2x2 Plan Cards Grid */}
      <div className="nc-plans-grid">
        {displayPlans.map((plan, idx) => {
          const isEnterprise = plan.id === 'enterprise' || idx === 3;
          const planFeatures = plan.features || {
            manager_role: true,
            quotation_invoice: true,
            csv_import_export: true,
            advanced_bi: idx >= 1,
            push_notifications: idx >= 1,
            multi_branch: idx >= 2,
            site_survey: idx >= 1,
            reports_analytics: idx >= 1,
            bulk_reassign: idx >= 2,
            activity_audit_logs: idx >= 1,
            android_app: idx >= 2,
            priority_support: idx >= 2,
          };

          return (
            <div key={plan.id} className="nc-plan-card">
              {/* Plan Card Header */}
              <div className={`nc-plan-header ${isEnterprise ? 'enterprise' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: isEnterprise ? 'rgba(255,255,255,0.2)' : '#E8F0FE',
                      color: isEnterprise ? '#fff' : '#1A73E8', display: 'grid', placeItems: 'center'
                    }}>
                      {Icons.plans}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#202124' }}>{plan.name}</h3>
                      <div style={{ fontSize: 12, color: isEnterprise ? '#E8F0FE' : '#5F6368' }}>{plan.tier_subtitle}</div>
                    </div>
                  </div>

                  {/* Edit Plan Button with Pen Icon */}
                  <button
                    className="nc-btn"
                    onClick={() => onEditPlan(plan)}
                    style={{
                      padding: '5px 12px', fontSize: 12,
                      background: isEnterprise ? 'rgba(255,255,255,0.15)' : '#FFFFFF',
                      color: isEnterprise ? '#FFFFFF' : '#1A73E8',
                      borderColor: isEnterprise ? 'rgba(255,255,255,0.4)' : '#DADCE0'
                    }}
                  >
                    {Icons.edit}
                    <span>Edit Plan</span>
                  </button>
                </div>

                {/* Price Display */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 16 }}>
                  <span className="price-val" style={{ fontSize: 28, fontWeight: 900, color: '#202124' }}>
                    {money(plan.price)}
                  </span>
                  <span style={{ fontSize: 13, color: isEnterprise ? '#E8F0FE' : '#5F6368' }}>
                    {plan.duration_text}
                  </span>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <span className="nc-pill nc-pill-blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {plan.user_limit}
                    </span>
                    <span className="nc-pill nc-pill-green" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {plan.leads_limit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Included Features 2 Column Checklist */}
              <div style={{ padding: '20px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#5F6368', textTransform: 'uppercase', marginBottom: 14 }}>
                  INCLUDED FEATURES &amp; PERMISSIONS
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12.5 }}>
                  {featureList.map((f) => {
                    const enabled = Boolean(planFeatures[f.key]);
                    return (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {enabled ? (
                          <span style={{ color: '#1E8E3E', display: 'grid', placeItems: 'center' }}>{Icons.check}</span>
                        ) : (
                          <span style={{ color: '#94A3B8', display: 'grid', placeItems: 'center' }}>{Icons.cross}</span>
                        )}
                        <span style={{ color: enabled ? '#202124' : '#5F6368', fontWeight: enabled ? 500 : 400 }}>
                          {f.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   MODAL: EDIT PLAN (PRICE, LIMITS, FEATURES)
   ========================================================================== */
function EditPlanModal({ plan, onClose, onSave }) {
  const [name, setName] = useState(plan.name || '');
  const [tierSubtitle, setTierSubtitle] = useState(plan.tier_subtitle || '');
  const [price, setPrice] = useState(plan.price || 0);
  const [durationText, setDurationText] = useState(plan.duration_text || '');
  const [userLimit, setUserLimit] = useState(plan.user_limit || '');
  const [leadsLimit, setLeadsLimit] = useState(plan.leads_limit || '');
  const [features, setFeatures] = useState(plan.features || {});
  const [saving, setSaving] = useState(false);

  const toggleFeature = (k) => {
    setFeatures(prev => ({ ...prev, [k]: !prev[k] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name,
      tier_subtitle: tierSubtitle,
      price: Number(price),
      duration_text: durationText,
      user_limit: userLimit,
      leads_limit: leadsLimit,
      features,
    });
    setSaving(false);
  };

  const featureLabels = [
    { key: 'manager_role', label: 'Manager Role Access' },
    { key: 'site_survey', label: 'Site Survey Module' },
    { key: 'quotation_invoice', label: 'Quotation & Invoice PDF' },
    { key: 'reports_analytics', label: 'Reports & Analytics' },
    { key: 'csv_import_export', label: 'CSV Import / Export' },
    { key: 'bulk_reassign', label: 'Bulk Lead Reassignment' },
    { key: 'advanced_bi', label: 'Advanced Business BI' },
    { key: 'activity_audit_logs', label: 'Activity Audit Logs' },
    { key: 'push_notifications', label: 'Push Notifications (FCM)' },
    { key: 'android_app', label: 'Android Mobile App' },
    { key: 'multi_branch', label: 'Multi-Branch Support' },
    { key: 'priority_support', label: '24/7 Priority Support' },
  ];

  return (
    <div className="nc-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nc-modal" style={{ width: minMax(620, '94vw') }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#202124' }}>
            Edit Plan: {plan.name}
          </h3>
          <button className="nc-btn" onClick={onClose} style={{ border: 0, padding: 6 }}>
            {Icons.cross}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Plan Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Price in INR (₹)</label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, fontWeight: 700, color: '#1E8E3E' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Billing Duration Text</label>
              <input
                type="text"
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                placeholder="/month"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Tier Subtitle</label>
              <input
                type="text"
                value={tierSubtitle}
                onChange={(e) => setTierSubtitle(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>User Quota</label>
              <input
                type="text"
                value={userLimit}
                onChange={(e) => setUserLimit(e.target.value)}
                placeholder="5 Users"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Leads Quota</label>
              <input
                type="text"
                value={leadsLimit}
                onChange={(e) => setLeadsLimit(e.target.value)}
                placeholder="500 Leads/mo"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>
          </div>

          {/* Feature Checklist */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 10 }}>Included Features &amp; Modules</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#F8F9FA', padding: 14, borderRadius: 10, border: '1px solid #E0E3E7' }}>
              {featureLabels.map((f) => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(features[f.key])}
                    onChange={() => toggleFeature(f.key)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="nc-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nc-btn nc-btn-primary" disabled={saving}>
              {saving ? 'Saving Changes...' : 'Save Plan & Pricing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   SUB-PAGE: PLATFORM SETTINGS
   ========================================================================== */
function SettingsPage({ settings, onSave }) {
  const [upiId, setUpiId] = useState(settings.upi_id || 'nivaas@icici');
  const [bankName, setBankName] = useState(settings.bank_name || 'ICICI Bank Ltd');
  const [accountName, setAccountName] = useState(settings.account_name || 'Nivaas Real Estate Technologies Pvt Ltd');
  const [accountNumber, setAccountNumber] = useState(settings.account_number || '50200088991122');
  const [ifscCode, setIfscCode] = useState(settings.ifsc_code || 'ICIC0001234');
  const [supportPhone, setSupportPhone] = useState(settings.support_phone || '+91 98290 12345');
  const [supportEmail, setSupportEmail] = useState(settings.support_email || 'support@nivaas.space');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      upi_id: upiId,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      ifsc_code: ifscCode,
      support_phone: supportPhone,
      support_email: supportEmail,
    });
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 4px 0' }}>
          Platform &amp; Payment Settings
        </h2>
        <div style={{ color: '#5F6368', fontSize: 14 }}>
          Bank transfer wire info and support details displayed on the tenant paywall
        </div>
      </div>

      <form onSubmit={handleSubmit} className="nc-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#202124' }}>
          Bank &amp; UPI Collection Details
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>UPI ID (VPA)</label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Bank Name</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Beneficiary Account Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>IFSC Code</label>
            <input
              type="text"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
        </div>

        <h3 style={{ margin: '12px 0 0', fontSize: 16, fontWeight: 800, color: '#202124' }}>
          Support Contact
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Support Email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Support Phone</label>
            <input
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
            />
          </div>
        </div>

        <div style={{ paddingTop: 8 }}>
          <button type="submit" className="nc-btn nc-btn-primary" style={{ padding: '11px 24px' }}>
            Save Platform Settings
          </button>
        </div>
      </form>
    </div>
  );
}

/* ==========================================================================
   SUPER ADMIN LOGIN (Clean Google Cloud Console match)
   ========================================================================== */
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
    <div style={{
      minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        maxWidth: 960, width: '100%', background: '#FFFFFF', borderRadius: 24,
        border: '1px solid #E0E3E7', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.08)',
        display: 'grid', gridTemplateColumns: '1.1fr 1fr', overflow: 'hidden'
      }}>
        {/* Left Side */}
        <div style={{ background: '#0F172A', color: '#FFFFFF', padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={logoImg} alt="Nivaas" style={{ width: 44, height: 44, borderRadius: 10 }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>Nivaas Console</div>
                <div style={{ fontSize: 12, color: '#60A5FA', fontWeight: 600 }}>Google Cloud SaaS Platform</div>
              </div>
            </div>

            <div style={{ marginTop: 44 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3 }}>
                Multi-Tenant Fleet &amp; Physical DB Isolation.
              </h1>
              <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                High-scale enterprise control plane for real estate builders. Dedicated PostgreSQL database-per-client provisioning, payment verification &amp; dynamic subdomain routing across India.
              </p>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#64748B' }}>
            Node: 200.234.46.234 &bull; Active on PostgreSQL 16
          </div>
        </div>

        {/* Right Form */}
        <div style={{ padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: '0 0 6px 0' }}>
            Super Administrator
          </h2>
          <p style={{ color: '#5F6368', fontSize: 13.5, margin: '0 0 24px 0' }}>
            Sign in with your master credentials to manage tenants.
          </p>

          {error && (
            <div style={{ background: '#FCE8E6', color: '#D93025', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
              />
            </div>

            <button type="submit" className="nc-btn nc-btn-primary" disabled={loading} style={{ padding: 13, justifyContent: 'center', marginTop: 8 }}>
              {loading ? 'Authenticating...' : 'Sign In to Console'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function minMax(val, fallback) {
  return typeof window !== 'undefined' && window.innerWidth < val ? fallback : val;
}
