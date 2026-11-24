import React, { useState, useMemo } from 'react';
import { Icon, Modal, copyText } from './ui.jsx';
import { inr, money, sqft } from '../lib/format.js';
import { emi } from '../lib/pricing.js';

export default function ShareModal({
  url,
  title,
  text,
  unit,
  project,
  lead,
  clientPhone,
  hideDirectNumber = false,
  say,
  onClose,
}) {
  const initialPhone = hideDirectNumber ? '' : String(clientPhone || lead?.phone || '').replace(/\D/g, '').replace(/^91/, '').replace(/^0+/, '');
  const [targetPhone, setTargetPhone] = useState(initialPhone);
  
  // Customization options
  const [includeSpecs, setIncludeSpecs] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeEmi, setIncludeEmi] = useState(true);
  const [includeMediaNote, setIncludeMediaNote] = useState(true);
  const [customNote, setCustomNote] = useState('');

  // Compute property details
  const price = Number(unit?.price || unit?.cost?.total || 0);
  const carpet = unit?.carpet_sqft || unit?.type?.carpet_sqft;
  const superSqft = unit?.super_sqft || unit?.type?.super_sqft;
  const bhk = unit?.bhk || unit?.type?.bhk;
  const estEmi = price > 0 ? emi(price * 0.8, 8.6, 20) : 0;

  // Real-time formatted WhatsApp message
  const fullMessage = useMemo(() => {
    const greetingName = lead?.name ? ` ${lead.name.split(' ')[0]}` : '';
    const lines = [];

    lines.push(`Namaste${greetingName}! 🙏`);
    lines.push(`Sharing the details for *${title || 'our property'}*:`);
    lines.push('');

    if (includeSpecs && (unit || bhk)) {
      lines.push('📋 *Property Details:*');
      if (unit?.unit_no) lines.push(`• Unit: Flat ${unit.unit_no}${unit.tower ? ' (Tower ' + unit.tower + ')' : ''}`);
      if (bhk) lines.push(`• Configuration: ${bhk} BHK`);
      if (unit?.floor !== undefined) lines.push(`• Floor: ${unit.floor === 0 ? 'Ground' : unit.floor}${unit.facing ? ' (' + unit.facing + ' facing)' : ''}`);
      if (carpet) lines.push(`• Carpet Area: ${sqft(carpet)}`);
      if (superSqft) lines.push(`• Super Built-up: ${sqft(superSqft)}`);
      lines.push('');
    }

    if (includePrice && price > 0) {
      lines.push('💰 *Pricing:*');
      lines.push(`• All-inclusive Price: *${inr(price)}*`);
      if (includeEmi && estEmi > 0) {
        lines.push(`• Estimated EMI: *${inr(estEmi)}/month* (at 8.6% for 20 yrs)`);
      }
      lines.push('');
    } else if (includePrice && project?.from_price) {
      lines.push(`💰 *Starting Price:* from ${inr(project.from_price)}`);
      lines.push('');
    }

    if (customNote.trim()) {
      lines.push(`📝 *Note:* ${customNote.trim()}`);
      lines.push('');
    }

    if (includeMediaNote) {
      lines.push('📸 *Photos, 3D Walkthrough & Cost Sheet:*');
      lines.push(`👉 Tap here to view: ${url}`);
    } else {
      lines.push(`🔗 *Link:* ${url}`);
    }

    lines.push('');
    lines.push('Feel free to call or reply on WhatsApp for a site visit!');

    return lines.join('\n');
  }, [lead?.name, title, includeSpecs, unit, bhk, carpet, superSqft, includePrice, price, includeEmi, estEmi, project?.from_price, customNote, includeMediaNote, url]);

  // Actions
  const openWhatsApp = phoneNum => {
    const clean = String(phoneNum || targetPhone || '').replace(/\D/g, '').replace(/^0+/, '');
    const fullPhone = clean.length === 10 ? '91' + clean : clean;
    const waUrl = fullPhone
      ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(fullMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(fullMessage)}`;
    window.open(waUrl, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'Property Details',
          text: fullMessage,
          url: url,
        });
      } catch (err) {
        if (err.name !== 'AbortError') copyText(fullMessage, say);
      }
    } else {
      copyText(fullMessage, say);
    }
  };

  return (
    <Modal
      title="Share Property with Client"
      wide
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <Icon name="eye" />Preview Page
            </a>
            <button className="btn" type="button" onClick={() => copyText(fullMessage, say)}>
              <Icon name="copy" />Copy Message
            </button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button className="btn ghost" type="button" onClick={handleNativeShare}>
                <Icon name="share" />Share via Apps
              </button>
            )}
          </div>
          <button className="btn wa-btn" type="button" onClick={() => openWhatsApp(targetPhone)}>
            <Icon name="wa" />Share on WhatsApp
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Direct Send to Number Box */}
        {!hideDirectNumber && <div className="card" style={{ background: 'var(--panel-2)', boxShadow: 'none' }}>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              <Icon name="wa" style={{ width: 15, height: 15, verticalAlign: -2, color: '#25D366' }} /> Send Directly to WhatsApp Number:
            </span>
            <div className="share-phone-row">
              <input
                type="tel"
                className="input"
                placeholder="Enter 10-digit mobile number"
                value={targetPhone}
                onChange={e => setTargetPhone(e.target.value)}
                style={{ maxWidth: 300 }}
              />
              <button
                type="button"
                className="btn wa-btn"
                disabled={!targetPhone || targetPhone.replace(/\D/g, '').length < 10}
                onClick={() => openWhatsApp(targetPhone)}
              >
                <Icon name="send" />Send on WhatsApp
              </button>
            </div>
            <span className="hint">
              {targetPhone.replace(/\D/g, '').length >= 10
                ? `Ready to open chat with +91 ${targetPhone.replace(/\D/g, '').slice(-10)}`
                : 'Or click "Share on WhatsApp" below to select any contact inside WhatsApp.'}
            </span>
          </div>
        </div>}

        {/* Link box */}
        <div className="sharebox">
          <span className="mono">{url}</span>
          <button className="btn sm" type="button" onClick={() => copyText(url, say)}>
            <Icon name="copy" />Copy Link
          </button>
        </div>

        {/* Customization Options */}
        <div className="share-toggles">
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
            Customize Message Content
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {(unit || bhk) && (
              <label className="share-toggle-item">
                <span>Include Specifications (Area, Floor)</span>
                <input
                  type="checkbox"
                  checked={includeSpecs}
                  onChange={e => setIncludeSpecs(e.target.checked)}
                />
              </label>
            )}
            <label className="share-toggle-item">
              <span>Include All-in Pricing</span>
              <input
                type="checkbox"
                checked={includePrice}
                onChange={e => setIncludePrice(e.target.checked)}
              />
            </label>
            {price > 0 && (
              <label className="share-toggle-item">
                <span>Include Monthly EMI Estimate</span>
                <input
                  type="checkbox"
                  checked={includeEmi}
                  onChange={e => setIncludeEmi(e.target.checked)}
                />
              </label>
            )}
            <label className="share-toggle-item">
              <span>Mention Photos & 3D Walkthrough</span>
              <input
                type="checkbox"
                checked={includeMediaNote}
                onChange={e => setIncludeMediaNote(e.target.checked)}
              />
            </label>
          </div>
          <div>
            <input
              type="text"
              className="input"
              placeholder="Add personal note (optional, e.g. Special offer valid till Sunday)"
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
        </div>

        {/* Live Message Preview */}
        <div className="field">
          <label>WhatsApp Message Preview</label>
          <div className="msgpreview">{fullMessage}</div>
        </div>
      </div>
    </Modal>
  );
}

