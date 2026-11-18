// Multi-Tenant Dynamic Database Pool Manager using Node.js AsyncLocalStorage
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../config.js';

// Parse Postgres numeric (OID 1700) to JS number
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)));

// AsyncLocalStorage keeps tenant connection context across asynchronous execution chains
export const tenantStorage = new AsyncLocalStorage();

// Parse base database connection URI
function getBaseDbUrl() {
  return config.databaseUrl || 'postgres://postgres:postgres@localhost:5432/nivaas';
}

function deriveDbUrl(dbName) {
  const base = getBaseDbUrl();
  try {
    const parsed = new URL(base);
    parsed.pathname = '/' + dbName;
    return parsed.toString();
  } catch {
    // If not standard URL format, replace trailing database name
    return base.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`);
  }
}

// Master Control Plane connection pool
export const masterPool = new pg.Pool({
  connectionString: config.masterDatabaseUrl || deriveDbUrl('nivaas_master'),
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
});

// Default legacy pool (e.g. 'nivaas') for backwards compatibility & tests
export const defaultPool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 15,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,
});

/**
 * LRU Connection Pool Cache for Tenant Databases.
 * Automatically evicts idle tenant pools after 15 minutes to preserve server RAM.
 */
class TenantPoolManager {
  constructor(maxActivePools = 30, idleTimeoutMs = 15 * 60 * 1000) {
    this.pools = new Map(); // dbName -> { pool, lastUsedAt }
    this.maxActivePools = maxActivePools;
    this.idleTimeoutMs = idleTimeoutMs;

    // Periodic sweep for idle tenant pools every 5 minutes
    this.cleanerInterval = setInterval(() => this.sweep(), 5 * 60 * 1000);
    if (this.cleanerInterval.unref) this.cleanerInterval.unref();
  }

  getPool(dbName) {
    if (!dbName) return defaultPool;

    const existing = this.pools.get(dbName);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.pool;
    }

    // If cache exceeds limit, evict the least recently used pool
    if (this.pools.size >= this.maxActivePools) {
      this.evictOldest();
    }

    const connStr = deriveDbUrl(dbName);
    const pool = new pg.Pool({
      connectionString: connStr,
      max: 5, // Strict 5 connection cap per tenant
      min: 0,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 20000,
      statement_timeout: 15000,
    });

    pool.on('error', err => {
      console.error(`[tenant-pool] Pool error for database ${dbName}:`, err.message);
    });

    this.pools.set(dbName, { pool, lastUsedAt: Date.now() });
    return pool;
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, item] of this.pools.entries()) {
      if (item.lastUsedAt < oldestTime) {
        oldestTime = item.lastUsedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const entry = this.pools.get(oldestKey);
      this.pools.delete(oldestKey);
      entry.pool.end().catch(() => {});
    }
  }

  sweep() {
    const now = Date.now();
    for (const [key, item] of this.pools.entries()) {
      if (now - item.lastUsedAt > this.idleTimeoutMs) {
        this.pools.delete(key);
        item.pool.end().catch(() => {});
      }
    }
  }

  async closeAll() {
    clearInterval(this.cleanerInterval);
    const closing = [];
    for (const [, item] of this.pools.entries()) {
      closing.push(item.pool.end().catch(() => {}));
    }
    this.pools.clear();
    await Promise.all(closing);
  }
}

export const tenantPoolManager = new TenantPoolManager();

/**
 * Returns the active PG pool for the current async execution context.
 * If running inside a tenant request, returns the tenant pool.
 * Otherwise returns the default/master pool.
 */
export function getActivePool() {
  const store = tenantStorage.getStore();
  if (store?.pool) return store.pool;
  if (store?.tenant?.db_name) return tenantPoolManager.getPool(store.tenant.db_name);
  return defaultPool;
}

/**
 * Helper to execute a function within a specific tenant context.
 */
export function runWithTenant(tenantContext, callback) {
  const pool = tenantContext?.db_name
    ? tenantPoolManager.getPool(tenantContext.db_name)
    : (tenantContext?.pool || defaultPool);

  return tenantStorage.run({ tenant: tenantContext, pool }, callback);
}

/**
 * Helper to query the master database directly (e.g. for superadmin or tenant lookup).
 */
export const masterDb = {
  q: (text, params) => masterPool.query(text, params),
  one: async (text, params) => (await masterPool.query(text, params)).rows[0] || null,
  many: async (text, params) => (await masterPool.query(text, params)).rows,
};

