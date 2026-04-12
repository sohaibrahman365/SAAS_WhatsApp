const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { enforceCustomerLimit } = require('../middleware/planLimits');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/customers
router.get('/', requireAuth, requirePermission('customers', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

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
router.post('/', requireAuth, requirePermission('customers', 'create'), enforceCustomerLimit, auditAction('create', 'customer'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
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
router.get('/:id', requireAuth, requirePermission('customers', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

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

// PUT /api/customers/:id — update customer details
router.put('/:id', requireAuth, requirePermission('customers', 'edit'), auditAction('update', 'customer', { getResourceId: (req) => req.params.id }), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { name, phone, email, age, gender, city, region, country } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined)    { sets.push('name = $' + idx++); params.push(name); }
    if (phone !== undefined)   { sets.push('phone = $' + idx++); params.push(phone); }
    if (email !== undefined)   { sets.push('email = $' + idx++); params.push(email || null); }
    if (age !== undefined)     { sets.push('age = $' + idx++); params.push(age || null); }
    if (gender !== undefined)  { sets.push('gender = $' + idx++); params.push(gender || null); }
    if (city !== undefined)    { sets.push('city = $' + idx++); params.push(city || null); }
    if (region !== undefined)  { sets.push('region = $' + idx++); params.push(region || null); }
    if (country !== undefined) { sets.push('country = $' + idx++); params.push(country || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    let query = 'UPDATE customers SET ' + sets.join(', ') + ' WHERE id = $' + idx++;
    params.push(req.params.id);

    if (tenantId) {
      query += ' AND tenant_id = $' + idx++;
      params.push(tenantId);
    }

    query += ' RETURNING *';
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id
router.delete('/:id', requireAuth, requirePermission('customers', 'delete'), auditAction('delete', 'customer', { getResourceId: (req) => req.params.id }), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    let query = 'DELETE FROM customers WHERE id = $1';
    const params = [req.params.id];

    if (tenantId) {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    query += ' RETURNING id, name';
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json({ removed: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
