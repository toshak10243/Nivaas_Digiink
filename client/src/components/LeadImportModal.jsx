import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Modal, Field } from './ui.jsx';

const COLUMNS = ['name', 'phone', 'email', 'project', 'budget', 'config_pref', 'source', 'campaign'];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted value.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('Add a header row and at least one lead row.');
  const headers = rows[0].map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some(header => !COLUMNS.includes(header))) throw new Error(`Use only these headers: ${COLUMNS.join(', ')}. Include name and phone.`);
  if (!headers.includes('name') || !headers.includes('phone')) throw new Error('CSV must include name and phone columns.');
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

export default function LeadImportModal({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const readFile = async file => {
    setError(''); setPreview(null);
    try {
      if (!file || file.size > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');
      const parsed = parseCsv(await file.text());
      if (parsed.length > 250) throw new Error('Import up to 250 leads per file.');
      setRows(parsed);
    } catch (e) { setRows(null); setError(e.message); }
  };
  const check = async () => {
    setBusy(true); setError('');
    try { setPreview(await api.post('/api/leads/import/preview', { rows })); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const commit = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.post('/api/leads/import', { rows });
      onDone(`Imported ${result.imported} leads; skipped ${result.skipped_duplicates} duplicates and ${result.invalid} invalid rows.`);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  const ready = preview?.ready > 0;
  return <Modal title="Import leads from CSV" wide onClose={() => !busy && onClose()} footer={<>
    <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
    {!preview ? <button className="btn sun" disabled={!rows?.length || busy} onClick={check}>{busy ? 'Checking…' : 'Preview rows'}</button> : <button className="btn sun" disabled={!ready || busy} onClick={commit}>{busy ? 'Importing…' : `Import ${preview.ready} leads`}</button>}
  </>}>
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>CSV headers: <code>name, phone</code> (required), plus optional <code>email, project, budget, config_pref, source, campaign</code>. Existing phone numbers and repeated rows are flagged and skipped.</p>
      <Field label="CSV file" id="lead-csv"><input id="lead-csv" type="file" accept=".csv,text/csv" className="input" onChange={e => readFile(e.target.files?.[0])} disabled={busy} /></Field>
      {rows && <div className="note"><b>{rows.length} rows loaded.</b> Preview checks phone/email formats, project names, and duplicate phones before importing.</div>}
      {preview && <><div className="kgrid"><div className="card card-b"><b>{preview.ready}</b><div className="muted">Ready</div></div><div className="card card-b"><b>{preview.duplicates}</b><div className="muted">Duplicates</div></div><div className="card card-b"><b>{preview.invalid}</b><div className="muted">Invalid</div></div></div>
        <div className="tablewrap" style={{ maxHeight: 280, overflow: 'auto' }}><table><thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Status</th><th>Details</th></tr></thead><tbody>{preview.rows.map(item => <tr key={item.row}><td>{item.row}</td><td>{item.name || '—'}</td><td>{item.phone || '—'}</td><td>{item.status}</td><td>{item.reason || 'Will be imported'}</td></tr>)}</tbody></table></div>
      </>}
      {error && <div role="alert" className="note" style={{ color: 'var(--red)' }}><Icon name="alert" /> {error}</div>}
    </div>
  </Modal>;
}
