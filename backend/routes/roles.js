const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');

const router = express.Router();

async function getUserPermissions(userId) {
  const { rows: users } = await pool.query('SELECT role, role_id FROM users WHERE id = $1', [userId]);
  if (!users[0]) return { permissions: [] };

  if (users[0].role === 'super_admin') {
    const { rows: all } = await pool.query('SELECT module, action FROM permissions');
    return { role: 'super_admin', permissions: all };
  }

  if (users[0].role_id) {
    const { rows: perms } = await pool.query(`
      SELECT p.module, p.action FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
    `, [users[0].role_id]);
    return { role_id: users[0].role_id, permissions: perms };
  }

  const { rows: perms } = await pool.query(`
    SELECT p.module, p.action FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r ON r.id = rp.role_id
    WHERE r.slug = $1 AND r.tenant_id IS NULL
  `, [users[0].role]);
  return { role: users[0].role, permissions: perms };
}

// ── GET /api/roles ──────────────────────────────────────────
router.get('/', requireAuth, requirePermission('team', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { rows } = await pool.query(`
      SELECT r.id, r.tenant_id, r.name, r.slug, r.description, r.is_system, r.created_at,
             COUNT(rp.id)::int AS permission_count
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.tenant_id IS NULL OR r.tenant_id = $1
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.name
    `, [tenantId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// NOTE: Static paths must be registered before /:id to avoid Express matching them as params

// ── GET /api/roles/permissions/all ──────────────────────────
router.get('/permissions/all', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM permissions ORDER BY module, action');
    const grouped = {};
    rows.forEach(p => {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    });
    res.json({ permissions: rows, grouped });
  } catch (err) { next(err); }
});

// ── GET /api/roles/user/:userId/permissions ─────────────────
router.get('/user/:userId/permissions', requireAuth, async (req, res, next) => {
  try {
    const perms = await getUserPermissions(req.params.userId);
    res.json(perms);
  } catch (err) { next(err); }
});

// ── GET /api/roles/:id ──────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const [{ rows: roles }, { rows: perms }] = await Promise.all([
      pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id]),
      pool.query(`
        SELECT p.id, p.module, p.action, p.description
          FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1
         ORDER BY p.module, p.action
      `, [req.params.id])
    ]);
    if (!roles[0]) return res.status(404).json({ error: 'Role not found' });
    res.json({ ...roles[0], permissions: perms });
  } catch (err) { next(err); }
});

// ── POST /api/roles ─────────────────────────────────────────
router.post('/', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { name, slug, description, permissionIds } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });

    const roleSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const { rows } = await pool.query(`
      INSERT INTO roles (tenant_id, name, slug, description, is_system)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING *
    `, [tenantId, name, roleSlug, description || '']);

    const role = rows[0];

    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map((pid, i) => `($1, $${i + 2})`).join(',');
      await pool.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${values} ON CONFLICT DO NOTHING`, [role.id, ...permissionIds]);
    }

    res.status(201).json(role);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A role with this slug already exists' });
    next(err);
  }
});

// ── PUT /api/roles/:id ──────────────────────────────────────
router.put('/:id', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, permissionIds } = req.body;

    const { rows: roles } = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (!roles[0]) return res.status(404).json({ error: 'Role not found' });
    if (roles[0].is_system && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'System roles can only be modified by super admins' });
    }

    if (name || description !== undefined) {
      await pool.query(
        'UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
        [name, description, id]
      );
    }

    if (permissionIds) {
      await pool.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      if (permissionIds.length > 0) {
        const values = permissionIds.map((pid, i) => `($1, $${i + 2})`).join(',');
        await pool.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          [id, ...permissionIds]
        );
      }
    }

    // Re-fetch with permissions for response
    const [{ rows: updated }, { rows: perms }] = await Promise.all([
      pool.query('SELECT * FROM roles WHERE id = $1', [id]),
      pool.query(`
        SELECT p.id, p.module, p.action, p.description
          FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1 ORDER BY p.module, p.action
      `, [id])
    ]);

    res.json({ ...updated[0], permissions: perms });
  } catch (err) { next(err); }
});

// ── DELETE /api/roles/:id ───────────────────────────────────
router.delete('/:id', requireAuth, requirePermission('team', 'edit_role'), async (req, res, next) => {
  try {
    const [{ rows }, { rows: users }] = await Promise.all([
      pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id]),
      pool.query('SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1', [req.params.id])
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Role not found' });
    if (rows[0].is_system) return res.status(403).json({ error: 'Cannot delete system roles' });
    if (users[0].count > 0) return res.status(409).json({ error: `${users[0].count} user(s) still assigned to this role. Reassign them first.` });

    await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.json({ deleted: rows[0].name });
  } catch (err) { next(err); }
});

module.exports = { router, getUserPermissions };
