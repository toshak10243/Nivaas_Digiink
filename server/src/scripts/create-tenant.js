// CLI Utility to provision a new tenant
import { provisionTenant } from '../services/tenant-provisioner.js';

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag, def = '') => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };

  const name = getArg('--name') || args[0] || 'Demo Builder';
  const slug = getArg('--slug') || args[1] || 'demo';
  const email = getArg('--email') || args[2] || 'demo@nivaas.space';
  const phone = getArg('--phone') || '9876543210';
  const plan = getArg('--plan') || 'trial';

  console.log(`Starting tenant provisioning for: ${name} (${slug})...`);
  try {
    const result = await provisionTenant({
      name,
      slug,
      adminEmail: email,
      adminName: `${name} Admin`,
      phone,
      planType: plan,
      durationDays: 7,
    });
    console.log('\n================== TENANT PROVISIONED SUCCESSFULLY ==================');
    console.log('Subdomain URL:    ', result.loginUrl);
    console.log('Database Name:    ', result.tenant.db_name);
    console.log('Admin Email:      ', result.adminEmail);
    console.log('Temporary Password:', result.tempPassword);
    console.log('Plan / Status:    ', `${result.tenant.plan_type} / ${result.tenant.subscription_status}`);
    console.log('Trial Ends At:    ', result.tenant.trial_ends_at);
    console.log('Welcome Email:    ', result.emailSent ? 'Sent' : 'Simulated (logged)');
    console.log('====================================================================\n');
  } catch (err) {
    console.error('Failed to provision tenant:', err.message);
    process.exit(1);
  }
}

main().then(() => process.exit(0));

