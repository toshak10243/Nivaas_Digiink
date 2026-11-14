import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { Icon, Avatar, Switch, Seg, Modal, Field, useLoad, Loading, Empty } from '../components/ui.jsx';
import { ago, time, phone, stageLabel } from '../lib/format.js';

const TRY = ['302-F available hai?', 'EMI kitni banegi?', 'Best price kya hoga?', 'Kal 11 baje visit kar sakte hain', '2 BHK ka rate kya hai?'];

export default function Chats({ me, say, go, params, reloadMe }) {
  const [list, reload] = useLoad(() => api.get('/api/chats'), []);
  const [newChat, setNewChat] = useState(false);
  const openId = params[0] || list?.[0]?.id;
  const twin = me.user.profile?.ai_twin || { mode: 'away', reply_after_min: 5 };
  const setTwin = async patch => { await api.patch('/api/me/profile', { ai_twin: patch }); reloadMe(); say('AI twin updated'); };
  if (!list) return <div className="page"><Loading /></div>;

  return (
    <div className="chatpage">
      {me.user.role === 'sales' && (
        <div className="twinbar">
          <span className="twinicon"><Icon name="spark" /></span>
          <div style={{ flex: 1, minWidth: 0 }}><b>Your AI twin on {me.user.whatsapp?.display || 'your WhatsApp'}</b>
            <span className="muted">{twin.mode === 'always' ? 'Replies to every message instantly. You can jump in any time.' : twin.mode === 'off' ? 'Off. You will only get notified.' : `Replies when you are “Away”, or if you don’t reply within ${twin.reply_after_min} min.`}</span></div>
          <Seg value={twin.mode} onChange={v => setTwin({ mode: v })} label="AI twin mode" options={[['off', 'Off'], ['away', 'Cover for me'], ['always', 'Always']]} />
          {twin.mode === 'away' && <select className="select" style={{ width: 120 }} value={twin.reply_after_min} onChange={e => setTwin({ reply_after_min: Number(e.target.value) })} aria-label="Wait before AI replies">{[2, 5, 10, 15, 30].map(m => <option key={m} value={m}>after {m} min</option>)}</select>}
        </div>
      )}
      <div className="inbox chatgrid">
        <aside className="ilist" aria-label="Chats">
          <div className="ilist-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b>WhatsApp chats</b>
              <span className="muted" style={{ fontSize: 12, display: 'block' }}>Each lead talks to their agent</span>
            </div>
            <button className="btn sm wa-btn" onClick={() => setNewChat(true)}>
              <Icon name="plus" />New Chat
            </button>
          </div>
          <div className="convs">
            {list.length === 0 && <Empty icon="chat" title="No chats yet">When a lead is assigned to you, an intro goes from your WhatsApp and the chat appears here.</Empty>}
            {list.map(c => (
              <button key={c.id} className="conv" aria-selected={c.id === openId} onClick={() => go('chats/' + c.id)}>
                <Avatar name={c.name} />
                <div style={{ minWidth: 0 }}><div className="n">{c.last_sender === 'customer' && <span className="ud" />}{c.name}</div>
                  <div className="p">{c.last_sender === 'ai' ? 'AI: ' : c.last_sender === 'agent' ? 'You: ' : ''}{c.last_body}</div></div>
                <div className="r"><span className="time">{c.last_at ? ago(c.last_at) : ''}</span>{!c.ai_enabled && <span className="pill cold">Manual</span>}{me.user.role === 'admin' && <span className="muted" style={{ fontSize: 11 }}>{c.agent}</span>}</div>
              </button>
            ))}
          </div>
        </aside>
        {openId ? <Thread key={openId} id={openId} me={me} say={say} go={go} onChange={reload} /> : <section className="ichat" />}
      </div>
      {newChat && <NewChatModal me={me} say={say} go={go} onClose={() => setNewChat(false)} onDone={ch => { setNewChat(false); reload(); go('chats/' + ch.id); }} />}
    </div>
  );
}

