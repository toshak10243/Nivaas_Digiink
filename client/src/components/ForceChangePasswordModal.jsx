import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Field } from './ui.jsx';

export default function ForceChangePasswordModal({ me, reloadMe, say }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (next.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }

    if (current === next) {
      setError('New password cannot be the same as your temporary password.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/password', { current, next });
      say('Password successfully updated! Welcome to Nivaas.');
      await reloadMe();
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
            padding: '28px 24px',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '4px 12px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 10,
            }}
          >
            First-Time Login Setup
          </div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800 }}>
            Set Your Permanent Password
          </h2>
          <div style={{ fontSize: 13.5, color: '#DBEAFE' }}>
            Namaste <b>{me?.user?.name}</b>! Please replace your temporary password with a secure permanent one to activate your workspace.
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div
              style={{
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <Field label="Current / Temporary Password" id="force-pw-curr">
            <input
              id="force-pw-curr"
              type="password"
              required
              autoComplete="current-password"
              placeholder="e.g. Nivaas@xxxx"
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
            />
          </Field>

          <Field label="New Permanent Password (8+ characters)" id="force-pw-next">
            <input
              id="force-pw-next"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Enter your new secret password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
            />
          </Field>

          <Field label="Confirm New Password" id="force-pw-confirm">
            <input
              id="force-pw-confirm"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Re-type new password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
            />
          </Field>

          <div style={{ paddingTop: 8 }}>
            <button
              type="submit"
              disabled={busy || !current || next.length < 8}
              className="btn sun"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 8,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Securing Account...' : 'Set Password & Enter Workspace →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
