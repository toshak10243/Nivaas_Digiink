import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api/index.js';
import { Icon, Logo, Avatar, useLoad } from './components/ui.jsx';
import { ago } from './lib/format.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Projects from './pages/Projects.jsx';
import Inventory from './pages/Inventory.jsx';
import Leads from './pages/Leads.jsx';
import Visits from './pages/Visits.jsx';
import Chats from './pages/Chats.jsx';
import Bookings from './pages/Bookings.jsx';
import Earnings from './pages/Earnings.jsx';
import Team from './pages/Team.jsx';
import Tickets from './pages/Tickets.jsx';
import Settings from './pages/Settings.jsx';
import Portal from './pages/Portal.jsx';
import SharePage from './pages/SharePage.jsx';
import EmiCalculatorModal from './components/EmiCalculatorModal.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import RenewSubscriptionModal from './pages/RenewSubscription.jsx';
import SuperAdminPortal from './pages/superadmin/SuperAdminPortal.jsx';

const NAV = {
  admin: [
    ['dashboard', 'Dashboard', 'home'],
    ['projects', 'Projects', 'building'],
    ['inventory', 'Inventory', 'grid'],
    ['leads', 'Leads', 'funnel'],
    ['visits', 'Site Visits', 'calendar'],
    ['chats', 'WhatsApp', 'chat'],
    ['bookings', 'Bookings', 'receipt'],
    ['portal', 'Buyer Handover', 'shield'],
    ['earnings', 'Payouts', 'rupee'],
    ['team', 'Team', 'users'],
    ['tickets', 'Complaints', 'wrench'],
    ['reports', 'Reports', 'chart'],
    ['settings', 'Settings', 'gear']
  ],
  sales: [
    ['dashboard', 'Dashboard', 'home'],
    ['inventory', 'Inventory', 'grid'],
    ['leads', 'My leads', 'funnel'],
    ['visits', 'Site visits', 'calendar'],
    ['chats', 'WhatsApp + AI', 'chat'],
    ['bookings', 'Bookings', 'receipt'],
    ['portal', 'Buyer Handover', 'shield'],
    ['earnings', 'My earnings', 'rupee'],
    ['tickets', 'Complaints', 'wrench']
  ],
  broker: [
    ['dashboard', 'Dashboard', 'home'],
    ['inventory', 'Inventory & Kit', 'grid'],
    ['leads', 'My clients', 'funnel'],
    ['visits', 'Site visits', 'calendar'],
    ['bookings', 'Bookings', 'receipt'],
    ['earnings', 'Commission', 'rupee']
  ],
  maintenance: [
    ['tickets', 'Complaints', 'wrench'],
    ['dashboard', 'Summary', 'home']
  ],
  customer: [
    ['portal', 'Buyer Handover', 'shield'],
    ['tickets', 'Complaints', 'wrench']
  ],
};
const TITLES = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  inventory: 'Inventory & Sales Kit',
  leads: 'Leads & AI Copilot',
  visits: 'Site Visits & Allocations',
  chats: 'WhatsApp',
  bookings: 'Bookings & Registry Day',
  portal: 'Buyer Handover & Construction Tracker',
  earnings: 'Payouts',
  team: 'Team',
  tickets: 'Complaints',
  reports: 'Reports',
  settings: 'Settings'
};
const ROLE_LABEL = { admin: 'Builder admin', sales: 'Sales agent', broker: 'Channel partner', maintenance: 'Maintenance', customer: 'Home owner' };

const parse = () => {
  if (location.pathname.startsWith('/s/')) return ['s', location.pathname.split('/')[2]];
  return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
};

