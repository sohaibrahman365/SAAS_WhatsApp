// Plan Limits Service — checks resource limits and usage quotas per tenant plan
const pool = require('../config/db');

// Cache plan limits (they rarely change)
const limitsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Default limits if plan_limits table hasn't been seeded
const DEFAULTS = {
  starter:    { max_products: 100,  max_customers: 500,   max_campaigns_mo: 5,   max_team_members: 3,  max_wa_messages_day: 100,  max_ai_calls_day: 50,   features: {}, retention_days: 30 },
  pro:        { max_products: 1000, max_customers: 5000,  max_campaigns_mo: 30,  max_team_members: 10, max_wa_messages_day: 500,  max_ai_calls_day: 200,  features: {}, retention_days: 90 },
  business:   { max_products: 5000, max_customers: 25000, max_campaigns_mo: 100, max_team_members: 25, max_wa_messages_day: 2000, max_ai_calls_day: 1000, features: {}, retention_days: 365 },
  enterprise: { max_products: -1,   max_customers: -1,    max_campaigns_mo: -1,  max_team_members: -1, max_wa_messages_day: -1,   max_ai_calls_day: -1,   features: {}, retention_days: -1 },
};

async function getPlanLimits(plan) {
  const cached = limitsCache.get(plan);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.limits;

  try {
    const { rows } = await pool.query('SELECT * FROM plan_limits WHERE plan = $1', [plan]);
    const limits = rows[0] || DEFAULTS[plan] || DEFAULTS.starter;
    limitsCache.set(plan, { limits, loadedAt: Date.now() });
    return limits;
  } catch {
    return DEFAULTS[plan] || DEFAULTS.starter;
  }
}

async function getTenantPlan(tenantId) {
  const { rows } = await pool.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
  return rows[0]?.plan || 'starter';
}

// -1 means unlimited
function isUnlimited(limit) {
  return limit === -1;
}

// ── Resource count checks ───────────────────────────────────

async function checkResourceLimit(tenantId, resource, table, extraWhere) {
  const plan = await getTenantPlan(tenantId);
  const limits = await getPlanLimits(plan);

  const limitKey = `max_${resource}`;
  const max = limits[limitKey];
  if (isUnlimited(max)) return { allowed: true, current: 0, limit: -1, plan };

  const where = extraWhere || '';
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 ${where}`,
    [tenantId]
  );
  const current = rows[0].count;

  return {
    allowed: current < max,
    current,
    limit: max,
    plan,
  };
}

async function checkProductLimit(tenantId) {
  return checkResourceLimit(tenantId, 'products', 'products');
}

async function checkCustomerLimit(tenantId) {
  return checkResourceLimit(tenantId, 'customers', 'customers');
}

async function checkCampaignLimit(tenantId) {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  return checkResourceLimit(tenantId, 'campaigns_mo', 'campaigns',
    `AND created_at >= '${period}-01'`);
}

async function checkTeamLimit(tenantId) {
  return checkResourceLimit(tenantId, 'team_members', 'users');
}

// ── Daily usage checks ──────────────────────────────────────

async function checkDailyUsage(tenantId, usageType) {
  const plan = await getTenantPlan(tenantId);
  const limits = await getPlanLimits(plan);

  const limitKey = `max_${usageType}_day`;
  const max = limits[limitKey];
  if (isUnlimited(max)) return { allowed: true, current: 0, limit: -1, plan };

  const col = usageType === 'wa_messages' ? 'wa_messages' : 'ai_calls';
  const { rows } = await pool.query(
    `SELECT COALESCE(${col}, 0) AS count FROM tenant_usage_daily
     WHERE tenant_id = $1 AND day = CURRENT_DATE`,
    [tenantId]
  );
  const current = rows[0]?.count || 0;

  return { allowed: current < max, current, limit: max, plan };
}

// ── Usage increment ─────────────────────────────────────────

async function incrementUsage(tenantId, field) {
  const period = new Date().toISOString().slice(0, 7);

  // Monthly counter
  await pool.query(`
    INSERT INTO tenant_usage (tenant_id, period, ${field})
    VALUES ($1, $2, 1)
    ON CONFLICT (tenant_id, period) DO UPDATE
    SET ${field} = tenant_usage.${field} + 1, updated_at = NOW()
  `, [tenantId, period]);

  // Daily counter (only for wa_messages and ai_calls)
  if (field === 'wa_messages' || field === 'ai_calls') {
    await pool.query(`
      INSERT INTO tenant_usage_daily (tenant_id, day, ${field})
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (tenant_id, day) DO UPDATE
      SET ${field} = tenant_usage_daily.${field} + 1
    `, [tenantId]);
  }
}

// ── Feature flag check ──────────────────────────────────────

async function hasFeature(tenantId, feature) {
  const plan = await getTenantPlan(tenantId);
  const limits = await getPlanLimits(plan);
  return limits.features?.[feature] === true;
}

// ── Get full usage summary for a tenant ─────────────────────

async function getUsageSummary(tenantId) {
  const plan = await getTenantPlan(tenantId);
  const limits = await getPlanLimits(plan);
  const period = new Date().toISOString().slice(0, 7);

  const [products, customers, campaigns, teamMembers, monthly, daily] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS c FROM products WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COUNT(*)::int AS c FROM customers WHERE tenant_id = $1', [tenantId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM campaigns WHERE tenant_id = $1 AND created_at >= $2 || '-01'`, [tenantId, period]),
    pool.query('SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT * FROM tenant_usage WHERE tenant_id = $1 AND period = $2', [tenantId, period]),
    pool.query('SELECT * FROM tenant_usage_daily WHERE tenant_id = $1 AND day = CURRENT_DATE', [tenantId]),
  ]);

  const m = monthly.rows[0] || {};
  const d = daily.rows[0] || {};

  return {
    plan,
    limits: {
      max_products: limits.max_products,
      max_customers: limits.max_customers,
      max_campaigns_mo: limits.max_campaigns_mo,
      max_team_members: limits.max_team_members,
      max_wa_messages_day: limits.max_wa_messages_day,
      max_ai_calls_day: limits.max_ai_calls_day,
      features: limits.features,
      retention_days: limits.retention_days,
    },
    usage: {
      products: products.rows[0].c,
      customers: customers.rows[0].c,
      campaigns_this_month: campaigns.rows[0].c,
      team_members: teamMembers.rows[0].c,
      wa_messages_today: d.wa_messages || 0,
      wa_messages_this_month: m.wa_messages || 0,
      ai_calls_today: d.ai_calls || 0,
      ai_calls_this_month: m.ai_calls || 0,
      api_calls_this_month: m.api_calls || 0,
    },
  };
}

function clearLimitsCache() {
  limitsCache.clear();
}

module.exports = {
  getPlanLimits,
  getTenantPlan,
  checkProductLimit,
  checkCustomerLimit,
  checkCampaignLimit,
  checkTeamLimit,
  checkDailyUsage,
  incrementUsage,
  hasFeature,
  getUsageSummary,
  clearLimitsCache,
};
