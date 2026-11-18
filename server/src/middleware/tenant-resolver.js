// Subdomain Tenant Resolver Middleware
import { masterDb, runWithTenant, defaultPool } from '../lib/tenant-db.js';
import { config } from '../config.js';

// Cache tenant lookups for 60 seconds to avoid hitting master DB on every microsecond request
const tenantCache = new Map(); // slug -> { tenant, expiresAt }

export async function lookupTenantBySlug(slug) {
  if (!slug) return null;
  const now = Date.now();
  const cached = tenantCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenant;
  }

  const tenant = await masterDb.one(
    `SELECT * FROM tenants WHERE slug = $1 OR custom_domain = $1`,
    [slug]
  );

  if (tenant) {
    tenantCache.set(slug, { tenant, expiresAt: now + 60000 });
  }
  return tenant;
}

export function clearTenantCache(slug) {
  if (slug) tenantCache.delete(slug);
  else tenantCache.clear();
}

/**
 * Express middleware that identifies tenant from Host header or X-Tenant-Slug,
 * sets req.tenant, and wraps the request chain in AsyncLocalStorage runWithTenant().
 */
export async function tenantResolver(req, res, next) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0];
  let slug = null;

  // 1. Check if host is a subdomain of baseDomain (e.g. apex.nivaas.space)
  const baseDomain = config.baseDomain.toLowerCase();
  if (host.endsWith('.' + baseDomain)) {
    slug = host.slice(0, -(baseDomain.length + 1));
  } else if (req.headers['x-tenant-slug']) {
    // 2. Fallback to explicit header for API clients / testing
    slug = String(req.headers['x-tenant-slug']).trim().toLowerCase();
  } else if (req.query?._tenant) {
    // 3. Fallback to query param
    slug = String(req.query._tenant).trim().toLowerCase();
  }

  // If host is the superadmin subdomain (e.g. admin.nivaas.space)
  if (slug === 'admin') {
    req.isSuperAdminPortal = true;
    return next();
  }

  let tenant = null;
  if (slug && slug !== 'www') {
    try {
      tenant = await lookupTenantBySlug(slug);
    } catch (err) {
      console.error('[tenant-resolver] Failed to lookup tenant:', err.message);
    }
  }

  // If no specific tenant found, fallback to default tenant (sgdevelopers -> nivaas)
  // This keeps legacy root URL / testing 100% operational
  if (!tenant) {
    tenant = {
      id: '8480a397-fb89-44d7-abc0-df9823c95c10',
      name: 'Shree Ganesh Developers',
      slug: 'sgdevelopers',
      db_name: 'nivaas',
      plan_type: 'yearly',
      subscription_status: 'active',
      subscription_ends_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    };
  }

  req.tenant = tenant;

  // Run the rest of the request within this tenant's isolated DB context
  runWithTenant(tenant, () => {
    next();
  });
}

