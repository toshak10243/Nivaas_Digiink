// Automated Transactional Email Service for Nivaas Multi-Tenant SaaS
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) {
    return null; // Return null if SMTP is not configured yet (will fallback to console log)
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const mail = getTransporter();
  if (!mail) {
    console.log(`\n================== [MAILER (SMTP NOT CONFIGURED - CONSOLE PREVIEW)] ==================`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text:\n${text || html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
    console.log(`====================================================================================\n`);
    return { ok: true, simulated: true };
  }

  try {
    const info = await mail.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html,
    });
    console.log(`[mailer] Email sent successfully to ${to} (MessageId: ${info.messageId})`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends a welcome email to a new builder/tenant with subdomain URL & credentials.
 */
export async function sendTenantWelcomeEmail({ email, name, subdomain, tempPassword, planType = 'trial', trialEndsAt }) {
  const loginUrl = `https://${subdomain}.${config.baseDomain}`;
  const expiryFormatted = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  }) : '7 Days';

  const planLabels = {
    starter: 'Starter Tier (Monthly Subscription)',
    professional: 'Professional Tier (6 Months Subscription)',
    business: 'Business Tier (Annual Enterprise)',
    enterprise: 'Enterprise Tier (Lifetime Access)',
    trial: '7-Day Free Trial Activated',
    monthly: 'Starter Tier (Monthly)',
    yearly: 'Business Tier (Annual)',
    lifetime: 'Enterprise Tier (Lifetime Access)',
  };
  const planBadge = planLabels[planType] || `${String(planType).toUpperCase()} Plan`;
  const isLifetime = planType === 'enterprise' || planType === 'lifetime';

  const subject = `Welcome to Nivaas — Your Real Estate AI CRM & Copilot is ready! (${subdomain}.${config.baseDomain})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #f8fafc; padding: 24px; margin: 0; }
        .card { max-width: 580px; margin: 0 auto; background: #131927; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; }
        .brand { font-size: 24px; font-weight: 800; color: #38bdf8; margin-bottom: 20px; letter-spacing: -0.5px; }
        .badge { display: inline-block; background: #059669; color: #fff; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
        h1 { font-size: 20px; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
        p { color: #94a3b8; line-height: 1.6; font-size: 14px; margin-top: 0; }
        .cred-box { background: #0b0f19; border: 1px solid #334155; border-radius: 8px; padding: 18px; margin: 24px 0; }
        .cred-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .cred-row:last-child { margin-bottom: 0; }
        .cred-label { color: #64748b; font-weight: 600; }
        .cred-val { color: #f1f5f9; font-weight: 700; font-family: monospace; font-size: 15px; }
        .btn { display: block; text-align: center; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 700; font-size: 15px; margin: 24px 0 16px; }
        .footer { border-top: 1px solid #1e293b; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">NIVAAS <span style="font-weight: 400; color: #94a3b8; font-size: 15px;">· Real Estate OS</span></div>
        <span class="badge">${planBadge}</span>
        <h1>Namaste ${name}!</h1>
        <p>Your private, dedicated Real Estate CRM instance has been successfully created and configured with an isolated database for <b>${name}</b>.</p>
        
        <div class="cred-box">
          <div class="cred-row">
            <span class="cred-label">Dedicated Subdomain:</span>
            <span class="cred-val">${subdomain}.${config.baseDomain}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Login ID / Email:</span>
            <span class="cred-val">${email}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Temporary Password:</span>
            <span class="cred-val" style="color: #38bdf8;">${tempPassword}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">${planType === 'trial' ? 'Trial Valid Until:' : 'Subscription Period:'}</span>
            <span class="cred-val" style="color: #10b981;">${isLifetime ? 'Lifetime Access' : expiryFormatted}</span>
          </div>
        </div>

        <a href="${loginUrl}" class="btn" target="_blank">Access Your Nivaas Workspace &rarr;</a>

        <p style="font-size: 13px; color: #cbd5e1;"><b>Quick Setup Steps:</b><br>
        1. Click the button above to log into your workspace.<br>
        2. Set your permanent secure password.<br>
        3. Add your first residential project & upload flat layouts to start tracking sales & site visits!</p>

        <div class="footer">
          Nivaas Real Estate Technologies · Dedicated Tenant: ${subdomain}.${config.baseDomain}<br>
          For direct assistance, reply to this email or contact support.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Sends a confirmation email when super-admin approves a payment proof.
 */
export async function sendPaymentApprovedEmail({ email, name, planType, newExpiryDate, subdomain }) {
  const loginUrl = `https://${subdomain}.${config.baseDomain}`;
  const expiryFormatted = new Date(newExpiryDate).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const subject = `Payment Approved — Your Nivaas Subscription is now Active!`;
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #131927; border: 1px solid #1e293b; border-radius: 12px; padding: 32px;">
        <h2 style="color: #10b981; margin-top: 0;">&#10003; Payment Verified &amp; Subscription Extended!</h2>
        <p style="color: #94a3b8;">Namaste <b>${name}</b>, your payment has been verified by our team.</p>
        <div style="background: #0b0f19; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #334155;">
          <p style="margin: 4px 0; color: #cbd5e1;"><b>Activated Plan:</b> ${planType.toUpperCase()}</p>
          <p style="margin: 4px 0; color: #10b981;"><b>Valid Until:</b> ${expiryFormatted}</p>
        </div>
        <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 700;">Open Workspace</a>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

