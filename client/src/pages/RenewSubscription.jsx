import React, { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { Icon, Modal } from '../components/ui.jsx';

export default function RenewSubscriptionModal({ isOpen, onClose, billing, onRenewed, say }) {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('half_yearly');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentMode, setPaymentMode] = useState('upi');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.get('/api/billing/plans').then(res => {
        if (res.plans) setPlans(res.plans.filter(p => p.id !== 'trial'));
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPlan = plans.find(p => p.id === selectedPlan) || plans[1] || plans[0];
  const pending = billing?.pending_payment;
  const methods = billing?.payment_methods;

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl('');
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    say?.('Copied to clipboard');
    setTimeout(() => setCopiedKey(''), 2500);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!methods) {
      say?.('Subscription payment destinations have not been configured and verified yet.');
      return;
    }
    if (!utrNumber || utrNumber.trim().length < 6) {
      say?.('Please enter a valid 12-digit UTR / Transaction Reference number');
      return;
    }
    if (!file) {
      say?.('Please attach a screenshot or receipt of the payment');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('plan_type', selectedPlan);
      fd.append('amount', currentPlan?.price || 0);
      fd.append('utr_number', utrNumber.trim());
      fd.append('payment_mode', paymentMode);
      fd.append('screenshot', file);

      const res = await api.post('/api/billing/submit-proof', fd);
      say?.(res.message || 'Payment proof submitted successfully!');
      onRenewed?.();
      onClose();
    } catch (err) {
      say?.(err.message || 'Failed to submit payment proof');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-box renew-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 820,
          width: '94%',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: '24px 28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: '#38bdf8', color: '#0f172a', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                Subscription Plans
              </span>
              {billing?.is_expired && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                  Plan Expired
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>
              Choose Your Nivaas Builder Plan
            </h2>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
              Full AI Real Estate Suite · Dedicated Database · WhatsApp Automation · Zero Hidden Charges
            </p>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close modal" style={{ color: '#94a3b8' }}>
            <Icon name="x" />
          </button>
        </div>

        {pending && (
          <div style={{ background: 'rgba(234, 179, 8, 0.12)', border: '1px solid #eab308', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#facc15', fontWeight: 700, fontSize: 14 }}>
              <Icon name="clock" /> Payment Verification In Progress
            </div>
            <p style={{ margin: '4px 0 0', color: '#fef08a', fontSize: 12.5, lineHeight: 1.5 }}>
              Your payment proof for <b>{pending.plan_type?.toUpperCase()}</b> (UTR: <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>{pending.utr_number}</code>) is currently under review by our team. Your workspace will be activated automatically within 1–2 hours.
            </p>
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          {plans.map(p => {
            const isSelected = selectedPlan === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.08)' : '#1e293b',
                  border: isSelected ? '2px solid #38bdf8' : '1px solid #334155',
                  borderRadius: 12,
                  padding: '16px 14px',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.popular && (
                  <span style={{ position: 'absolute', top: -10, right: 12, background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 9999 }}>
                    MOST POPULAR
                  </span>
                )}
                {p.id === 'lifetime' && (
                  <span style={{ position: 'absolute', top: -10, right: 12, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 9999 }}>
                    VIP DEAL
                  </span>
                )}
                <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? '#38bdf8' : '#e2e8f0', marginBottom: 6 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  ₹{p.price.toLocaleString('en-IN')}
                </div>
                {p.discountNote && (
                  <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginBottom: 8 }}>
                    {p.discountNote}
                  </div>
                )}
                <ul style={{ margin: '8px 0 0', paddingLeft: 14, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4, flex: 1 }}>
                  {p.features?.slice(0, 3).map((feat, idx) => (
                    <li key={idx} style={{ marginBottom: 3 }}>{feat}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Payment & Screenshot Submission Section */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
            
            {/* Left Column: Bank & UPI Info */}
            {methods ? <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="receipt" /> Step 1: Pay ₹{(currentPlan?.price || 0).toLocaleString('en-IN')} via UPI or NEFT
              </h3>

              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                  Official UPI ID (Instant)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <code style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                    {methods.upi.upiId}
                  </code>
                  <button
                    type="button"
                    className="btn sm ghost"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => copyToClipboard(methods.upi.upiId, 'upi')}
                  >
                    {copiedKey === 'upi' ? '✓ Copied' : 'Copy UPI'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Scan on PhonePe / Google Pay / Paytm / BHIM
                </div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                  Bank Current Account (NEFT / RTGS / IMPS)
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#cbd5e1' }}>
                  <div><b>Beneficiary:</b> {methods.bank.accountName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><b>A/C No:</b> <code style={{ color: '#fff' }}>{methods.bank.accountNumber}</code></span>
                    <button type="button" className="btn sm ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => copyToClipboard(methods.bank.accountNumber, 'ac')}>
                      {copiedKey === 'ac' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><b>IFSC:</b> <code style={{ color: '#fff' }}>{methods.bank.ifscCode}</code></span>
                    <button type="button" className="btn sm ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => copyToClipboard(methods.bank.ifscCode, 'ifsc')}>
                      {copiedKey === 'ifsc' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div><b>Bank:</b> {methods.bank.bankName}</div>
                </div>
              </div>
            </div> : <div role="status" style={{ border: '1px solid #f59e0b', borderRadius: 8, padding: 16, color: '#fcd34d', lineHeight: 1.5 }}>
              Subscription payment destinations are not configured and verified yet. Please contact support before making a payment.
            </div>}

            {/* Right Column: Upload Proof Form */}
            <form onSubmit={handleSubmit}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="checkCircle" /> Step 2: Submit UTR &amp; Payment Screenshot
              </h3>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>
                  Payment Mode
                </label>
                <select
                  className="select"
                  style={{ width: '100%', background: '#0f172a', borderColor: '#334155', color: '#fff' }}
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value)}
                >
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="neft">NEFT / RTGS Bank Transfer</option>
                  <option value="imps">IMPS Instant Transfer</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>
                  UTR / Reference / Transaction ID *
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', background: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: 13 }}
                  placeholder="e.g. 432198765432 or UPI Ref No"
                  value={utrNumber}
                  onChange={e => setUtrNumber(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>
                  Attach Payment Screenshot / Receipt *
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  style={{ fontSize: 12, color: '#94a3b8' }}
                  required
                />
                {previewUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={previewUrl}
                      alt="Payment Screenshot Preview"
                      style={{ maxHeight: 110, borderRadius: 6, border: '1px solid #334155' }}
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn sun"
                disabled={submitting || !methods}
                style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 700 }}
              >
                {submitting ? 'Submitting Proof…' : `Submit Proof for ₹${(currentPlan?.price || 0).toLocaleString('en-IN')}`}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}

