const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { getUsageSummary, getPlanLimits, clearLimitsCache } = require('../services/planLimits');

const router = express.Router();

// ── GET /api/usage ──────────────────────────────────────────
// Returns usage summary + limits for the caller's tenant
router.get('/', requireAuth, requirePermission('dashboard', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const summary = await getUsageSummary(tenantId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usage/history ──────────────────────────────────
// Returns monthly usage history for the tenant
router.get('/history', requireAuth, requirePermission('dashboard', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { rows } = await pool.query(
      `SELECT * FROM tenant_usage WHERE tenant_id = $1 ORDER BY period DESC LIMIT 12`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usage/audit ────────────────────────────────────
// Returns audit log for the tenant (admins only)
router.get('/audit', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const resource = req.query.resource;
    const action = req.query.action;

    let where = 'WHERE tenant_id = $1';
    const params = [tenantId];
    let idx = 2;

    if (resource) {
      where += ` AND resource = $${idx++}`;
      params.push(resource);
    }
    if (action) {
      where += ` AND action = $${idx++}`;
      params.push(action);
    }

    const { rows } = await pool.query(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usage/audit/all ────────────────────────────────
// Platform-wide audit log (super_admin only)
router.get('/audit/all', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const { rows } = await pool.query(
      `SELECT a.*, t.name AS tenant_name
       FROM audit_log a
       LEFT JOIN tenants t ON t.id = a.tenant_id
       ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usage/plans ────────────────────────────────────
// Returns all plan tier definitions (public info)
router.get('/plans', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plan_limits ORDER BY max_products');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/usage/plans/:plan ──────────────────────────────
// Update plan limits (super_admin only)
router.put('/plans/:plan', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { plan } = req.params;
    const { max_products, max_customers, max_campaigns_mo, max_team_members,
            max_wa_messages_day, max_ai_calls_day, features, retention_days } = req.body;

    const { rows } = await pool.query(`
      UPDATE plan_limits SET
        max_products = COALESCE($2, max_products),
        max_customers = COALESCE($3, max_customers),
        max_campaigns_mo = COALESCE($4, max_campaigns_mo),
        max_team_members = COALESCE($5, max_team_members),
        max_wa_messages_day = COALESCE($6, max_wa_messages_day),
        max_ai_calls_day = COALESCE($7, max_ai_calls_day),
        features = COALESCE($8, features),
        retention_days = COALESCE($9, retention_days),
        updated_at = NOW()
      WHERE plan = $1
      RETURNING *
    `, [plan, max_products, max_customers, max_campaigns_mo, max_team_members,
        max_wa_messages_day, max_ai_calls_day, features ? JSON.stringify(features) : null, retention_days]);

    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });
    clearLimitsCache();
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usage/all ──────────────────────────────────────
// Platform-wide usage summary (super_admin only)
router.get('/all', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const period = new Date().toISOString().slice(0, 7);
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.plan, t.status,
        u.wa_messages, u.ai_calls, u.campaigns_created, u.api_calls,
        (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id = t.id) AS product_count,
        (SELECT COUNT(*)::int FROM customers c WHERE c.tenant_id = t.id) AS customer_count,
        (SELECT COUNT(*)::int FROM users us WHERE us.tenant_id = t.id) AS team_count
      FROM tenants t
      LEFT JOIN tenant_usage u ON u.tenant_id = t.id AND u.period = $1
      ORDER BY t.name
    `, [period]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
