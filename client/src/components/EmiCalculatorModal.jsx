import React, { useState, useMemo } from 'react';
import { Icon, Modal, Field } from './ui.jsx';
import { inr, money } from '../lib/format.js';
import { emi } from '../lib/pricing.js';

export default function EmiCalculatorModal({ initialPrice, unit, project, onClose, say }) {
  const defaultPrice = Number(initialPrice || unit?.price || 7500000);
  const [mode, setMode] = useState('property'); // 'property' | 'loan'
  const [propertyPrice, setPropertyPrice] = useState(defaultPrice);
  const [downPct, setDownPct] = useState(20);
  const [directLoan, setDirectLoan] = useState(Math.round(defaultPrice * 0.8));
  const [rate, setRate] = useState(8.6);
  const [years, setYears] = useState(20);
  const [showAmort, setShowAmort] = useState(false);
  const [sharePhone, setSharePhone] = useState('');

  // Calculate Loan Amount
  const loanAmount = mode === 'property' 
    ? Math.max(0, Math.round(propertyPrice * (1 - downPct / 100))) 
    : Math.max(0, Number(directLoan || 0));

  const downAmount = mode === 'property' 
    ? Math.round(propertyPrice * (downPct / 100)) 
    : Math.max(0, propertyPrice - loanAmount);

  // EMI calculation
  const monthlyEmi = useMemo(() => emi(loanAmount, rate, years), [loanAmount, rate, years]);
  const totalMonths = years * 12;
  const totalPayment = monthlyEmi * totalMonths;
  const totalInterest = Math.max(0, totalPayment - loanAmount);
  const principalPct = totalPayment > 0 ? (loanAmount / totalPayment) * 100 : 0;

  // Year-wise Amortization Schedule
  const amortizationSchedule = useMemo(() => {
    if (!loanAmount || !rate || !years || !monthlyEmi) return [];
    const monthlyRate = rate / 12 / 100;
    let balance = loanAmount;
    const schedule = [];

    for (let y = 1; y <= years; y++) {
      let principalPaidYear = 0;
      let interestPaidYear = 0;
      const openingBalance = balance;

      for (let m = 1; m <= 12; m++) {
        if (balance <= 0) break;
        const interestMonth = balance * monthlyRate;
        const principalMonth = Math.min(balance, monthlyEmi - interestMonth);
        interestPaidYear += interestMonth;
        principalPaidYear += principalMonth;
        balance = Math.max(0, balance - principalMonth);
      }

      schedule.push({
        year: y,
        opening: Math.round(openingBalance),
        emiPaid: Math.round(principalPaidYear + interestPaidYear),
        principal: Math.round(principalPaidYear),
        interest: Math.round(interestPaidYear),
        closing: Math.round(balance),
      });

      if (balance <= 0) break;
    }
    return schedule;
  }, [loanAmount, rate, years, monthlyEmi]);

  // Construct WhatsApp Share Text
  const shareMessage = useMemo(() => {
    const title = unit?.unit_no ? `Flat ${unit.unit_no}${project?.name ? ' at ' + project.name : ''}` : project?.name || 'Property';
    return `Namaste! Here is the Home Loan EMI estimate for *${title}*:

• Property Value: ${inr(propertyPrice)}
• Down Payment (${downPct}%): ${inr(downAmount)}
• Loan Amount: ${inr(loanAmount)}
• Interest Rate: ${rate}% p.a.
• Tenure: ${years} Years (${totalMonths} Months)
----------------------------------------
*Monthly EMI: ${inr(monthlyEmi)} / month*
• Total Interest: ${inr(totalInterest)}
• Total Payable: ${inr(totalPayment)}
----------------------------------------
_Estimate only. Final loan terms subject to bank approval._`;
  }, [unit, project, propertyPrice, downPct, downAmount, loanAmount, rate, years, totalMonths, monthlyEmi, totalInterest, totalPayment]);

  const sendWhatsApp = phoneNum => {
    const clean = String(phoneNum || '').replace(/\D/g, '').replace(/^0+/, '');
    const fullPhone = clean.length === 10 ? '91' + clean : clean;
    const url = fullPhone 
      ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(shareMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };

  const copyEstimate = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      say?.('EMI estimate copied! Paste it in WhatsApp.');
    } catch {
      say?.('Select text and copy manually.');
    }
  };

  const PRESET_PRICES = [
    [4500000, '₹45 L'],
    [6000000, '₹60 L'],
    [8000000, '₹80 L'],
    [10000000, '₹1 Cr'],
    [15000000, '₹1.5 Cr'],
    [20000000, '₹2 Cr'],
  ];

  const PRESET_RATES = [8.4, 8.5, 8.6, 8.75, 9.0, 9.5];
  const PRESET_YEARS = [10, 15, 20, 25, 30];
  const PRESET_DOWNS = [10, 15, 20, 25, 30, 40];

  return (
    <Modal
      title={unit?.unit_no ? `Home Loan EMI · Flat ${unit.unit_no}` : "Home Loan EMI Calculator"}
      wide
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn" type="button" onClick={copyEstimate}>
              <Icon name="copy" />Copy Quote
            </button>
            <button className="btn wa-btn" type="button" onClick={() => sendWhatsApp(sharePhone)}>
              <Icon name="wa" />Share on WhatsApp
            </button>
          </div>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Result Highlight Box */}
        <div className="emibox">
          <div className="emibox-top">
            <div>
              <span className="eyebrow">Estimated Monthly EMI</span>
              <div className="emival num">
                {inr(monthlyEmi)}
                <small>/ month</small>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="eyebrow">Total Payment (Loan + Interest)</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }} className="num">
                {money(totalPayment)}
              </div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="emibar" role="img" aria-label={`Principal ${Math.round(principalPct)}%, Interest ${Math.round(100 - principalPct)}%`}>
            <i style={{ width: `${principalPct}%` }} />
          </div>

          <div className="emistats">
            <div className="emistat">
              <span>Loan Amount</span>
              <b className="num">{inr(loanAmount)}</b>
            </div>
            <div className="emistat">
              <span>Down Payment ({downPct}%)</span>
              <b className="num">{inr(downAmount)}</b>
            </div>
            <div className="emistat">
              <span>Total Interest</span>
              <b className="num">{money(totalInterest)}</b>
            </div>
            <div className="emistat">
              <span>Tenure / Months</span>
              <b className="num">{years} Y / {totalMonths} M</b>
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg" role="group" aria-label="Calculation Mode">
            <button type="button" aria-pressed={mode === 'property'} onClick={() => setMode('property')}>
              By Property Value
            </button>
            <button type="button" aria-pressed={mode === 'loan'} onClick={() => setMode('loan')}>
              By Direct Loan Amount
            </button>
          </div>
        </div>

        {/* Input Controls */}
        <div className="card" style={{ boxShadow: 'none', background: 'var(--panel-2)' }}>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'property' ? (
              <>
                <Field label={`Property Value (₹) — ${inr(propertyPrice)}`} id="emi-prop">
                  <input
                    id="emi-prop"
                    type="number"
                    step="50000"
                    className="input"
                    value={propertyPrice}
                    onChange={e => setPropertyPrice(Math.max(0, Number(e.target.value)))}
                  />
                  <div className="preset-chips">
                    {PRESET_PRICES.map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={'chipbtn' + (propertyPrice === val ? ' active' : '')}
                        onClick={() => setPropertyPrice(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                <label className="slider">
                  <span>
                    Down payment: <b>{downPct}% ({inr(downAmount)})</b>
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={downPct}
                    onChange={e => setDownPct(Number(e.target.value))}
                  />
                  <div className="preset-chips">
                    {PRESET_DOWNS.map(pct => (
                      <button
                        key={pct}
                        type="button"
                        className={'chipbtn' + (downPct === pct ? ' active' : '')}
                        onClick={() => setDownPct(pct)}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </label>
              </>
            ) : (
              <Field label={`Direct Loan Amount (₹) — ${inr(directLoan)}`} id="emi-direct">
                <input
                  id="emi-direct"
                  type="number"
                  step="50000"
                  className="input"
                  value={directLoan}
                  onChange={e => setDirectLoan(Math.max(0, Number(e.target.value)))}
                />
              </Field>
            )}

            <div className="kgrid">
              <div>
                <label className="slider">
                  <span>
                    Interest rate: <b>{rate}% p.a.</b>
                  </span>
                  <input
                    type="range"
                    min="7"
                    max="14"
                    step="0.05"
                    value={rate}
                    onChange={e => setRate(Number(e.target.value))}
                  />
                  <div className="preset-chips">
                    {PRESET_RATES.map(r => (
                      <button
                        key={r}
                        type="button"
                        className={'chipbtn' + (rate === r ? ' active' : '')}
                        onClick={() => setRate(r)}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <div>
                <label className="slider">
                  <span>
                    Loan tenure: <b>{years} years ({totalMonths} months)</b>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="1"
                    value={years}
                    onChange={e => setYears(Number(e.target.value))}
                  />
                  <div className="preset-chips">
                    {PRESET_YEARS.map(y => (
                      <button
                        key={y}
                        type="button"
                        className={'chipbtn' + (years === y ? ' active' : '')}
                        onClick={() => setYears(y)}
                      >
                        {y} Yrs
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Direct Send Box */}
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b><Icon name="wa" style={{ width: 16, height: 16, verticalAlign: -2, color: '#25D366' }} /> Send Loan Quote to Client</b>
              <button
                type="button"
                className="linkbtn"
                style={{ fontSize: 13 }}
                onClick={() => setShowAmort(prev => !prev)}
              >
                {showAmort ? 'Hide Amortization Schedule ▲' : 'View Year-wise Schedule ▼'}
              </button>
            </div>

            <div className="share-phone-row">
              <input
                type="tel"
                className="input"
                placeholder="Client Mobile Number (e.g. 9829012345)"
                value={sharePhone}
                onChange={e => setSharePhone(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <button
                type="button"
                className="btn wa-btn"
                disabled={!sharePhone || sharePhone.replace(/\D/g, '').length < 10}
                onClick={() => sendWhatsApp(sharePhone)}
              >
                <Icon name="wa" />Send to this number
              </button>
            </div>

            {/* Collapsible Amortization Schedule */}
            {showAmort && (
              <div className="amort-table-wrap">
                <table className="amort-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Opening Balance</th>
                      <th>Annual EMI</th>
                      <th>Principal Paid</th>
                      <th>Interest Paid</th>
                      <th>Ending Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amortizationSchedule.map(row => (
                      <tr key={row.year}>
                        <td><b>Year {row.year}</b></td>
                        <td className="num">{inr(row.opening)}</td>
                        <td className="num">{inr(row.emiPaid)}</td>
                        <td className="num" style={{ color: 'var(--st-avail)' }}>{inr(row.principal)}</td>
                        <td className="num" style={{ color: 'var(--hot)' }}>{inr(row.interest)}</td>
                        <td className="num">{inr(row.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

