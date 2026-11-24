// Subscription Expiry & Paywall Enforcement Guard
export function subscriptionGuard(req, res, next) {
  const tenant = req.tenant;
  if (!tenant) return next();

  // Super-admin portal requests bypass tenant subscription checks
  if (req.isSuperAdminPortal) return next();

  // Billing and Auth endpoints must always remain accessible so tenant can renew
  if (req.path.startsWith('/billing') || req.path.startsWith('/auth') || req.path.startsWith('/health')) {
    return next();
  }

  const now = new Date();
  const endsAt = tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at) : null;
  const hasValidExpiry = endsAt && Number.isFinite(endsAt.getTime());
  const isExpired = !hasValidExpiry || now >= endsAt;

  // Read-only queries (GET) are permitted so builders don't lose view access to their data
  if (req.method === 'GET') {
    return next();
  }

  // Mutative actions (POST, PUT, PATCH, DELETE) are locked once subscription expires
  const subscriptionActive = tenant.subscription_status === 'active';
  const lifetimePlan = tenant.plan_type === 'lifetime';
  if (!subscriptionActive || (!lifetimePlan && isExpired)) {
    return res.status(402).json({
      error: 'Your subscription or free trial has expired. Please choose a plan and submit renewal proof to continue updating records.',
      code: 'SUBSCRIPTION_EXPIRED',
      plan_type: tenant.plan_type,
      subscription_ends_at: tenant.subscription_ends_at,
    });
  }

  next();
}

