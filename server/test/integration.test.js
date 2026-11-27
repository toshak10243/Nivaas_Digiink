import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { assertDedicatedIntegrationDatabase } from './lib/integration-db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseName = assertDedicatedIntegrationDatabase(testDatabaseUrl);

let schema;
let scopedUrl;
let controlPool;
let fixturePool;
let serverProcess;
let serverOutput = '';
let baseUrl;
let fixtures;
let tokens;
let uploadDir;

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`API exited before becoming ready.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`API did not become ready: ${lastError?.message || 'timeout'}\n${serverOutput}`);
}

async function api(route, { token, method = 'GET', body, headers = {} } = {}) {
  const options = { method, headers: { ...headers } };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    if (body instanceof FormData) options.body = body;
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  const response = await fetch(`${baseUrl}${route}`, options);
  const data = await response.json().catch(() => null);
  return { response, data };
}

before(async () => {
  if (!testDatabaseUrl) return;
  const dbName = testDatabaseName;
  if (!dbName) throw new Error('TEST_DATABASE_URL must include a database name.');
  schema = `nivaas_it_${process.pid}_${randomBytes(4).toString('hex')}`;
  controlPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1 });
  await controlPool.query(`CREATE SCHEMA "${schema}"`);

  const scoped = new URL(testDatabaseUrl);
  scoped.searchParams.set('options', `-c search_path=${schema},public`);
  scopedUrl = scoped.toString();
  process.env.DATABASE_URL = scopedUrl;
  process.env.JWT_SECRET = 'integration-test-secret-with-32-characters';
  process.env.META_APP_SECRET = 'integration-meta-app-secret-with-at-least-32-chars';
  process.env.GEMINI_API_KEY = '';
  process.env.NODE_ENV = 'test';
  process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'nivaas-integration-'));

  const { ensureDatabaseSchema } = await import('../db/setup-db.js');
  await ensureDatabaseSchema(scopedUrl);
  const { runMigrations } = await import('../db/migrations.js');
  await runMigrations();
  fixturePool = new pg.Pool({ connectionString: scopedUrl, max: 4 });

  const org = (await fixturePool.query(`INSERT INTO orgs (name) VALUES ('Integration Fixtures') RETURNING id`)).rows[0];
  const passwordHash = await bcrypt.hash('IntegrationPass123', 4);
  const accounts = [
    ['admin', 'admin', 'Admin'], ['salesOne', 'sales', 'Sales One'], ['salesTwo', 'sales', 'Sales Two'],
    ['brokerOne', 'broker', 'Broker One'], ['brokerTwo', 'broker', 'Broker Two'], ['maintenance', 'maintenance', 'Maintenance'],
    ['customerOne', 'customer', 'Customer One'], ['customerTwo', 'customer', 'Customer Two'],
  ];
  const users = {};
  for (let i = 0; i < accounts.length; i += 1) {
    const [key, role, name] = accounts[i];
    const profile = role === 'sales'
      ? { incentive: { type: 'percent', value: 0.25 }, availability: 'available' }
      : role === 'broker' ? { commission: { type: 'percent', value: 2 } } : {};
    users[key] = (await fixturePool.query(
      `INSERT INTO users (org_id, role, name, email, password_hash, profile) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,role,name,email`,
      [org.id, role, name, `user${i}@integration.test`, passwordHash, JSON.stringify(profile)],
    )).rows[0];
  }

  const project = (await fixturePool.query(
    `INSERT INTO projects (org_id,name,city,rate_sqft,charges,payment_plan) VALUES ($1,'Test Residences','Jaipur',100,'{}','[{"milestone":"Booking","pct":100}]') RETURNING id`,
    [org.id],
  )).rows[0];
  const type = (await fixturePool.query(
    `INSERT INTO unit_types (project_id,name,bhk,carpet_sqft,builtup_sqft,super_sqft) VALUES ($1,'2 BHK',2,80,90,100) RETURNING id`,
    [project.id],
  )).rows[0];
  const units = {};
  for (const unitNo of ['T-101', 'T-102', 'T-103']) {
    units[unitNo] = (await fixturePool.query(
      `INSERT INTO units (project_id,unit_type_id,unit_no,floor) VALUES ($1,$2,$3,1) RETURNING id`,
      [project.id, type.id, unitNo],
    )).rows[0].id;
  }
  const leads = {};
  for (const [key, user, phone] of [
    ['salesOne', users.salesOne, '919910000001'], ['salesTwo', users.salesTwo, '919910000002'],
    ['brokerOne', users.brokerOne, '919910000003'], ['brokerTwo', users.brokerTwo, '919910000004'],
  ]) {
    leads[key] = (await fixturePool.query(
      `INSERT INTO leads (org_id,project_id,name,phone,assigned_to,broker_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [org.id, project.id, key, phone, user.id, user.role === 'broker' ? user.id : null],
    )).rows[0].id;
  }
  const share = (await fixturePool.query(
    `INSERT INTO share_links (org_id,created_by,project_id,unit_id) VALUES ($1,$2,$3,$4) RETURNING token`,
    [org.id, users.admin.id, project.id, units['T-102']],
  )).rows[0];
  fixtures = { org, users, project, units, leads, share };

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(here, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_URL: scopedUrl, UPLOAD_DIR: uploadDir, NODE_ENV: 'test', META_APP_SECRET: process.env.META_APP_SECRET, GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  await waitForServer();

  tokens = {};
  for (const [key, user] of Object.entries(users)) {
    if (!['admin', 'salesOne', 'salesTwo', 'brokerOne', 'brokerTwo', 'customerOne', 'customerTwo', 'maintenance'].includes(key)) continue;
    const { response, data } = await api('/auth/login', { method: 'POST', body: { email: user.email, password: 'IntegrationPass123' } });
    assert.equal(response.status, 200, `Login failed for ${key}: ${JSON.stringify(data)}`);
    tokens[key] = data.token;
  }
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    const exited = new Promise(resolve => serverProcess.once('exit', resolve));
    serverProcess.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
    if (serverProcess.exitCode === null) {
      serverProcess.kill('SIGKILL');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1_000))]);
    }
  }
  await fixturePool?.end();
  if (schema && controlPool) await controlPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await controlPool?.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

