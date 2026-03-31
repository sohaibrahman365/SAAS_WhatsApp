const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function tenantScope(req) {
  if (req.user.role === 'super_admin') return req.query.tenantId || null;
  return req.user.tenantId;
}

// GET /api/customers
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const tenantId = tenantScope(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM customers WHERE tenant_id = $1 ORDER BY created_at DESC';
      params = [tenantId];
    } else if (req.user.role === 'super_admin') {
      query  = 'SELECT * FROM customers ORDER BY created_at DESC';
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

// POST /api/customers
router.post('/', requireAuth, requireRole('super_admin', 'admin', 'manager'), async (req, res, next) => {
  try {
    const tenantId = tenantScope(req) || req.body.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const { name, phone, email, age, gender, city, region, country, source } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const { rows } = await pool.query(
      `INSERT INTO customers (tenant_id, name, phone, email, age, gender, city, region, country, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, phone) DO UPDATE
         SET name   = EXCLUDED.name,
             email  = EXCLUDED.email,
             age    = EXCLUDED.age,
             gender = EXCLUDED.gender,
             city   = EXCLUDED.city,
             region = EXCLUDED.region,
             country = EXCLUDED.country
       RETURNING *`,
      [
        tenantId,
        name    || null,
        phone,
        email   || null,
        age     ?? null,
        gender  || null,
        city    || null,
        region  || null,
        country || null,
        source  || 'web_search',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const tenantId = tenantScope(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2';
      params = [req.params.id, tenantId];
    } else {
      query  = 'SELECT * FROM customers WHERE id = $1';
      params = [req.params.id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
