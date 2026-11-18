// Super Admin Control Plane API Router
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { masterDb } from '../lib/tenant-db.js';
import { clearTenantCache } from '../middleware/tenant-resolver.js';
import { provisionTenant } from '../services/tenant-provisioner.js';
import { sendPaymentApprovedEmail } from '../services/mailer.js';
import { config } from '../config.js';
import { h, fail } from '../lib/auth.js';

const r = Router();

// Middleware to protect Super Admin routes
export function requireSuperAdmin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Super Admin authentication required', code: 'SUPERADMIN_AUTH_REQUIRED' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.role !== 'super_admin' && decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden. Super Admin privileges required.', code: 'FORBIDDEN' });
    }
    req.superAdmin = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: isExpired ? 'Super Admin session expired. Please log in again.' : 'Invalid Super Admin session token',
      code: isExpired ? 'SESSION_EXPIRED' : 'INVALID_TOKEN',
    });
  }
}

/**
 * POST /api/superadmin/login
 * Authenticates Super Admin against nivaas_master.super_admins
 */
r.post('/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const rawPass = String(password || '');

  if (!cleanEmail || !rawPass) {
    throw fail(400, 'Email and password are required');
  }

  const admin = await masterDb.one(
    `SELECT id, name, email, password_hash, role FROM super_admins WHERE lower(email) = $1`,
    [cleanEmail]
  );

  if (!admin) {
    throw fail(401, 'Invalid Super Admin email or password');
  }

  const match = await bcrypt.compare(rawPass, admin.password_hash);
  if (!match) {
    throw fail(401, 'Invalid Super Admin email or password');
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: 'super_admin' },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  res.json({
    ok: true,
    token,
    superAdmin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
}));

/**
 * GET /api/superadmin/me
 */
r.get('/me', requireSuperAdmin, h(async (req, res) => {
  const admin = await masterDb.one(
    `SELECT id, name, email, role, created_at FROM super_admins WHERE id = $1`,
    [req.superAdmin.id]
  );
  if (!admin) throw fail(404, 'Super Admin not found');
  res.json({ superAdmin: admin });
}));

/**
 * GET /api/superadmin/metrics
 * Overview stats for the dashboard header
 */
r.get('/metrics', requireSuperAdmin, h(async (req, res) => {
  const stats = await masterDb.one(`
    SELECT
      COUNT(*)::int AS total_tenants,
      COUNT(CASE WHEN subscription_status = 'active' THEN 1 END)::int AS active_tenants,
      COUNT(CASE WHEN subscription_status = 'trial' AND subscription_ends_at > NOW() THEN 1 END)::int AS trial_tenants,
      COUNT(CASE WHEN subscription_ends_at <= NOW() THEN 1 END)::int AS expired_tenants
    FROM tenants
  `);

  const pendingPayments = await masterDb.one(`
    SELECT COUNT(*)::int AS pending_count
    FROM subscription_payments
    WHERE status = 'pending'
  `);

  const revenue = await masterDb.one(`
    SELECT COALESCE(SUM(amount), 0)::int AS total_revenue
    FROM subscription_payments
    WHERE status = 'approved'
  `);

  res.json({
    tenants: stats || { total_tenants: 0, active_tenants: 0, trial_tenants: 0, expired_tenants: 0 },
    pendingPaymentsCount: pendingPayments?.pending_count || 0,
    totalRevenue: revenue?.total_revenue || 0,
  });
}));

/**
 * GET /api/superadmin/tenants
 * Lists all registered tenants/clients
 */
r.get('/tenants', requireSuperAdmin, h(async (req, res) => {
  const tenants = await masterDb.many(`
    SELECT 
      id, name, slug, custom_domain, db_name, 
      admin_email, admin_name, phone, plan_type, 
      subscription_status, trial_ends_at, subscription_ends_at,
      created_at, updated_at
    FROM tenants
    ORDER BY created_at DESC
  `);
  res.json({ tenants });
}));

/**
 * POST /api/superadmin/tenants
 * Provisions a brand new tenant with an isolated database
 */
r.post('/tenants', requireSuperAdmin, h(async (req, res) => {
  const { name, slug, adminEmail, adminName, phone, planType, durationDays } = req.body || {};
  
  const result = await provisionTenant({
    name,
    slug,
    adminEmail,
    adminName,
    phone,
    planType: planType || 'trial',
    durationDays: durationDays ? Number(durationDays) : 7,
  });

  res.status(201).json({
    ok: true,
    tenant: result.tenant,
    tempPassword: result.tempPassword,
    loginUrl: result.loginUrl,
    message: `Tenant "${result.tenant.name}" created successfully with dedicated DB "${result.tenant.db_name}".`,
  });
}));

/**
 * PATCH /api/superadmin/tenants/:id
 * Quick actions to extend subscription, change status, or plan
 */
