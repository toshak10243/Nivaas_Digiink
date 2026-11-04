import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Logo, Icon } from '../components/ui.jsx';
import logoImg from '../assets/logo.png';

const ROLES = [
  ['admin', 'Builder admin', 'Projects, inventory, team, commissions, payouts', 'building'],
  ['sales', 'Sales agent', 'My leads, WhatsApp with AI twin, share flats, bookings', 'funnel'],
  ['broker', 'Channel partner', 'Live inventory, register clients, my commission', 'briefcase'],
  ['maintenance', 'Maintenance team', 'Complaint queue with 24-hour SLA', 'wrench'],
  ['customer', 'Home owner', 'My flat, payments, construction updates, complaints', 'home'],
];

// Sample logins, shown only while running locally (npm run dev), never in the production build.
const SAMPLES = [
  ['Builder admin', 'admin@sgdevelopers.in', 'nivaas123'], ['Sales · Rohit', 'rohit@sgdevelopers.in', 'nivaas123'], ['Sales · Neha', 'neha@sgdevelopers.in', 'nivaas123'],
  ['Broker · Rajesh', 'rajesh@sharmarealty.in', 'nivaas123'], ['Broker · Pooja', 'pooja@jaipurhomes.co', 'nivaas123'], ['Maintenance · Ajay', 'ajay@sgdevelopers.in', 'nivaas123'],
  ['Customer · Ramesh (101-F)', 'ramesh.gupta@gmail.com', 'home1234'],
];

export default function Login({ onDone }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', company: '', name: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { mode === 'login' ? await api.login(f.email, f.password) : await api.setup(f); onDone(); } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="login-page-wrap">
      <div className="login-white-card">
        {/* Left Column: Brand Showcase & Value Proposition */}
        <div className="login-showcase-panel">
          <div>
            <div className="login-brand-header">
              <img src={logoImg} alt="Nivaas" className="login-brand-logo" />
              <div>
                <div className="login-brand-title">Nivaas</div>
                <span className="login-brand-tag">Enterprise Real Estate OS</span>
              </div>
            </div>

            <div className="login-hero-text" style={{ marginTop: 36 }}>
              <h1>Smart Real Estate Sales, Booking &amp; Handover.</h1>
              <p>
                From advertising leads to key handover. Live dynamic inventory, AI objection copilot, digital site visit passports, and verified buyer handover rooms in one unified workspace.
              </p>
            </div>

            <div className="login-feature-list">
              <div className="login-feature-item">
                <div className="login-feature-icon">
                  <Icon name="grid" />
                </div>
                <div className="login-feature-text">
                  <b>Live Sales &amp; Inventory Kit</b>
                  <span>Dynamic pricing, instant PDF cost sheets &amp; authorized broker sales kits.</span>
                </div>
              </div>

              <div className="login-feature-item">
                <div className="login-feature-icon">
                  <Icon name="spark" />
                </div>
                <div className="login-feature-text">
                  <b>AI Objection &amp; Sales Handover Copilot</b>
                  <span>Instant verified objection resolution scripts and team handover memory.</span>
                </div>
              </div>

              <div className="login-feature-item">
                <div className="login-feature-icon">
                  <Icon name="calendar" />
                </div>
                <div className="login-feature-text">
                  <b>Smart Route &amp; Visit Evidence Passport</b>
                  <span>Automated staff allocation and tamper-evident buyer visit records.</span>
                </div>
              </div>

              <div className="login-feature-item">
                <div className="login-feature-icon">
                  <Icon name="shield" />
                </div>
                <div className="login-feature-text">
                  <b>Digital Buyer Handover Room</b>
                  <span>Construction progress stages, milestone demand notices, receipts &amp; registry manager.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="login-trust-footer">
            <Icon name="checkCircle" style={{ width: 16, height: 16, color: '#10b981' }} />
            <span>RERA Compliant · Enterprise Grade · Real-Time WhatsApp Engine</span>
          </div>
        </div>

        {/* Right Column: Clean White Authentication Form */}
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-mobile-logo">
              <img src={logoImg} alt="Nivaas" style={{ width: 38, height: 38, borderRadius: 10 }} />
              <div>
                <b style={{ fontSize: 20, display: 'block', color: '#0f172a' }}>Nivaas</b>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Real Estate OS</span>
              </div>
            </div>

            {api.mode === 'demo' ? (
              <div>
                <h2 className="login-form-title">Try the demo as…</h2>
                <p className="login-form-sub">Sample builder: Shree Ganesh Developers, Jaipur. Switch roles any time from the top bar.</p>
                {ROLES.map(([k, l, d, ic]) => (
                  <button key={k} className="login-rolecard-white" onClick={() => { api.loginAs(k); onDone(); }}>
                    <span className="login-role-icon"><Icon name={ic} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block', fontSize: 14 }}>{l}</b>
                      <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{d}</span>
                    </span>
                    <Icon name="arrow" style={{ width: 16, height: 16, color: '#94a3b8' }} />
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="login-form-title">{mode === 'login' ? 'Sign In to Nivaas' : 'Set up your company'}</h2>
                <p className="login-form-sub">
                  {mode === 'login' ? 'Enter your registered credentials to access your real estate portal.' : 'Create your company workspace and get started.'}
                </p>

                {mode === 'setup' && (
                  <>
                    <div className="login-field">
                      <label htmlFor="l-co">Company Name</label>
                      <input id="l-co" className="login-input" placeholder="e.g. Acme Infra & Developers" required value={f.company} onChange={set('company')} />
                    </div>
                    <div className="login-field">
                      <label htmlFor="l-nm">Your Full Name</label>
                      <input id="l-nm" className="login-input" placeholder="e.g. Vikram Singhania" value={f.name} onChange={set('name')} />
                    </div>
                  </>
                )}

                <div className="login-field">
                  <label htmlFor="l-em">Work Email Address</label>
                  <input id="l-em" type="email" className="login-input" placeholder="name@company.com" autoComplete="username" required value={f.email} onChange={set('email')} />
                </div>

                <div className="login-field">
                  <label htmlFor="l-pw">Password</label>
                  <input id="l-pw" type="password" className="login-input" placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'setup' ? 8 : 1} value={f.password} onChange={set('password')} />
                </div>

                {err && <div className="login-err-msg">{err}</div>}

                <button className="login-btn-primary" disabled={busy}>
                  {busy ? 'Verifying…' : mode === 'login' ? 'Sign In to Workspace' : 'Create Company Workspace'}
                </button>

                <button type="button" className="login-btn-secondary" onClick={() => setMode(mode === 'login' ? 'setup' : 'login')}>
                  {mode === 'login' ? 'First time here? Set up your company' : 'Already have an account? Sign In'}
                </button>

                {import.meta.env.DEV && mode === 'login' && (
                  <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>Quick sample accounts (Dev only):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {SAMPLES.map(([l, em, pw]) => (
                        <button
                          key={em}
                          type="button"
                          className="btn sm ghost"
                          style={{ fontSize: 11.5, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' }}
                          onClick={() => { setF({ ...f, email: em, password: pw }); setErr(''); }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
