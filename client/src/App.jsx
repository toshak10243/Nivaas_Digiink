import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api/index.js';
import { Icon, Logo, Avatar, useLoad } from './components/ui.jsx';
import { ago } from './lib/format.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
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

const NAV = {
  admin: [
    ['dashboard', 'Dashboard', 'home'],
    ['projects', 'Projects', 'building'],
    ['inventory', 'Inventory', 'grid'],
    ['leads', 'Leads', 'funnel'],
    ['visits', 'Site visits', 'calendar'],
    ['chats', 'WhatsApp', 'chat'],
    ['bookings', 'Bookings', 'receipt'],
    ['portal', 'Buyer Handover', 'shield'],
    ['earnings', 'Payouts', 'rupee'],
    ['team', 'Team', 'users'],
    ['tickets', 'Complaints', 'wrench'],
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
  useEffect(() => { const f = () => setRoute(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = useCallback(path => { location.hash = '#/' + path.replace(/^\//, ''); }, []);
  const say = useCallback(t => { setToast(t); clearTimeout(say.t); say.t = setTimeout(() => setToast(''), 3200); }, []);

  if (route[0] === 's') return <><SharePage token={route[1]} say={say} />{toast && <div className="toast" role="status">{toast}</div>}</>;
  if (!authed) return <Login onDone={() => { setAuthed(true); go(''); }} />;
  return <Shell key={sess} route={route} go={go} say={say} toast={toast} onSwitchRole={r => { api.loginAs(r); location.hash = '#/'; setSess(x => x + 1); }}
    onLogout={() => { api.logout(); setAuthed(false); location.hash = '#/'; }} />;
}

function Shell({ route, go, say, toast, onLogout, onSwitchRole }) {
  const [me, reloadMe] = useLoad(() => api.get('/api/me'), []);
  const [notifs, reloadN] = useLoad(() => api.get('/api/notifications'), []);
  const [bell, setBell] = useState(false);
  const [showEmi, setShowEmi] = useState(false);
  useEffect(() => { const t = setInterval(reloadN, 30000); return () => clearInterval(t); }, [reloadN]);
  if (!me) return <div className="boot"><Logo size={44} /></div>;
  const role = me.user.role;
  const nav = NAV[role];
  const page = nav.some(n => n[0] === route[0]) ? route[0] : nav[0][0];
  const unread = (notifs || []).filter(n => !n.read).length;
  const props = { me, go, say, params: route.slice(1), reloadMe };
  const theme = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><Logo /><div><b>Nivaas</b><small>{me.org.name}</small></div></div>
        <div className="navlist">
          {nav.map(([k, l, ic]) => (
            <button key={k} className="navbtn" aria-current={page === k ? 'page' : undefined} onClick={() => go(k)}><Icon name={ic} /><span>{l}</span></button>
          ))}
        </div>
        <div className="railfoot">
          {role === 'sales' && <Availability me={me} reload={reloadMe} say={say} />}
          <div className="bizchip"><Avatar name={me.user.name} /><div style={{ minWidth: 0 }}><b>{me.user.name}</b><span>{ROLE_LABEL[role]}</span></div></div>
        </div>
      </nav>
      <main className="work">
        <header className="topbar">
          <div style={{ minWidth: 0 }}><h1>{TITLES[page]}</h1></div>
          <div className="spacer" />
          {api.mode === 'demo' && <DemoSwitch role={role} onSwitch={onSwitchRole} />}
          <button className="iconbtn" onClick={() => setShowEmi(true)} title="Home Loan EMI Calculator" aria-label="Home Loan EMI Calculator"><Icon name="calc" /></button>
          <button className="iconbtn" onClick={theme} aria-label="Switch theme"><Icon name="moon" /></button>
          <div style={{ position: 'relative' }}>
            <button className="iconbtn" aria-label="Notifications" onClick={() => { setBell(b => !b); if (!bell && unread) api.post('/api/notifications/read').then(reloadN); }}>
              <Icon name="bell" />{unread > 0 && <span className="dot" />}
            </button>
            {bell && <Bell list={notifs || []} onPick={n => { setBell(false); if (n.link) go(n.link.replace(/^\//, '').replace('share', 'inventory')); }} />}
          </div>
          <button className="iconbtn" aria-label="Log out" onClick={onLogout}><Icon name="logout" /></button>
        </header>
        <div className="content" key={page + route.join('/')}>
          {page === 'dashboard' && <Dashboard {...props} />}
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