test('API regression flows: authorization, privacy, booking, payments, tickets, sharing, and integration failures', async t => {
  const unauthenticated = await api('/api/me');
  assert.equal(unauthenticated.response.status, 401);

  // Access tokens must not be accepted by the refresh endpoint, and malformed
  // writes must fail before changing their corresponding records.
  const accessTokenRefresh = await api('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.admin } });
  assert.equal(accessTokenRefresh.response.status, 401);
  const login = await api('/auth/login', { method: 'POST', body: { email: fixtures.users.admin.email, password: 'IntegrationPass123' } });
  assert.equal(login.response.status, 200);
  const refresh = await api('/auth/refresh', { method: 'POST', body: { refreshToken: login.data.refreshToken } });
  assert.equal(refresh.response.status, 200);
  const refreshAsApiCredential = await api('/api/me', { token: login.data.refreshToken });
  assert.equal(refreshAsApiCredential.response.status, 401);

  const leadCountBeforeInvalid = Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count);
  const invalidLead = await api('/api/leads', {
    token: tokens.admin, method: 'POST',
    body: { name: 'Invalid Phone Lead', phone: 'not-a-phone', email: 'bad-email' },
  });
  assert.equal(invalidLead.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadCountBeforeInvalid);

  const invalidVisit = await api('/api/visits', {
    token: tokens.admin, method: 'POST',
    body: { name: 'Invalid Walk-in', phone: '919940000001', scheduled_at: '2020-02-30T10:00:00Z' },
  });
  assert.equal(invalidVisit.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadCountBeforeInvalid,
    'a rejected walk-in visit must not leave a partial lead behind');

  const orgBeforeInvalidSettings = await fixturePool.query('SELECT name, settings FROM orgs WHERE id = $1', [fixtures.org.id]);
  const invalidSettings = await api('/api/org', {
    token: tokens.admin, method: 'PUT', body: { name: 'Should Not Persist', settings: { unknown_option: true } },
  });
  assert.equal(invalidSettings.response.status, 400);
  const orgAfterInvalidSettings = await fixturePool.query('SELECT name, settings FROM orgs WHERE id = $1', [fixtures.org.id]);
  assert.deepEqual(orgAfterInvalidSettings.rows[0], orgBeforeInvalidSettings.rows[0]);

  const badUnitType = await api(`/api/projects/${fixtures.project.id}/unit-types`, {
    token: tokens.admin, method: 'POST',
    body: { name: 'Invalid Type', bhk: 2.5, carpet_sqft: 100, builtup_sqft: 90, super_sqft: 120 },
  });
  assert.equal(badUnitType.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM unit_types WHERE project_id = $1', [fixtures.project.id])).rows[0].count), 1);

  const badAreaType = await api(`/api/projects/${fixtures.project.id}/unit-types`, {
    token: tokens.admin, method: 'POST',
    body: { name: 'Impossible Areas', bhk: 2, carpet_sqft: 100, builtup_sqft: 90, super_sqft: 120 },
  });
  assert.equal(badAreaType.response.status, 400);
  const validUnitType = await api(`/api/projects/${fixtures.project.id}/unit-types`, {
    token: tokens.admin, method: 'POST',
    body: { name: '3 BHK', bhk: 3, carpet_sqft: 120, builtup_sqft: 140, super_sqft: 160, bathrooms: 2, balconies: 1 },
  });
  assert.equal(validUnitType.response.status, 200);
  assert.equal(validUnitType.data.bhk, 3);
  const unchangedProject = await fixturePool.query('SELECT name, map_url, cover_url FROM projects WHERE id = $1', [fixtures.project.id]);
  const unsafeProjectUrl = await api(`/api/projects/${fixtures.project.id}`, {
    token: tokens.admin, method: 'PUT', body: { name: 'Must Not Persist', map_url: 'javascript:alert(1)' },
  });
  assert.equal(unsafeProjectUrl.response.status, 400);
  assert.deepEqual((await fixturePool.query('SELECT name, map_url, cover_url FROM projects WHERE id = $1', [fixtures.project.id])).rows[0], unchangedProject.rows[0]);

  const unsupportedTower = await api(`/api/projects/${fixtures.project.id}/towers`, {
    token: tokens.admin, method: 'POST', body: { name: 'Invalid Tower', floors: 2, per_floor: 2, surprise: true },
  });
  assert.equal(unsupportedTower.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM towers WHERE project_id = $1', [fixtures.project.id])).rows[0].count), 0);

  const badUnitPriceBefore = await fixturePool.query('SELECT plc_pct, price_override FROM units WHERE id = $1', [fixtures.units['T-102']]);
  const invalidInventoryUpdate = await api(`/api/units/${fixtures.units['T-102']}`, {
    token: tokens.admin, method: 'PATCH', body: { plc_pct: 101 },
  });
  assert.equal(invalidInventoryUpdate.response.status, 400);
  assert.deepEqual((await fixturePool.query('SELECT plc_pct, price_override FROM units WHERE id = $1', [fixtures.units['T-102']])).rows[0], badUnitPriceBefore.rows[0]);
  const holdUnit = await api(`/api/units/${fixtures.units['T-102']}`, { token: tokens.salesOne, method: 'PATCH', body: { action: 'hold' } });
  assert.equal(holdUnit.response.status, 200);
  assert.equal(holdUnit.data.status, 'hold');
  const releaseUnit = await api(`/api/units/${fixtures.units['T-102']}`, { token: tokens.salesOne, method: 'PATCH', body: { action: 'release' } });
  assert.equal(releaseUnit.response.status, 200);
  assert.equal(releaseUnit.data.status, 'available');

  // Expiring holds are safely reclaimable, while concurrent agents cannot both hold the same unit.
  const holdAttempts = await Promise.all([
    api(`/api/units/${fixtures.units['T-102']}`, { token: tokens.salesOne, method: 'PATCH', body: { action: 'hold' } }),
    api(`/api/units/${fixtures.units['T-102']}`, { token: tokens.salesTwo, method: 'PATCH', body: { action: 'hold' } }),
  ]);
  assert.deepEqual(holdAttempts.map(x => x.response.status).sort(), [200, 409]);
  const winningAgent = holdAttempts[0].response.status === 200 ? 'salesOne' : 'salesTwo';
  await fixturePool.query(`UPDATE units SET hold_until = now() - interval '1 second' WHERE id = $1`, [fixtures.units['T-102']]);
  const reclaim = await api(`/api/units/${fixtures.units['T-102']}`, {
    token: tokens[winningAgent === 'salesOne' ? 'salesTwo' : 'salesOne'], method: 'PATCH', body: { action: 'hold' },
  });
  assert.equal(reclaim.response.status, 200, JSON.stringify(reclaim.data));
  assert.notEqual(reclaim.data.hold_by, fixtures.users[winningAgent].id);
  const ownerAfterReclaim = reclaim.data.hold_by === fixtures.users.salesOne.id ? 'salesOne' : 'salesTwo';
  assert.equal((await api(`/api/units/${fixtures.units['T-102']}`, {
    token: tokens[ownerAfterReclaim === 'salesOne' ? 'salesTwo' : 'salesOne'], method: 'PATCH', body: { action: 'release' },
  })).response.status, 409, 'another agent must not release the active hold');
  assert.equal((await api(`/api/units/${fixtures.units['T-102']}`, {
    token: tokens[ownerAfterReclaim], method: 'PATCH', body: { action: 'extend' },
  })).response.status, 200, 'the owner can extend their active hold');
  assert.equal((await api(`/api/units/${fixtures.units['T-102']}`, {
    token: tokens[ownerAfterReclaim], method: 'PATCH', body: { action: 'release' },
  })).response.status, 200);

  // Discounts cannot bypass approval. Admin decisions are auditable and quotes are single-use.
  const directDiscount = await api('/api/bookings', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-102'], customer_name: 'Customer One', customer_email: fixtures.users.customerOne.email, discount: 1 },
  });
  assert.equal(directDiscount.response.status, 409);
  assert.equal((await fixturePool.query('SELECT status FROM units WHERE id = $1', [fixtures.units['T-102']])).rows[0].status, 'available');

  const rejectedOffer = await api('/api/quotes', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-102'], lead_id: fixtures.leads.salesOne, discount: 500, note: 'Buyer requested a price review' },
  });
  assert.equal(rejectedOffer.response.status, 201, JSON.stringify(rejectedOffer.data));
  assert.equal(rejectedOffer.data.status, 'pending');
  assert.equal((await api('/api/quotes?status=pending', { token: tokens.salesOne })).data.some(x => x.id === rejectedOffer.data.id), true);
  assert.equal((await api(`/api/quotes/${rejectedOffer.data.id}`, {
    token: tokens.salesTwo, method: 'PATCH', body: { status: 'approved' },
  })).response.status, 403, 'sales users cannot approve discounts');
  const rejectDecision = await api(`/api/quotes/${rejectedOffer.data.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'rejected', decision_note: 'Outside approved range' },
  });
  assert.equal(rejectDecision.response.status, 200);
  assert.equal(rejectDecision.data.status, 'rejected');
  assert.equal(rejectDecision.data.decision_note, 'Outside approved range');

  const expiredOffer = await api('/api/quotes', {
    token: tokens.salesOne, method: 'POST', body: { unit_id: fixtures.units['T-102'], discount: 600 },
  });
  assert.equal(expiredOffer.response.status, 201);
  await fixturePool.query(`UPDATE price_quotes SET expires_at = now() - interval '1 second' WHERE id = $1`, [expiredOffer.data.id]);
  const approveExpired = await api(`/api/quotes/${expiredOffer.data.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'approved' },
  });
  assert.equal(approveExpired.response.status, 409);
  assert.equal((await fixturePool.query('SELECT status FROM price_quotes WHERE id = $1', [expiredOffer.data.id])).rows[0].status, 'expired');

  const approvedOffer = await api('/api/quotes', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-103'], discount: 1000, note: 'Approved test quote' },
  });
  assert.equal(approvedOffer.response.status, 201);
  assert.equal(approvedOffer.data.status, 'pending');
  const approvedDecision = await api(`/api/quotes/${approvedOffer.data.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'approved' },
  });
  assert.equal(approvedDecision.response.status, 200, JSON.stringify(approvedDecision.data));
  assert.equal(approvedDecision.data.status, 'approved');
  const approvedQuotes = await api(`/api/quotes?unit_id=${fixtures.units['T-103']}&status=approved`, { token: tokens.salesOne });
  assert.equal(approvedQuotes.data.some(x => x.id === approvedOffer.data.id), true);
  const wrongDiscount = await api('/api/bookings', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-103'], customer_name: 'Customer One', customer_email: fixtures.users.customerOne.email, discount: 999, price_quote_id: approvedOffer.data.id },
  });
  assert.equal(wrongDiscount.response.status, 409);
  assert.equal((await fixturePool.query('SELECT status FROM units WHERE id = $1', [fixtures.units['T-103']])).rows[0].status, 'available');
  const offerBooking = await api('/api/bookings', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-103'], customer_name: 'Customer One', customer_email: fixtures.users.customerOne.email, discount: 1000, price_quote_id: approvedOffer.data.id },
  });
  assert.equal(offerBooking.response.status, 200, JSON.stringify(offerBooking.data));
  assert.equal(offerBooking.data.price_quote_id, approvedOffer.data.id);
  assert.equal(Number(offerBooking.data.discount), 1000);
  assert.equal((await fixturePool.query('SELECT status FROM price_quotes WHERE id = $1', [approvedOffer.data.id])).rows[0].status, 'converted');
  const reusedQuoteBooking = await api('/api/bookings', {
    token: tokens.salesOne, method: 'POST',
    body: { unit_id: fixtures.units['T-103'], customer_name: 'Customer One', customer_email: fixtures.users.customerOne.email, discount: 1000, price_quote_id: approvedOffer.data.id },
  });
  assert.equal(reusedQuoteBooking.response.status, 409);

  const duplicateMember = await api('/api/team', {
    token: tokens.admin, method: 'POST', body: { role: 'sales', name: 'Duplicate Sales', email: fixtures.users.salesOne.email, password: 'AnotherPass123' },
  });
  assert.equal(duplicateMember.response.status, 409);
  const beforeDuplicateUpdate = await fixturePool.query('SELECT email FROM users WHERE id = $1', [fixtures.users.salesTwo.id]);
  const duplicateEmailUpdate = await api(`/api/team/${fixtures.users.salesTwo.id}`, {
    token: tokens.admin, method: 'PATCH', body: { email: fixtures.users.salesOne.email },
  });
  assert.equal(duplicateEmailUpdate.response.status, 409);
  assert.deepEqual((await fixturePool.query('SELECT email FROM users WHERE id = $1', [fixtures.users.salesTwo.id])).rows[0], beforeDuplicateUpdate.rows[0]);

  const forbiddenProjects = await api('/api/projects', { token: tokens.customerOne });
  assert.equal(forbiddenProjects.response.status, 403);
  assert.equal((await api('/api/projects', { token: tokens.admin })).response.status, 200);

  const salesLeads = await api('/api/leads', { token: tokens.salesOne });
  assert.deepEqual(salesLeads.data.map(x => x.id), [fixtures.leads.salesOne]);
  const brokerLeads = await api('/api/leads', { token: tokens.brokerOne });
  assert.deepEqual(brokerLeads.data.map(x => x.id), [fixtures.leads.brokerOne]);
  assert.equal(salesLeads.data[0].priority_level, 'low');
  assert.equal(salesLeads.data[0].recommended_action, 'Call the customer and confirm their requirements');
  assert.equal(brokerLeads.data[0].phone, '••••••0003');
  assert.equal((await api(`/api/leads/${fixtures.leads.brokerOne}`, { token: tokens.brokerOne })).data.phone, '••••••0003');

  await fixturePool.query(`UPDATE leads SET email = 'buyer-private@example.test' WHERE id = $1`, [fixtures.leads.brokerOne]);
  const privateBrokerLead = await api(`/api/leads/${fixtures.leads.brokerOne}`, { token: tokens.brokerOne });
  assert.equal(privateBrokerLead.data.email, null, 'broker lead details must not return buyer email');
  assert.equal((await api(`/api/leads/${fixtures.leads.brokerOne}`, { token: tokens.admin })).data.email, 'buyer-private@example.test', 'admin retains buyer contact details');

  const smartLead = await api('/api/leads', {
    token: tokens.admin, method: 'POST',
    body: {
      name: 'Smart Follow-up Check', phone: '919910000095', project_id: fixtures.project.id,
      stage: 'qualified', temperature: 'hot', budget: '₹80–90 L', config_pref: '3 BHK',
      followup_at: new Date(Date.now() + 2 * 3600e3).toISOString(), auto_assign: true,
    },
  });
  assert.equal(smartLead.response.status, 200);
  assert.ok([fixtures.users.salesOne.id, fixtures.users.salesTwo.id].includes(smartLead.data.assigned_to), 'auto assignment must choose an active sales agent');
  const prioritizedLead = (await api('/api/leads', { token: tokens.admin })).data.find(lead => lead.id === smartLead.data.id);
  assert.equal(prioritizedLead.priority_level, 'high');
  assert.ok(prioritizedLead.priority_reasons.includes('Budget captured'));
  assert.ok(prioritizedLead.priority_reasons.includes('Flat preference captured'));
  assert.equal(prioritizedLead.recommended_action, 'Send a shortlist that fits the budget and flat preference');
  const leadDetails = await api(`/api/leads/${smartLead.data.id}`, { token: tokens.admin });
  assert.equal(leadDetails.data.priority_score, prioritizedLead.priority_score);
  assert.equal(leadDetails.data.recommended_action, prioritizedLead.recommended_action);

  const leadsBeforeInvalidInput = Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count);
  for (const invalidLead of [
    { name: 'Malformed Phone', phone: 'Call me at 919910000099' },
    { name: 'Malformed Email', phone: '919910000098', email: 'not-an-email' },
    { name: 'Unknown Source', phone: '919910000097', source: 'untrusted_source' },
    { name: 'Unknown Field', phone: '919910000096', make_admin: true },
  ]) {
    const rejected = await api('/api/leads', { token: tokens.admin, method: 'POST', body: invalidLead });
    assert.equal(rejected.response.status, 400);
  }
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadsBeforeInvalidInput);
  const ignoredLeadField = await api(`/api/leads/${fixtures.leads.salesOne}`, {
    token: tokens.salesOne, method: 'PATCH', body: { make_admin: true },
  });
  assert.equal(ignoredLeadField.response.status, 400);
  const brokerCreatedLead = await api('/api/leads', {
    token: tokens.brokerOne, method: 'POST', body: { name: 'Broker Privacy Check', phone: '919910000099', email: 'new-buyer@example.test' },
  });
  assert.equal(brokerCreatedLead.response.status, 200);
  assert.equal(brokerCreatedLead.data.phone, '••••••0099');
  assert.equal(brokerCreatedLead.data.email, null);
  const brokerStoredLead = (await fixturePool.query('SELECT phone, email FROM leads WHERE id = $1', [brokerCreatedLead.data.id])).rows[0];
  assert.equal(brokerStoredLead.phone, '919910000099');
  assert.equal(brokerStoredLead.email, 'new-buyer@example.test', 'privacy filtering must not discard stored contact details');
  const brokerEditedLead = await api(`/api/leads/${brokerCreatedLead.data.id}`, {
    token: tokens.brokerOne, method: 'PATCH', body: { email: 'updated-buyer@example.test' },
  });
  assert.equal(brokerEditedLead.data.email, null, 'broker lead update responses must also suppress buyer email');

  const brokerVisit = (await fixturePool.query(
    `INSERT INTO site_visits (org_id,lead_id,project_id,agent_id,scheduled_at) VALUES ($1,$2,$3,$4,now() + interval '1 day') RETURNING id`,
    [fixtures.org.id, fixtures.leads.brokerOne, fixtures.project.id, fixtures.users.brokerOne.id],
  )).rows[0];
  const pastVisit = await api('/api/visits', {
    token: tokens.admin, method: 'POST', body: { lead_id: fixtures.leads.brokerOne, scheduled_at: '2020-01-02T10:00:00Z' },
  });
  assert.equal(pastVisit.response.status, 400);
  const unauthorizedVisitUpdate = await api(`/api/visits/${brokerVisit.id}`, {
    token: tokens.brokerTwo, method: 'PATCH', body: { status: 'confirmed' },
  });
  assert.equal(unauthorizedVisitUpdate.response.status, 404);
  const pastReschedule = await api(`/api/visits/${brokerVisit.id}`, {
    token: tokens.brokerOne, method: 'PATCH', body: { status: 'rescheduled', reschedule_at: '2020-01-02T10:00:00Z' },
  });
  assert.equal(pastReschedule.response.status, 400);
  const futureVisitTime = new Date(Date.now() + 2 * 86400000).toISOString();
  const rescheduledVisit = await api(`/api/visits/${brokerVisit.id}`, {
    token: tokens.brokerOne, method: 'PATCH', body: { status: 'rescheduled', reschedule_at: futureVisitTime },
  });
  assert.equal(rescheduledVisit.response.status, 200);
  assert.equal(rescheduledVisit.data.status, 'scheduled');
  assert.equal(new Date(rescheduledVisit.data.scheduled_at).toISOString(), futureVisitTime);
  const confirmedVisit = await api(`/api/visits/${brokerVisit.id}`, {
    token: tokens.brokerOne, method: 'PATCH', body: { status: 'confirmed' },
  });
  assert.equal(confirmedVisit.response.status, 200);
  const reopenedVisit = await api(`/api/visits/${brokerVisit.id}`, {
    token: tokens.brokerOne, method: 'PATCH', body: { status: 'scheduled' },
  });
  assert.equal(reopenedVisit.response.status, 409);
  const brokerVisits = await api('/api/visits', { token: tokens.brokerOne });
  assert.equal(brokerVisits.data.find(v => v.id === brokerVisit.id).phone, '••••••0003');
  const brokerDashboard = await api('/api/dashboard', { token: tokens.brokerOne });
  assert.equal(brokerDashboard.data.visits.find(v => v.id === brokerVisit.id).phone, '••••••0003');

  const workflowLead = (await fixturePool.query(
    `INSERT INTO leads (org_id,project_id,name,phone,source,stage,assigned_to) VALUES ($1,$2,'Visit Workflow Buyer','919911000010','whatsapp','contacted',$3) RETURNING id`,
    [fixtures.org.id, fixtures.project.id, fixtures.users.salesOne.id],
  )).rows[0].id;
  const pendingVisit = (await fixturePool.query(
    `INSERT INTO site_visits (org_id,lead_id,project_id,agent_id,status,source,scheduled_by,confirmation_note)
     VALUES ($1,$2,$3,$4,'to_confirm','ai',$4,'Customer asked to visit') RETURNING id`,
    [fixtures.org.id, workflowLead, fixtures.project.id, fixtures.users.salesOne.id],
  )).rows[0];
  const pendingVisits = await api('/api/visits?status=to_confirm', { token: tokens.admin });
  assert.equal(pendingVisits.response.status, 200);
  assert.equal(pendingVisits.data.find(v => v.id === pendingVisit.id)?.status, 'to_confirm', 'undated requests should be visible in the To confirm queue');
  const fixedVisitTime = new Date(Date.now() + 4 * 86400000).toISOString();
  const fixedVisit = await api(`/api/visits/${pendingVisit.id}`, {
    token: tokens.salesOne, method: 'PATCH', body: { status: 'rescheduled', reschedule_at: fixedVisitTime },
  });
  assert.equal(fixedVisit.response.status, 200, JSON.stringify(fixedVisit.data));
  assert.equal(fixedVisit.data.status, 'scheduled');
  assert.equal(new Date(fixedVisit.data.scheduled_at).toISOString(), fixedVisitTime);
  assert.equal((await fixturePool.query('SELECT stage FROM leads WHERE id = $1', [workflowLead])).rows[0].stage, 'visit_scheduled');
  const repeatedSlotTime = new Date(Date.now() + 5 * 86400000).toISOString();
  const once = await api(`/api/leads/${workflowLead}/visits`, { token: tokens.salesOne, method: 'POST', body: { scheduled_at: repeatedSlotTime } });
  const twice = await api(`/api/leads/${workflowLead}/visits`, { token: tokens.salesOne, method: 'POST', body: { scheduled_at: repeatedSlotTime } });
  assert.equal(once.response.status, 200);
  assert.equal(twice.response.status, 200);
  assert.equal(once.data.id, twice.data.id, 'repeated requests for one slot should reuse the same visit record');
  assert.equal(Number((await fixturePool.query(`SELECT count(*) FROM site_visits WHERE lead_id = $1 AND scheduled_at = $2 AND status IN ('scheduled','confirmed')`, [workflowLead, repeatedSlotTime])).rows[0].count), 1);

  await fixturePool.query('UPDATE users SET phone = $2 WHERE id = $1', [fixtures.users.customerOne.id, '919920000009']);
  const brokerBooking = (await fixturePool.query(
    `INSERT INTO bookings (org_id,unit_id,customer_id,sold_by,broker_id,deal_value,status) VALUES ($1,$2,$3,$4,$5,100000,'cancelled') RETURNING id`,
    [fixtures.org.id, fixtures.units['T-103'], fixtures.users.customerOne.id, fixtures.users.salesOne.id, fixtures.users.brokerOne.id],
  )).rows[0];
  const brokerBookings = await api('/api/bookings', { token: tokens.brokerOne });
  assert.equal(brokerBookings.data.find(b => b.id === brokerBooking.id).customer_phone, '••••••0009');
  const brokerBookingDetail = await api(`/api/bookings/${brokerBooking.id}`, { token: tokens.brokerOne });
  assert.equal(brokerBookingDetail.data.customer_phone, '••••••0009');
  assert.equal(brokerBookingDetail.data.customer_email, null, 'broker booking details must not return buyer email');

  await fixturePool.query(
    `INSERT INTO commissions (org_id, booking_id, user_id, kind, basis, amount, status, paid_on) VALUES
      ($1,$2,$3,'broker_commission','2% of deal',2000,'paid',current_date),
      ($1,$2,$4,'broker_commission','2% of deal',2000,'pending',NULL)`,
    [fixtures.org.id, brokerBooking.id, fixtures.users.brokerOne.id, fixtures.users.brokerTwo.id],
  );
  const ownCommission = await api('/api/commissions', { token: tokens.brokerOne });
  assert.equal(ownCommission.response.status, 200);
  assert.equal(ownCommission.data.length, 1);
  assert.equal(ownCommission.data[0].user_id, fixtures.users.brokerOne.id, 'commission ledger must be limited to the signed-in broker');
  assert.equal(ownCommission.data[0].status, 'paid');
  const otherBrokerCommission = await api('/api/commissions', { token: tokens.brokerTwo });
  assert.equal(otherBrokerCommission.data.length, 1);
  assert.equal(otherBrokerCommission.data[0].user_id, fixtures.users.brokerTwo.id);

  const campaignTypeId = (await fixturePool.query(`SELECT id FROM unit_types WHERE project_id = $1 ORDER BY bhk LIMIT 1`, [fixtures.project.id])).rows[0].id;
  const campaignUnit = (await fixturePool.query(
    `INSERT INTO units (project_id,unit_type_id,unit_no,floor) VALUES ($1,$2,'T-104',1) RETURNING id`,
    [fixtures.project.id, campaignTypeId],
  )).rows[0].id;
  const campaignLead = (await fixturePool.query(
    `INSERT INTO leads (org_id,project_id,name,phone,email,source,source_ref,stage,assigned_to,created_at,updated_at)
     VALUES ($1,$2,'Campaign Buyer','919933000001','campaign-buyer@example.test','share_link',$3,'qualified',$4,now(),now()) RETURNING id`,
    [fixtures.org.id, fixtures.project.id, fixtures.share.token, fixtures.users.salesOne.id],
  )).rows[0].id;
  await fixturePool.query(
    `INSERT INTO site_visits (org_id,lead_id,project_id,agent_id,scheduled_at,status)
     VALUES ($1,$2,$3,$4,now() - interval '1 day','done')`,
    [fixtures.org.id, campaignLead, fixtures.project.id, fixtures.users.salesOne.id],
  );
  const campaignBooking = await api('/api/bookings', {
    token: tokens.admin, method: 'POST', body: {
      unit_id: campaignUnit, customer_name: 'Campaign Buyer', customer_email: 'campaign-buyer@example.test',
      customer_phone: '919933000001', booking_amount: 0,
    },
  });
  assert.equal(campaignBooking.response.status, 200, JSON.stringify(campaignBooking.data));
  assert.equal(campaignBooking.data.lead_id, campaignLead, 'booking should inherit a unique source lead when no lead is selected');
  await fixturePool.query(
    `INSERT INTO leads (org_id,project_id,name,phone,source,stage,created_at,updated_at)
     VALUES ($1,$2,'Stalled Lead','919933000002','leadsathi','contacted',now() - interval '20 days',now() - interval '8 days')`,
    [fixtures.org.id, fixtures.project.id],
  );
  const conversionReport = await api('/api/reports/conversions?days=90', { token: tokens.admin });
  assert.equal(conversionReport.response.status, 200, JSON.stringify(conversionReport.data));
  const campaignRow = conversionReport.data.sources.find(row => row.source === 'Shared kit' && row.project === 'Test Residences');
  assert.ok(campaignRow, 'source report should include the originating shared campaign');
  assert.equal(campaignRow.visited, 1);
  assert.equal(campaignRow.booked, 1);
  assert.equal(conversionReport.data.projects.find(row => row.project === 'Test Residences').booked, 1);
  assert.ok(conversionReport.data.stuck.some(row => row.stage === 'contacted' && row.leads >= 1), 'stuck stage report should include old active leads');
  const analyticsReport = await api(`/api/reports/analytics?period=year&year=${new Date().getFullYear()}&project=${fixtures.project.id}&source=share_link&campaign=${fixtures.share.token}`, { token: tokens.admin });
  assert.equal(analyticsReport.response.status, 200, JSON.stringify(analyticsReport.data));
  assert.equal(Number(analyticsReport.data.totals.leads), 1, 'project, source, and campaign filters should count the matching lead');
  assert.equal(Number(analyticsReport.data.totals.visits_completed), 1);
  assert.equal(Number(analyticsReport.data.totals.sales_units), 1);
  assert.equal(Number(analyticsReport.data.projects[0].bookings), 1);
  const combinedFiltersReport = await api(`/api/reports/analytics?period=year&year=${new Date().getFullYear()}&project=${fixtures.project.id}&salesperson=${fixtures.users.salesOne.id}&broker=${fixtures.users.brokerOne.id}&source=share_link&campaign=${fixtures.share.token}`, { token: tokens.admin });
  assert.equal(combinedFiltersReport.response.status, 200, JSON.stringify(combinedFiltersReport.data));
  assert.equal((await api('/api/reports/analytics?period=custom&from=2026-02-30&to=2026-03-01', { token: tokens.admin })).response.status, 400);
  const dashboardAnalytics = await api('/api/dashboard/analytics?months=6', { token: tokens.admin });
  assert.equal(dashboardAnalytics.response.status, 200, JSON.stringify(dashboardAnalytics.data));
  assert.equal(dashboardAnalytics.data.rows.length, 6);
  const dashboardAnalyticsYear = await api('/api/dashboard/analytics?months=12', { token: tokens.admin });
  assert.equal(dashboardAnalyticsYear.data.rows.length, 12);
  assert.equal((await api('/api/reports/conversions?days=45', { token: tokens.admin })).response.status, 400);
  assert.equal((await api('/api/reports/conversions', { token: tokens.brokerOne })).response.status, 403);

  const fallbackDraft = await api(`/api/leads/${fixtures.leads.salesOne}/ai-objection`, {
    token: tokens.salesOne, method: 'POST', body: { objection: 'What is the confirmed possession date?' },
  });
  assert.equal(fallbackDraft.response.status, 200);
  assert.equal(fallbackDraft.data.isDraft, true);
  assert.match(fallbackDraft.data.reviewNotice, /Confirm factual/);

  const bookingBody = unitId => ({ unit_id: unitId, customer_name: 'Customer One', customer_email: fixtures.users.customerOne.email, customer_phone: '919920000001', booking_amount: 0 });
  const invalidBooking = await api('/api/bookings', {
    token: tokens.admin, method: 'POST',
    body: { ...bookingBody(fixtures.units['T-102']), customer_email: 'invalid-email', booking_amount: 0 },
  });
  assert.equal(invalidBooking.response.status, 400);
  assert.equal((await fixturePool.query('SELECT status FROM units WHERE id = $1', [fixtures.units['T-102']])).rows[0].status, 'available');
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM bookings WHERE unit_id = $1', [fixtures.units['T-102']])).rows[0].count), 0);

  const bookingAttempts = await Promise.all([
    api('/api/bookings', { token: tokens.salesOne, method: 'POST', body: bookingBody(fixtures.units['T-101']) }),
    api('/api/bookings', { token: tokens.salesTwo, method: 'POST', body: bookingBody(fixtures.units['T-101']) }),
  ]);
  const accepted = bookingAttempts.filter(x => x.response.status === 200);
  const conflicts = bookingAttempts.filter(x => x.response.status === 409);
  assert.equal(accepted.length, 1, 'Exactly one concurrent booking should succeed');
  assert.equal(conflicts.length, 1, 'The competing booking should receive a conflict');
  const booking = accepted[0].data;

  // Buyer portal: account-scoped booking data, visit actions, construction progress, and private documents.
  await fixturePool.query('UPDATE bookings SET lead_id = $2 WHERE id = $1', [booking.id, fixtures.leads.salesOne]);
  const portalVisitTime = new Date(Date.now() + 3 * 86400000).toISOString();
  const portalVisit = (await fixturePool.query(
    `INSERT INTO site_visits (org_id,lead_id,project_id,agent_id,scheduled_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [fixtures.org.id, fixtures.leads.salesOne, fixtures.project.id, fixtures.users.salesOne.id, portalVisitTime],
  )).rows[0];
  await fixturePool.query(
    `INSERT INTO project_updates (project_id,title,body,stage_name,progress_pct,media_urls) VALUES ($1,'Buyer portal update','Foundation work is complete.','Foundation',25,'[]')`,
    [fixtures.project.id],
  );
  await fixturePool.query(
    `INSERT INTO payments (booking_id,amount,mode,milestone) VALUES ($1,100,'NEFT','Booking amount')`,
    [booking.id],
  );

  const forbiddenBookingPortal = await api('/api/portal', { token: tokens.customerTwo });
  assert.equal(forbiddenBookingPortal.response.status, 200);
  assert.equal(forbiddenBookingPortal.data.bookings.some(row => row.id === booking.id), false);
  const customerPortal = await api('/api/portal', { token: tokens.customerOne });
  assert.equal(customerPortal.response.status, 200, JSON.stringify(customerPortal.data));
  const portalBooking = customerPortal.data.bookings.find(row => row.id === booking.id);
  assert.ok(portalBooking, 'buyer should see their booking');
  assert.equal(portalBooking.payments.length, 1);
  assert.equal(portalBooking.updates.some(update => update.title === 'Buyer portal update'), true);
  assert.equal(portalBooking.visits.some(visit => visit.id === portalVisit.id), true);
  assert.deepEqual(portalBooking.schedule.map(item => item.milestone), ['Booking']);

  const unauthorizedVisitAction = await api(`/api/portal/visits/${portalVisit.id}`, {
    token: tokens.customerTwo, method: 'PATCH', body: { action: 'confirm' },
  });
  assert.equal(unauthorizedVisitAction.response.status, 404);
  const invalidPortalReschedule = await api(`/api/portal/visits/${portalVisit.id}`, {
    token: tokens.customerOne, method: 'PATCH', body: { action: 'reschedule', scheduled_at: '2020-01-01T10:00:00Z' },
  });
  assert.equal(invalidPortalReschedule.response.status, 400);
  const confirmedPortalVisit = await api(`/api/portal/visits/${portalVisit.id}`, {
    token: tokens.customerOne, method: 'PATCH', body: { action: 'confirm' },
  });
  assert.equal(confirmedPortalVisit.response.status, 200, JSON.stringify(confirmedPortalVisit.data));
  assert.equal(confirmedPortalVisit.data.status, 'confirmed');
  const newPortalVisitTime = new Date(Date.now() + 5 * 86400000).toISOString();
  const rescheduledPortalVisit = await api(`/api/portal/visits/${portalVisit.id}`, {
    token: tokens.customerOne, method: 'PATCH',
    body: { action: 'reschedule', scheduled_at: newPortalVisitTime, reason: 'Travel conflict' },
  });
  assert.equal(rescheduledPortalVisit.response.status, 200, JSON.stringify(rescheduledPortalVisit.data));
  assert.equal(rescheduledPortalVisit.data.status, 'scheduled');
  assert.equal(new Date(rescheduledPortalVisit.data.scheduled_at).toISOString(), newPortalVisitTime);
  const persistedPortalVisit = await fixturePool.query('SELECT status, scheduled_at, feedback FROM site_visits WHERE id = $1', [portalVisit.id]);
  assert.equal(persistedPortalVisit.rows[0].status, 'scheduled');
  assert.equal(new Date(persistedPortalVisit.rows[0].scheduled_at).toISOString(), newPortalVisitTime);
  assert.match(persistedPortalVisit.rows[0].feedback, /Buyer requested reschedule/);

  const buyerDocumentForm = new FormData();
  buyerDocumentForm.append('category', 'agreement');
  buyerDocumentForm.append('files', new Blob(['%PDF-1.4\nBuyer agreement test'], { type: 'application/pdf' }), 'agreement.pdf');
  const uploadedBuyerDocument = await api(`/api/bookings/${booking.id}/documents`, {
    token: tokens.admin, method: 'POST', body: buyerDocumentForm,
  });
  assert.equal(uploadedBuyerDocument.response.status, 201, JSON.stringify(uploadedBuyerDocument.data));
  assert.equal(uploadedBuyerDocument.data[0].category, 'agreement');
  const portalWithDocument = await api('/api/portal', { token: tokens.customerOne });
  const buyerDocument = portalWithDocument.data.bookings.find(row => row.id === booking.id).documents[0];
  assert.equal(buyerDocument.title, 'agreement.pdf');
  assert.match(buyerDocument.url, /^\/private-files\/booking-documents\//);
  assert.equal((await fetch(`${baseUrl}${buyerDocument.url}`)).status, 200, 'buyer can open the private document link');
  assert.equal((await api('/api/portal', { token: tokens.customerTwo })).data.bookings.some(row => row.id === booking.id), false,
    'another buyer must not receive this booking or its documents');

  const skippedBookingStatus = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'possession' },
  });
  assert.equal(skippedBookingStatus.response.status, 409);
  const emptyBookingStatus = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: '' },
  });
  assert.equal(emptyBookingStatus.response.status, 400);
  const bookingBeforeInvalidChecklist = await fixturePool.query('SELECT status, registry_checklist FROM bookings WHERE id = $1', [booking.id]);
  const invalidRegistryChecklist = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { registry_checklist: { stamp_duty_paid: 'yes' } },
  });
  assert.equal(invalidRegistryChecklist.response.status, 400);
  const unchangedBooking = await fixturePool.query('SELECT status, registry_checklist FROM bookings WHERE id = $1', [booking.id]);
  assert.deepEqual(unchangedBooking.rows[0], bookingBeforeInvalidChecklist.rows[0]);

  for (const status of ['agreement', 'registered', 'possession']) {
    const transition = await api(`/api/bookings/${booking.id}`, { token: tokens.admin, method: 'PATCH', body: { status } });
    assert.equal(transition.response.status, 200, `Expected booking transition to ${status}: ${JSON.stringify(transition.data)}`);
  }
  const backwardsBookingStatus = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'agreement' },
  });
  assert.equal(backwardsBookingStatus.response.status, 409);
  assert.equal((await fixturePool.query('SELECT status FROM bookings WHERE id = $1', [booking.id])).rows[0].status, 'possession');

  const overpayment = await api(`/api/bookings/${booking.id}/payments`, {
    token: tokens.admin, method: 'POST', body: { amount: Number(booking.deal_value) + 1, mode: 'UPI' },
  });
  assert.equal(overpayment.response.status, 400);

  const ownTicket = await api('/api/tickets', {
    token: tokens.customerOne, method: 'POST',
    body: { booking_id: booking.id, category: 'plumbing', title: 'Integration test leak', priority: 'urgent' },
  });
  assert.equal(ownTicket.response.status, 200, JSON.stringify(ownTicket.data));
  const customerTickets = await api('/api/tickets', { token: tokens.customerOne });
  assert.equal(customerTickets.data.some(ticket => ticket.id === ownTicket.data.id), true, 'buyer should see their complaint in the self-service list');
  const otherTicket = await api('/api/tickets', {
    token: tokens.customerTwo, method: 'POST',
    body: { booking_id: booking.id, category: 'plumbing', title: 'Unauthorized ticket' },
  });
  assert.equal(otherTicket.response.status, 404);

  const internalComment = await api(`/api/tickets/${ownTicket.data.id}/comments`, {
    token: tokens.admin, method: 'POST', body: (() => {
      const form = new FormData();
      form.append('body', 'Internal operations note');
      form.append('internal', 'true');
      form.append('photos', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: 'image/png' }), 'internal.png');
      return form;
    })(),
  });
  assert.equal(internalComment.response.status, 200);
  const adminTicket = await api(`/api/tickets/${ownTicket.data.id}`, { token: tokens.admin });
  assert.equal(adminTicket.response.status, 200);
  assert.equal(adminTicket.data.files.length, 1);
  const protectedFileUrl = adminTicket.data.files[0].url;
  assert.match(protectedFileUrl, /^\/private-files\/tickets\//);
  const protectedFile = await fetch(`${baseUrl}${protectedFileUrl}`);
  assert.equal(protectedFile.status, 200);
  const tamperedFileUrl = protectedFileUrl.replace(/tickets\/[^?]+/, `tickets/${randomUUID()}`);
  assert.equal((await fetch(`${baseUrl}${tamperedFileUrl}`)).status, 404);
  const customerTicket = await api(`/api/tickets/${ownTicket.data.id}`, { token: tokens.customerOne });
  assert.equal(customerTicket.response.status, 200);
  assert.equal(customerTicket.data.comments.some(x => x.body === 'Internal operations note'), false);
  assert.equal(customerTicket.data.files.length, 0, 'customers must not receive attachments from internal notes');
  const privateKey = (await fixturePool.query('SELECT url FROM ticket_files WHERE ticket_id = $1', [ownTicket.data.id])).rows[0].url;
  assert.match(privateKey, /^private\//);
  assert.equal((await fetch(`${baseUrl}/uploads/${privateKey}`)).status, 404, 'private upload storage must not be served as a public static file');
  assert.equal((await api(`/api/tickets/${ownTicket.data.id}`, { token: tokens.customerTwo })).response.status, 404);

  const avatarForm = new FormData();
  avatarForm.append('files', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: 'image/png' }), 'avatar.png');
  const avatarUpload = await api('/api/me/avatar', { token: tokens.admin, method: 'POST', body: avatarForm });
  assert.equal(avatarUpload.response.status, 200);
  assert.match(avatarUpload.data.avatar_url, /^\/private-files\/avatars\//);
  assert.equal((await fetch(`${baseUrl}${avatarUpload.data.avatar_url}`)).status, 200);
  const avatarKey = (await fixturePool.query('SELECT profile->>\'avatar_path\' AS path FROM users WHERE id = $1', [fixtures.users.admin.id])).rows[0].path;
  assert.match(avatarKey, /^private\//);
  assert.equal((await fetch(`${baseUrl}/uploads/${avatarKey}`)).status, 404, 'profile pictures must not be served as public static files');

  const badUpload = new FormData();
  badUpload.append('files', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'payload.html');
  const uploadResult = await api('/api/uploads', { token: tokens.admin, method: 'POST', body: badUpload });
  assert.equal(uploadResult.response.status, 400);
  const validMedia = new FormData();
  validMedia.append('kind', 'image');
  validMedia.append('unit_type_id', (await fixturePool.query(`SELECT id FROM unit_types WHERE project_id=$1 ORDER BY bhk LIMIT 1`, [fixtures.project.id])).rows[0].id);
  validMedia.append('files', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: 'image/png' }), 'sample.png');
  const validMediaUpload = await api(`/api/projects/${fixtures.project.id}/media`, { token: tokens.admin, method: 'POST', body: validMedia });
  assert.equal(validMediaUpload.response.status, 200, JSON.stringify(validMediaUpload.data));
  assert.equal(validMediaUpload.data[0].kind, 'image');

  const brokerProjectKit = await api('/api/share', {
    token: tokens.brokerOne, method: 'POST', body: { project_id: fixtures.project.id },
  });
  assert.equal(brokerProjectKit.response.status, 200);
  assert.match(brokerProjectKit.data.url, /\/s\/[a-f0-9-]+$/i, 'broker share action must create a public customer-facing link');
  const brokerShareList = await api('/api/share', { token: tokens.brokerOne });
  assert.ok(brokerShareList.data.some(link => link.token === brokerProjectKit.data.token));
  assert.ok(brokerShareList.data.every(link => link.created_by === fixtures.users.brokerOne.id), 'brokers may only view their own shared links');
  const publicPage = await api(`/p/${fixtures.share.token}`);
  assert.equal(publicPage.response.status, 200);
  const publicUnit = publicPage.data.units.find(x => x.id === fixtures.units['T-102']);
  assert.equal(publicUnit.status, 'available');
  assert.equal(Object.hasOwn(publicUnit, 'price_override'), false);
  assert.equal(JSON.stringify(publicPage.data).includes('access_token'), false);

  const leadsBeforeBadEnquiries = Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count);
  const invalidPublicEnquiry = await api(`/p/${fixtures.share.token}/enquire`, {
    method: 'POST', body: { name: 'Bad Phone Visitor', phone: 'abc123' },
  });
  assert.equal(invalidPublicEnquiry.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadsBeforeBadEnquiries);

  const orgSecret = (await fixturePool.query('SELECT bridge_secret FROM orgs WHERE id = $1', [fixtures.org.id])).rows[0].bridge_secret;
  const badBridgePayload = await api(`/bridge/leadsathi/${fixtures.org.id}?secret=${encodeURIComponent(orgSecret)}`, {
    method: 'POST', body: { event: 'new_lead', lead: { phone: '123', lead_fields: { email: 'broken' } } },
  });
  assert.equal(badBridgePayload.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadsBeforeBadEnquiries);

  const badBridgeVisit = await api(`/bridge/leadsathi/${fixtures.org.id}?secret=${encodeURIComponent(orgSecret)}`, {
    method: 'POST', body: { event: 'new_lead', lead: { phone: '919940000009', lead_fields: { visit: '2020-02-30T10:00:00Z' } } },
  });
  assert.equal(badBridgeVisit.response.status, 400);
  assert.equal(Number((await fixturePool.query('SELECT count(*) FROM leads WHERE org_id = $1', [fixtures.org.id])).rows[0].count), leadsBeforeBadEnquiries);
  const validBridgeLead = await api(`/bridge/leadsathi/${fixtures.org.id}?secret=${encodeURIComponent(orgSecret)}`, {
    method: 'POST', body: { event: 'new_lead', lead: { id: 'phase5-valid-lead', name: 'Bridge Valid Lead', phone: '919940000010', lead_fields: { email: 'bridge@example.test', config: '2 BHK' } } },
  });
  assert.equal(validBridgeLead.response.status, 200);
  assert.ok(validBridgeLead.data.lead_id);

  // The rejected enquiry also counts toward the IP/token rate limit.
  for (let i = 0; i < 7; i += 1) {
    const enquiry = await api(`/p/${fixtures.share.token}/enquire`, {
      method: 'POST', body: { name: `Public Visitor ${i}`, phone: `9199300000${String(i).padStart(2, '0')}` },
    });
    assert.equal(enquiry.response.status, 200);
  }
  const limitedEnquiry = await api(`/p/${fixtures.share.token}/enquire`, {
    method: 'POST', body: { name: 'Rate Limited', phone: '919930000099' },
  });
  assert.equal(limitedEnquiry.response.status, 429);

  const invalidWebhook = await api('/webhooks/whatsapp', { method: 'POST', body: { entry: [] } });
  assert.equal(invalidWebhook.response.status, 401);

  // WhatsApp consent and send guards must work before any Meta API call is made.
  const consentLead = await api('/api/leads', {
    token: tokens.admin, method: 'POST',
    body: { name: 'WhatsApp Consent Lead', phone: '919950000001', whatsapp_consent: 'opted_in' },
  });
  assert.equal(consentLead.response.status, 200);
  assert.equal(consentLead.data.whatsapp_consent, 'opted_in');
  const optedOut = await api(`/api/leads/${consentLead.data.id}`, {
    token: tokens.admin, method: 'PATCH', body: { whatsapp_consent: 'opted_out' },
  });
  assert.equal(optedOut.response.status, 200);
  assert.equal(optedOut.data.whatsapp_consent, 'opted_out');

  const waNumber = (await fixturePool.query(
    `INSERT INTO wa_numbers (org_id, phone_number_id, display, access_token) VALUES ($1,'integration-phone','Test Number','unused-token') RETURNING id`,
    [fixtures.org.id],
  )).rows[0];
  const chat = await api('/api/chats', {
    token: tokens.admin, method: 'POST', body: { lead_id: consentLead.data.id },
  });
  assert.equal(chat.response.status, 200);
  const optOutTemplate = await api(`/api/chats/${chat.data.id}/templates`, {
    token: tokens.admin, method: 'POST', body: { name: 'anything', language: 'en', parameters: [] },
  });
  assert.equal(optOutTemplate.response.status, 409);
  const optOutFreeText = await api(`/api/chats/${chat.data.id}/messages`, {
    token: tokens.admin, method: 'POST', body: { text: 'This must not be sent' },
  });
  assert.equal(optOutFreeText.response.status, 409);
  const noWabaTemplates = await api(`/api/whatsapp/templates?wa_number_id=${waNumber.id}`, { token: tokens.admin });
  assert.equal(noWabaTemplates.response.status, 502);

  const trackedMessage = (await fixturePool.query(
    `INSERT INTO chat_messages (chat_id,sender,body,ext_id,delivery_status) VALUES ($1,'agent','Status fixture','wamid.integration-status','accepted') RETURNING id`,
    [chat.data.id],
  )).rows[0];
  const deliveryEvent = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.integration-status', status: 'delivered' }] } }] }] };
  const deliveryBody = JSON.stringify(deliveryEvent);
  const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(deliveryBody).digest('hex')}`;
  const deliveredWebhook = await api('/webhooks/whatsapp', {
    method: 'POST', body: deliveryEvent, headers: { 'x-hub-signature-256': signature },
  });
  assert.equal(deliveredWebhook.response.status, 200);
  let trackedStatus;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    trackedStatus = await fixturePool.query('SELECT delivery_status FROM chat_messages WHERE id = $1', [trackedMessage.id]);
    if (trackedStatus.rows[0].delivery_status === 'delivered') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(trackedStatus.rows[0].delivery_status, 'delivered');
});
