import React, { useState, useEffect, useCallback } from 'react';

// Custom Super Admin API helper using dedicated token storage
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
  const [activeTab, setActiveTab] = useState('tenants'); // 'tenants' | 'payments'
  const [metrics, setMetrics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
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
      say(err.message || 'Failed to load control plane data');
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

  const filteredTenants = tenants.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.name || '').toLowerCase().includes(q) ||
      (t.slug || '').toLowerCase().includes(q) ||
      (t.admin_email || '').toLowerCase().includes(q)
    );
  });

  const pendingPayments = payments.filter(p => p.status === 'pending');

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#1e293b', border: '1px solid #38bdf8', color: '#f8fafc',
          padding: '12px 20px', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span>⚡</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header style={{
        background: '#0d1322', borderBottom: '1px solid #1e293b',
        padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#fff'
          }}>
            N
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: '#fff' }}>NIVAAS</span>
              <span style={{
                background: '#312e81', color: '#a5b4fc', fontSize: 11, fontWeight: 700,
                padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: 0.5
              }}>
                Control Plane
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Multi-Tenant SaaS Master Management</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={loadData}
            title="Refresh Data"
            style={{
              background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
              borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span>↻</span> {loading ? 'Syncing...' : 'Refresh'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13
            }}>
              SA
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Super Administrator</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>admin@nivaas.space</div>
            </div>
            <button
              onClick={() => { saApi.logout(); setAuthed(false); }}
              style={{
                background: 'transparent', border: 'none', color: '#ef4444',
                fontSize: 13, cursor: 'pointer', padding: '4px 8px', marginLeft: 8
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px' }}>
        {/* Metric Overview Cards */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          <MetricCard
            title="Total Tenants"
            value={metrics?.tenants?.total_tenants ?? 0}
            icon="🏢"
            sub="Registered Companies"
            color="#38bdf8"
          />
          <MetricCard
            title="Active Subscriptions"
            value={metrics?.tenants?.active_tenants ?? 0}
            icon="🟢"
            sub="Paying Builders"
            color="#10b981"
          />
          <MetricCard
            title="Free Trials"
            value={metrics?.tenants?.trial_tenants ?? 0}
            icon="⏳"
            sub="Active 7-Day Trials"
            color="#f59e0b"
          />
          <MetricCard
            title="Pending Payment Proofs"
            value={pendingPayments.length}
            icon="💳"
            sub="Awaiting Verification"
            color={pendingPayments.length > 0 ? '#ef4444' : '#64748b'}
            badge={pendingPayments.length > 0 ? `${pendingPayments.length} Action Needed` : null}
          />
          <MetricCard
            title="Verified Revenue"
            value={`₹${(metrics?.totalRevenue ?? 0).toLocaleString('en-IN')}`}
            icon="💰"
            sub="Approved Payments"
            color="#a855f7"
          />
        </section>

        {/* Tab Controls & Actions */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b', marginBottom: 20, paddingBottom: 12
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setActiveTab('tenants')}
              style={{
                background: activeTab === 'tenants' ? '#1e293b' : 'transparent',
                border: activeTab === 'tenants' ? '1px solid #334155' : '1px solid transparent',
                color: activeTab === 'tenants' ? '#38bdf8' : '#94a3b8',
                borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>🏢</span> Tenants &amp; Isolated DBs
              <span style={{
                background: '#0f172a', color: '#94a3b8', fontSize: 11,
                padding: '2px 8px', borderRadius: 10
              }}>
                {tenants.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              style={{
                background: activeTab === 'payments' ? '#1e293b' : 'transparent',
                border: activeTab === 'payments' ? '1px solid #334155' : '1px solid transparent',
                color: activeTab === 'payments' ? '#38bdf8' : '#94a3b8',
                borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>💳</span> Payment Verifications
              {pendingPayments.length > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 10
                }}>
                  {pendingPayments.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'tenants' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                placeholder="Search tenant, slug, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: '#0f172a', border: '1px solid #334155', color: '#f8fafc',
                  padding: '9px 14px', borderRadius: 8, fontSize: 13, width: 240
                }}
              />
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none',
                  color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 14,
                  fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 4px 14px rgba(37,99,235,0.4)'
                }}
              >
                <span>+</span> Create New Tenant
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Tenants List */}
        {activeTab === 'tenants' && (
          <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#111827', color: '#64748b', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>
                  <th style={{ padding: '14px 18px' }}>Company &amp; Subdomain</th>
                  <th style={{ padding: '14px 18px' }}>Physical Database</th>
                  <th style={{ padding: '14px 18px' }}>Admin Contact</th>
                  <th style={{ padding: '14px 18px' }}>Current Plan</th>
                  <th style={{ padding: '14px 18px' }}>Expiry &amp; Days</th>
                  <th style={{ padding: '14px 18px' }}>Status</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      No tenants found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const expiry = new Date(t.subscription_ends_at || t.trial_ends_at);
                    const isExpired = Date.now() > expiry.getTime();
                    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #1e293b', transition: 'background 0.2s' }}>
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>{t.name}</div>
                          <a
                            href={`https://${t.slug}.nivaas.space`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#38bdf8', textDecoration: 'none', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
                          >
                            <span>{t.slug}.nivaas.space</span>
                            <span>↗</span>
                          </a>
                        </td>
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{
                            background: '#090d16', border: '1px solid #1e293b',
                            padding: '4px 10px', borderRadius: 6, fontFamily: 'monospace',
                            color: '#a5b4fc', fontSize: 12, display: 'inline-block'
                          }}>
                            {t.db_name}
                          </div>
                        </td>
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{ color: '#cbd5e1' }}>{t.admin_name || 'Admin'}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{t.admin_email}</div>
                          {t.phone && <div style={{ color: '#64748b', fontSize: 11 }}>{t.phone}</div>}
                        </td>
                        <td style={{ padding: '16px 18px' }}>
                          <span style={{
                            background: '#1e293b', color: '#e2e8f0', padding: '4px 8px',
                            borderRadius: 6, fontWeight: 700, fontSize: 11, textTransform: 'uppercase'
                          }}>
                            {t.plan_type || 'trial'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{ color: isExpired ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                            {isExpired ? 'Expired' : `${daysLeft} days remaining`}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>
                            {expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td style={{ padding: '16px 18px' }}>
                          <span style={{
                            background: isExpired ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                            color: isExpired ? '#ef4444' : '#10b981',
                            border: `1px solid ${isExpired ? '#ef4444' : '#10b981'}`,
                            padding: '3px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700
                          }}>
                            {isExpired ? 'EXPIRED' : (t.subscription_status || 'ACTIVE').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={async () => {
                                try {
                                  await saApi.updateTenant(t.id, { extendDays: 30 });
                                  say(`Extended ${t.name} by 30 days!`);
                                  loadData();
                                } catch (e) {
                                  say(e.message);
                                }
                              }}
                              title="Extend subscription by 30 days"
                              style={{
                                background: '#1e293b', border: '1px solid #334155', color: '#38bdf8',
                                padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              +30 Days
                            </button>
                            <button
                              onClick={async () => {
                                const nextStatus = t.subscription_status === 'suspended' ? 'active' : 'suspended';
                                try {
                                  await saApi.updateTenant(t.id, { status: nextStatus });
                                  say(`Updated ${t.name} to ${nextStatus}`);
                                  loadData();
                                } catch (e) {
                                  say(e.message);
                                }
                              }}
                              style={{
                                background: '#1e293b', border: '1px solid #334155',
                                color: t.subscription_status === 'suspended' ? '#10b981' : '#f59e0b',
                                padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              {t.subscription_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
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
        )}

        {/* Tab 2: Payment Proof Approvals */}
        {activeTab === 'payments' && (
          <div>
            {payments.length === 0 ? (
              <div style={{
                background: '#0d1322', border: '1px solid #1e293b', borderRadius: 12,
                padding: 60, textAlign: 'center', color: '#64748b'
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>No Payment Submissions Yet</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>When clients upload UPI QR or NEFT transfer receipts, they will appear here for 1-click verification.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
                {payments.map((p) => {
                  const isPending = p.status === 'pending';
                  const isApproved = p.status === 'approved';

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: '#0d1322',
                        border: isPending ? '1px solid #38bdf8' : '1px solid #1e293b',
                        borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column',
                        position: 'relative', boxShadow: isPending ? '0 0 20px rgba(56,189,248,0.1)' : 'none'
                      }}
                    >
                      {/* Status Tag */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>{p.tenant_name}</div>
                          <div style={{ fontSize: 12, color: '#38bdf8' }}>{p.tenant_slug}.nivaas.space</div>
                        </div>
                        <span style={{
                          background: isPending ? 'rgba(245,158,11,0.2)' : isApproved ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                          color: isPending ? '#f59e0b' : isApproved ? '#10b981' : '#ef4444',
                          border: `1px solid ${isPending ? '#f59e0b' : isApproved ? '#10b981' : '#ef4444'}`,
                          padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase'
                        }}>
                          {p.status}
                        </span>
                      </div>

                      {/* Payment Details */}
                      <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ color: '#64748b' }}>Selected Plan:</span>
                          <span style={{ fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase' }}>{p.plan_type}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ color: '#64748b' }}>Amount:</span>
                          <span style={{ fontWeight: 800, color: '#10b981', fontSize: 15 }}>₹{Number(p.amount).toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ color: '#64748b' }}>UTR / Reference:</span>
                          <span style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{p.utr_number}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Submitted At:</span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>
                            {new Date(p.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* Screenshot Preview */}
                      {p.screenshot_url && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Payment Receipt / Screenshot:</div>
                          <div
                            onClick={() => setInspectScreenshot(p.screenshot_url)}
                            style={{
                              height: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #334155',
                              cursor: 'pointer', position: 'relative', background: '#000'
                            }}
                          >
                            <img
                              src={p.screenshot_url}
                              alt="Payment Proof"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                            <div style={{
                              position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.8)',
                              color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 4, fontWeight: 600
                            }}>
                              Click to Enlarge 🔍
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons for Pending */}
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                          <button
                            onClick={async () => {
                              try {
                                const res = await saApi.approvePayment(p.id);
                                say(res.message || 'Payment approved!');
                                loadData();
                              } catch (e) {
                                say(e.message);
                              }
                            }}
                            style={{
                              flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)',
                              border: 'none', color: '#fff', padding: '10px 14px', borderRadius: 8,
                              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', gap: 6
                            }}
                          >
                            <span>✓</span> Approve &amp; Unlock
                          </button>
                          <button
                            onClick={async () => {
                              const notes = prompt('Enter rejection reason (optional):');
                              if (notes === null) return;
                              try {
                                await saApi.rejectPayment(p.id, notes);
                                say('Payment marked as rejected');
                                loadData();
                              } catch (e) {
                                say(e.message);
                              }
                            }}
                            style={{
                              background: '#1e293b', border: '1px solid #ef4444', color: '#ef4444',
                              padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 'auto', fontSize: 12, color: '#64748b', textAlign: 'center', paddingTop: 8 }}>
                          {isApproved ? '✓ Verified and subscription extended' : '✗ Submission was rejected'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

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

      {/* Modal: Inspect Screenshot */}
      {inspectScreenshot && (
        <div
          onClick={() => setInspectScreenshot(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out'
          }}
        >
          <div style={{ maxWidth: 800, maxHeight: '90vh', background: '#0d1322', borderRadius: 12, overflow: 'hidden', padding: 8 }}>
            <img src={inspectScreenshot} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, sub, color, badge }) {
  return (
    <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 12, padding: 18, position: 'relative' }}>
      {badge && (
        <div style={{
          position: 'absolute', top: 12, right: 12, background: '#ef4444', color: '#fff',
          fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 9999, textTransform: 'uppercase'
        }}>
          {badge}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>
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
  const [provisionResult, setProvisionResult] = useState(null);

  // Auto-slugify company name
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
      setProvisionResult(res);
    } catch (err) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#0d1322', border: '1px solid #1e293b', borderRadius: 14,
        maxWidth: 540, width: '100%', padding: 28, position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer' }}
        >
          ✕
        </button>

        {provisionResult ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
              <h3 style={{ margin: 0, color: '#10b981', fontSize: 20 }}>Tenant Created Successfully!</h3>
              <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                Dedicated database <b>{provisionResult.tenant.db_name}</b> has been created and initialized.
              </p>
            </div>

            <div style={{ background: '#090d16', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: '#64748b' }}>Workspace URL: </span>
                <a href={provisionResult.loginUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontWeight: 700 }}>
                  {provisionResult.loginUrl}
                </a>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: '#64748b' }}>Admin Email: </span>
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>{provisionResult.tenant.admin_email}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Temporary Password: </span>
                <span style={{ color: '#f59e0b', fontWeight: 800, fontFamily: 'monospace' }}>{provisionResult.tempPassword}</span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              An automated welcome email with these credentials has also been sent to <b>{provisionResult.tenant.admin_email}</b>.
            </p>

            <button
              onClick={() => onSuccess(provisionResult)}
              style={{
                width: '100%', background: '#2563eb', border: 'none', color: '#fff',
                padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 12
              }}
            >
              Done &amp; Return to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 18, color: '#f8fafc' }}>🏢 Provision New Client / Tenant</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px 0' }}>
              Creates an isolated PostgreSQL database, migrates tables, and emails credentials.
            </p>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Company / Builder Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Prestige Estates"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Subdomain Slug *</label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#090d16', border: '1px solid #334155', borderRadius: 8, padding: '0 12px' }}>
                <input
                  type="text"
                  required
                  placeholder="prestige"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#38bdf8', padding: '10px 0', fontSize: 13, fontWeight: 700, outline: 'none' }}
                />
                <span style={{ color: '#64748b', fontSize: 13 }}>.nivaas.space</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Admin Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Sharma"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Admin Email *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@prestige.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="9829012345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Initial Plan</label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value)}
                  style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}
                >
                  <option value="trial">7-Day Free Trial</option>
                  <option value="monthly">Monthly Plan (30 Days)</option>
                  <option value="6months">Half-Yearly (6 Months)</option>
                  <option value="yearly">Annual Plan (1 Year)</option>
                  <option value="lifetime">Lifetime Deal</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none',
                  color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer'
                }}
              >
                {submitting ? 'Creating Database & Schema...' : 'Create Tenant ➔'}
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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #090d16 60%)', padding: 20, fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16,
        padding: 36, maxWidth: 420, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff', marginBottom: 12
          }}>
            🛡️
          </div>
          <h2 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>Nivaas Control Plane</h2>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Super Administrator Sign In</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Super Admin Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '11px 14px', borderRadius: 8, fontSize: 14 }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: '11px 14px', borderRadius: 8, fontSize: 14 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: 'linear-gradient(135deg, #4f46e5, #2563eb)', border: 'none',
              color: '#fff', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(79,70,229,0.4)'
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Control Plane ➔'}
          </button>
        </form>
      </div>
    </div>
  );
}
