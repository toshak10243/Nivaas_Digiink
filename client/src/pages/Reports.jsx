import React, { useMemo, useState } from 'react';
import { api } from '../api/index.js';
import { Empty, Icon, Loading, useLoad } from '../components/ui.jsx';
import { money } from '../lib/format.js';

const number = value => Number(value || 0);
const percent = (value, total) => total ? `${Math.round(value / total * 100)}%` : '0%';
const delta = (current, previous) => {
  const a = number(current), b = number(previous);
  if (!b) return a ? '+100%' : '0%';
  const pct = Math.round((a - b) / b * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
};

export default function Reports({ go }) {
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [quarter, setQuarter] = useState('1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState({ project: '', salesperson: '', broker: '', source: '', campaign: '' });
  const [exportView, setExportView] = useState('salespeople');
  const [selectedSalesperson, setSelectedSalesperson] = useState('');
  const [options, , optionsError] = useLoad(() => api.get('/api/reports/options'), []);
  const query = useMemo(() => {
    const params = new URLSearchParams({ period, year });
    if (period === 'month') params.set('month', month);
    if (period === 'quarter') params.set('quarter', quarter);
    if (period === 'custom') { if (from) params.set('from', from); if (to) params.set('to', to); }
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [period, year, month, quarter, from, to, filters]);
  const [report, reload, error] = useLoad(() => api.get(`/api/reports/analytics?${query}`), [query]);

  const setFilter = key => event => {
    const value = event.target.value;
    setFilters(current => ({ ...current, [key]: value }));
    if (key === 'salesperson') setSelectedSalesperson(value);
  };
  const resetFilters = () => { setFilters({ project: '', salesperson: '', broker: '', source: '', campaign: '' }); setSelectedSalesperson(''); };

  const exportRows = () => {
    if (!report) return [];
    const map = {
      salespeople: ['Salesperson', report.salespeople.map(row => ({ Name: row.name, Leads: row.leads, 'Contact rate': `${row.contact_rate_pct}%`, Visits: row.visits, Bookings: row.bookings, 'Sales value': row.sales_value, 'Conversion': `${row.conversion_pct}%`, 'Target achievement': `${row.target_achievement_pct}%`, 'First response (min)': row.first_response_minutes }))],
      sources: ['Lead sources', report.sources], campaigns: ['Campaigns', report.campaigns], projects: ['Projects', report.projects], brokers: ['Brokers', report.brokers],
      lostReasons: ['Lost reasons', report.lostReasons], collections: ['Collections by project', report.collections],
    };
    return map[exportView] || map.salespeople;
  };
  const downloadExcel = () => {
    const [name, rows] = exportRows();
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    const csv = [columns, ...rows.map(row => columns.map(column => row[column] ?? ''))]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `nivaas-${name.toLowerCase().replaceAll(' ', '-')}-${report.start}-to-${report.end}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  if (optionsError) return <div className="page"><Empty icon="chart" title="Unable to load report filters">{optionsError}</Empty></div>;
  if (!report && error) return <div className="page"><Empty icon="chart" title="Unable to load reports">{error}<button className="btn" onClick={reload}>Try again</button></Empty></div>;
  if (!options || !report) return <div className="page"><Loading /></div>;
  const totals = report.totals;
  const kpis = [
    ['New leads', 'leads', 'leads_prev', totals.leads],
    ['Visits scheduled', 'visits_scheduled', 'visits_scheduled_prev', totals.visits_scheduled],
    ['Visits completed', 'visits_completed', 'visits_completed_prev', totals.visits_completed],
    ['Sales value', 'sales_value', 'sales_value_prev', money(totals.sales_value)],
    ['Homes sold', 'sales_units', 'sales_units_prev', totals.sales_units],
    ['Collections', 'collections', 'collections_prev', money(totals.collections)],
  ];
  const selectedName = options.salespeople.find(person => person.id === filters.salesperson)?.name;

  return <div className="page reports-page">
    <div className="pagehead reports-toolbar"><div style={{ flex: 1 }}><h2>Reports &amp; Performance</h2><p>Review leads, visits, sales, collections, sources, and team performance against CRM records.</p></div>
      <label className="field"><span className="eyebrow">Export view</span><select className="select" value={exportView} onChange={event => setExportView(event.target.value)}><option value="salespeople">Salespeople</option><option value="sources">Sources</option><option value="campaigns">Campaigns</option><option value="projects">Projects</option><option value="brokers">Brokers</option><option value="lostReasons">Lost reasons</option><option value="collections">Collections</option></select></label>
      <button className="btn" onClick={downloadExcel}><Icon name="download" />Excel CSV</button><button className="btn sun" onClick={() => window.print()}><Icon name="file" />Print / Save PDF</button>
    </div>

    <section className="card reports-filters">
      <div className="reports-filter-grid">
        <label className="field"><span className="eyebrow">Date range</span><select className="select" value={period} onChange={event => { const next = event.target.value; setPeriod(next); if (next === 'custom') { setFrom(`${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`); setTo(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())); } }}><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option><option value="custom">Custom dates</option></select></label>
        {period !== 'custom' && <label className="field"><span className="eyebrow">Year</span><input className="input" type="number" min="2000" max="2200" value={year} onChange={event => setYear(event.target.value)} /></label>}
        {period === 'month' && <label className="field"><span className="eyebrow">Month</span><select className="select" value={month} onChange={event => setMonth(event.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString('en-IN', { month: 'long' })}</option>)}</select></label>}
        {period === 'quarter' && <label className="field"><span className="eyebrow">Quarter</span><select className="select" value={quarter} onChange={event => setQuarter(event.target.value)}>{[1, 2, 3, 4].map(item => <option key={item} value={item}>Q{item}</option>)}</select></label>}
        {period === 'custom' && <><label className="field"><span className="eyebrow">From</span><input className="input" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="field"><span className="eyebrow">To</span><input className="input" type="date" value={to} onChange={event => setTo(event.target.value)} /></label></>}
        <label className="field"><span className="eyebrow">Project</span><select className="select" value={filters.project} onChange={setFilter('project')}><option value="">All projects</option>{options.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span className="eyebrow">Salesperson</span><select className="select" value={filters.salesperson} onChange={setFilter('salesperson')}><option value="">All salespeople</option>{options.salespeople.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span className="eyebrow">Broker</span><select className="select" value={filters.broker} onChange={setFilter('broker')}><option value="">All brokers</option>{options.brokers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span className="eyebrow">Lead source</span><select className="select" value={filters.source} onChange={setFilter('source')}><option value="">All sources</option>{options.sources.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="field"><span className="eyebrow">Campaign / source reference</span><select className="select" value={filters.campaign} onChange={setFilter('campaign')}><option value="">All campaigns</option>{options.campaigns.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <button className="btn ghost reports-reset" onClick={resetFilters}>Clear filters</button>
      </div>
      <small className="muted">Comparisons use the same date range one year earlier. Report period: {report.start} through {new Date(`${report.end}T00:00:00`).toLocaleDateString('en-IN')} (inclusive).</small>
    </section>

    <section className="reports-summary reports-summary-six">{kpis.map(([title, key, previousKey, display]) => <article key={key}><span>{title}</span><b>{display}</b><small><strong>{delta(totals[key], totals[previousKey])}</strong> vs same period last year</small></article>)}</section>

    <section className="reports-chart-grid">
      <article className="card admin-panel">
        <header className="admin-panel-head"><h3><Icon name="chart" />Leads by source</h3></header>
        {report.sources.length ? <div className="report-bars">{report.sources.map(row => <Bar key={row.source} label={row.source.replaceAll('_', ' ')} value={row.leads} max={Math.max(1, ...report.sources.map(item => number(item.leads)))} />)}</div> : <p className="muted">No leads for this range.</p>}
      </article>
      <article className="card admin-panel">
        <header className="admin-panel-head"><h3><Icon name="calendar" />Visits by month</h3></header>
        {report.visitsByMonth.length ? <div className="report-bars">{report.visitsByMonth.map(row => <div className="report-bar-row" key={row.month}><span>{row.month}</span><div><i style={{ width: `${Math.min(100, number(row.scheduled) / Math.max(1, ...report.visitsByMonth.map(x => number(x.scheduled))) * 100)}%` }} /><i className="secondary" style={{ width: `${Math.min(100, number(row.completed) / Math.max(1, ...report.visitsByMonth.map(x => number(x.scheduled))) * 100)}%` }} /></div><b>{row.scheduled} / {row.completed}</b></div>)}</div> : <p className="muted">No visits for this range.</p>}
      </article>
      <article className="card admin-panel">
        <header className="admin-panel-head"><h3><Icon name="building" />Sales value by month</h3></header>
        {report.salesByMonth.length ? <div className="report-bars">{report.salesByMonth.map(row => <Bar key={row.month} label={row.month} value={row.sales_value} max={Math.max(1, ...report.salesByMonth.map(item => number(item.sales_value)))} format={money} />)}</div> : <p className="muted">No sales for this range.</p>}
      </article>
      <article className="card admin-panel">
        <header className="admin-panel-head"><h3><Icon name="wallet" />Collections by month</h3></header>
        {report.collectionsByMonth.length ? <div className="report-bars">{report.collectionsByMonth.map(row => <Bar key={row.month} label={row.month} value={row.collections} max={Math.max(1, ...report.collectionsByMonth.map(item => number(item.collections)))} format={money} />)}</div> : <p className="muted">No collections for this range.</p>}
      </article>
    </section>

    <section className="card admin-panel">
      <header className="admin-panel-head"><div><h3><Icon name="users" />Salesperson performance</h3><span>Click a salesperson to filter and open their lead drill-down.</span></div></header>
      <div className="reports-table-wrap"><table className="performer-table reports-table"><thead><tr><th>Salesperson</th><th>Leads</th><th>Contact rate</th><th>Visits</th><th>Bookings</th><th>Sales value</th><th>Conversion</th><th>Target</th><th>First response</th></tr></thead><tbody>
        {report.salespeople.map(row => <tr key={row.id} className="report-click-row" onClick={() => { setSelectedSalesperson(row.id); setFilters(current => ({ ...current, salesperson: row.id })); }}><td><b>{row.name}</b></td><td>{row.leads}</td><td>{row.contact_rate_pct}%</td><td>{row.visits}</td><td>{row.bookings}</td><td>{money(row.sales_value)}</td><td>{row.conversion_pct}%</td><td><div className="report-target"><span>{row.target_achievement_pct}%</span><i><b style={{ width: `${Math.min(100, row.target_achievement_pct)}%` }} /></i></div></td><td>{row.first_response_minutes == null ? '—' : `${row.first_response_minutes} min`}</td></tr>)}
      </tbody></table>{!report.salespeople.length && <div className="admin-empty-compact">No salesperson activity for this filter.</div>}</div>
      {selectedSalesperson && report.salespersonLeads.length > 0 && <div className="reports-drilldown"><h4>{selectedName || 'Salesperson'} · leads</h4><div className="reports-table-wrap"><table className="performer-table reports-table"><thead><tr><th>Lead</th><th>Stage</th><th>Source</th><th>Campaign</th><th>Project</th><th>Created</th></tr></thead><tbody>{report.salespersonLeads.map(row => <tr key={row.id} onClick={() => go(`leads/${row.id}`)}><td>{row.name || 'Unnamed lead'}</td><td>{row.stage.replaceAll('_', ' ')}</td><td>{row.source}</td><td>{row.campaign || '—'}</td><td>{row.project || 'Unassigned'}</td><td>{new Date(row.created_at).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div></div>}
    </section>

    <section className="reports-chart-grid">
      <ReportTable title="Source & campaign" icon="funnel" rows={report.campaigns} columns={['source','campaign','leads']} />
      <ReportTable title="Project performance" icon="building" rows={report.projects} columns={['project','leads','visits','bookings','sales_value']} format={{ sales_value: money }} />
      <ReportTable title="Broker performance" icon="briefcase" rows={report.brokers} columns={['broker','bookings','sales_value','commission']} format={{ sales_value: money, commission: money }} />
      <ReportTable title="Lost reasons" icon="x" rows={report.lostReasons} columns={['reason','leads']} />
      <ReportTable title="Collections by project" icon="wallet" rows={report.collections} columns={['project','collected']} format={{ collected: money }} />
    </section>
    <button className="btn" onClick={() => go('dashboard')}>Back to dashboard</button>
  </div>;
}

function Bar({ label, value, max, format = value => Number(value).toLocaleString('en-IN') }) {
  return <div className="report-bar-row"><span>{label}</span><div><i style={{ width: `${Math.min(100, number(value) / max * 100)}%` }} /></div><b>{format(value)}</b></div>;
}

function ReportTable({ title, icon, rows, columns, format = {} }) {
  return <article className="card admin-panel"><header className="admin-panel-head"><h3><Icon name={icon} />{title}</h3></header>{rows.length ? <div className="reports-table-wrap"><table className="performer-table reports-table"><thead><tr>{columns.map(column => <th key={column}>{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{columns.map(column => <td key={column}>{format[column] ? format[column](row[column]) : row[column] ?? '—'}</td>)}</tr>)}</tbody></table></div> : <p className="muted" style={{ padding: 14 }}>No data for this range.</p>}</article>;
}
