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
  const expiryFormatted = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }) : 'Lifetime Access';

  const planLabels = {
    starter: 'Starter Tier (Monthly)',
    professional: 'Professional Tier (6 Months)',
    business: 'Business Tier (Annual)',
    enterprise: 'Enterprise Tier (Lifetime)',
    trial: '7-Day Free Trial',
    monthly: 'Starter Tier (Monthly)',
    yearly: 'Business Tier (Annual)',
    lifetime: 'Enterprise Tier (Lifetime)',
  };
  const planBadge = planLabels[planType] || `${String(planType).toUpperCase()} Plan`;
  const isLifetime = planType === 'enterprise' || planType === 'lifetime';
  const clientCode = String(subdomain || '').toUpperCase().slice(0, 12);

  const subject = `Welcome to Nivaas — Your ${name} Real Estate CRM is Ready!`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; }
    .wrapper { background-color: #f1f5f9; padding: 40px 16px; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%); padding: 36px 32px; text-align: center; color: #ffffff; }
    .header-badge { display: inline-block; padding: 4px 14px; background: rgba(255, 255, 255, 0.2); border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 12px; }
    .header h1 { margin: 0 0 8px; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 14px; color: #dbeafe; }
    .content { padding: 36px 32px; }
    .greeting { font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .intro { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .card-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
    .badge-code { background: #dbeafe; color: #1d4ed8; padding: 3px 10px; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: 700; }
    .badge-temp { background: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; }
    .cta-container { text-align: center; margin: 32px 0 20px; }
    .btn-primary { display: inline-block; padding: 14px 32px; background: #2563eb; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .steps-section { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 24px; }
    .steps-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .step-item { font-size: 13.5px; color: #475569; margin-bottom: 8px; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .footer a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="email-container">
      <div class="header">
        <div class="header-badge">Nivaas Real Estate OS</div>
        <h1>Welcome to Your Real Estate CRM</h1>
        <p>Your business platform has been provisioned and is ready</p>
      </div>

      <div class="content">
        <div class="greeting">Hello ${name},</div>
        <div class="intro">
          We're excited to partner with you! A dedicated Real Estate CRM portal for <strong>${name}</strong> is now live. Everything you need to manage residential inventory, leads, WhatsApp AI copilot, site visits, buyer handover, bookings, and your team is ready for you.
        </div>

        <div class="card">
          <div class="card-title">Account &amp; Workspace Summary</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Company Name</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Client ID Code</td>
              <td style="padding: 8px 0; text-align: right;"><span class="badge-code">${clientCode}</span></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Login Email</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Subscription Plan</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #2563eb;">${planBadge}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">${planType === 'trial' ? 'Trial Expiry' : 'Renewal Date'}</td>
              <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #0f172a;">${isLifetime ? 'Lifetime Access' : expiryFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Temporary Password</td>
              <td style="padding: 8px 0; text-align: right;"><span class="badge-temp">${tempPassword}</span></td>
            </tr>
          </table>
        </div>

        <div class="cta-container">
          <a href="${loginUrl}" class="btn-primary" target="_blank">
            Access CRM Login Portal &rarr;
          </a>
        </div>

        <div class="steps-section">
          <div class="steps-title">Quick Next Steps:</div>
          <div class="step-item">&bull; <strong>Set Your Password:</strong> Log in with your temporary password and set your permanent, secure password.</div>
          <div class="step-item">&bull; <strong>Configure Profile:</strong> Add your builder company address, contact numbers, logo, and RERA registration.</div>
          <div class="step-item">&bull; <strong>Invite Team:</strong> Add staff members, assign roles, and start managing inventory &amp; leads.</div>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 8px;">Need assistance? Reach out anytime at <a href="mailto:support@nivaas.space">support@nivaas.space</a></p>
        <p style="margin: 0; color: #94a3b8;">&copy; ${new Date().getFullYear()} Nivaas Real Estate Technologies. All rights reserved.</p>
      </div>
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

