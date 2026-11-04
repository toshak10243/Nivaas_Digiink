import React, { useRef } from 'react';
import { Icon, Modal, copyText } from './ui.jsx';
import { inr, money, date, dateTime, phone, sqft } from '../lib/format.js';

export function numberToWordsINR(num) {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = ('000000000' + Math.floor(num)).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
  return 'Rupees ' + str.trim() + ' Only';
}

export default function DocPreviewModal({ type, data = {}, onClose, say = alert }) {
  const printRef = useRef(null);

  const getDocTitle = () => {
    switch (type) {
      case 'cost_sheet': return 'Official Cost Sheet & Price Quote';
      case 'demand_letter': return 'Payment Demand Notice / Milestone Call';
      case 'receipt': return 'Official Payment Acknowledgment Receipt';
      default: return 'Document Preview';
    }
  };

  const handlePrint = () => {
    const sheetEl = printRef.current?.querySelector('.doc-sheet') || document.querySelector('.doc-sheet');
    if (!sheetEl) {
      window.print();
      return;
    }

    const title = getDocTitle();
    const printableHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13.5px;
        line-height: 1.5;
      }
      .no-print-bar {
        background: #0f172a;
        color: #ffffff;
        padding: 10px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 999;
      }
      .no-print-bar button {
        background: #e65100;
        color: #ffffff;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
      }
      .no-print-bar .close-btn {
        background: rgba(255,255,255,0.15);
        margin-right: 8px;
      }
      @media print {
        .no-print-bar { display: none !important; }
        body { padding: 0 !important; }
      }
      .print-container {
        padding: 20px 28px;
        max-width: 840px;
        margin: 0 auto;
      }
      .doc-sheet {
        background: #ffffff !important;
        color: #1e293b !important;
        padding: 0;
        max-width: 100%;
        width: 100%;
        margin: 0 auto;
      }
            .doc-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 14px;
              margin-bottom: 16px;
              gap: 20px;
            }
            .doc-org-name {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              letter-spacing: -0.01em;
              text-transform: uppercase;
            }
            .doc-org-sub {
              font-size: 11.5px;
              color: #64748b;
              margin-top: 2px;
            }
            .doc-meta-right {
              text-align: right;
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 3px;
            }
            .doc-badge {
              display: inline-block;
              background: #0f172a !important;
              color: #ffffff !important;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              padding: 3px 10px;
              border-radius: 4px;
              margin-bottom: 4px;
            }
            .doc-meta-item {
              font-size: 12px;
              color: #475569;
            }
            .doc-project-banner {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #f8fafc !important;
              border: 1px solid #cbd5e1;
              padding: 10px 14px;
              border-radius: 6px;
              margin-bottom: 14px;
            }
            .doc-project-banner h3 {
              margin: 0;
              font-size: 15px;
              color: #0f172a;
            }
            .doc-project-badge {
              background: #e0f2fe !important;
              color: #0369a1 !important;
              font-size: 12px;
              font-weight: 600;
              padding: 3px 9px;
              border-radius: 99px;
            }
            .doc-section-title {
              font-size: 11.5px;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              margin: 16px 0 8px;
            }
            .doc-grid-table {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
              background: #f8fafc !important;
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              border-radius: 6px;
              margin-bottom: 12px;
            }
            .doc-grid-cell span {
              display: block;
              font-size: 10.5px;
              color: #64748b;
              text-transform: uppercase;
              font-weight: 600;
            }
            .doc-grid-cell b {
              display: block;
              font-size: 13px;
              color: #0f172a;
              margin-top: 1px;
            }
            .doc-client-card {
              background: #f1f5f9 !important;
              border-left: 3px solid #0f172a;
              padding: 8px 12px;
              border-radius: 0 6px 6px 0;
              margin-bottom: 12px;
              font-size: 12.5px;
            }
            .doc-client-card span {
              color: #475569;
              margin-right: 6px;
            }
            .doc-table {
              width: 100%;
              border-collapse: collapse;
              margin: 8px 0 12px;
              font-size: 12.5px;
            }
            .doc-table th {
              background: #f1f5f9 !important;
              color: #334155;
              text-align: left;
              padding: 7px 10px;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.03em;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1px solid #cbd5e1;
            }
            .doc-table td {
              padding: 7px 10px;
              border-bottom: 1px solid #e2e8f0;
              color: #1e293b;
            }
            .doc-table.compact td {
              padding: 4px 10px;
              font-size: 12px;
            }
            .doc-tar { text-align: right; }
            .doc-total-row td {
              background: #f8fafc !important;
              font-weight: 800;
              border-top: 2px solid #0f172a;
              border-bottom: 2px solid #0f172a;
              color: #0f172a;
              font-size: 13.5px;
            }
            .doc-demand-highlight td {
              background: #eff6ff !important;
              font-weight: 700;
              color: #1d4ed8;
              border-top: 1px solid #bfdbfe;
              border-bottom: 1px solid #bfdbfe;
            }
            .doc-words-box {
              background: #f8fafc !important;
              border: 1px dashed #cbd5e1;
              padding: 7px 10px;
              border-radius: 5px;
              font-size: 12px;
              color: #334155;
              margin-bottom: 12px;
            }
            .doc-notes-box {
              background: #fffbeb !important;
              border: 1px solid #fde68a;
              padding: 8px 12px;
              border-radius: 6px;
              font-size: 11.5px;
              color: #92400e;
              line-height: 1.45;
              margin-bottom: 12px;
            }
            .doc-bank-box {
              background: #f8fafc !important;
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              border-radius: 6px;
              margin-bottom: 10px;
            }
            .doc-bank-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 6px 12px;
              font-size: 12px;
            }
            .doc-bank-grid span {
              color: #64748b;
              margin-right: 6px;
            }
            .doc-notes-text {
              font-size: 11px;
              color: #64748b;
              line-height: 1.45;
              margin: 8px 0 14px;
            }
            .doc-signatures {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-top: 24px;
              padding-top: 10px;
            }
            .doc-sign-col {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              min-width: 170px;
            }
            .doc-sign-line {
              width: 150px;
              height: 1px;
              background: #94a3b8;
              margin-bottom: 5px;
            }
            .doc-sign-col span {
              font-size: 11.5px;
              font-weight: 600;
              color: #334155;
            }
            .doc-sign-seal {
              border: 2px dashed #0284c7;
              color: #0284c7;
              font-size: 10.5px;
              font-weight: 800;
              padding: 5px 12px;
              border-radius: 4px;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .doc-to-box {
              background: #f8fafc !important;
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              border-radius: 6px;
              margin-bottom: 12px;
              line-height: 1.5;
            }
            .doc-subject {
              font-size: 13px;
              line-height: 1.45;
              margin-bottom: 10px;
              color: #0f172a;
            }
            .doc-para {
              font-size: 13px;
              line-height: 1.5;
              color: #334155;
              margin-bottom: 12px;
            }
            .doc-receipt-badge-wrap {
              display: flex;
              justify-content: center;
              margin: 4px 0 10px;
            }
            .doc-receipt-stamp {
              border: 3px double #15803d;
              color: #15803d;
              padding: 5px 18px;
              border-radius: 6px;
              font-weight: 900;
              letter-spacing: 0.08em;
              font-size: 13.5px;
              text-transform: uppercase;
            }
            .text-ok { color: #15803d; }
            .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            .muted { color: #64748b; }
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <span><strong>Nivaas Document Viewer</strong> &middot; Ready for PDF Export</span>
            <div>
              <button class="close-btn" onclick="window.close()">Close</button>
              <button onclick="window.print()">Print / Save PDF</button>
            </div>
          </div>
          <div class="print-container">
            ${sheetEl.outerHTML}
          </div>
        </body>
      </html>`;

    // Strategy 1: Open clean popup window (Chrome/Edge/Safari never blanks this)
    const printWin = window.open('', '_blank', 'width=900,height=960,toolbar=0,scrollbars=1,status=0');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printableHtml);
      printWin.document.close();
      setTimeout(() => {
        try {
          printWin.focus();
          printWin.print();
        } catch (_) {}
      }, 350);
      return;
    }

    // Strategy 2: If popups are blocked, use an off-screen iframe (WITH width & opacity, NOT visibility:hidden)
    let iframe = document.getElementById('nivaas-print-frame');
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.id = 'nivaas-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '1024px';
    iframe.style.height = '1400px';
    iframe.style.opacity = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
    frameDoc.open();
    frameDoc.write(printableHtml);
    frameDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (_) {}
    }, 400);
  };

  const getWhatsAppMessage = () => {
    if (type === 'cost_sheet') {
      const { project, unit, cs, lead } = data;
      return `*OFFICIAL COST SHEET*\n*Project:* ${project?.name || 'Project'}\n*Unit:* ${unit?.unit_no} (${unit?.type_name || ''})\n*Super Area:* ${unit?.super_sqft ? sqft(unit.super_sqft) : '—'}\n*Total All-Inclusive:* ${inr(cs?.total || unit?.price || 0)}\n\n_Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} via Nivaas._`;
    }
    if (type === 'demand_letter') {
      const { booking, milestone, project } = data;
      return `*DEMAND NOTICE - MILESTONE PAYMENT*\n*Project:* ${project?.name || booking?.project_name}\n*Unit:* ${booking?.unit_no}\n*Buyer:* ${booking?.customer_name}\n*Milestone:* ${milestone?.milestone || 'Milestone'}\n*Amount Due:* ${inr(milestone?.due_amount || milestone?.amount || 0)}\n*Due Date:* ${milestone?.due_date || 'Within 15 days'}\n\nPlease transfer via NEFT/RTGS to our official project escrow account.`;
    }
    if (type === 'receipt') {
      const { booking, payment, project } = data;
      return `*PAYMENT RECEIPT*\n*Receipt No:* ${payment?.ref || 'RCP-' + (payment?.id || '01')}\n*Project:* ${project?.name || booking?.project_name}\n*Unit:* ${booking?.unit_no}\n*Received From:* ${booking?.customer_name}\n*Amount:* ${inr(payment?.amount || 0)}\n*Mode / UTR:* ${payment?.mode || 'NEFT'} - ${payment?.ref || '—'}\n*Against:* ${payment?.milestone || 'Installment'}\n\n_Thank you for your payment!_`;
    }
    return '';
  };

  const shareWhatsApp = () => {
    const text = getWhatsAppMessage();
    const phoneNo = (data?.lead?.phone || data?.booking?.customer_phone || '').replace(/\D/g, '');
    const url = phoneNo ? `https://wa.me/${phoneNo}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopy = () => {
    copyText(getWhatsAppMessage());
    say('Document summary copied to clipboard');
  };

  return (
    <Modal
      title={getDocTitle()}
      onClose={onClose}
      wide
      footer={
        <div className="doc-modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={handleCopy}><Icon name="copy" />Copy Text</button>
          <button className="btn wa-btn" onClick={shareWhatsApp}><Icon name="wa" />Share on WhatsApp</button>
          <button className="btn sun" onClick={handlePrint}><Icon name="download" />Print / Save PDF</button>
        </div>
      }
    >
      <div className="doc-printable-area" ref={printRef}>
        {type === 'cost_sheet' && <CostSheetView data={data} />}
        {type === 'demand_letter' && <DemandLetterView data={data} />}
        {type === 'receipt' && <ReceiptView data={data} />}
      </div>
    </Modal>
  );
}

