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
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  alert: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  hourglass: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 22h14" /><path d="M5 2h14" /><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  rupee: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" /><path d="M6 8h12" /><path d="M6 13l8.5 8" /><path d="M6 13h3a4 4 0 0 0 0-8" />
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  donut: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
    </svg>
  ),
  grid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  filter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  ribbon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  building: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  ),
  laptop: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  key: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7M2 13a6 6 0 1 0 12 0 6 6 0 0 0-12 0z" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  database: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  calendar: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
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
  getTenant: (id) => saApi.request(`/api/superadmin/tenants/${id}`),
  createTenant: (body) => saApi.request('/api/superadmin/tenants', { method: 'POST', body }),
  updateTenant: (id, body) => saApi.request(`/api/superadmin/tenants/${id}`, { method: 'PATCH', body }),
  deleteTenant: (id) => saApi.request(`/api/superadmin/tenants/${id}`, { method: 'DELETE' }),
  resetPassword: (id) => saApi.request(`/api/superadmin/tenants/${id}/reset-password`, { method: 'POST' }),
  renewTenant: (id, body) => saApi.request(`/api/superadmin/tenants/${id}/renew`, { method: 'POST', body }),
  getPayments: (status) => saApi.request(`/api/superadmin/payments${status ? `?status=${status}` : ''}`),
  approvePayment: (id) => saApi.request(`/api/superadmin/payments/${id}/approve`, { method: 'POST' }),
  rejectPayment: (id, notes) => saApi.request(`/api/superadmin/payments/${id}/reject`, { method: 'POST', body: { notes } }),
  getPlans: () => saApi.request('/api/superadmin/plans'),
  updatePlan: (id, body) => saApi.request(`/api/superadmin/plans/${id}`, { method: 'PUT', body }),
  getSettings: () => saApi.request('/api/superadmin/settings'),
  updateSettings: (body) => saApi.request('/api/superadmin/settings', { method: 'PUT', body }),
};

const getRouteFromHash = () => {
  const raw = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
  const parts = raw.split('/');
  if (parts[0] === 'clients' && parts[1] === 'new') return { page: 'clients-new', id: null };
  if (parts[0] === 'clients' && parts[1]) return { page: 'client-detail', id: parts[1] };
  if (['dashboard', 'clients', 'payments', 'plans', 'settings'].includes(parts[0])) return { page: parts[0], id: null };
  return { page: 'dashboard', id: null };
};

