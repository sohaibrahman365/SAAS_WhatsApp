const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/tenants
// super_admin → all tenants; others → their own tenant only
router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') {
      const { rows } = await pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
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
    const { name, email, phone, plan } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO tenants (name, email, phone, plan)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, email.toLowerCase().trim(), phone || null, plan || 'starter']
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

module.exports = router;
