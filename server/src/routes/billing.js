// Tenant Billing & Renewal Subscription Routes
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { masterDb } from '../lib/tenant-db.js';
import { config } from '../config.js';
import { clearTenantCache } from '../middleware/tenant-resolver.js';

const r = Router();

export const PLANS = [
  {
    id: 'trial',
    name: '7-Day Free Trial',
    price: 0,
    durationDays: 7,
    features: ['1 Residential Project', 'Up to 3 Team Members', 'AI Objection & Sales Copilot', 'WhatsApp Lead Routing', 'Basic Analytics'],
  },
  {
    id: 'monthly',
    name: 'Starter Monthly',
    price: 4999,
    durationDays: 30,
    popular: false,
    discountNote: 'Billed monthly',
    features: ['2 Residential Projects', 'Up to 5 Sales Agents', 'AI Sales Copilot & Twin', 'Complete Inventory Manager', 'WhatsApp Automation', 'Standard Email Support'],
  },
  {
    id: 'half_yearly',
    name: 'Growth (6 Months)',
    price: 24999,
    durationDays: 180,
    popular: true,
    discountNote: 'Save 17% (₹4,166/month)',
    features: ['5 Projects & Towers', 'Up to 15 Sales Agents', 'AI Route & Staff Optimizer', 'Site Visit Evidence Passport', 'AI Registry Day Manager', 'Priority Support'],
  },
  {
    id: 'yearly',
    name: 'Annual Builder Pro (1 Year)',
    price: 44999,
    durationDays: 365,
    popular: false,
    discountNote: 'Save 25% (₹3,750/month)',
    features: ['Unlimited Projects & Towers', 'Up to 30 Sales Staff & Brokers', 'Digital Buyer Handover Room', 'Custom Project Brochure URLs', 'Dedicated Account Manager'],
  },
  {
    id: 'lifetime',
    name: 'Lifetime Founder Deal',
    price: 99999,
    durationDays: 36500,
    popular: false,
    discountNote: 'One-Time Payment · Zero Renewal Fees Forever',
    features: ['Unlimited Everything Forever', 'Unlimited Projects, Units & Agents', 'All Future AI Upgrades Included', 'Direct Engineering Priority Support', 'VIP Founder Badge'],
  },
];

export const PAYMENT_METHODS = {
  upi: {
    upiId: process.env.PAYMENT_UPI_ID || 'nivaas@icici',
    payeeName: 'Nivaas Solutions',
    qrCodeUrl: '/assets/payment-qr.png',
  },
  bank: {
    accountName: 'Nivaas Solutions Private Limited',
    bankName: 'HDFC Bank',
    accountNumber: '50200084729182',
    ifscCode: 'HDFC0000123',
    accountType: 'Current Account',
    branch: 'Jaipur Main Branch',
  },
};

// Payment screenshot storage
const proofUploadDir = path.join(config.uploadDir, 'payment-proofs');
fs.mkdirSync(proofUploadDir, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, proofUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `proof-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(allowed ? null : new Error('Please upload an image (JPG, PNG, WebP) or PDF screenshot'), allowed);
  },
});

// GET /api/billing/plans
r.get('/plans', (_req, res) => {
  res.json({ plans: PLANS });
});

// GET /api/billing/status
r.get('/status', async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Refresh latest tenant record from master DB
  const latest = await masterDb.one(`SELECT * FROM tenants WHERE id = $1`, [tenant.id]);
  const t = latest || tenant;

  const now = new Date();
  const endsAt = t.subscription_ends_at ? new Date(t.subscription_ends_at) : null;
  const isExpired = endsAt ? now > endsAt : false;
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24))) : 0;

  // Check for any pending review payment
  const pendingPayment = await masterDb.one(
    `SELECT * FROM subscription_payments WHERE tenant_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [t.id]
  );

  res.json({
    tenant_name: t.name,
    subdomain: t.slug,
    plan_type: t.plan_type,
    subscription_status: t.subscription_status,
    trial_ends_at: t.trial_ends_at,
    subscription_ends_at: t.subscription_ends_at,
    is_expired: isExpired,
    days_left: daysLeft,
    pending_payment: pendingPayment || null,
    payment_methods: PAYMENT_METHODS,
  });
});

// POST /api/billing/submit-proof
r.post('/submit-proof', uploadProof.single('screenshot'), async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const { plan_type, utr_number, payment_mode = 'upi' } = req.body || {};
  if (!plan_type) return res.status(400).json({ error: 'Please select a subscription plan' });

  const plan = PLANS.find(p => p.id === plan_type);
  if (!plan || plan.price <= 0) return res.status(400).json({ error: 'Invalid plan selected' });

  const cleanUtr = String(utr_number || '').trim();
  if (!cleanUtr || cleanUtr.length < 6) {
    return res.status(400).json({ error: 'Please enter a valid 12-digit UTR or Transaction reference number' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a screenshot or receipt of the payment' });
  }

  const screenshotUrl = `/uploads/payment-proofs/${req.file.filename}`;

  // Insert payment request into master database
  const payment = await masterDb.one(
    `INSERT INTO subscription_payments (
       tenant_id, plan_type, amount, duration_days, payment_mode, utr_number, screenshot_url, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
    [tenant.id, plan.id, plan.price, plan.durationDays, payment_mode, cleanUtr, screenshotUrl]
  );

  // Update tenant status to pending_verification
  await masterDb.one(
    `UPDATE tenants SET subscription_status = 'pending_verification', updated_at = now() WHERE id = $1 RETURNING id`,
    [tenant.id]
  );
  clearTenantCache(tenant.slug);

  res.json({
    ok: true,
    message: 'Payment proof submitted successfully! Our verification team will review and activate your subscription shortly.',
    payment,
  });
});

// GET /api/billing/history
r.get('/history', async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const rows = await masterDb.many(
    `SELECT * FROM subscription_payments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [tenant.id]
  );
  res.json({ payments: rows });
});

export default r;