export default function SuperAdminPortal() {
  const [authed, setAuthed] = useState(saApi.isLoggedIn());
  const [routeState, setRouteState] = useState(getRouteFromHash);
  const currentPage = routeState.page;
  const currentTenantId = routeState.id;

  const setCurrentPage = useCallback((page, id = null) => {
    setRouteState({ page, id });
    if (page === 'clients-new') {
      window.location.hash = '#/clients/new';
    } else if (page === 'client-detail' && id) {
      window.location.hash = `#/clients/${id}`;
    } else {
      window.location.hash = `#/${page}`;
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRouteState(getRouteFromHash());
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/dashboard';
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
              <span className="nc-breadcrumb-link" onClick={() => setCurrentPage('dashboard')} style={{ cursor: 'pointer' }}>Nivaas Console</span>
              <span>&gt;</span>
              {currentPage === 'client-detail' ? (
                <>
                  <span className="nc-breadcrumb-link" onClick={() => setCurrentPage('clients')} style={{ cursor: 'pointer' }}>Clients</span>
                  <span>&gt;</span>
                  <span>Tenant Details</span>
                </>
              ) : (
                <span style={{ textTransform: 'capitalize' }}>{currentPage.replace('-', ' ')}</span>
              )}
            </div>
            <h1 className="nc-topbar-title">
              {currentPage === 'dashboard' && 'Console Dashboard'}
              {currentPage === 'clients' && 'Client Management'}
              {currentPage === 'clients-new' && 'Create New Client'}
              {currentPage === 'client-detail' && 'Tenant Details & Infrastructure'}
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
              <span style={{ display: 'flex', color: '#5F6368' }}>{Icons.clock}</span>
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
                      <div className="nc-icon-badge" style={{ background: '#E6F4EA', color: '#1E8E3E' }}>
                        {Icons.check}
                      </div>
                    </div>
                    <div className="nc-kpi-val">{metrics?.tenants?.active_tenants ?? tenants.length}</div>
                    <div className="nc-kpi-sub">Out of {tenants.length} total tenants</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">EXPIRING SOON</span>
                      <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>
                        {Icons.alert}
                      </div>
                    </div>
                    <div className="nc-kpi-val">0</div>
                    <div className="nc-kpi-sub">Renewal within 7 days</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">GRACE PERIOD</span>
                      <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>
                        {Icons.hourglass}
                      </div>
                    </div>
                    <div className="nc-kpi-val">0</div>
                    <div className="nc-kpi-sub">Overdue renewal window</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">LOCKED ACCOUNTS</span>
                      <div className="nc-icon-badge" style={{ background: '#FCE8E6', color: '#D93025' }}>
                        {Icons.lock}
                      </div>
                    </div>
                    <div className="nc-kpi-val">{metrics?.tenants?.expired_tenants || 0}</div>
                    <div className="nc-kpi-sub">Access restricted</div>
                  </div>

                  <div className="nc-kpi-card">
                    <div className="nc-kpi-header">
                      <span className="nc-kpi-label">MONTHLY REVENUE</span>
                      <div className="nc-icon-badge" style={{ background: '#E8F0FE', color: '#1A73E8' }}>
                        {Icons.rupee}
                      </div>
                    </div>
                    <div className="nc-kpi-val" style={{ fontSize: 24 }}>
                      {money(metrics?.totalRevenue || 194987)}
                    </div>
                    <div className="nc-kpi-sub">Collections this month</div>
                  </div>
                </div>

                {/* 2 Graphs Row */}
                <div className="nc-charts-grid">
                  {/* Revenue Trend Chart Card */}
                  <div className="nc-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 4, height: 16, background: '#1A73E8', borderRadius: 2 }} />
                        <span style={{ color: '#1A73E8', display: 'flex' }}>{Icons.chart}</span>
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
                      <div style={{ width: 4, height: 16, background: '#1E8E3E', borderRadius: 2 }} />
                      <span style={{ color: '#1E8E3E', display: 'flex' }}>{Icons.donut}</span>
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

                    <button className="nc-btn nc-btn-primary" onClick={loadAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {Icons.filter}
                      <span>Apply Filters</span>
                    </button>
                  </div>
                </div>

                {/* Table Card */}
                <div className="nc-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#202124' }}>
                      <span style={{ color: '#1A73E8', display: 'flex' }}>{Icons.grid}</span>
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
                                      style={{ padding: '6px 12px', fontSize: 12, border: 0, color: '#1A73E8', background: 'transparent', fontWeight: 700 }}
                                      onClick={() => setCurrentPage('client-detail', t.id)}
                                    >
                                      Details &rarr;
                                    </button>

                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to permanently delete tenant "${t.name}" and its isolated database?`)) {
                                          saApi.deleteTenant(t.id)
                                            .then(() => { say(`Tenant "${t.name}" deleted successfully.`); loadAll(); })
                                            .catch((e) => say(e.message));
                                        }
                                      }}
                                      style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4 }}
                                      title="Delete Tenant"
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

            {/* PAGE 3B: CLIENT DETAIL VIEW (Screenshot / ClientDetail.jsx 1:1 match) */}
            {currentPage === 'client-detail' && (
              <ClientDetailPage
                tenantId={currentTenantId}
                plans={plans}
                onBack={() => setCurrentPage('clients')}
                say={say}
                onTenantUpdated={loadAll}
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
  const [planId, setPlanId] = useState('starter');
  const [duration, setDuration] = useState('1 Month');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdTenant, setCreatedTenant] = useState(null);
  const [copied, setCopied] = useState(false);

  const handlePlanChange = (val) => {
    setPlanId(val);
    if (val === 'starter') setDuration('1 Month');
    else if (val === 'professional') setDuration('6 Months');
    else if (val === 'business') setDuration('1 Year');
    else if (val === 'enterprise') setDuration('Lifetime');
    else if (val === 'trial') setDuration('7 Days');
  };

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
      const durationDaysMap = {
        '7 Days': 7,
        '1 Month': 30,
        '3 Months': 90,
        '6 Months': 180,
        '1 Year': 365,
        'Lifetime': 3650,
      };
      const durationDays = durationDaysMap[duration] || 30;

      const res = await saApi.createTenant({
        name: businessName,
        slug: subdomain,
        adminName: ownerName || businessName,
        adminEmail: email,
        phone,
        planType: planId,
        durationDays,
      });

      setCreatedTenant({
        ...res,
        businessName,
        subdomain,
        email,
        planId,
        duration,
      });
    } catch (err) {
      setError(err.message || 'Provisioning failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTenant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 840, margin: '0 auto' }}>
        <div className="nc-card" style={{ padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#E6F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#137333' }}>
              {Icons.check}
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: 0 }}>
                Tenant Instance Successfully Deployed!
              </h2>
              <div style={{ fontSize: 14, color: '#5F6368', marginTop: 3 }}>
                Physical PostgreSQL database isolated &amp; initial admin user registered
              </div>
            </div>
          </div>

          <div style={{ background: '#F8F9FA', borderRadius: 12, padding: 20, border: '1px solid #E8EAED', marginBottom: 24 }}>
            <div className="nc-detail-row">
              <span className="nc-detail-label">Client Name</span>
              <span className="nc-detail-val" style={{ fontWeight: 700 }}>{createdTenant.businessName}</span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">Tenant Subdomain</span>
              <span className="nc-detail-val">
                <a
                  href={`https://${createdTenant.subdomain}.nivaas.space`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#1A73E8', fontWeight: 700, textDecoration: 'none' }}
                >
                  https://{createdTenant.subdomain}.nivaas.space &rarr;
                </a>
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">Isolated Database</span>
              <span className="nc-detail-val" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#137333' }}>
                nivaas_{createdTenant.subdomain}
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">Subscription Tier</span>
              <span className="nc-detail-val" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                {createdTenant.planId} ({createdTenant.duration})
              </span>
            </div>
          </div>

          {/* Master Admin One-Time Credentials */}
          <div style={{ border: '2px dashed #1A73E8', background: '#F1F3F4', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A73E8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Client Admin One-Time Credentials
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#5F6368', display: 'block', marginBottom: 4 }}>Admin Email</label>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontWeight: 600, fontSize: 14 }}>
                  {createdTenant.email}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#5F6368', display: 'block', marginBottom: 4 }}>Temporary Password</label>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#D93025' }}>
                  {createdTenant.tempPassword || 'Auto-generated'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="nc-btn"
                style={{ background: '#fff', border: '1px solid #DADCE0', padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  navigator.clipboard.writeText(`URL: https://${createdTenant.subdomain}.nivaas.space\nEmail: ${createdTenant.email}\nPassword: ${createdTenant.tempPassword}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}
              >
                {Icons.copy}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="nc-btn nc-btn-primary"
                onClick={() => {
                  onSuccess(createdTenant);
                }}
              >
                Go to Client Directory &rarr;
              </button>
              <button
                type="button"
                className="nc-btn"
                style={{ border: '1px solid #DADCE0' }}
                onClick={() => {
                  setCreatedTenant(null);
                  setBusinessName('');
                  setOwnerName('');
                  setEmail('');
                  setPhone('');
                  setCity('');
                  setState('');
                  setSubdomain('');
                  setPlanId('starter');
                  setDuration('1 Month');
                }}
              >
                + Create Another Client
              </button>
            </div>

            <a
              href={`https://${createdTenant.subdomain}.nivaas.space`}
              target="_blank"
              rel="noreferrer"
              className="nc-btn nc-btn-dark"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>Launch Client CRM App</span>
              {Icons.launch}
            </a>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="nc-create-client-grid">
        {/* Left Form */}
        <form onSubmit={handleSubmit} className="nc-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section 1 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 4, height: 16, background: '#1A73E8', borderRadius: 4 }} />
              <span style={{ color: '#1A73E8', display: 'flex' }}>{Icons.building}</span>
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
              <span style={{ color: '#1E8E3E', display: 'flex' }}>{Icons.laptop}</span>
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
                  onChange={(e) => handlePlanChange(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value="starter">Starter Tier (Monthly - ₹2,999)</option>
                  <option value="professional">Professional Tier (6 Months - ₹24,999)</option>
                  <option value="business">Business Tier (1 Year - ₹44,999)</option>
                  <option value="enterprise">Enterprise Tier (Lifetime - ₹99,999)</option>
                  <option value="trial">Free Trial (7 Days)</option>
                </select>

                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value="7 Days">7 Days Trial</option>
                  <option value="1 Month">1 Month</option>
                  <option value="3 Months">3 Months</option>
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
            <div style={{ marginBottom: 12, color: '#94A3B8' }}>{Icons.laptop}</div>
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
            <div className="nc-icon-badge" style={{ background: '#FEF7E0', color: '#B06000' }}>
              {Icons.hourglass}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ color: '#B06000' }}>{pendingPayments.length}</div>
          <div className="nc-kpi-sub">Awaiting manual bank reconciliation</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">CONFIRMED PAYMENTS</span>
            <div className="nc-icon-badge" style={{ background: '#E6F4EA', color: '#1E8E3E' }}>
              {Icons.check}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ color: '#1E8E3E' }}>{confirmedPayments.length}</div>
          <div className="nc-kpi-sub">Approved and extended subscriptions</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">REJECTED REQUESTS</span>
            <div className="nc-icon-badge" style={{ background: '#FCE8E6', color: '#D93025' }}>
              {Icons.cross}
            </div>
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
   SUB-PAGE: CLIENT DETAIL VIEW (Matches ClientDetail.jsx from digiink_admin)
   ========================================================================== */
function ClientDetailPage({ tenantId, plans, onBack, say, onTenantUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Renew Dialog
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewPlan, setRenewPlan] = useState('monthly');
  const [renewDurationDays, setRenewDurationDays] = useState(30);
  const [renewAmount, setRenewAmount] = useState('');
  const [renewNotes, setRenewNotes] = useState('');

  // Hard Reset Password Dialog
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchClient = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await saApi.getTenant(tenantId);
      setData(res);
      if (res?.tenant) {
        setRenewPlan(res.tenant.plan_type || 'monthly');
      }
    } catch (err) {
      setError(err.message || 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const handleHardResetPassword = async () => {
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await saApi.resetPassword(tenantId);
      if (res.success && res.data) {
        setResetResult(res.data);
        setSuccess(`Password successfully reset for ${res.data.businessName}.`);
      }
    } catch (err) {
      setError(err.message || 'Failed to reset client admin password.');
    } finally {
      setResetLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleRenew = async (e) => {
    e.preventDefault();
    setRenewLoading(true);
    setError('');
    setSuccess('');
    try {
      await saApi.renewTenant(tenantId, {
        plan_type: renewPlan,
        duration_days: renewDurationDays,
        amount_paid: renewAmount ? Number(renewAmount) : 0,
        notes: renewNotes,
      });
      setSuccess('Client subscription renewed & extended successfully!');
      setRenewOpen(false);
      fetchClient();
      if (onTenantUpdated) onTenantUpdated();
    } catch (err) {
      setError(err.message || 'Renewal failed.');
    } finally {
      setRenewLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    const t = data?.tenant;
    if (!t) return;
    const nextStatus = t.subscription_status === 'suspended' ? 'active' : 'suspended';
    if (!window.confirm(`Are you sure you want to ${nextStatus === 'active' ? 'activate' : 'suspend'} this client instance?`)) return;
    try {
      await saApi.updateTenant(tenantId, { status: nextStatus });
      setSuccess(`Tenant marked as ${nextStatus}.`);
      fetchClient();
      if (onTenantUpdated) onTenantUpdated();
    } catch (err) {
      setError(err.message || 'Status update failed.');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', color: '#5F6368' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E8F0FE', borderTopColor: '#1A73E8', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
        <div>Loading tenant details...</div>
      </div>
    );
  }

  const tenant = data?.tenant;
  const payments = data?.payments || [];
  if (!tenant) {
    return (
      <div className="nc-card" style={{ textAlign: 'center', padding: 48 }}>
        <h3 style={{ color: '#D93025' }}>Tenant Not Found</h3>
        <button className="nc-btn" onClick={onBack} style={{ marginTop: 16 }}>Back to Clients</button>
      </div>
    );
  }

  const end = new Date(tenant.subscription_ends_at || tenant.trial_ends_at);
  const now = new Date();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  const isExpired = diffDays <= 0;
  const isExpiringSoon = diffDays > 0 && diffDays <= 7;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Top Google Cloud Console Hero Banner */}
      <div className="nc-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          {/* Left Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={onBack}
              className="nc-btn"
              style={{ width: 42, height: 42, padding: 0, borderRadius: '50%', display: 'grid', placeItems: 'center' }}
              title="Back to Clients"
            >
              {Icons.back}
            </button>

            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: '#E8F0FE',
              color: '#1A73E8', fontSize: 20, fontWeight: 800, display: 'grid', placeItems: 'center',
              border: '1px solid #D2E3FC'
            }}>
              {tenant.name ? tenant.name[0].toUpperCase() : 'T'}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#202124', margin: 0 }}>
                  {tenant.name}
                </h2>
                <span className="nc-pill nc-pill-blue" style={{ fontFamily: 'monospace' }}>
                  CLI{String(tenant.slug).slice(0, 3).toUpperCase()}
                </span>
                <span className={`nc-pill ${tenant.subscription_status === 'active' ? 'nc-pill-green' : 'nc-pill-red'}`}>
                  {tenant.subscription_status}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 13, color: '#5F6368' }}>
                <span>Database: <b style={{ color: '#202124' }}>{tenant.db_name}</b></span>
                <span>&bull;</span>
                <a
                  href={`https://${tenant.slug}.nivaas.space`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#1A73E8', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <span>{tenant.slug}.nivaas.space</span>
                  {Icons.launch}
                </a>
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="nc-btn"
              onClick={() => setRenewOpen(true)}
              style={{ background: '#1E8E3E', color: '#FFFFFF', borderColor: '#1E8E3E', fontWeight: 700 }}
            >
              {Icons.refresh}
              <span>Renew / Extend</span>
            </button>

            <a
              href={`https://${tenant.slug}.nivaas.space`}
              target="_blank"
              rel="noreferrer"
              className="nc-btn nc-btn-dark"
              style={{ fontWeight: 700, textDecoration: 'none' }}
            >
              <span>Login As Client</span>
              {Icons.launch}
            </a>

            <button
              className="nc-btn"
              onClick={() => {
                setResetResult(null);
                setResetModalOpen(true);
              }}
              style={{ background: '#E8F0FE', color: '#1A73E8', borderColor: '#D2E3FC', fontWeight: 700 }}
            >
              {Icons.key}
              <span>Reset Password</span>
            </button>

            <button
              className="nc-btn"
              onClick={handleStatusToggle}
              style={{
                color: tenant.subscription_status === 'suspended' ? '#1E8E3E' : '#D93025',
                borderColor: tenant.subscription_status === 'suspended' ? '#CEEAD6' : '#FAD2CF',
                background: tenant.subscription_status === 'suspended' ? '#E6F4EA' : '#FCE8E6',
                fontWeight: 700
              }}
            >
              {tenant.subscription_status === 'suspended' ? Icons.check : Icons.lock}
              <span>{tenant.subscription_status === 'suspended' ? 'Unlock Access' : 'Suspend Access'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: '#FCE8E6', color: '#D93025', padding: '12px 18px', borderRadius: 12, border: '1px solid #FAD2CF', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#E6F4EA', color: '#1E8E3E', padding: '12px 18px', borderRadius: 12, border: '1px solid #CEEAD6', fontSize: 13.5, fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* 2. 4 Metric Cards Grid */}
      <div className="nc-tenant-kpis-grid">
        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">ACTIVE PLAN TIER</span>
            <div className="nc-icon-badge" style={{ background: '#E8F0FE', color: '#1A73E8' }}>
              {Icons.ribbon}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ textTransform: 'capitalize', fontSize: 20 }}>
            {tenant.plan_type} Tier
          </div>
          <div className="nc-kpi-sub">Enterprise Quota Active</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">SYSTEM STATUS</span>
            <div className="nc-icon-badge" style={{ background: tenant.subscription_status === 'active' ? '#E6F4EA' : '#FCE8E6', color: tenant.subscription_status === 'active' ? '#1E8E3E' : '#D93025' }}>
              {Icons.shield}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ textTransform: 'capitalize', color: tenant.subscription_status === 'active' ? '#1E8E3E' : '#D93025' }}>
            {tenant.subscription_status}
          </div>
          <div className="nc-kpi-sub">Access Gateway Online</div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">SUBSCRIPTION EXPIRY</span>
            <div className="nc-icon-badge" style={{ background: isExpiringSoon ? '#FEF7E0' : '#E6F4EA', color: isExpiringSoon ? '#B06000' : '#1E8E3E' }}>
              {Icons.calendar}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ fontSize: 20 }}>
            {end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <div className="nc-kpi-sub">
            <span className={`nc-pill ${isExpired ? 'nc-pill-red' : isExpiringSoon ? 'nc-pill-yellow' : 'nc-pill-green'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
              {isExpired ? 'Expired' : `${diffDays} days left`}
            </span>
          </div>
        </div>

        <div className="nc-kpi-card">
          <div className="nc-kpi-header">
            <span className="nc-kpi-label">ISOLATED DATABASE</span>
            <div className="nc-icon-badge" style={{ background: '#E8F0FE', color: '#1A73E8' }}>
              {Icons.database}
            </div>
          </div>
          <div className="nc-kpi-val" style={{ fontSize: 18, color: '#1A73E8', fontFamily: 'monospace' }}>
            {tenant.db_name}
          </div>
          <div className="nc-kpi-sub">PostgreSQL 16 Dedicated</div>
        </div>
      </div>

      {/* 3. 2-Column Main Section */}
      <div className="nc-tenant-detail-grid">
        {/* Left Card: Organization & Technical Profile */}
        <div className="nc-card" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 18, background: '#1A73E8', borderRadius: 2 }} />
            <span style={{ color: '#1A73E8', display: 'flex' }}>{Icons.building}</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#202124', whiteSpace: 'nowrap' }}>
              Tenant Organization Profile
            </h3>
          </div>

          <div style={{ padding: '16px 24px' }}>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.building} Business Name</span>
              <span className="nc-detail-val">{tenant.name}</span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.ribbon} Tenant Code</span>
              <span className="nc-detail-val">
                <span className="nc-pill nc-pill-blue" style={{ fontFamily: 'monospace' }}>
                  CLI{String(tenant.slug).slice(0, 3).toUpperCase()}
                </span>
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.clients} Primary Owner / Contact</span>
              <span className="nc-detail-val">{tenant.admin_name}</span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.globe} Email Address</span>
              <span className="nc-detail-val">
                <a href={`mailto:${tenant.admin_email}`} style={{ color: '#1A73E8', textDecoration: 'none' }}>
                  {tenant.admin_email}
                </a>
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.payments} Phone Number</span>
              <span className="nc-detail-val">{tenant.phone || '—'}</span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.globe} App Subdomain Route</span>
              <span className="nc-detail-val">
                <a href={`https://${tenant.slug}.nivaas.space`} target="_blank" rel="noreferrer" style={{ color: '#1A73E8', fontWeight: 700, textDecoration: 'none' }}>
                  {tenant.slug}.nivaas.space &rarr;
                </a>
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.database} Physical Database</span>
              <span className="nc-detail-val" style={{ fontFamily: 'monospace', color: '#1A73E8' }}>
                {tenant.db_name}
              </span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.shield} Isolation Architecture</span>
              <span className="nc-detail-val">Database-per-Tenant (Isolated Data Plane)</span>
            </div>
            <div className="nc-detail-row">
              <span className="nc-detail-label">{Icons.calendar} Onboarded Date</span>
              <span className="nc-detail-val">
                {new Date(tenant.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card: Subscription Entitlements & History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          {/* Entitlements Card */}
          <div className="nc-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 4, height: 18, background: '#1E8E3E', borderRadius: 2 }} />
              <span style={{ color: '#1E8E3E', display: 'flex' }}>{Icons.plans}</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#202124', whiteSpace: 'nowrap' }}>
                Included Features &amp; Entitlements
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 14px' }}>
              {[
                'Manager Role Access',
                'Site Survey Module',
                'Quotation & Invoice PDF',
                'Reports & Analytics',
                'CSV Import / Export',
                'Bulk Lead Reassignment',
                'Advanced Business BI',
                'Activity Audit Logs',
                'Push Notifications (FCM)',
                'Android Mobile App',
                'Multi-Branch Support',
                '24/7 Priority Support',
              ].map((feat) => (
                <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3C4043' }}>
                  <span style={{ color: '#1E8E3E', display: 'flex' }}>{Icons.check}</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Audit History Card */}
          <div className="nc-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#202124' }}>
                Payment &amp; Renewal Audit History
              </h4>
              <span style={{ fontSize: 12, color: '#5F6368' }}>{payments.length} records</span>
            </div>

            <div className="nc-table-wrap">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>UTR / Ref</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#5F6368', padding: '24px 16px' }}>
                        No past renewal records found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontSize: 12.5 }}>
                          {new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{p.plan_type}</td>
                        <td style={{ color: '#1E8E3E', fontWeight: 700 }}>{money(p.amount)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.utr_number || '—'}</td>
                        <td>
                          <span className={`nc-pill ${p.status === 'approved' ? 'nc-pill-green' : 'nc-pill-yellow'}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* RENEW SUBSCRIPTION MODAL */}
      {renewOpen && (
        <div className="nc-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setRenewOpen(false)}>
          <div className="nc-modal" style={{ width: 'min(500px, 94vw)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#202124' }}>
                Extend / Renew Subscription
              </h3>
              <button className="nc-btn" onClick={() => setRenewOpen(false)} style={{ border: 0, padding: 6 }}>
                {Icons.cross}
              </button>
            </div>

            <form onSubmit={handleRenew} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Select Plan Tier</label>
                <select
                  value={renewPlan}
                  onChange={(e) => setRenewPlan(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value="starter">Starter Tier (₹2,999 /mo)</option>
                  <option value="professional">Professional Tier (₹24,999 /6 mo)</option>
                  <option value="business">Business Tier (₹44,999 /yr)</option>
                  <option value="enterprise">Enterprise Tier (₹99,999 One-Time)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Renewal Duration</label>
                <select
                  value={renewDurationDays}
                  onChange={(e) => setRenewDurationDays(Number(e.target.value))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14, background: '#fff' }}
                >
                  <option value={7}>7 Days (Trial Extension)</option>
                  <option value={30}>1 Month (+30 Days)</option>
                  <option value={90}>3 Months (+90 Days)</option>
                  <option value={180}>6 Months (+180 Days)</option>
                  <option value={365}>1 Year (+365 Days)</option>
                  <option value={3650}>Lifetime (+10 Years)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Amount Collected (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 2999"
                  value={renewAmount}
                  onChange={(e) => setRenewAmount(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>Notes / UTR</label>
                <input
                  type="text"
                  placeholder="e.g. Bank Wire / UPI Ref"
                  value={renewNotes}
                  onChange={(e) => setRenewNotes(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #DADCE0', fontSize: 14 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="nc-btn" onClick={() => setRenewOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="nc-btn nc-btn-primary" disabled={renewLoading}>
                  {renewLoading ? 'Extending...' : 'Confirm Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HARD RESET PASSWORD MODAL (Exact match from digiink_admin) */}
      {resetModalOpen && (
        <div className="nc-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setResetModalOpen(false)}>
          <div className="nc-modal" style={{ width: 'min(540px, 94vw)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#FEF7E0', color: '#B06000', display: 'grid', placeItems: 'center' }}>
                  {Icons.key}
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#202124' }}>
                  Hard Reset Admin Password
                </h3>
              </div>
              <button className="nc-btn" onClick={() => setResetModalOpen(false)} style={{ border: 0, padding: 6 }}>
                {Icons.cross}
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {!resetResult ? (
                <div>
                  <p style={{ color: '#5F6368', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    This will directly generate a new one-time temporary master password for <b>{tenant.name}</b> in its isolated database (<b>{tenant.db_name}</b>).
                  </p>
                  <div style={{ background: '#F8F9FA', padding: 14, borderRadius: 10, border: '1px solid #E0E3E7', fontSize: 13, marginBottom: 20 }}>
                    <div>Login Email: <b style={{ color: '#202124' }}>{tenant.admin_email}</b></div>
                    <div>Portal: <b style={{ color: '#1A73E8' }}>https://{tenant.slug}.nivaas.space</b></div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="nc-btn" onClick={() => setResetModalOpen(false)}>
                      Cancel
                    </button>
                    <button className="nc-btn nc-btn-primary" onClick={handleHardResetPassword} disabled={resetLoading}>
                      {resetLoading ? 'Generating...' : 'Confirm & Reset'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ background: '#E6F4EA', color: '#1E8E3E', padding: '12px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, marginBottom: 16 }}>
                    New password successfully generated in {tenant.db_name}!
                  </div>

                  <div style={{ background: '#0F172A', color: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.05em' }}>ONE-TIME TEMPORARY PASSWORD</div>
                    <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#FBBF24', margin: '8px 0 14px' }}>
                      {resetResult.tempPassword}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>
                      Username: <b>{resetResult.adminUsername}</b><br />
                      Portal: <b>{resetResult.portalUrl}</b>
                    </div>

                    <button
                      className="nc-btn"
                      onClick={() => copyToClipboard(`Portal: ${resetResult.portalUrl}\nUsername: ${resetResult.adminUsername}\nTemp Password: ${resetResult.tempPassword}`)}
                      style={{ background: copiedKey ? '#16A34A' : '#0284C7', color: '#FFFFFF', border: 0, fontWeight: 700, fontSize: 13 }}
                    >
                      {copiedKey ? Icons.check : Icons.copy}
                      <span>{copiedKey ? 'Copied to Clipboard!' : 'Copy All Credentials'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="nc-btn nc-btn-primary" onClick={() => { setResetModalOpen(false); setResetResult(null); }}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   SUB-PAGE: SUBSCRIPTION PLANS (Screenshot 5 1:1 match with Edit Rate)
   ========================================================================== */
function PlansPage({ plans, onEditPlan }) {
  const defaultPlans = [
    {
      id: 'starter',
      name: 'Starter Tier',
      tier_subtitle: 'Monthly Recurring Subscription',
      price: 2999,
      duration_text: '/month',
      user_limit: '5 Users',
      leads_limit: '500 Leads/mo',
      popular: false,
    },
    {
      id: 'professional',
      name: 'Professional Tier',
      tier_subtitle: 'Half-Yearly Growth Commitment',
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
      tier_subtitle: 'Founder Lifetime Access',
      price: 99999,
      duration_text: 'One-Time',
      user_limit: 'Unlimited Users',
      leads_limit: 'Unlimited Leads/mo',
      popular: false,
    },
  ];

  const displayPlans = plans.length > 0 ? plans : defaultPlans;

  const features12 = [
    'Manager Role Access',
    'Site Survey Module',
    'Quotation & Invoice PDF',
    'Reports & Analytics',
    'CSV Import / Export',
    'Bulk Lead Reassignment',
    'Advanced Business BI',
    'Activity Audit Logs',
    'Push Notifications (FCM)',
    'Android Mobile App',
    'Multi-Branch Support',
    '24/7 Priority Support',
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
                      {Icons.ribbon}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: isEnterprise ? '#fff' : '#202124' }}>
                        {plan.name}
                      </h3>
                      <div style={{ fontSize: 12, color: isEnterprise ? '#E8F0FE' : '#5F6368' }}>
                        {plan.tier_subtitle}
                      </div>
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
                  <span className="price-val" style={{ fontSize: 28, fontWeight: 900, color: isEnterprise ? '#fff' : '#202124' }}>
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

              {/* Included Features 2 Column Checklist (All 12 Features Enabled) */}
              <div style={{ padding: '20px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#5F6368', textTransform: 'uppercase', marginBottom: 14 }}>
                  INCLUDED FEATURES &amp; PERMISSIONS
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12.5 }}>
                  {features12.map((fName) => (
                    <div key={fName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#1E8E3E', display: 'grid', placeItems: 'center' }}>
                        {Icons.check}
                      </span>
                      <span style={{ color: '#202124', fontWeight: 500 }}>
                        {fName}
                      </span>
                    </div>
                  ))}
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
   MODAL: EDIT PLAN (ONLY RATES AS REQUESTED)
   ========================================================================== */
function EditPlanModal({ plan, onClose, onSave }) {
  const [price, setPrice] = useState(plan.price || 0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      price: Number(price),
    });
    setSaving(false);
  };

  return (
    <div className="nc-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nc-modal" style={{ width: 'min(440px, 94vw)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E0E3E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#202124' }}>
              Edit Rate: {plan.name}
            </h3>
            <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2 }}>
              {plan.tier_subtitle} ({plan.duration_text})
            </div>
          </div>
          <button className="nc-btn" onClick={onClose} style={{ border: 0, padding: 6 }}>
            {Icons.cross}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5F6368', marginBottom: 6 }}>
              Subscription Rate in INR (₹)
            </label>
            <input
              type="number"
              required
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8,
                border: '1px solid #DADCE0', fontSize: 20, fontWeight: 800,
                color: '#1E8E3E', outline: 'none'
              }}
            />
            <div style={{ fontSize: 12, color: '#5F6368', marginTop: 6 }}>
              Billed cycle: <b>{plan.duration_text}</b> &bull; Quotas: {plan.user_limit}, {plan.leads_limit}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="nc-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nc-btn nc-btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Save Plan Rate'}
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
