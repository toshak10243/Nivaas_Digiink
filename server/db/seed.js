// Loads the sample builder (shared/seed-data.js) into PostgreSQL.
//   npm run db:seed            → adds the sample org
//   npm run db:seed -- --reset → wipes ALL data first (careful)
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../src/db.js';
import { buildSeed } from '../../shared/seed-data.js';
import { costSheet, scheduleFor } from '../src/lib/pricing.js';

const S = buildSeed();
const id = new Map();
const uid = k => { if (!id.has(k)) id.set(k, crypto.randomUUID()); return id.get(k); };
const media = f => `/uploads/sample/${f}`;
const c = await pool.connect();
const q = (t, p) => c.query(t, p);

try {
  await q('BEGIN');
  if (process.argv.includes('--reset')) await q('TRUNCATE orgs CASCADE');
  const org = (await q(`INSERT INTO orgs (name, phone, email, address, rera_promoter, settings) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, bridge_secret`,
    [S.org.name, S.org.phone, S.org.email, S.org.address, S.org.rera_promoter, S.org.settings])).rows[0];
  const staffPw = await bcrypt.hash('nivaas123', 10), custPw = await bcrypt.hash('home1234', 10);
  for (const u of S.users) await q(`INSERT INTO users (id, org_id, role, name, email, phone, password_hash, profile) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid(u.id), org.id, u.role, u.name, u.email, u.phone, u.role === 'customer' ? custPw : staffPw, u.profile]);

  const types = {};
  for (const p of S.projects) {
    await q(`INSERT INTO projects (id, org_id, name, tagline, description, location, city, map_url, rera_no, status, possession, rate_sqft, charges, payment_plan, amenities, highlights, cover_url, sales_pool)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [uid(p.id), org.id, p.name, p.tagline, p.description, p.location, p.city, p.map_url, p.rera_no, p.status, p.possession, p.rate_sqft, p.charges, JSON.stringify(p.payment_plan),
        p.amenities, p.highlights, media(p.cover), p.sales_pool.map(uid)]);
    for (const t of p.types) {
      types[t.id] = t;
      await q(`INSERT INTO unit_types (id, project_id, name, bhk, carpet_sqft, builtup_sqft, super_sqft, bathrooms, balconies, floorplan_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uid(t.id), uid(p.id), t.name, t.bhk, t.carpet_sqft, t.builtup_sqft, t.super_sqft, t.bathrooms, t.balconies, media(t.floorplan)]);
      await q(`INSERT INTO media (org_id, project_id, unit_type_id, kind, url, title, sort) VALUES ($1,$2,$3,'floorplan',$4,$5,50)`, [org.id, uid(p.id), uid(t.id), media(t.floorplan), `${t.name} floor plan`]);
    }
    for (const tw of p.towers) await q(`INSERT INTO towers (id, project_id, name, floors) VALUES ($1,$2,$3,$4)`, [uid(p.id + ':T' + tw.name), uid(p.id), tw.name, tw.floors]);
    for (const [i, [kind, f, title]] of p.media.entries()) await q(`INSERT INTO media (org_id, project_id, kind, url, title, sort) VALUES ($1,$2,$3,$4,$5,$6)`, [org.id, uid(p.id), kind, media(f), title, i]);
    for (const u of p.updates) await q(`INSERT INTO project_updates (project_id, title, body, created_at) VALUES ($1,$2,$3,$4)`, [uid(p.id), u.title, u.body, S.ago(u.days)]);
  }
  for (const u of S.units) await q(`INSERT INTO units (id, project_id, tower_id, unit_type_id, unit_no, floor, facing, plc_pct, status, hold_by, hold_until, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [uid(u.id), uid(u.project), uid(u.project + ':T' + u.tower), uid(u.type), u.unit_no, u.floor, u.facing, u.plc_pct, u.status, u.hold_by ? uid(u.hold_by) : null,
      u.hold_hours ? new Date(Date.now() + u.hold_hours * 3600e3) : null, u.notes || null]);

  const projOf = Object.fromEntries(S.projects.map(p => [p.id, p]));
  const userOf = Object.fromEntries(S.users.map(u => [u.id, u]));
  for (const b of S.bookings) {
    const unit = S.units.find(u => u.id === b.unit), p = projOf[unit.project];
    const deal = costSheet(p, types[unit.type], unit).total - b.discount;
    const date = S.ago(b.days_ago).slice(0, 10);
    await q(`INSERT INTO bookings (id, org_id, unit_id, customer_id, sold_by, broker_id, deal_value, discount, booking_amount, booking_date, status, schedule) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [uid(b.id), org.id, uid(unit.id), uid(b.customer), b.sold_by ? uid(b.sold_by) : null, b.broker ? uid(b.broker) : null, deal, b.discount, Math.round(deal * 0.1), date, b.status, JSON.stringify(scheduleFor(p, deal))]);
    let paid = 0;
    for (const m of scheduleFor(p, deal)) {
      if (paid + m.pct > b.paid_pct) break;
      paid += m.pct;
      await q(`INSERT INTO payments (booking_id, amount, paid_on, mode, ref, milestone) VALUES ($1,$2,$3,$4,$5,$6)`,
        [uid(b.id), m.amount, S.ago(Math.max(1, b.days_ago - paid)).slice(0, 10), paid <= 10 ? 'Cheque' : 'NEFT', 'UTR' + Math.floor(Math.random() * 1e9), m.milestone]);
    }
    for (const [who, kind] of [[b.sold_by, 'sales_incentive'], [b.broker, 'broker_commission']]) {
      if (!who) continue;
      const rule = kind === 'sales_incentive' ? userOf[who].profile.incentive : userOf[who].profile.commission;
      const amt = rule.type === 'flat' ? rule.value : Math.round(deal * rule.value / 100);
      await q(`INSERT INTO commissions (org_id, booking_id, user_id, kind, basis, amount, status, paid_on, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [org.id, uid(b.id), uid(who), kind, rule.type === 'flat' ? `Flat ₹${rule.value.toLocaleString('en-IN')}` : `${rule.value}% of deal value`, amt,
          b.days_ago > 60 ? 'paid' : b.days_ago > 20 ? 'approved' : 'pending', b.days_ago > 60 ? S.ago(b.days_ago - 30).slice(0, 10) : null, S.ago(b.days_ago)]);
    }
  }

  for (const l of S.leads) {
    await q(`INSERT INTO leads (id, org_id, project_id, name, phone, source, stage, temperature, budget, config_pref, purpose, timeline, ai_summary, assigned_to, assigned_at, first_touch_at, broker_id, unit_id, lost_reason, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
      [uid(l.id), org.id, uid(l.project), l.name, l.phone, l.source, l.stage, l.temperature, l.budget, l.config_pref, l.purpose, l.timeline, l.ai_summary,
        l.assigned ? uid(l.assigned) : null, l.assigned ? S.ago(l.days_ago) : null, l.assigned && l.stage !== 'qualified' ? S.ago(l.days_ago) : null,
        l.broker ? uid(l.broker) : null, l.unit ? uid(l.unit) : null, l.lost_reason, S.ago(l.days_ago)]);
    await q(`INSERT INTO lead_events (lead_id, kind, body, created_at) VALUES ($1,'created',$2,$3)`, [uid(l.id), { leadsathi: 'From LeadSathi AI (WhatsApp)', share_link: 'Enquired from a shared link', broker: 'Registered by broker', walk_in: 'Walk-in at site office', whatsapp: 'WhatsApp inquiry' }[l.source], S.ago(l.days_ago)]);
    if (l.assigned) await q(`INSERT INTO lead_events (lead_id, kind, body, created_at) VALUES ($1,'assigned',$2,$3)`, [uid(l.id), `Assigned to ${userOf[l.assigned].name} automatically`, S.ago(l.days_ago * 0.98)]);
  }
  for (const v of S.visits) await q(`INSERT INTO site_visits (org_id, lead_id, project_id, agent_id, scheduled_at, status, feedback) SELECT $1,$2,project_id,$3,$4,$5,$6 FROM leads WHERE id = $2`,
    [org.id, uid(v.lead), v.agent ? uid(v.agent) : null, v.when, v.status, v.feedback || null]);

  for (const ag of ['rohit', 'neha', 'arjun']) await q(`INSERT INTO wa_numbers (org_id, user_id, phone_number_id, display, access_token) VALUES ($1,$2,$3,$4,'demo-token')`,
    [org.id, uid(ag), 'demo-' + ag + '-' + org.id.slice(0, 6), '+' + userOf[ag].phone.replace(/^(\d{2})(\d{5})(\d+)$/, '$1 $2 $3')]);
  for (const ch of S.chats) {
    const num = (await q(`SELECT id FROM wa_numbers WHERE user_id = $1`, [uid(ch.agent)])).rows[0];
    await q(`INSERT INTO chats (id, org_id, lead_id, wa_number_id, agent_id, ai_enabled, last_customer_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uid(ch.id), org.id, uid(ch.lead), num.id, uid(ch.agent), ch.ai, new Date(Date.now() - Math.min(...ch.messages.filter(m => m[0] === 'customer').map(m => m[2])) * 60000)]);
    for (const [sender, body, mins] of ch.messages) await q(`INSERT INTO chat_messages (chat_id, sender, body, created_at) VALUES ($1,$2,$3,$4)`, [uid(ch.id), sender, body, new Date(Date.now() - mins * 60000)]);
  }

  const bookedUnits = (await q(`SELECT b.id, b.unit_id, b.customer_id FROM bookings b WHERE b.org_id = $1`, [org.id])).rows;
  for (const [i, t] of S.tickets.entries()) {
    const b = t.unit ? bookedUnits.find(x => x.unit_id === uid(t.unit)) : bookedUnits[3 + i];
    const created = new Date(Date.now() - t.hours_ago * 3600e3);
    const tk = (await q(`INSERT INTO tickets (org_id, booking_id, unit_id, customer_id, category, title, description, priority, status, assigned_to, sla_due_at, resolved_at, rating, created_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [org.id, b.id, b.unit_id, b.customer_id, t.category, t.title, t.description, t.priority, t.status, uid(t.assigned),
        new Date(created.getTime() + (t.priority === 'urgent' ? 6 : 24) * 3600e3), ['resolved', 'closed'].includes(t.status) ? new Date(created.getTime() + 20 * 3600e3) : null, t.rating || null, created])).rows[0];
    for (const [who, body, h] of t.comments) await q(`INSERT INTO ticket_comments (ticket_id, author_id, body, created_at) VALUES ($1,$2,$3,$4)`, [tk.id, who ? uid(who) : null, body, new Date(Date.now() - h * 3600e3)]);
  }
  for (const s of S.shares) await q(`INSERT INTO share_links (org_id, created_by, project_id, unit_id, lead_id, views, last_viewed) VALUES ($1,$2,$3,$4,$5,$6, now() - interval '3 hours')`,
    [org.id, uid(s.by), uid(s.project), s.unit ? uid(s.unit) : null, s.lead ? uid(s.lead) : null, s.views]);

  await q('COMMIT');
  console.log('✓ Sample builder loaded:', S.org.name);
  console.log('  Admin      admin@sgdevelopers.in / nivaas123');
  console.log('  Sales      rohit@sgdevelopers.in / nivaas123');
  console.log('  Broker     rajesh@sharmarealty.in / nivaas123');
  console.log('  Maintenance ajay@sgdevelopers.in / nivaas123');
  console.log('  Customer   ramesh.gupta@gmail.com / home1234');
  console.log('  LeadSathi webhook secret:', org.bridge_secret);
} catch (e) {
  await q('ROLLBACK'); console.error(e); process.exitCode = 1;
} finally { c.release(); await pool.end(); }