function Thread({ id, me, say, go, onChange }) {
  const [c, reload] = useLoad(() => api.get('/api/chats/' + id), [id]);
  const [text, setText] = useState('');
  const [cust, setCust] = useState('');
  const [testMessages, setTestMessages] = useState([]);
  const [testText, setTestText] = useState('');
  const [testError, setTestError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => { box.current && (box.current.scrollTop = box.current.scrollHeight); }, [c?.messages?.length, testMessages.length, busy]);
  if (!c) return <section className="ichat"><Loading /></section>;
  const send = async () => { const t = text.trim(); if (!t) return; setBusy(true); try { await api.post(`/api/chats/${id}/messages`, { text: t }); setText(''); reload(); onChange(); } catch (e) { say(e.message); } setBusy(false); };
  const simulate = async (t = cust) => {
    t = t.trim(); if (!t) return; setBusy(true); setCust('');
    try { const r = await api.post(`/demo/chats/${id}/customer`, { text: t }); await reload(); onChange(); if (r.pending) say(`You are available, so the AI twin waits ${r.pending} min for you. Reply yourself or tap “Let AI reply now”.`); }
    catch (e) { say(e.message); }
    setBusy(false);
  };
  const aiNow = async () => { setBusy(true); try { await api.post(`/demo/chats/${id}/ai-now`); await reload(); onChange(); } catch (e) { say(e.message); } setBusy(false); };
  const waiting = c.messages.at(-1)?.sender === 'customer';
  const askAI = async () => {
    const message = testText.trim();
    if (!message || busy) return;
    setBusy(true); setTestError('');
    try {
      const result = await api.post(`/api/chats/${id}/ai-preview`, { text: message, history: testMessages.slice(-6) });
      setTestMessages(previous => [...previous, { sender: 'customer', body: message }, { sender: 'ai', body: result.reply, attachments: result.attachments || [] }]);
      setTestText('');
    } catch (error) { setTestError(error.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="ichat" aria-label="Chat">
      <div className="ichat-h">
        <Avatar name={c.name} />
        <div className="who"><b>{c.name}</b><span>{phone(c.phone)} · on {c.display}</span></div>
        <button className="btn sm ghost" onClick={() => go('leads/' + c.lead_id)}>Lead</button>
        <a
          className="btn sm wa-btn"
          href={`https://wa.me/${String(c.phone || '').replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          title="Open in WhatsApp Web"
        >
          <Icon name="wa" />WhatsApp Web
        </a>
        <div className="aitoggle"><span>{c.ai_enabled ? 'AI twin on' : 'You are replying'}</span><Switch on={c.ai_enabled} label="AI twin for this chat" onChange={async v => { await api.patch('/api/chats/' + id, { ai_enabled: v }); reload(); onChange(); }} /></div>
      </div>
      <div className="msgs" ref={box} aria-live="polite">
        {c.messages.map(m => m.sender === 'system' ? <div key={m.id} className="sysmsg">{m.body}</div> : (
          <div key={m.id} className={'bub ' + (m.sender === 'agent' ? 'owner' : m.sender)}>
            <span className="by">{m.sender === 'ai' ? <><Icon name="spark" />AI twin</> : m.sender === 'agent' ? 'You' : c.name.split(' ')[0]}</span>{m.body}<span className="t">{time(m.created_at)}</span>
          </div>
        ))}
        {testMessages.length > 0 && <div className="sysmsg">Demo conversation ? visible only in this browser, not sent to WhatsApp.</div>}
        {testMessages.map((m, index) => <div key={index} className={'bub ' + m.sender}><span className="by">{m.sender === 'ai' ? 'AI demo reply' : 'Demo customer'}</span>{m.body}{m.attachments?.length > 0 && <div className="preview-attachments">{m.attachments.map((file, i) => <figure key={`${file.url}-${i}`}><img src={api.media(file.url)} alt={file.title || file.type_name} /><figcaption>{file.kind === 'floorplan' ? `${file.type_name} layout` : file.title || `${file.type_name} sample flat`}</figcaption></figure>)}</div>}</div>)}
        {busy && <div className="typing">Working <i /><i /><i /></div>}
      </div>
      <div className="composer">
        {api.mode !== 'demo' && <div className="demosim">
          <div className="mode"><span className="k">Demo AI:</span> customer ka message likho; AI isi chat mein reply karega.</div>
          <div className="quick">{['Aravali Heights mein kya options hain?', 'Site visit karni hai'].map(message => <button key={message} disabled={busy} onClick={() => setTestText(message)}>{message}</button>)}<button disabled={busy} onClick={() => { setTestMessages([]); setTestError(''); }}>Clear test</button></div>
          {testError && <p role="alert">{testError}</p>}
          <form className="sendrow" onSubmit={event => { event.preventDefault(); askAI(); }}>
            <input className="input" aria-label="Test customer message" placeholder="Type as the customer to test AI..." maxLength={2000} disabled={busy} value={testText} onChange={event => setTestText(event.target.value)} />
            <button className="btn sun" disabled={busy || !testText.trim()}>{busy ? 'AI is replying...' : 'Ask AI'}</button>
          </form>
        </div>}
        {api.mode === 'demo' && (
          <div className="demosim">
            <div className="mode"><span className="k">Demo:</span> type as the customer on WhatsApp.</div>
            <div className="quick">{TRY.map(t => <button key={t} disabled={busy} onClick={() => simulate(t)}>{t}</button>)}</div>
            <form className="sendrow" onSubmit={e => { e.preventDefault(); simulate(); }}>
              <input className="input" aria-label="Customer message" placeholder="Customer writes…" value={cust} onChange={e => setCust(e.target.value)} />
              <button className="btn" disabled={busy || !cust.trim()}>Send as customer</button>
              {waiting && c.ai_enabled && <button type="button" className="btn sun" disabled={busy} onClick={aiNow}><Icon name="spark" />Let AI reply now</button>}
            </form>
          </div>
        )}
        <form className="sendrow" onSubmit={e => { e.preventDefault(); send(); }}>
          <input className="input" aria-label="Your reply" placeholder="Reply as yourself…" value={text} onChange={e => setText(e.target.value)} />
          <button className="btn ink" disabled={busy || !text.trim()}><Icon name="send" />Send</button>
        </form>
      </div>
    </section>
  );
}

function NewChatModal({ me, say, go, onClose, onDone }) {
  const [leads] = useLoad(() => api.get('/api/leads'), []);
  const [source, setSource] = useState('existing'); // 'existing' | 'new'
  const [leadId, setLeadId] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [template, setTemplate] = useState('intro');
  const [customMsg, setCustomMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedLead = (leads || []).find(l => l.id === leadId);
  const targetName = source === 'existing' ? selectedLead?.name || 'there' : nameInput.trim() || 'there';
  const targetPhone = source === 'existing' ? selectedLead?.phone : phoneInput.trim();

  const TEMPLATES = {
    intro: `Namaste ${targetName}! 🙏 I'm ${me.user.name} from Shree Ganesh Developers. I'll help you with your home search and site visits. When would be a good time to connect?`,
    brochure: `Namaste ${targetName}! Here are the latest floor plans, photos and payment plans for our ongoing projects. Feel free to ask any questions!`,
    visit: `Namaste ${targetName}! We are excited to show you the site. Would tomorrow 11 AM or 4 PM work well for your visit?`,
    custom: customMsg,
  };

  const finalMsg = template === 'custom' ? customMsg : TEMPLATES[template] || '';

  const startInApp = async () => {
    setBusy(true);
    try {
      const payload = source === 'existing' 
        ? { lead_id: leadId, initial_message: finalMsg }
        : { phone: targetPhone, name: nameInput, initial_message: finalMsg };
      const chat = await api.post('/api/chats', payload);
      say(chat.templateSent
        ? 'Approved intro template sent. You can send your message after the customer replies.'
        : 'WhatsApp message sent');
      onDone(chat);
    } catch (e) {
      say(e.message);
    }
    setBusy(false);
  };

  const openWhatsAppWeb = () => {
    const clean = String(targetPhone || '').replace(/\D/g, '').replace(/^0+/, '');
    const full = clean.length === 10 ? '91' + clean : clean;
    const url = full
      ? `https://wa.me/${full}?text=${encodeURIComponent(finalMsg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(finalMsg)}`;
    window.open(url, '_blank');
    onClose();
  };

  return (
    <Modal
      title="Start WhatsApp Chat"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !targetPhone}
              onClick={openWhatsAppWeb}
            >
              <Icon name="wa" />Open WhatsApp Web
            </button>
            <button
              type="button"
              className="btn sun"
              disabled={busy || !targetPhone}
              onClick={startInApp}
            >
              <Icon name="chat" />Start in Nivaas
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="seg" role="group" aria-label="Lead Source">
          <button type="button" aria-pressed={source === 'existing'} onClick={() => setSource('existing')}>
            Select Existing Lead
          </button>
          <button type="button" aria-pressed={source === 'new'} onClick={() => setSource('new')}>
            New Phone Number
          </button>
        </div>

        {source === 'existing' ? (
          <Field label="Choose Lead" id="nc-lead">
            <select
              id="nc-lead"
              className="select"
              value={leadId}
              onChange={e => setLeadId(e.target.value)}
            >
              <option value="">-- Select a Lead --</option>
              {(leads || []).map(l => (
                <option key={l.id} value={l.id}>
                  {l.name || 'Unnamed'} ({phone(l.phone)}) · {stageLabel(l.stage)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="kgrid">
            <Field label="Client Name" id="nc-name">
              <input
                id="nc-name"
                className="input"
                placeholder="Ramesh Gupta"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
              />
            </Field>
            <Field label="Mobile Number" id="nc-phone">
              <input
                id="nc-phone"
                type="tel"
                className="input"
                placeholder="98290 12345"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Message Template" id="nc-tmpl">
          <select
            id="nc-tmpl"
            className="select"
            value={template}
            onChange={e => setTemplate(e.target.value)}
          >
            <option value="intro">👋 Introduction & Site Visit Invitation</option>
            <option value="brochure">🏡 Project Brochure & Pricing Details</option>
            <option value="visit">📅 Confirm Site Visit Time</option>
            <option value="custom">✏️ Custom Message</option>
          </select>
        </Field>

        {template === 'custom' ? (
          <Field label="Your Message" id="nc-custom">
            <textarea
              id="nc-custom"
              className="textarea"
              rows={3}
              placeholder="Type your WhatsApp message..."
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
            />
          </Field>
        ) : (
          <div className="field">
            <label>Message Preview</label>
            <div className="msgpreview">{finalMsg}</div>
          </div>
        )}
        <small className="muted">Outside WhatsApp's 24-hour reply window, Nivaas sends the approved intro template. Your selected message can be sent after the customer replies.</small>
      </div>
    </Modal>
  );
}
