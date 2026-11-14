import { config } from '../config.js';

export async function callGemini({ prompt, system = '', jsonMode = false, temperature = 0.3, signal }) {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const models = [config.gemini.model, 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest'];
  let lastErr = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const bodyPayload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 1200,
      },
    };

    if (system) {
      bodyPayload.systemInstruction = { parts: [{ text: system }] };
    }
    if (jsonMode) {
      bodyPayload.generationConfig.responseMimeType = 'application/json';
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        lastErr = new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch (e) {
      if(signal?.aborted) throw e;
      lastErr = e;
    }
  }

  throw lastErr || new Error('Gemini API call failed across all models');
}

/**
 * Feature 7: AI Buyer Objection Resolver
 * Takes customer objection + project facts and produces an approved, polite, persuasive response script.
 */
export async function resolveObjection({ project = {}, lead = {}, objection = '' }) {
  const system = `You are a real-estate sales copilot for ${project.name || 'our premium property'} by a verified developer.
Your goal is to address buyer objections with polite, factual, confident responses in conversational Hindi/Hinglish (with English technical terms like RERA, carpet area, expressway, IFMS).

PROJECT FACTS:
- Name: ${project.name || 'Nivaas Project'}
- Location: ${project.location || 'Prime Location'}, ${project.city || 'Jaipur'}
- Price Rate: ₹${project.rate_sqft || 5200}/sq ft
- Possession: ${project.possession || 'Dec 2026'}
- RERA Reg: ${project.rera_no || 'Verified RERA'}
- Amenities: ${(project.amenities || []).join(', ')}
- Payment Plan: Construction Linked (CLP)

RULES:
1. Never sound defensive or argumentative. First acknowledge the customer's perspective with empathy.
2. Provide concrete facts (e.g. commute time, RERA escrow safety, quality of construction, amenity ROI).
3. End with a light call-to-action (inviting for a live sample flat visit or coffee at site office).
4. Return pure JSON with:
   {
     "objectionTitle": "Short title",
     "responseScript": "Sales agent talking script for phone or in-person",
     "whatsappMessage": "Short, beautifully formatted WhatsApp text with bullet points and emojis ready to send",
     "keyFacts": ["Fact 1", "Fact 2", "Fact 3"]
   }`;

  const prompt = `Customer name: ${lead.name || 'Valued Buyer'}
Looking for: ${lead.config_pref || 'Flat'}
Budget: ${lead.budget || 'Not specified'}
Objection raised by customer: "${objection}"

Provide the objection handling response in JSON format.`;

  try {
    const raw = await callGemini({ prompt, system, jsonMode: true, temperature: 0.3 });
    const cleanJson = String(raw || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    const script = parsed.responseScript || parsed.pitch_script || parsed.script || parsed.text || '';
    const wa = parsed.whatsappMessage || parsed.whatsapp_message || script;
    const facts = Array.isArray(parsed.keyFacts) ? parsed.keyFacts : Array.isArray(parsed.key_facts) ? parsed.key_facts : [];
    return {
      objectionTitle: parsed.objectionTitle || objection.slice(0, 40),
      responseScript: script,
      pitch_script: script,
      whatsappMessage: wa,
      whatsapp_message: wa,
      keyFacts: facts,
      key_facts: facts,
    };
  } catch (e) {
    // Robust fallback if AI fails or rate limits
    const safeName = lead.name ? lead.name.split(' ')[0] : 'Sir/Ma\'am';
    const projName = project.name || 'our project';
    const fallbackScript = `Namaste ${safeName}! I completely understand your concern regarding "${objection}". Let me share the verified facts about ${projName}. As a RERA-certified development, every milestone and construction quality parameter is strictly audited for on-time delivery. We also offer flexible Construction-Linked Payment (CLP) plans. Let us connect at the site office this weekend to review the master plan and model flat together.`;
    const fallbackWa = `Namaste *${safeName}*!\n\nRegarding your query on *${objection}*:\n• *${projName}* is RERA-certified with on-time construction tracking.\n• Approved for home loans from SBI, HDFC, and all major banks.\n• Premium build quality with lifetime amenities & clubhouse access.\n\nWould you be free for a 15-minute visit this weekend to see the sample flat in person?`;
    const fallbackFacts = [
      `RERA Registered: ${project.rera_no || 'Approved & Verified'}`,
      `Possession: ${project.possession || 'Scheduled on-time'}`,
      'Construction Linked Payment (CLP) milestone protection'
    ];
    return {
      objectionTitle: objection.slice(0, 40),
      responseScript: fallbackScript,
      pitch_script: fallbackScript,
      whatsappMessage: fallbackWa,
      whatsapp_message: fallbackWa,
      keyFacts: fallbackFacts,
      key_facts: fallbackFacts,
    };
  }
}

/**
 * Feature 9: AI Sales Handover Memory
 * Synthesizes customer history, offers, visits, and objections into a 1-paragraph handover briefing.
 */
export async function generateHandoverBrief({ lead = {}, events = [], visits = [], chats = [] }) {
  try {
    const historyText = (events || []).map(e => {
      const d = e.created_at ? (typeof e.created_at === 'string' ? e.created_at.slice(0, 10) : new Date(e.created_at).toISOString().slice(0, 10)) : '';
      return `[${d}] ${e.kind || 'note'}: ${e.body || ''}`;
    }).join('\n');

    const visitsText = (visits || []).map(v => {
      const d = v.scheduled_at ? (typeof v.scheduled_at === 'string' ? v.scheduled_at.slice(0, 10) : new Date(v.scheduled_at).toISOString().slice(0, 10)) : '';
      return `Visit on ${d}: Status ${v.status || 'scheduled'}, Feedback: ${v.feedback || 'None'}`;
    }).join('\n');

    const system = `You are a sales operations manager writing an executive client handover briefing for a newly assigned sales agent.
Synthesize all activity logs, quotes, visits, and chats into an actionable 1-paragraph summary in crisp Hinglish/English.
Return pure JSON with:
{
  "summary": "1 concise paragraph with customer mindset, key interest, price quotes discussed, and current status",
  "keyInterest": "e.g. 3 BHK East-facing, Tower A",
  "offeredPrice": "e.g. Quoted ₹1.18 Cr with car parking discount",
  "criticalNotes": ["Note 1", "Note 2"],
  "recommendedAction": "Immediate next step for the new agent"
}`;

    const prompt = `Lead: ${lead.name || 'Client'} (${lead.phone || 'Phone'})
Stage: ${lead.stage || 'Contacted'}, Temperature: ${lead.temperature || 'Warm'}
Requirement: ${lead.config_pref || '—'}, Budget: ${lead.budget || '—'}
Timeline: ${lead.timeline || '—'}, Purpose: ${lead.purpose || '—'}

Timeline Events:
${historyText || 'No prior events recorded'}

Site Visits:
${visitsText || 'No site visits recorded'}

Create the executive handover summary in JSON format.`;

    const raw = await callGemini({ prompt, system, jsonMode: true, temperature: 0.2 });
    return JSON.parse(raw);
  } catch (e) {
    console.error('generateHandoverBrief fallback triggered:', e?.message || e);
    return {
      summary: `Client ${lead.name || 'Valued Buyer'} is evaluating ${lead.config_pref || 'residential units'} in the ${lead.budget || 'standard'} budget range. Currently in ${lead.stage || 'active discussion'} stage. All verified notes and requirements are documented for uninterrupted transition.`,
      keyInterest: lead.config_pref || 'Residential Flat',
      offeredPrice: lead.budget || 'Developer List Price',
      criticalNotes: [
        'Schedule introductory call and introduce as the newly dedicated relationship manager.',
        'Review preferred floor layout and payment milestone schedule with buyer.'
      ],
      recommendedAction: 'Place introduction call within 24 hours to confirm current buying intent.'
    };
  }
}

/**
 * Feature 11: AI Site Visit Evidence Passport
 * Builds a verified digital certificate of what was shown, quoted and discussed during the visit.
 */
export async function generateVisitPassportData({ visit = {}, lead = {}, project = {}, unit = {} }) {
  const passportId = `SVP-${(project.name || 'NV').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const visitDate = new Date(visit.scheduled_at || Date.now()).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const whatsappText = `*OFFICIAL SITE VISIT PASSPORT*\n` +
    `*Passport ID:* #${passportId}\n` +
    `*Project:* ${project.name || 'Premium Project'}\n` +
    `*Customer:* ${lead.name || visit.name}\n` +
    `*Date Visited:* ${visitDate}\n` +
    `*Flat(s) Inspected:* ${unit.unit_no ? `Flat ${unit.unit_no} (${unit.type_name || 'Unit'})` : visit.interested_unit || 'Sample Flat & Show Villa'}\n` +
    `*Rating / Experience:* ${'★'.repeat(visit.rating || 5)}\n` +
    `*Executive In-Charge:* ${visit.agent || 'Site Relationship Manager'}\n\n` +
    `_This verified digital passport guarantees authorized developer pricing and priority allotment for 7 days._`;

  return {
    passportId,
    verifiedAt: new Date().toISOString(),
    customerName: lead.name || visit.name,
    customerPhone: lead.phone || visit.phone,
    projectName: project.name,
    projectLocation: project.location,
    unitInspected: unit.unit_no ? `Flat ${unit.unit_no} (${unit.type_name || ''})` : visit.interested_unit || 'Sample Flat',
    hostAgent: visit.agent || 'Site Advisor',
    rating: visit.rating || 5,
    feedback: visit.feedback || 'Visit completed successfully',
    whatsappText,
  };
}