export default function App() {
  const [route, setRoute] = useState(parse());
  const [authed, setAuthed] = useState(api.isLoggedIn());
  const [toast, setToast] = useState('');
  const [sess, setSess] = useState(0);
  const say = useCallback(t => { setToast(t); clearTimeout(say.t); say.t = setTimeout(() => setToast(''), 3500); }, []);

  useEffect(() => { const f = () => setRoute(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('nivaas_session_expired');
      if (msg) {
        sessionStorage.removeItem('nivaas_session_expired');
        say(msg);
      }
    } catch {}

    const onSessionExpired = e => {
      setAuthed(false);
      setRoute([]);
      if (location.hash) location.hash = '';
      const msg = e?.detail?.message || 'Session expired. Please log in again.';
      say(msg);
    };
    window.addEventListener('nivaas:session-expired', onSessionExpired);
    return () => window.removeEventListener('nivaas:session-expired', onSessionExpired);
  }, [say]);

  const go = useCallback(path => { location.hash = '#/' + path.replace(/^\//, ''); }, []);

  const isSuperAdmin = window.location.hostname.startsWith('admin.') || 
    window.location.pathname.startsWith('/superadmin') || 
    route[0] === 'superadmin';

  if (isSuperAdmin) {
    return <SuperAdminPortal />;
  }

  if (route[0] === 's') return <><SharePage token={route[1]} say={say} />{toast && <div className="toast" role="status">{toast}</div>}</>;
  if (!authed) return (
    <>
      <Login onDone={() => { setAuthed(true); go(''); }} notice={toast} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
  return <Shell key={sess} route={route} go={go} say={say} toast={toast} onSwitchRole={r => { api.loginAs(r); location.hash = '#/'; setSess(x => x + 1); }}
    onLogout={() => { api.logout(); setAuthed(false); location.hash = '#/'; }} />;
}

function Shell({ route, go, say, toast, onLogout, onSwitchRole }) {
  const [me, reloadMe] = useLoad(() => api.get('/api/me'), []);
  const [notifs, reloadN] = useLoad(() => api.get('/api/notifications'), []);
  const [billing, reloadBilling] = useLoad(() => api.get('/api/billing/status').catch(() => null), []);
  const [bell, setBell] = useState(false);
  const [showEmi, setShowEmi] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { const t = setInterval(reloadN, 30000); return () => clearInterval(t); }, [reloadN]);
  useEffect(() => { if (route[0] === 'renew' || (billing?.is_expired && me?.user?.role === 'admin')) setShowRenew(true); }, [route, billing, me]);
  if (!me) return <div className="boot"><Logo size={44} /></div>;
  const role = me.user.role;
  const nav = NAV[role];
  const page = nav.some(n => n[0] === route[0]) ? route[0] : nav[0][0];
  const adminWorkspace = role === 'admin';
  const executiveDashboard = role === 'admin' && page === 'dashboard';
  const unread = (notifs || []).filter(n => !n.read).length;
  const props = { me, go, say, params: route.slice(1), reloadMe };

  return (
    <div className={'shell' + (adminWorkspace ? ' nivaas-admin-shell' : '') + (executiveDashboard ? ' admin-dashboard-shell' : '') + (sidebarOpen ? ' sidebar-open' : '')}>
      <nav className="rail" aria-label="Main">
        <div className="brand"><Logo /><div><b>Nivaas</b><small>{adminWorkspace ? 'Real Estate CRM' : me.org.name}</small></div></div>
        {adminWorkspace && <button className="mobile-sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><Icon name="x" /></button>}
        <div className="navlist">
          {nav.map(([k, l, ic]) => (
            <button key={k} className="navbtn" aria-current={page === k ? 'page' : undefined} onClick={() => { setSidebarOpen(false); go(k); }}><Icon name={ic} /><span>{l}</span></button>
          ))}
        </div>
        <div className="railfoot">
          {role === 'sales' && <Availability me={me} reload={reloadMe} say={say} />}
          <button type="button" className="bizchip profile-chip" aria-label="View and edit your profile" onClick={() => setShowProfile(true)}>
            <Avatar name={me.user.name} src={api.media(me.user.profile?.avatar_url)} /><div style={{ minWidth: 0, textAlign: 'left' }}><b>{me.user.name}</b><span>{ROLE_LABEL[role]}</span></div><Icon name="arrow" />
          </button>
        </div>
      </nav>
      <main className="work">
        <header className="topbar">
          {adminWorkspace && <button className="iconbtn dashboard-menu-button" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><Icon name="menu" /></button>}
          <div style={{ minWidth: 0 }}><h1>{TITLES[page]}</h1></div><div className="spacer" />
          {billing && billing.days_left !== undefined && (
            <button
              type="button"
              className="trial-badge-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: billing.is_expired ? 'rgba(239,68,68,0.18)' : billing.days_left <= 3 ? 'rgba(234,179,8,0.18)' : 'rgba(16,185,129,0.18)',
                color: billing.is_expired ? '#f87171' : billing.days_left <= 3 ? '#facc15' : '#34d399',
                border: `1px solid ${billing.is_expired ? '#ef4444' : billing.days_left <= 3 ? '#eab308' : '#059669'}`,
                borderRadius: 9999,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                marginRight: 6
              }}
              onClick={() => setShowRenew(true)}
              title="Click to view subscription & renewal plans"
            >
              <Icon name="clock" style={{ width: 13, height: 13 }} />
              {billing.is_expired ? 'Plan Expired — Renew' : `${billing.days_left}d Trial Left`}
            </button>
          )}
          {adminWorkspace ? <DashboardSearch go={go} /> : api.mode === 'demo' && <DemoSwitch role={role} onSwitch={onSwitchRole} />}
          {!adminWorkspace && <button className="iconbtn" onClick={() => setShowEmi(true)} title="Home Loan EMI Calculator" aria-label="Home Loan EMI Calculator"><Icon name="calc" /></button>}
          <div style={{ position: 'relative' }}>
            <button className="iconbtn" aria-label="Notifications" onClick={() => { setBell(b => !b); if (!bell && unread) api.post('/api/notifications/read').then(reloadN); }}>
              <Icon name="bell" />{unread > 0 && <span className="dot" />}
            </button>
            {bell && <Bell list={notifs || []} onPick={n => { setBell(false); if (n.link) go(n.link.replace(/^\//, '').replace('share', 'inventory')); }} />}
          </div>
          {adminWorkspace ? <div className="profile-menu-wrap">
            <button className="dashboard-profile-button" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(value => !value)}><Avatar name={me.user.name} size="sm" src={api.media(me.user.profile?.avatar_url)} /><Icon name="chevronDown" /></button>
            {profileOpen && <div className="dashboard-profile-menu"><b>{me.user.name}</b><small>{ROLE_LABEL[role]}</small>{api.mode === 'demo' && <label className="profile-role-switch">View as <select value={role} onChange={event => onSwitchRole(event.target.value)}><option value="admin">Builder admin</option><option value="sales">Sales agent</option><option value="broker">Broker</option><option value="maintenance">Maintenance</option><option value="customer">Home owner</option></select></label>}<button onClick={() => { setProfileOpen(false); setShowProfile(true); }}><Icon name="user" />My profile</button><button onClick={() => { setProfileOpen(false); setShowRenew(true); }}><Icon name="receipt" />Subscription &amp; Plans</button><button onClick={() => { setProfileOpen(false); setShowEmi(true); }}><Icon name="calc" />Home loan calculator</button><button className="profile-logout" onClick={onLogout}><Icon name="logout" />Log out</button></div>}
          </div> : <button className="iconbtn" aria-label="Log out" onClick={onLogout}><Icon name="logout" /></button>}
        </header>
        <div className="content" key={page + route.join('/')}>
          {page === 'dashboard' && <Dashboard {...props} />}
          {page === 'reports' && <Reports {...props} />}
          {page === 'projects' && <Projects {...props} />}
          {page === 'inventory' && <Inventory {...props} />}
          {page === 'leads' && <Leads {...props} />}
          {page === 'visits' && <Visits {...props} />}
          {page === 'chats' && <Chats {...props} />}
          {page === 'bookings' && <Bookings {...props} />}
          {page === 'earnings' && <Earnings {...props} />}
          {page === 'team' && <Team {...props} />}
          {page === 'tickets' && <Tickets {...props} />}
          {page === 'settings' && <Settings {...props} />}
          {page === 'portal' && <Portal {...props} />}
        </div>
      </main>
      {showEmi && <EmiCalculatorModal onClose={() => setShowEmi(false)} say={say} />}
      {showProfile && <ProfileModal me={me} onClose={() => setShowProfile(false)} onSaved={() => { setShowProfile(false); reloadMe(); }} onAvatarSaved={reloadMe} say={say} />}
      <RenewSubscriptionModal isOpen={showRenew} onClose={() => setShowRenew(false)} billing={billing} onRenewed={reloadBilling} say={say} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Availability({ me, reload, say }) {
  const a = me.user.profile?.availability || 'available';
  const set = async v => { await api.patch('/api/me/profile', { availability: v }); reload(); say(v === 'away' ? 'You are away. Your AI twin is answering your WhatsApp.' : `Status: ${v}`); };
  return (
    <div className="agentcard">
      <b><span className={'pulse' + (a === 'away' ? ' off' : '')} />{a === 'away' ? 'Away · AI twin on' : a === 'busy' ? 'Busy' : 'Available'}</b>
      <div className="availseg">{['available', 'busy', 'away'].map(k => <button key={k} aria-pressed={a === k} onClick={() => set(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
    </div>
  );
}

function DemoSwitch({ role, onSwitch }) {
  return (
    <label className="demoswitch"><span>View as</span>
      <select value={role} onChange={e => onSwitch(e.target.value)} aria-label="Switch demo role">
        <option value="admin">Builder admin</option><option value="sales">Sales agent</option><option value="broker">Broker</option><option value="maintenance">Maintenance</option><option value="customer">Home owner</option>
      </select>
    </label>
  );
}

function Bell({ list, onPick }) {
  const ic = { lead_assigned: 'funnel', lead: 'funnel', new_lead: 'funnel', visit: 'calendar', ticket: 'wrench', booking: 'receipt', share_view: 'eye', chat: 'chat', payout: 'rupee', inventory: 'grid', update: 'building', payment: 'rupee', routing: 'alert' };
  return (
    <div className="card bell">
      <div className="card-h"><h3>Notifications</h3></div>
      <div style={{ padding: '6px 0', maxHeight: 420, overflow: 'auto' }}>
        {list.length === 0 && <p className="muted" style={{ padding: '6px 18px' }}>Nothing new</p>}
        {list.slice(0, 20).map(n => (
          <button key={n.id} className="bellrow" onClick={() => onPick(n)}>
            <span className="belli"><Icon name={ic[n.kind] || 'bell'} /></span>
            <span style={{ minWidth: 0, flex: 1, fontWeight: n.read ? 400 : 600 }}>{n.body}</span>
            <span className="time">{ago(n.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardSearch({ go }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    const timer = setTimeout(async () => {
      const [leadsResult, bookingsResult] = await Promise.allSettled([
        api.get('/api/leads?q=' + encodeURIComponent(term)), api.get('/api/bookings'),
      ]);
      const found = [];
      if (leadsResult.status === 'fulfilled' && Array.isArray(leadsResult.value)) {
        found.push(...leadsResult.value.slice(0, 5).map(item => ({ id: item.id, title: item.name || item.phone, detail: 'Lead · ' + (item.project_name || 'No project'), route: 'leads/' + item.id })));
      }
      if (bookingsResult.status === 'fulfilled' && Array.isArray(bookingsResult.value)) {
        const matching = bookingsResult.value.filter(item => [item.customer_name, item.customer_phone, item.unit_no, item.project_name].some(value => String(value || '').toLowerCase().includes(term.toLowerCase())));
        found.push(...matching.slice(0, 5).map(item => ({ id: item.id, title: item.customer_name || item.unit_no, detail: 'Booking · ' + item.unit_no + ' · ' + item.project_name, route: 'bookings/' + item.id })));
      }
      setResults(found.slice(0, 7));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);
  const choose = result => { setOpen(false); setQuery(''); go(result.route); };
  return <div className="dashboard-search-wrap">
    <label className="dashboard-search"><Icon name="search" /><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter' && results[0]) choose(results[0]); if (event.key === 'Escape') setOpen(false); }} placeholder="Search leads, bookings, buyers..." aria-label="Search leads, bookings, and buyers" /><kbd>Ctrl K</kbd></label>
    {open && query.trim().length >= 2 && <div className="dashboard-search-results">{results.length ? results.map(result => <button key={result.route} onMouseDown={event => event.preventDefault()} onClick={() => choose(result)}><b>{result.title}</b><small>{result.detail}</small></button>) : <span>No matching leads or bookings found.</span>}</div>}
  </div>;
}
