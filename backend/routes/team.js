const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: tenant scope
function resolvedTenantId(req) {
  if (req.user.role === 'super_admin' && req.query.tenantId) return req.query.tenantId;
  return req.user.tenantId;
}

// ── GET /api/team ───────────────────────────────────────────
// List team members for the current tenant
router.get('/', requireAuth, requireRole('super_admin', 'admin', 'manager'), async (req, res, next) => {
  try {
    const tenantId = resolvedTenantId(req);
    let query, params;

    if (req.user.role === 'super_admin' && !req.query.tenantId) {
      // Super admin without tenantId filter: show all users
      query = `
        SELECT u.id, u.name, u.email, u.role, u.role_id, u.status, u.created_at, u.invited_at,
               t.name AS tenant_name, t.id AS tenant_id,
               r.name AS role_name, r.slug AS role_slug
          FROM users u
          LEFT JOIN tenants t ON t.id = u.tenant_id
          LEFT JOIN roles r ON r.id = u.role_id
         ORDER BY u.created_at DESC
      `;
      params = [];
    } else {
      if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
      query = `
        SELECT u.id, u.name, u.email, u.role, u.role_id, u.status, u.created_at, u.invited_at,
               t.name AS tenant_name,
               r.name AS role_name, r.slug AS role_slug
          FROM users u
          LEFT JOIN tenants t ON t.id = u.tenant_id
          LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.tenant_id = $1
         ORDER BY u.created_at DESC
      `;
      params = [tenantId];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/team/invite ───────────────────────────────────
// Invite a new team member to the tenant
router.post('/invite', requireAuth, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const tenantId = resolvedTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { name, email, role, roleId, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    // Validate role — cannot invite super_admin
    const allowedRoles = ['admin', 'manager', 'analyst'];
    const assignRole = allowedRoles.includes(role) ? role : 'analyst';

    // Admin can only invite manager/analyst, not other admins
    if (req.user.role === 'admin' && assignRole === 'admin') {
      return res.status(403).json({ error: 'Admins cannot invite other admins' });
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, role_id, tenant_id, invited_by, invited_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, name, email, role, role_id, tenant_id, status, created_at, invited_at
    `, [name || email.split('@')[0], email, hash, assignRole, roleId || null, tenantId, req.user.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/team/:userId/role ────────────────────────────
// Change a team member's role (supports both legacy role string and dynamic role_id)
router.patch('/:userId/role', requireAuth, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const tenantId = resolvedTenantId(req);
    const { userId } = req.params;
    const { role, roleId } = req.body;

    const allowedRoles = ['admin', 'manager', 'analyst'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, manager, or analyst' });
    }

    // Admin can only assign manager/analyst
    if (req.user.role === 'admin' && role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot promote to admin' });
    }

    // Cannot change own role
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Build dynamic SET clause
    const sets = [];
    const params = [];
    let idx = 1;

    if (role) {
      sets.push('role = $' + idx++);
      params.push(role);
    }
    if (roleId !== undefined) {
      sets.push('role_id = $' + idx++);
      params.push(roleId || null);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Provide role or roleId' });
    }

    let query = 'UPDATE users SET ' + sets.join(', ') + ' WHERE id = $' + idx++;
    params.push(userId);

    if (req.user.role !== 'super_admin') {
      query += ' AND tenant_id = $' + idx++;
      params.push(tenantId);
    }

    query += ' RETURNING id, name, email, role, role_id, status';
    const { rows } = await pool.query(query, params);

    if (!rows[0]) return res.status(404).json({ error: 'User not found in your tenant' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/team/:userId/status ──────────────────────────
// Activate or suspend a team member
router.patch('/:userId/status', requireAuth, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const tenantId = resolvedTenantId(req);
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or suspended' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    let query = 'UPDATE users SET status = $1 WHERE id = $2';
    const params = [status, userId];

    if (req.user.role !== 'super_admin') {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }

    query += ' RETURNING id, name, email, role, status';
    const { rows } = await pool.query(query, params);

    if (!rows[0]) return res.status(404).json({ error: 'User not found in your tenant' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/team/:userId ────────────────────────────────
// Remove a team member
router.delete('/:userId', requireAuth, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const tenantId = resolvedTenantId(req);
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    let query = 'DELETE FROM users WHERE id = $1';
    const params = [userId];

    if (req.user.role !== 'super_admin') {
      query += ' AND tenant_id = $2';
      params.push(tenantId);
    }

    query += ' RETURNING id, name, email';
    const { rows } = await pool.query(query, params);

    if (!rows[0]) return res.status(404).json({ error: 'User not found in your tenant' });
    res.json({ removed: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