r.patch('/tenants/:id', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const { status, extendDays, planType } = req.body || {};

  const tenant = await masterDb.one(`SELECT * FROM tenants WHERE id = $1`, [id]);
  if (!tenant) throw fail(404, 'Tenant not found');

  let updateFields = [];
  let params = [id];
  let pIdx = 2;

  if (status) {
    updateFields.push(`subscription_status = $${pIdx++}`);
    params.push(status);
  }

  if (planType) {
    updateFields.push(`plan_type = $${pIdx++}`);
    params.push(planType);
  }

  if (extendDays && Number(extendDays) > 0) {
    const days = Number(extendDays);
    updateFields.push(
      `subscription_ends_at = GREATEST(subscription_ends_at, NOW()) + ($${pIdx++} || ' days')::interval`
    );
    params.push(days);
    if (!status) {
      updateFields.push(`subscription_status = 'active'`);
    }
  }

  if (updateFields.length === 0) {
    throw fail(400, 'No updates specified');
  }

  updateFields.push(`updated_at = NOW()`);

  const updated = await masterDb.one(
    `UPDATE tenants SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  clearTenantCache(tenant.slug);

  res.json({ ok: true, tenant: updated });
}));

/**
 * GET /api/superadmin/tenants/:id
 * Detailed profile of a single tenant including its isolated DB status and audit payments
 */
r.get('/tenants/:id', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const tenant = await masterDb.one(`SELECT * FROM tenants WHERE id = $1`, [id]);
  if (!tenant) throw fail(404, 'Tenant not found');

  const payments = await masterDb.many(
    `SELECT * FROM subscription_payments WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [id]
  );

  res.json({ ok: true, tenant, payments });
}));

/**
 * POST /api/superadmin/tenants/:id/reset-password
 * Hard resets tenant admin credentials directly in the client's isolated physical database
 */
r.post('/tenants/:id/reset-password', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const tenant = await masterDb.one(`SELECT * FROM tenants WHERE id = $1`, [id]);
  if (!tenant) throw fail(404, 'Tenant not found');

  const crypto = await import('node:crypto');
  const tempPassword = 'Nivaas@' + crypto.randomBytes(4).toString('hex');
  const hash = await bcrypt.hash(tempPassword, 10);

  // Update directly inside tenant's isolated physical database
  const { getTenantPool } = await import('../lib/tenant-db.js');
  const tenantPool = await getTenantPool(tenant.slug);
  await tenantPool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE lower(email) = lower($2)`,
    [hash, tenant.admin_email]
  );

  res.json({
    success: true,
    data: {
      businessName: tenant.name,
      adminUsername: tenant.admin_email,
      tempPassword,
      portalUrl: `https://${tenant.slug}.nivaas.space`,
      generatedAt: new Date().toISOString(),
    }
  });
}));

/**
 * POST /api/superadmin/tenants/:id/renew
 * Extends client subscription duration with plan selection and records audit log
 */
r.post('/tenants/:id/renew', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const { plan_type, duration_days, duration_months, amount_paid, notes } = req.body || {};
  const tenant = await masterDb.one(`SELECT * FROM tenants WHERE id = $1`, [id]);
  if (!tenant) throw fail(404, 'Tenant not found');

  const days = duration_days ? Number(duration_days) : (Number(duration_months) || 1) * 30;

  const updated = await masterDb.one(
    `UPDATE tenants 
     SET subscription_ends_at = GREATEST(subscription_ends_at, NOW()) + ($1 || ' days')::interval,
         subscription_status = 'active',
         plan_type = COALESCE($2, plan_type),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [days, plan_type || tenant.plan_type, id]
  );

  // Record audit payment proof if amount provided
  if (amount_paid && Number(amount_paid) > 0) {
    await masterDb.query(
      `INSERT INTO subscription_payments (tenant_id, plan_type, amount, duration_days, payment_mode, screenshot_url, status, review_notes, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, 'manual_admin', 'https://nivaas.space/assets/admin-approved.png', 'approved', $5, $6, NOW())`,
      [id, plan_type || tenant.plan_type || 'monthly', Number(amount_paid), days, notes || 'Manual license renewal by Super Admin', req.superAdmin.id]
    );
  }

  clearTenantCache(tenant.slug);

  res.json({ ok: true, tenant: updated });
}));

/**
 * GET /api/superadmin/payments
 * Lists all subscription payment proofs submitted by tenants
 */
r.get('/payments', requireSuperAdmin, h(async (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT 
      p.id, p.tenant_id, p.plan_type, p.amount, 
      p.utr_number, p.screenshot_url, p.status, 
      p.review_notes, p.created_at, p.reviewed_at,
      t.name AS tenant_name, t.slug AS tenant_slug, t.admin_email, t.admin_name,
      sa.name AS reviewer_name
    FROM subscription_payments p
    JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN super_admins sa ON sa.id = p.reviewed_by
  `;

  const params = [];
  if (status) {
    query += ` WHERE p.status = $1`;
    params.push(status);
  }

  query += ` ORDER BY p.created_at DESC`;

  const payments = await masterDb.many(query, params);
  res.json({ payments });
}));

