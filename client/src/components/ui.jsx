import React, { useEffect, useState, useCallback, useRef } from 'react';
import logoImg from '../assets/logo.png';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' };
const paths = {
  home: <><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-6h4v6" /></>,
  building: <><path d="M4 21V5l8-3v19M12 8l8 3v10" /><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  funnel: <path d="M3 4h18l-7 9v6l-4 2v-8z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  wallet: <><path d="M4 6.5A2.5 2.5 0 016.5 4H20v16H6a2 2 0 01-2-2z" /><path d="M4 7h15M16 12h4M17 12v.01" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a4 4 0 004 4M17 6h3v2a4 4 0 01-4 4" /></>,
  chat: <><path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z" /></>,
  rupee: <><path d="M6 4h12M6 9h12M13 20L7 13h3a4 4 0 000-8" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 15c1.8.6 2.8 2.2 3 5" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  bell: <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 003.4 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  phone: <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></>,
  link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  play: <path d="M7 4l13 8-13 8z" />,
  camera: <><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  pin: <><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  userPlus: <><circle cx="9" cy="8" r="4" /><path d="M2 21c1-4 3.6-6 7-6s6 2 7 6M19 8v6M16 11h6" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  wa: <><path d="M20.5 11.6A8.5 8.5 0 017.9 19l-4.4 1.2 1.2-4.2A8.5 8.5 0 1120.5 11.6z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8a4 4 0 01-2.8-2.8l.8-1-1-2z" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18" /></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2" /></>,
  file: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></>,
};
export function Icon({ name, ...rest }) { return <svg {...P} aria-hidden="true" {...rest}>{paths[name] || paths.spark}</svg>; }

export function Logo({ size = 34, className = '', style = {} }) {
  return (
    <img
      src={logoImg}
      alt="Nivaas"
      width={size}
      height={size}
      className={`app-logo ${className}`.trim()}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        borderRadius: 8,
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style
      }}
    />
  );
}

export const initials = n => {
  if (!n) return 'U';
  const parts = String(n).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};
const HUES = ['#E8EAFE', '#FFF0E3', '#E2F6EC', '#FDE9EA', '#EEF1F7', '#FFF2D9'];
export function Avatar({ name, size, tone, src }) {
  const [imgErr, setImgErr] = useState(false);
  const h = HUES[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  const showImg = Boolean(src && !imgErr);
  return (
    <div
      className={'av' + (size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : '')}
      style={tone !== false ? { background: showImg ? 'transparent' : h, borderColor: 'transparent', color: '#1E293B', fontWeight: 700 } : undefined}
    >
      {showImg ? (
        <img src={src} alt="" onError={() => setImgErr(true)} />
      ) : (
        <span style={{ fontSize: size === 'lg' ? 17 : size === 'sm' ? 11 : 13, letterSpacing: 0.5 }}>
          {initials(name)}
        </span>
      )}
    </div>
  );
}

const STATUS = {
  available: ['ok', 'Available'], hold: ['warm', 'On hold'], booked: ['new', 'Booked'], sold: ['ink', 'Sold'], blocked: ['cold', 'Blocked'], unavailable: ['cold', 'Not available'],
  hot: ['hot', 'Hot'], warm: ['warm', 'Warm'], cold: ['cold', 'Cold'],
  open: ['hot', 'Open'], in_progress: ['warm', 'In progress'], resolved: ['ok', 'Resolved'], closed: ['cold', 'Closed'],
  scheduled: ['new', 'Scheduled'], done: ['ok', 'Done'], no_show: ['hot', 'No-show'], cancelled: ['cold', 'Cancelled'],
  pending: ['warm', 'Pending'], approved: ['new', 'Approved'], paid: ['ok', 'Paid'], void: ['cold', 'Void'],
  agreement: ['new', 'Agreement'], registered: ['ok', 'Registered'], possession: ['ok', 'Possession'],
  urgent: ['hot', 'Urgent'], normal: ['cold', 'Normal'], low: ['cold', 'Low'],
  available_now: ['ok', 'Available'], busy: ['warm', 'Busy'], away: ['cold', 'Away'],
};
export function Pill({ s, label }) { const [tone, l] = STATUS[s] || ['cold', s]; return <span className={'pill ' + tone}>{label || l}</span>; }

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, actions }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="dscrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-h"><div style={{ minWidth: 0, flex: 1 }}><h3>{title}</h3>{sub && <div className="muted" style={{ fontSize: 13 }}>{sub}</div>}</div>{actions}<button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="drawer-b">{children}</div>
      </aside>
    </div>
  );
}

export const Empty = ({ icon = 'spark', title, children }) => (
  <div className="empty"><span className="empty-i"><Icon name={icon} /></span><b>{title}</b>{children && <span>{children}</span>}</div>
);

export function Seg({ value, onChange, options, label }) {
  return <div className="seg" role="group" aria-label={label}>{options.map(([k, l]) => <button type="button" key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Field({ label, hint, children, id }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

export function Switch({ on, onChange, label }) { return <button type="button" className="switch" role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />; }

/** load data; returns [data, reload, error] */
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const load = useCallback(() => fn().then(d => alive.current && (setData(d), setError(null))).catch(e => alive.current && setError(e.message)), deps); // eslint-disable-line
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  return [data, load, error];
}

export function Loading() { return <div className="loading"><span /><span /><span /></div>; }

export async function copyText(text, say) {
  try { await navigator.clipboard.writeText(text); say?.('Link copied. Paste it in WhatsApp.'); return true; }
  catch { say?.('Select the link and copy it'); return false; }
}
