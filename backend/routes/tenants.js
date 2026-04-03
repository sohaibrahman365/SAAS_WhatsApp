const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/tenants/stats ─────────────────────────────────
// Aggregate stats for the platform (super_admin)
router.get('/stats', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tenants) AS total_tenants,
        (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_tenants,
        (SELECT COUNT(*) FROM tenants WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month,
        (SELECT COALESCE(SUM(mrr), 0) FROM tenants WHERE status = 'active') AS total_mrr
    `);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/tenants
// super_admin → all tenants; others → their own tenant only
router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') {
      const { rows } = await pool.query(`
        SELECT t.*, COUNT(p.id)::int AS product_count
          FROM tenants t
          LEFT JOIN products p ON p.tenant_id = t.id
         GROUP BY t.id
         ORDER BY t.created_at DESC
      `);
      return res.json(rows);
    }

    if (!req.user.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.user.tenantId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants — super_admin only
router.post('/', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name, email, phone, plan, website_url } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO tenants (name, email, phone, plan, website_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, email.toLowerCase().trim(), phone || null, plan || 'starter', website_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/tenants/:id ─────────────────────────────────────
// Update tenant details
router.put('/:id', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name, email, phone, plan, status, mrr, website_url } = req.body;
    const { rows } = await pool.query(`
      UPDATE tenants SET
        name        = COALESCE($2, name),
        email       = COALESCE($3, email),
        phone       = COALESCE($4, phone),
        plan        = COALESCE($5, plan),
        status      = COALESCE($6, status),
        mrr         = COALESCE($7, mrr),
        website_url = COALESCE($8, website_url)
      WHERE id = $1
      RETURNING *
    `, [req.params.id, name, email, phone, plan, status, mrr, website_url]);

    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /api/tenants/:id/status ────────────────────────────
// Quick status toggle (active/suspended)
router.patch('/:id/status', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active, suspended, or cancelled' });
    }
    const { rows } = await pool.query(
      'UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/tenants/:id ──────────────────────────────────
// Remove a tenant (super_admin only, with safety checks)
router.delete('/:id', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [{ rows: tenant }, { rows: users }] = await Promise.all([
      pool.query('SELECT * FROM tenants WHERE id = $1', [req.params.id]),
      pool.query('SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1', [req.params.id]),
    ]);
    if (!tenant[0]) return res.status(404).json({ error: 'Tenant not found' });
    if (users[0].count > 0) {
      return res.status(409).json({
        error: `Cannot delete tenant with ${users[0].count} user(s). Remove or reassign them first.`,
      });
    }

    await pool.query('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    res.json({ deleted: tenant[0].name });
  } catch (err) { next(err); }
});

module.exports = router;