/**
 * POST /api/superadmin/payments/:id/approve
 * Approves a payment proof, extends tenant subscription, and sends email notification
 */
r.post('/payments/:id/approve', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const payment = await masterDb.one(
    `SELECT p.*, t.name AS tenant_name, t.slug AS tenant_slug, t.admin_email, t.admin_name, t.subscription_ends_at
     FROM subscription_payments p
     JOIN tenants t ON t.id = p.tenant_id
     WHERE p.id = $1`,
    [id]
  );

  if (!payment) throw fail(404, 'Payment submission not found');
  if (payment.status === 'approved') throw fail(400, 'Payment has already been approved');

  // Determine duration in days from plan_type
  let extensionDays = 30; // default monthly
  if (payment.plan_type === '6months') extensionDays = 180;
  else if (payment.plan_type === 'yearly') extensionDays = 365;
  else if (payment.plan_type === 'lifetime') extensionDays = 3650; // 10 years

  // Update payment status
  await masterDb.q(
    `UPDATE subscription_payments
     SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
     WHERE id = $2`,
    [req.superAdmin.id, id]
  );

  // Extend tenant subscription & activate
  const updatedTenant = await masterDb.one(
    `UPDATE tenants
     SET 
       subscription_ends_at = GREATEST(subscription_ends_at, NOW()) + ($1 || ' days')::interval,
       subscription_status = 'active',
       plan_type = $2,
       updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [extensionDays, payment.plan_type, payment.tenant_id]
  );

  clearTenantCache(payment.tenant_slug);

  // Fire email confirmation to client
  try {
    await sendPaymentApprovedEmail({
      email: payment.admin_email,
      name: payment.tenant_name || payment.admin_name,
      planType: payment.plan_type,
      newExpiryDate: updatedTenant.subscription_ends_at,
      subdomain: payment.tenant_slug,
    });
  } catch (mailErr) {
    console.error('[superadmin] Mail sending failed on approval:', mailErr.message);
  }

  res.json({
    ok: true,
    message: `Payment approved! Tenant "${payment.tenant_name}" subscription extended until ${new Date(updatedTenant.subscription_ends_at).toLocaleDateString('en-IN')}.`,
    tenant: updatedTenant,
  });
}));

/**
 * POST /api/superadmin/payments/:id/reject
 * Marks payment as rejected with optional notes
 */
r.post('/payments/:id/reject', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};

  const payment = await masterDb.one(`SELECT id, status FROM subscription_payments WHERE id = $1`, [id]);
  if (!payment) throw fail(404, 'Payment submission not found');

  await masterDb.q(
    `UPDATE subscription_payments
     SET status = 'rejected', review_notes = $1, reviewed_at = NOW(), reviewed_by = $2
     WHERE id = $3`,
    [notes || 'Invalid payment receipt or UTR number', req.superAdmin.id, id]
  );

  res.json({ ok: true, message: 'Payment marked as rejected' });
}));

/**
 * GET /api/superadmin/plans
 * Lists all customizable subscription plans from nivaas_master
 */
r.get('/plans', requireSuperAdmin, h(async (req, res) => {
  const plans = await masterDb.many(`SELECT * FROM subscription_plans ORDER BY price ASC`);
  res.json({ ok: true, plans });
}));

/**
 * PUT /api/superadmin/plans/:id
 * Updates pricing, features, and quotas for a plan
 */
r.put('/plans/:id', requireSuperAdmin, h(async (req, res) => {
  const { id } = req.params;
  const { name, tier_subtitle, price, duration_text, user_limit, leads_limit, features } = req.body || {};

  const existing = await masterDb.one(`SELECT id FROM subscription_plans WHERE id = $1`, [id]);
  if (!existing) throw fail(404, 'Plan not found');

  const updated = await masterDb.one(
    `UPDATE subscription_plans
     SET 
       name = COALESCE($1, name),
       tier_subtitle = COALESCE($2, tier_subtitle),
       price = COALESCE($3, price),
       duration_text = COALESCE($4, duration_text),
       user_limit = COALESCE($5, user_limit),
       leads_limit = COALESCE($6, leads_limit),
       features = COALESCE($7, features),
       updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [name, tier_subtitle, price ? Number(price) : null, duration_text, user_limit, leads_limit, features ? JSON.stringify(features) : null, id]
  );

  res.json({ ok: true, plan: updated });
}));

/**
 * GET /api/superadmin/settings
 * Retrieves master platform settings
 */
r.get('/settings', requireSuperAdmin, h(async (req, res) => {
  const row = await masterDb.one(`SELECT value FROM platform_settings WHERE key = 'bank_upi'`);
  res.json({ ok: true, settings: row?.value || {} });
}));

/**
 * PUT /api/superadmin/settings
 * Updates master platform settings (UPI ID, bank account, support contact)
 */
r.put('/settings', requireSuperAdmin, h(async (req, res) => {
  const settings = req.body || {};
  await masterDb.q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('bank_upi', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
  res.json({ ok: true, settings });
}));

export default r;

