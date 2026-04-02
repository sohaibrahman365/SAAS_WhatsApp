const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// requireRole('admin', 'super_admin') — pass one or more allowed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// requirePermission('campaigns', 'launch') — check dynamic permission
function requirePermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    // Super admin bypasses all permission checks
    if (req.user.role === 'super_admin') return next();

    try {
      let hasPermission = false;

      // Check via role_id (dynamic role)
      if (req.user.roleId) {
        const { rows } = await pool.query(`
          SELECT 1 FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = $1 AND p.module = $2 AND p.action = $3
        `, [req.user.roleId, module, action]);
        hasPermission = rows.length > 0;
      }

      // Fallback: check via legacy role slug
      if (!hasPermission && req.user.role) {
        const { rows } = await pool.query(`
          SELECT 1 FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          JOIN roles r ON r.id = rp.role_id
          WHERE r.slug = $1 AND r.tenant_id IS NULL AND p.module = $2 AND p.action = $3
        `, [req.user.role, module, action]);
        hasPermission = rows.length > 0;
      }

      if (!hasPermission) {
        return res.status(403).json({ error: `Permission denied: ${module}.${action}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireRole, requirePermission };
