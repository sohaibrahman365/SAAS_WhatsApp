const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { enforceProductLimit } = require('../middleware/planLimits');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/products
router.get('/', requireAuth, requirePermission('products', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC';
      params = [tenantId];
    } else if (req.user.role === 'super_admin') {
      query  = 'SELECT * FROM products ORDER BY created_at DESC';
      params = [];
    } else {
      return res.status(400).json({ error: 'No tenant assigned' });
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', requireAuth, requirePermission('products', 'create'), enforceProductLimit, auditAction('create', 'product'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const {
      name, price, description, image_url, categories,
      region, country, province, city, timezone,
      target_age_min, target_age_max, target_genders,
      preferences, activity_filter,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO products
         (tenant_id, name, price, description, image_url, categories,
          region, country, province, city, timezone,
          target_age_min, target_age_max, target_genders, preferences, activity_filter)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        tenantId, name,
        price           ?? null,
        description     || null,
        image_url       || null,
        JSON.stringify(categories    || []),
        region          || null,
        country         || null,
        province        || null,
        city            || null,
        timezone        || null,
        target_age_min  ?? null,
        target_age_max  ?? null,
        JSON.stringify(target_genders || []),
        JSON.stringify(preferences    || []),
        activity_filter || '7d',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', requireAuth, requirePermission('products', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM products WHERE id = $1 AND tenant_id = $2';
      params = [req.params.id, tenantId];
    } else {
      query  = 'SELECT * FROM products WHERE id = $1';
      params = [req.params.id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
