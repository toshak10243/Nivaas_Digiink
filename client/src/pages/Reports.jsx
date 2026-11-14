import { api } from '../api/index.js';
import { Empty, Icon, Loading, useLoad } from '../components/ui.jsx';
import { money } from '../lib/format.js';

export default function Reports({ go }) {
  const [dashboard, reload, error] = useLoad(() => api.get('/api/dashboard'), []);

  if (error) return <div className="page"><Empty icon="chart" title="Unable to load reports">{error}<button className="btn" onClick={reload}>Try again</button></Empty></div>;
  if (!dashboard) return <div className="page"><Loading /></div>;
  const inventory = Object.fromEntries(dashboard.inventory.map(item => [item.status, item.n]));
  const leadCount = dashboard.pipeline.reduce((sum, item) => sum + Number(item.n || 0), 0);
  return <div className="page reports-page">
    <div className="pagehead"><div><h2>Reports</h2><p>Monthly sales, inventory, and lead activity from your live CRM data.</p></div></div>
    <section className="reports-summary">
      <article><span>Gross sales booked</span><b>{money(dashboard.sales.value)}</b><small>{dashboard.sales.units} bookings this month</small></article>
      <article><span>Collections deposited</span><b>{money(dashboard.collected)}</b><small>Payments received this month</small></article>
      <article><span>Available inventory</span><b>{inventory.available || 0} / {Object.values(inventory).reduce((sum, n) => sum + n, 0)}</b><small>Units currently available</small></article>
      <article><span>Active leads</span><b>{leadCount}</b><small>Across all pipeline stages</small></article>
    </section>
    <section className="card admin-panel">
      <header className="admin-panel-head"><h3><Icon name="chart" />Sales trend · Last 6 months</h3><span>Booked value and units from current CRM records</span></header>
      <div className="reports-table-wrap"><table className="performer-table reports-table"><thead><tr><th>Month</th><th>Booked value</th><th>Deals</th></tr></thead><tbody>{dashboard.trend.map(item => <tr key={item.month}><td>{new Date(item.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td><td>{money(item.value)}</td><td>{item.units}</td></tr>)}</tbody></table></div>
    </section>
    <button className="btn" onClick={() => go('dashboard')}>Back to dashboard</button>
  </div>;
}
