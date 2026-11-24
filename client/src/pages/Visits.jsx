import React, { useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Pill, Modal, Field, Seg, useLoad, Loading, Empty } from '../components/ui.jsx';
import { time, dateTime, phone } from '../lib/format.js';

const dayKey = d => new Date(d).toDateString();
function label(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - t) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function Visits({ me, go, say }) {
  const [visits, reload] = useLoad(() => api.get('/api/visits'), []);
  const [filter, setFilter] = useState('upcoming');
  const [bookingModal, setBookingModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(null);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [passportModal, setPassportModal] = useState(null);

  if (!visits) return <div className="page"><Loading /></div>;

  const filteredVisits = visits.filter(v => {
    if (filter === 'upcoming') return ['scheduled', 'confirmed'].includes(v.status) && new Date(v.scheduled_at) > Date.now() - 4 * 3600e3;
    if (filter === 'unassigned') return !v.agent && ['scheduled', 'confirmed'].includes(v.status);
    if (filter === 'confirmed') return v.status === 'confirmed';
    if (filter === 'done') return v.status === 'done';
    if (filter === 'no_show') return ['no_show', 'cancelled', 'rescheduled'].includes(v.status);
    return true; // all
  });

  const sendWhatsAppPass = (v) => {
    const projName = v.project_name || 'Our Premium Project';
    const loc = v.project_location || 'Project Site Office';
    const mapUrl = v.project_map_url || 'https://maps.google.com';
    const visitDate = new Date(v.scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    const visitTime = new Date(v.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    let msg = `*VIP SITE VISIT PASS*\n` +
      `Namaste *${v.name}*!\n\n` +
      `Your site visit to *${projName}* has been confirmed.\n\n` +
      `â€¢ *Date:* ${visitDate}\n` +
      `â€¢ *Time:* ${visitTime}\n` +
      `â€¢ *Visitors:* ${v.visitors_count || 1} Person(s)\n`;

    if (v.transport === 'cab' && v.pickup_address) {
      msg += `â€¢ *Transport:* Cab pickup requested at: ${v.pickup_address}\n`;
    }

    msg += `â€¢ *Site Address:* ${loc}\n` +
      `â€¢ *Google Maps Navigation:* ${mapUrl}\n` +
      `â€¢ *Host / Relationship Manager:* ${v.agent || 'Our Site Manager'}\n\n` +
      `We look forward to welcoming you!`;

    const clientPhone = String(v.phone || '').replace(/\D/g, '');
    const url = clientPhone ? `https://wa.me/${clientPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const confirmVisit = async (v) => {
    try {
      await api.patch('/api/visits/' + v.id, { status: 'confirmed' });
      say('Site visit confirmed');
      reload();
    } catch (e) {
      say(e.message);
    }
  };

  const markNoShow = async (v) => {
    try {
      await api.patch('/api/visits/' + v.id, { status: 'no_show' });
      say('Visit marked as no-show');
      reload();
    } catch (e) {
      say(e.message);
    }
  };

  // Group by day for upcoming view
  const groups = {};
  for (const v of filteredVisits) {
    (groups[dayKey(v.scheduled_at)] ||= []).push(v);
  }

  return (
    <div className="page wide">
      <div className="pagehead">
        <div style={{ flex: 1 }}>
          <h2>Site Visits Command Center</h2>
          <p>Schedule client visits, arrange cab pickups, send WhatsApp passes with Google Maps navigation, and record feedback.</p>
        </div>
        <button className="btn sun" onClick={() => setBookingModal(true)}>
          <Icon name="calendar" />+ Book Site Visit
        </button>
      </div>

      <div className="invbar">
        <Seg
          value={filter}
          onChange={setFilter}
          label="Status"
          options={[
            ['upcoming', 'Upcoming'],
            ['unassigned', 'Unassigned'],
            ['confirmed', 'Confirmed'],
            ['done', 'Visited / Done'],
            ['no_show', 'Rescheduled / No-show'],
            ['all', 'All Visits']
          ]}
        />
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
          {filteredVisits.length} visit{filteredVisits.length === 1 ? '' : 's'} found
        </span>
      </div>

      {filteredVisits.length === 0 ? (
        <Empty icon="calendar" title="No visits found for this filter">
          Click "+ Book Site Visit" or schedule directly from any lead.
        </Empty>
      ) : (
        Object.entries(groups).map(([k, list]) => (
          <section key={k} className="card" style={{ marginBottom: 18 }}>
            <div className="card-h">
              <h3>{label(list[0].scheduled_at)}</h3>
              <span className="muted">{list.length} visit{list.length > 1 ? 's' : ''}</span>
            </div>
            <div className="list">
              {list.map(v => (
                <div key={v.id} className="lrow vrow" style={{ alignItems: 'flex-start', padding: '14px 16px', gap: 14 }}>
                  <div style={{ minWidth: 80 }}>
                    <span className="when big" style={{ display: 'block', fontSize: 17, fontWeight: 700 }}>{time(v.scheduled_at)}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{new Date(v.scheduled_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <button className="linkbtn" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }} onClick={() => go('leads/' + v.lead_id)}>
                        {v.name}
                      </button>
                      <Pill s={v.status} />
                      {v.visitors_count > 1 && (
                        <span className="visit-badge">
                          <Icon name="users" style={{ width: 12, height: 12 }} />
                          {v.visitors_count} Visitors
                        </span>
                      )}
                      {v.transport === 'cab' && (
                        <span className="visit-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                          Cab Requested: {v.pickup_address || 'Address pending'}
                        </span>
                      )}
                    </div>

                    <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                      <span>{v.config_pref || 'Requirement open'}</span> Â· <b>{v.project_name}</b> Â· Advisor: <b>{v.agent || 'Unassigned'}</b>
                    </div>

                    <div className="mono muted" style={{ fontSize: 12 }}>
                      {phone(v.phone)}
                    </div>

                    {v.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13 }}>
                        <span style={{ color: '#f59e0b' }}>{'â˜…'.repeat(v.rating)}{'â˜†'.repeat(5 - v.rating)}</span>
                        <b style={{ color: 'var(--ink-2)' }}>({v.rating}/5)</b>
                        {v.interested_unit && <span className="visit-badge">Interested: {v.interested_unit}</span>}
                      </div>
                    )}

                    {v.feedback && (
                      <div className="muted" style={{ fontSize: 12.5, fontStyle: 'italic', marginTop: 4, background: 'var(--panel-2)', padding: '4px 8px', borderRadius: 4 }}>
                        â€œ{v.feedback}â€
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', alignSelf: 'center' }}>
                    {me?.user?.role !== 'broker' && <button className="btn sm wa-btn" title="Send WhatsApp Pass" onClick={() => sendWhatsAppPass(v)}>
                      <Icon name="wa" />WhatsApp Pass
                    </button>}

                    {v.status === 'scheduled' && (
                      <button className="btn sm" onClick={() => confirmVisit(v)}>
                        <Icon name="checkCircle" />Confirm
                      </button>
                    )}

                    {v.status === 'done' ? (
                      <button className="btn sm" style={{ border: '1px solid #059669', color: '#059669', background: 'rgba(5,150,105,0.08)' }} onClick={() => setPassportModal(v)}>
                        <Icon name="shield" />Evidence Passport
                      </button>
                    ) : (
                      <button className="btn sm ghost" style={{ fontSize: 11.5 }} onClick={() => setPassportModal(v)} title="View/edit visit evidence passport & notes">
                        <Icon name="shield" />Evidence Passport
                      </button>
                    )}

                    {['scheduled', 'confirmed'].includes(v.status) && (
                      <>
                        <button className="btn sm sun" onClick={() => setCompleteModal(v)}>
                          <Icon name="check" />Visited
                        </button>
                        <button className="btn sm ghost" onClick={() => setRescheduleModal(v)}>
                          Reschedule
                        </button>
                        <button className="btn sm ghost danger" onClick={() => markNoShow(v)}>
                          No-show
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {bookingModal && (
        <BookVisitModal
          onClose={() => setBookingModal(false)}
          say={say}
          onDone={() => { setBookingModal(false); reload(); }}
        />
      )}

      {completeModal && (
        <CompleteVisitModal
          visit={completeModal}
          onClose={() => setCompleteModal(null)}
          say={say}
          onDone={() => { setCompleteModal(null); reload(); }}
        />
      )}

      {rescheduleModal && (
        <RescheduleVisitModal
          visit={rescheduleModal}
          onClose={() => setRescheduleModal(null)}
          say={say}
          onDone={() => { setRescheduleModal(null); reload(); }}
        />
      )}

      {passportModal && (
        <VisitPassportModal
          visit={passportModal}
          onClose={() => setPassportModal(null)}
          say={say}
          onDone={() => { setPassportModal(null); reload(); }}
        />
      )}
    </div>
  );
}

function BookVisitModal({ onClose, say, onDone }) {
  const [leads] = useLoad(() => api.get('/api/leads'), []);
  const [projects] = useLoad(() => api.get('/api/projects'), []);
  const [leadId, setLeadId] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [projectId, setProjectId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [visitorsCount, setVisitorsCount] = useState(2);
  const [transport, setTransport] = useState('self');
  const [pickupAddress, setPickupAddress] = useState('');
  const [busy, setBusy] = useState(false);

  // default date to tomorrow 11 AM
  React.useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    setScheduledAt(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
  }, []);

  React.useEffect(() => {
    if (projects?.length && !projectId) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const onSelectLead = (id) => {
    setLeadId(id);
    const l = leads?.find(x => x.id === id);
    if (l) {
      setCustName(l.name);
      setCustPhone(l.phone);
      if (l.project_id) setProjectId(l.project_id);
    }
  };

  const submit = async () => {
    if (!scheduledAt) return say('Please select visit date and time');
    if (!leadId && (!custName || custPhone.replace(/\D/g, '').length < 10)) {
      return say('Please select a lead or provide valid client name and phone');
    }
    setBusy(true);
    try {
      await api.post('/api/visits', {
        lead_id: leadId || undefined,
        name: custName,
        phone: custPhone,
        project_id: projectId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        visitors_count: Number(visitorsCount) || 1,
        transport,
        pickup_address: transport === 'cab' ? pickupAddress : null,
      });
      say('Site visit scheduled successfully');
      onDone();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal
      title="Book a Site Visit"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn sun" disabled={busy} onClick={submit}>
            {busy ? 'Bookingâ€¦' : 'Schedule Visit'}
          </button>
        </>
      }
    >
      <div className="kgrid">
        <Field label="Client (From Lead Pipeline)" id="bv-lead">
          <select id="bv-lead" className="select" value={leadId} onChange={e => onSelectLead(e.target.value)}>
            <option value="">Select Existing Lead...</option>
            {(leads || []).filter(l => !['booked', 'lost'].includes(l.stage)).map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.phone}) Â· {l.stage}</option>
            ))}
          </select>
        </Field>

        <Field label="Project to Visit" id="bv-proj">
          <select id="bv-proj" className="select" value={projectId} onChange={e => setProjectId(e.target.value)}>
            {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        {!leadId && (
          <>
            <Field label="Client Full Name" id="bv-name">
              <input id="bv-name" className="input" placeholder="e.g. Ramesh Sharma" value={custName} onChange={e => setCustName(e.target.value)} />
            </Field>
            <Field label="Client Phone Number" id="bv-ph">
              <input id="bv-ph" className="input" inputMode="tel" placeholder="98290 12345" value={custPhone} onChange={e => setCustPhone(e.target.value)} />
            </Field>
          </>
        )}

        <Field label="Scheduled Date & Time" id="bv-time">
          <input id="bv-time" type="datetime-local" className="input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
        </Field>

        <Field label="Expected Visitors Count" id="bv-cnt">
          <select id="bv-cnt" className="select" value={visitorsCount} onChange={e => setVisitorsCount(e.target.value)}>
            <option value="1">1 Person (Client alone)</option>
            <option value="2">2 Persons (Couple / Buyer + Spouse)</option>
            <option value="3">3 Persons (Family)</option>
            <option value="4">4 Persons (Family / Decision Makers)</option>
            <option value="5">5+ Persons (Group)</option>
          </select>
        </Field>
      </div>

      <div className="card" style={{ marginTop: 14, background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
        <div className="card-b">
          <b>Transportation Preference</b>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="trans" checked={transport === 'self'} onChange={() => setTransport('self')} />
              <span>Personal Vehicle / Self</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="trans" checked={transport === 'cab'} onChange={() => setTransport('cab')} />
              <span>Builder Cab / Chauffeur Required ðŸš–</span>
            </label>
          </div>

          {transport === 'cab' && (
            <Field label="Pickup Location & Time Instructions" id="bv-pick" style={{ marginTop: 10 }}>
              <input
                id="bv-pick"
                className="input"
                placeholder="e.g. Near C-Scheme Circle, Jaipur (Driver will coordinate 30 min prior)"
                value={pickupAddress}
                onChange={e => setPickupAddress(e.target.value)}
              />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CompleteVisitModal({ visit, onClose, say, onDone }) {
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [interestedUnit, setInterestedUnit] = useState('');
  const [setFollowup, setSetFollowup] = useState(true);
  const [followupDate, setFollowupDate] = useState('');
  const [followupNote, setFollowupNote] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    // Default follow-up date 2 days later at 11 AM
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(11, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    setFollowupDate(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch('/api/visits/' + visit.id, {
        status: 'done',
        rating: Number(rating),
        feedback,
        interested_unit: interestedUnit || null,
      });

      if (setFollowup && followupDate) {
        await api.patch('/api/leads/' + visit.lead_id, {
          followup_at: new Date(followupDate).toISOString(),
          followup_type: 'call',
          followup_note: followupNote || `Post site-visit follow-up: ${feedback || 'Discuss feedback & offer'}`,
        });
      }

      say('Visit marked completed and feedback recorded!');
      onDone();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal
      title={`Record Visit Feedback: ${visit.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn sun" disabled={busy} onClick={submit}>
            {busy ? 'Savingâ€¦' : 'Complete Visit'}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ marginBottom: 6, display: 'block' }}>Customer Interest & Rating</label>
        <div className="rating-stars" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map(star => (
            <span
              key={star}
              className={`rating-star ${star <= rating ? 'filled' : ''}`}
              onClick={() => setRating(star)}
              title={`${star} star`}
            >
              â˜…
            </span>
          ))}
          <span style={{ fontSize: 13, color: 'var(--ink-2)', alignSelf: 'center', marginLeft: 8 }}>
            {rating === 5 ? 'Very Enthusiastic' : rating === 4 ? 'Positive' : rating === 3 ? 'Neutral / Evaluating' : 'Cold / Mismatch'}
          </span>
        </div>
      </div>

      <Field label="Preferred Flat / Unit (if discussed)" id="cv-unit">
        <input
          id="cv-unit"
          className="input"
          placeholder="e.g. Tower B - 302, 3 BHK park-facing"
          value={interestedUnit}
          onChange={e => setInterestedUnit(e.target.value)}
        />
      </Field>

      <Field label="Visit Notes & Client Feedback" id="cv-fb">
        <textarea
          id="cv-fb"
          className="textarea"
          rows={3}
          placeholder="Liked the clubhouse, concerned about possession timeline, asked for payment flexibility..."
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
        />
      </Field>

      <div className="card" style={{ marginTop: 14, background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
        <div className="card-b">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={setFollowup} onChange={e => setSetFollowup(e.target.checked)} />
            <span>Schedule Post-Visit Follow-up Reminder</span>
          </label>

          {setFollowup && (
            <div className="kgrid" style={{ marginTop: 10 }}>
              <Field label="Follow-up Date & Time" id="cv-fdt">
                <input id="cv-fdt" type="datetime-local" className="input" value={followupDate} onChange={e => setFollowupDate(e.target.value)} />
              </Field>
              <Field label="Follow-up Agenda" id="cv-fag">
                <input id="cv-fag" className="input" placeholder="Call to present customized payment plan" value={followupNote} onChange={e => setFollowupNote(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RescheduleVisitModal({ visit, onClose, say, onDone }) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!scheduledAt) return say('Please select new visit date & time');
    setBusy(true);
    try {
      await api.patch('/api/visits/' + visit.id, {
        status: 'rescheduled',
        reschedule_at: new Date(scheduledAt).toISOString(),
        feedback: reason ? `Rescheduled: ${reason}` : 'Rescheduled on customer request',
      });
      say('Visit rescheduled successfully');
      onDone();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal
      title={`Reschedule Site Visit: ${visit.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn sun" disabled={busy} onClick={submit}>
            {busy ? 'Savingâ€¦' : 'Confirm Reschedule'}
          </button>
        </>
      }
    >
      <Field label="New Date & Time" id="rv-time">
        <input id="rv-time" type="datetime-local" className="input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
      </Field>
      <Field label="Reason for Reschedule" id="rv-rs">
        <input id="rv-rs" className="input" placeholder="e.g. Client requested weekend slot due to office meeting" value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

function VisitPassportModal({ visit, onClose, say, onDone }) {
  const [passport, setPassport] = useState(visit.evidence_passport || null);
  const [busy, setBusy] = useState(false);
  const [flatsShown, setFlatsShown] = useState(visit.evidence_passport?.flats_shown || visit.interested_unit || '');
  const [priceQuoted, setPriceQuoted] = useState(visit.evidence_passport?.price_quoted || '');
  const [commitments, setCommitments] = useState(visit.evidence_passport?.commitments || '');
  const [questions, setQuestions] = useState(visit.evidence_passport?.questions || visit.feedback || '');

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/visits/${visit.id}/ai-passport`, {
        flats_shown: flatsShown,
        price_quoted: priceQuoted,
        commitments: commitments,
        questions: questions
      });
      setPassport(res.passport || res);
      say('Site visit notes saved');
      if (typeof onDone === 'function') onDone();
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  const copyText = () => {
    const text = `SITE VISIT NOTES (CRM RECORD)\n` +
      `Client: ${visit.name} (${visit.phone})\n` +
      `Project: ${visit.project_name || 'Project Site'}\n` +
      `Date & Time: ${new Date(visit.scheduled_at).toLocaleString('en-IN')}\n` +
      `Flats / units recorded: ${flatsShown || 'Not recorded'}\n` +
      `Price / quote recorded: ${priceQuoted || 'Not recorded'}\n` +
      `Commitments discussed: ${commitments || 'Not recorded'}\n` +
      `Questions / notes: ${questions || 'Not recorded'}\n` +
      `CRM record ID: ${visit.id}`;
    navigator.clipboard?.writeText(text);
    say('Visit notes copied to clipboard');
  };

  const shareBuyerWhatsApp = () => {
    const text = `*SITE VISIT NOTES (CRM RECORD)*\n` +
      `Namaste *${visit.name}*!\n\n` +
      `Thank you for visiting *${visit.project_name || 'our project'}* today.\n\n` +
      `â€¢ *Flats / units recorded:* ${flatsShown || 'Not recorded'}\n` +
      `â€¢ *Price / quote recorded:* ${priceQuoted || 'Not recorded'}\n` +
      `â€¢ *Commitments discussed:* ${commitments || 'Not recorded'}\n` +
      `â€¢ *CRM record ID:* ${visit.id}\n\n` +
      `These CRM-entered notes do not independently verify prices, commitments, approvals, or availability. Confirm them with the responsible project representative.`;
    const ph = String(visit.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <Modal
      title="Site Visit Notes"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn ghost" onClick={copyText}><Icon name="copy" />Copy Record</button>
          <button className="btn wa-btn" onClick={shareBuyerWhatsApp}><Icon name="wa" />Share with Buyer</button>
          <button className="btn sun" disabled={busy} onClick={generate}>
            {busy ? 'Saving…' : passport ? 'Update Notes' : 'Save Notes'}
          </button>
        </>
      }
    >
      <div className="passport-sheet">
        <div className="passport-header">
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#64748b', textTransform: 'uppercase' }}>
              NIVAAS SITE VISIT NOTES
            </span>
            <h2 style={{ fontSize: 18, margin: '2px 0 0', color: '#0f172a' }}>Site Visit Notes</h2>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Client: <b>{visit.name}</b> Â· {visit.phone} Â· Host: <b>{visit.agent || 'Site RM'}</b>
            </div>
          </div>
          <div className="passport-seal">
            CRM RECORD
          </div>
        </div>

        <div className="passport-grid">
          <div className="passport-cell">
            <span>Project & Locus</span>
            <b>{visit.project_name || 'Project Site Office'}</b>
          </div>
          <div className="passport-cell">
            <span>Visit Timestamp</span>
            <b>{new Date(visit.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Flats / Units Shown during Visit" id="vp-flats">
            <input id="vp-flats" className="input" placeholder="e.g. Flat 402 Tower A (3 BHK) and Sample Flat 101" value={flatsShown} onChange={e => setFlatsShown(e.target.value)} />
          </Field>
          <Field label="Cost Sheet & Commercials Quoted" id="vp-price">
            <input id="vp-price" className="input" placeholder="e.g. â‚¹98.5 Lakhs all-inclusive with 1 covered parking" value={priceQuoted} onChange={e => setPriceQuoted(e.target.value)} />
          </Field>
          <Field label="Commitments Discussed (CRM Record)" id="vp-comm">
            <input id="vp-comm" className="input" placeholder="e.g. Free modular kitchen voucher if booked before Sunday, 10:90 scheme" value={commitments} onChange={e => setCommitments(e.target.value)} />
          </Field>
          <Field label="Buyer Questions & Discussion Points" id="vp-q">
            <textarea id="vp-q" className="textarea" rows={2} placeholder="e.g. Buyer inquired about morning sunlight in master bedroom and clubhouse completion date" value={questions} onChange={e => setQuestions(e.target.value)} />
          </Field>
        </div>

        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f1f5f9', borderRadius: 8, fontSize: 11.5, color: '#475569' }}>
          <b>Record note:</b> These details are entered by the team and may be updated. Confirm quoted terms and commitments with the responsible project representative.
        </div>
      </div>
    </Modal>
  );
}
