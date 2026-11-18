import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a PostgreSQL database reserved for integration tests.');

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

function dbNameFrom(url) { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')); }

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
  const dbName = dbNameFrom(testDatabaseUrl);
  if (!dbName) throw new Error('TEST_DATABASE_URL must include a database name.');
  schema = `nivaas_it_${process.pid}_${randomBytes(4).toString('hex')}`;
  controlPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1 });
  await controlPool.query(`CREATE SCHEMA "${schema}"`);

  const scoped = new URL(testDatabaseUrl);
  scoped.searchParams.set('options', `-c search_path=${schema},public`);
  scopedUrl = scoped.toString();
  process.env.DATABASE_URL = scopedUrl;
  process.env.JWT_SECRET = 'integration-test-secret-with-32-characters';
  process.env.META_APP_SECRET = '';
  process.env.GEMINI_API_KEY = '';
  process.env.NODE_ENV = 'test';
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
  for (const unitNo of ['T-101', 'T-102']) {
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
    env: { ...process.env, PORT: String(port), DATABASE_URL: scopedUrl, UPLOAD_DIR: uploadDir, NODE_ENV: 'test', META_APP_SECRET: '', GEMINI_API_KEY: '' },
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

  const skippedBookingStatus = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { status: 'possession' },
  });
  assert.equal(skippedBookingStatus.response.status, 409);
  const bookingBeforeInvalidChecklist = await fixturePool.query('SELECT status, registry_checklist FROM bookings WHERE id = $1', [booking.id]);
  const invalidRegistryChecklist = await api(`/api/bookings/${booking.id}`, {
    token: tokens.admin, method: 'PATCH', body: { registry_checklist: { stamp_duty_paid: 'yes' } },
  });
  assert.equal(invalidRegistryChecklist.response.status, 400);
  const unchangedBooking = await fixturePool.query('SELECT status, registry_checklist FROM bookings WHERE id = $1', [booking.id]);
  assert.deepEqual(unchangedBooking.rows[0], bookingBeforeInvalidChecklist.rows[0]);

  const overpayment = await api(`/api/bookings/${booking.id}/payments`, {
    token: tokens.admin, method: 'POST', body: { amount: Number(booking.deal_value) + 1, mode: 'UPI' },
  });
  assert.equal(overpayment.response.status, 400);

  const ownTicket = await api('/api/tickets', {
    token: tokens.customerOne, method: 'POST',
    body: { booking_id: booking.id, category: 'plumbing', title: 'Integration test leak', priority: 'urgent' },
  });
  assert.equal(ownTicket.response.status, 200, JSON.stringify(ownTicket.data));
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
});
