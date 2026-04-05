const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { ROLES, ASSIGNABLE_ROLES } = require('../constants/roles');
const { enforceTeamLimit } = require('../middleware/planLimits');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// ── GET /api/team ───────────────────────────────────────────
// List team members for the current tenant
router.get('/', requireAuth, requirePermission('team', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    let query, params;

    if (req.user.role === ROLES.SUPER_ADMIN && !req.query.tenantId) {
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
router.post('/invite', requireAuth, requirePermission('team', 'invite'), enforceTeamLimit, auditAction('invite', 'team'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { name, email, role, roleId, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const assignRole = ASSIGNABLE_ROLES.includes(role) ? role : ROLES.ANALYST;

    if (req.user.role === ROLES.ADMIN && assignRole === 'admin') {
      return res.status(403).json({ error: 'Admins cannot invite other admins' });
    }

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
router.patch('/:userId/role', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { userId } = req.params;
    const { role, roleId } = req.body;

    if (role && !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, manager, or analyst' });
    }

    if (req.user.role === ROLES.ADMIN && role === ROLES.ADMIN) {
      return res.status(403).json({ error: 'Admins cannot promote to admin' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

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
router.patch('/:userId/status', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or suspended' });
    }

    if (userId === req.user.userId) {
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
router.delete('/:userId', requireAuth, requirePermission('team', 'remove'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { userId } = req.params;

    if (userId === req.user.userId) {
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