function DocHeader({ org, project, docType, docRef, docDate }) {
  return (
    <div className="doc-header">
      <div className="doc-brand">
        <div className="doc-org-name">{org?.name || 'NIVAAS DEVELOPERS & INFRA'}</div>
        <div className="doc-org-sub">RERA Promoter Reg: {org?.rera_promoter || 'RAJ/P/2023/1842'} · CIN: U70109RJ2022PTC081290</div>
        <div className="doc-org-sub">{org?.address || 'Corporate Tower, Tonk Road, Jaipur, Rajasthan 302015'}</div>
      </div>
      <div className="doc-meta-right">
        <div className="doc-badge">{docType}</div>
        <div className="doc-meta-item"><b>Ref:</b> {docRef}</div>
        <div className="doc-meta-item"><b>Date:</b> {docDate}</div>
      </div>
    </div>
  );
}

function CostSheetView({ data }) {
  const { project = {}, unit = {}, cs = {}, lead = {}, org = {} } = data;
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const refNo = `CS-${unit?.unit_no || 'UNIT'}-${Math.floor(1000 + Math.random() * 9000)}`;

  return (
    <div className="doc-sheet">
      <DocHeader
        org={org}
        project={project}
        docType="OFFICIAL COST SHEET"
        docRef={refNo}
        docDate={today}
      />

      <div className="doc-project-banner">
        <div>
          <h3>{project.name || 'Project Name'}</h3>
          <p className="muted">{project.location || 'Prime Location'}, {project.city || 'Jaipur'} · RERA: <b>{project.rera_no || 'RAJ/P/2024/9912'}</b></p>
        </div>
        <div className="doc-project-badge">Possession: <b>{project.possession || 'Dec 2026'}</b></div>
      </div>

      <div className="doc-section-title">Unit Specifications</div>
      <div className="doc-grid-table">
        <div className="doc-grid-cell"><span>Unit No</span><b>{unit.unit_no}</b></div>
        <div className="doc-grid-cell"><span>Configuration</span><b>{unit.type_name || `${unit.bhk || 3} BHK`}</b></div>
        <div className="doc-grid-cell"><span>Tower & Floor</span><b>Tower {unit.tower || 'A'}, Floor {unit.floor}</b></div>
        <div className="doc-grid-cell"><span>Facing</span><b>{unit.facing || 'East (Park Facing)'}</b></div>
        <div className="doc-grid-cell"><span>Carpet Area</span><b>{sqft(unit.carpet_sqft || 1050)}</b></div>
        <div className="doc-grid-cell"><span>Super Built-up Area</span><b>{sqft(unit.super_sqft || 1450)}</b></div>
      </div>

      {lead?.name && (
        <div className="doc-client-card">
          <span>Prepared Exclusively For:</span>
          <b>{lead.name}</b> {lead.phone && <span className="mono">({phone(lead.phone)})</span>}
        </div>
      )}

      <div className="doc-section-title">Price Breakdown</div>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Calculation Basis</th>
            <th className="doc-tar">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Basic Sale Price (BSP)</b></td>
            <td>{sqft(cs.sqft || unit.super_sqft)} × {inr(cs.rate || project.rate_sqft || 5200)}/sq ft</td>
            <td className="doc-tar num">{inr(cs.base || (unit.super_sqft || 1400) * (project.rate_sqft || 5200))}</td>
          </tr>
          {Boolean(cs.plc || unit.plc_pct) && (
            <tr>
              <td><b>Preferential Location Charge (PLC)</b></td>
              <td>{unit.plc_pct || cs.plc_pct || 5}% on Basic Sale Price</td>
              <td className="doc-tar num">{inr(cs.plc || Math.round(cs.base * 0.05))}</td>
            </tr>
          )}
          <tr>
            <td><b>Covered Car Parking</b></td>
            <td>1 Reserved Basement Space</td>
            <td className="doc-tar num">{inr(cs.parking || 300000)}</td>
          </tr>
          <tr>
            <td><b>Club Membership & Amenities</b></td>
            <td>Lifetime Access to Clubhouse, Gym & Pool</td>
            <td className="doc-tar num">{inr(cs.club || 150000)}</td>
          </tr>
          <tr>
            <td><b>GST (Goods & Services Tax)</b></td>
            <td>{cs.gst_pct || 5}% as per Central & State Tax Schedule</td>
            <td className="doc-tar num">{inr(cs.gst || Math.round((cs.base || 6000000) * 0.05))}</td>
          </tr>
          <tr>
            <td><b>Interest-Free Maintenance Security (IFMS)</b></td>
            <td>Sinking Fund Deposit (Payable at possession)</td>
            <td className="doc-tar num">{inr(cs.deposit || 75000)}</td>
          </tr>
          <tr className="doc-total-row">
            <td><b>TOTAL ALL-INCLUSIVE PRICE</b></td>
            <td><b>Inclusive of GST, Parking, Club & IFMS</b></td>
            <td className="doc-tar num"><b>{inr(cs.total || unit.price || 0)}</b></td>
          </tr>
        </tbody>
      </table>

      <div className="doc-words-box">
        <b>Amount in Words:</b> {numberToWordsINR(cs.total || unit.price || 0)}
      </div>

      <div className="doc-section-title">Government Charges (At Possession)</div>
      <div className="doc-notes-box">
        Stamp Duty ({cs.stamp_pct || 6}%) & Registration Charges ({inr(cs.registration || 30000)}) are estimated at <b>{inr((cs.stamp || 0) + (cs.registration || 30000))}</b> and payable directly to the Sub-Registrar / Government Treasury at the time of legal conveyance/registry.
      </div>

      {project.payment_plan && (
        <>
          <div className="doc-section-title">Construction Linked Payment (CLP) Schedule</div>
          <table className="doc-table compact">
            <thead>
              <tr>
                <th>Stage / Milestone</th>
                <th className="doc-tar">% of Total</th>
                <th className="doc-tar">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {project.payment_plan.map((m, i) => (
                <tr key={i}>
                  <td>{m.milestone}</td>
                  <td className="doc-tar">{m.pct}%</td>
                  <td className="doc-tar num">{inr(Math.round(((cs.total || unit.price || 0) * m.pct) / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="doc-signatures">
        <div className="doc-sign-col">
          <div className="doc-sign-line" />
          <span>Customer Acceptance</span>
        </div>
        <div className="doc-sign-col">
          <div className="doc-sign-line" />
          <span>Authorized Developer Signatory</span>
        </div>
      </div>
    </div>
  );
}

function DemandLetterView({ data }) {
  const { booking = {}, milestone = {}, project = {}, org = {} } = data;
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const dueDate = milestone.due_date || new Date(Date.now() + 15 * 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const refNo = `DL-${booking.unit_no || 'UNIT'}-${Math.floor(1000 + Math.random() * 9000)}`;
  const dueAmt = milestone.amount || milestone.due_amount || 0;

  return (
    <div className="doc-sheet">
      <DocHeader
        org={org}
        project={project}
        docType="DEMAND NOTICE"
        docRef={refNo}
        docDate={today}
      />

      <div className="doc-to-box">
        <b>To:</b><br />
        <strong>{booking.customer_name || 'Valued Homebuyer'}</strong><br />
        <span>Mobile: {phone(booking.customer_phone)}</span><br />
        {booking.customer_email && <span>Email: {booking.customer_email}</span>}
      </div>

      <div className="doc-subject">
        <b>SUBJECT:</b> Notice of Payment Demand for Completion of Milestone: <u>"{milestone.milestone || 'Next Construction Milestone'}"</u> in respect of Flat No. <b>{booking.unit_no}</b>, {booking.project_name || project.name}.
      </div>

      <p className="doc-para">
        Dear {booking.customer_name?.split(' ')[0] || 'Sir/Madam'},<br />
        We are pleased to inform you that construction at <b>{booking.project_name || project.name}</b> is progressing as per schedule. The architectural milestone mentioned below has been duly certified by the project supervising engineer and is now complete.
      </p>

      <div className="doc-section-title">Milestone Payment Summary</div>
      <table className="doc-table">
        <tbody>
          <tr>
            <td>Unit No. & Project</td>
            <td className="doc-tar"><b>Flat {booking.unit_no}, {booking.project_name || project.name}</b></td>
          </tr>
          <tr>
            <td>Total Agreed Deal Value</td>
            <td className="doc-tar num">{inr(booking.deal_value || 0)}</td>
          </tr>
          <tr>
            <td>Previously Received Payments</td>
            <td className="doc-tar num text-ok">{inr(booking.paid || 0)}</td>
          </tr>
          <tr className="doc-demand-highlight">
            <td><b>AMOUNT CURRENTLY DUE FOR THIS MILESTONE</b></td>
            <td className="doc-tar num"><b>{inr(dueAmt)}</b></td>
          </tr>
          <tr>
            <td>Due Date for Remittance</td>
            <td className="doc-tar"><b>{dueDate}</b> (within 15 days)</td>
          </tr>
          <tr>
            <td>Remaining Balance Post This Payment</td>
            <td className="doc-tar num">{inr(Math.max(0, (booking.deal_value || 0) - (booking.paid || 0) - dueAmt))}</td>
          </tr>
        </tbody>
      </table>

      <div className="doc-words-box">
        <b>Amount in Words:</b> {numberToWordsINR(dueAmt)}
      </div>

      <div className="doc-section-title">Bank Remittance & RTGS / NEFT Details</div>
      <div className="doc-bank-box">
        <div className="doc-bank-grid">
          <div><span>Account Name:</span><b>{org.name || 'Nivaas Project'} RERA Master Collection Escrow A/c</b></div>
          <div><span>Bank Name:</span><b>HDFC Bank Limited</b></div>
          <div><span>Account Number:</span><b className="mono">50200084920192</b></div>
          <div><span>IFSC Code:</span><b className="mono">HDFC0001842</b></div>
          <div><span>Branch:</span><b>Tonk Road Commercial Branch, Jaipur</b></div>
          <div><span>Payment Remarks / Memo:</span><b className="mono">{booking.unit_no} - {booking.customer_name?.split(' ')[0]}</b></div>
        </div>
      </div>

      <p className="doc-notes-text">
        * Please mention your Unit No. ({booking.unit_no}) in the transaction narration for swift automated ledger crediting. Prompt receipt acknowledgment will be dispatched via WhatsApp & SMS. As per RERA regulations, delayed payments beyond the due date attract interest at SBI MCLR + 2% per annum.
      </p>

      <div className="doc-signatures">
        <div className="doc-sign-col">
          <div className="doc-sign-seal">RERA VERIFIED ESCROW</div>
        </div>
        <div className="doc-sign-col">
          <div className="doc-sign-line" />
          <span>Authorized Accounts Signatory</span>
          <small className="muted">{org.name || 'Nivaas Developers'}</small>
        </div>
      </div>
    </div>
  );
}

function ReceiptView({ data }) {
  const { booking = {}, payment = {}, project = {}, org = {} } = data;
  const payDate = payment.paid_on ? date(payment.paid_on) : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const refNo = payment.ref ? `RCP-${payment.ref}` : `RCP-${payment.id || Math.floor(1000 + Math.random() * 9000)}`;

  return (
    <div className="doc-sheet">
      <DocHeader
        org={org}
        project={project}
        docType="PAYMENT RECEIPT"
        docRef={refNo}
        docDate={payDate}
      />

      <div className="doc-receipt-badge-wrap">
        <div className="doc-receipt-stamp">PAYMENT RECEIVED</div>
      </div>

      <table className="doc-table">
        <tbody>
          <tr>
            <td>Received With Thanks From</td>
            <td><b>{booking.customer_name || 'Homebuyer'}</b></td>
          </tr>
          <tr>
            <td>Mobile / Contact</td>
            <td className="mono">{phone(booking.customer_phone)}</td>
          </tr>
          <tr>
            <td>Property / Unit Details</td>
            <td><b>Flat {booking.unit_no}</b>, Tower {booking.tower || 'A'}, {booking.project_name || project.name}</td>
          </tr>
          <tr className="doc-demand-highlight">
            <td><b>Amount Received</b></td>
            <td className="num"><b>{inr(payment.amount || 0)}</b></td>
          </tr>
          <tr>
            <td>Amount in Words</td>
            <td><b>{numberToWordsINR(payment.amount || 0)}</b></td>
          </tr>
          <tr>
            <td>Payment Mode</td>
            <td><b>{payment.mode || 'NEFT / RTGS'}</b></td>
          </tr>
          <tr>
            <td>Transaction Ref / UTR / Cheque No.</td>
            <td className="mono"><b>{payment.ref || 'UTR' + Math.floor(100000 + Math.random() * 900000)}</b></td>
          </tr>
          <tr>
            <td>Credited Against</td>
            <td>{payment.milestone || 'Milestone Installment'}</td>
          </tr>
          <tr>
            <td>Transaction Date</td>
            <td>{payDate}</td>
          </tr>
        </tbody>
      </table>

      <div className="doc-section-title">Ledger Summary (After This Payment)</div>
      <div className="doc-grid-table">
        <div className="doc-grid-cell"><span>Total Deal Value</span><b>{inr(booking.deal_value || 0)}</b></div>
        <div className="doc-grid-cell"><span>Total Paid to Date</span><b className="text-ok">{inr(booking.paid || payment.amount || 0)}</b></div>
        <div className="doc-grid-cell"><span>Outstanding Balance</span><b>{inr(Math.max(0, (booking.deal_value || 0) - (booking.paid || payment.amount || 0)))}</b></div>
      </div>

      <div className="doc-notes-box" style={{ marginTop: 20 }}>
        Note: Payment received subject to realization in case of Cheque/Draft. This is a computer-generated, digitally signed official receipt and does not require a physical rubber stamp.
      </div>

      <div className="doc-signatures">
        <div className="doc-sign-col">
          <small className="muted">Generated on {dateTime(new Date().toISOString())}</small>
        </div>
        <div className="doc-sign-col">
          <div className="doc-sign-line" />
          <span>Accounts Department</span>
          <small className="muted">{org.name || 'Nivaas Developers'}</small>
        </div>
      </div>
    </div>
  );
}

