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

const normalizeHost = value => String(value || '').trim().toLowerCase().replace(/\.$/, '').split(':')[0];
const validTenantSlug = value => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);

export function getTenantIdentifier(req, baseDomain = config.baseDomain) {
  const host = normalizeHost(req.headers?.['x-forwarded-host'] || req.headers?.host);
  const normalizedBaseDomain = normalizeHost(baseDomain);
  if (host && host.endsWith(`.${normalizedBaseDomain}`)) {
    return { slug: host.slice(0, -(normalizedBaseDomain.length + 1)), source: 'host' };
  }
  if (req.headers?.['x-tenant-slug'] !== undefined) {
    return { slug: String(req.headers['x-tenant-slug']).trim().toLowerCase(), source: 'header' };
  }
  if (req.query?._tenant !== undefined) {
    return { slug: String(req.query._tenant).trim().toLowerCase(), source: 'query' };
  }
  // Custom domains are looked up by their full host name.
  if (host && host !== normalizedBaseDomain && !['localhost', '127.0.0.1'].includes(host)) {
    return { slug: host, source: 'custom-domain' };
  }
  return { slug: null, source: null };
}

/**
 * Express middleware that identifies tenant from Host header or X-Tenant-Slug,
 * sets req.tenant, and wraps the request chain in AsyncLocalStorage runWithTenant().
 */
export async function tenantResolver(req, res, next) {
  const { slug, source } = getTenantIdentifier(req);

  // If host is the superadmin subdomain (e.g. admin.nivaas.space)
  if (slug === 'admin') {
    req.isSuperAdminPortal = true;
    return next();
  }

  let tenant = null;
  if (slug && slug !== 'www') {
    const isCustomDomain = source === 'custom-domain';
    if ((!isCustomDomain && !validTenantSlug(slug)) || (isCustomDomain && !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(slug))) {
      return res.status(400).json({ error: 'Invalid tenant identifier' });
    }
    try {
      tenant = await lookupTenantBySlug(slug);
    } catch (err) {
      console.error('[tenant-resolver] Failed to lookup tenant:', err.message);
      return res.status(503).json({ error: 'Tenant lookup is temporarily unavailable' });
    }
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  }

  // If no specific tenant found, fallback to default tenant (sgdevelopers -> nivaas)
  // This keeps legacy root URL / testing 100% operational
  if (!tenant) {
    tenant = {
      id: '8480a397-fb89-44d7-abc0-df9823c95c10',
      name: 'Shree Ganesh Developers',
      slug: 'sgdevelopers',
      // Integration tests point DATABASE_URL at a temporary database/schema.
      // Keep their HTTP requests on that database instead of the local default.
      db_name: process.env.NODE_ENV === 'test'
        ? decodeURIComponent(new URL(config.databaseUrl).pathname.replace(/^\//, ''))
        : 'nivaas',
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

