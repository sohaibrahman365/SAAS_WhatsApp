// Audit Trail Middleware — logs user actions to audit_log table
const pool = require('../config/db');
const { resolveTenantId } = require('./tenantScope');

async function logAudit({ tenantId, userId, userEmail, action, resource, resourceId, details, req }) {
  try {
    await pool.query(`
      INSERT INTO audit_log (tenant_id, user_id, user_email, action, resource, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      tenantId || null,
      userId || null,
      userEmail || null,
      action,
      resource,
      resourceId || null,
      details ? JSON.stringify(details) : null,
      req?.ip || req?.headers?.['x-forwarded-for'] || null,
      req?.headers?.['user-agent'] || null,
    ]);
  } catch (err) {
    console.error('[audit] Failed to log:', err.message);
  }
}

// Middleware factory: wraps a route handler to auto-log after success
function auditAction(action, resource, opts = {}) {
  return (req, res, next) => {
    // Store original json to intercept response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Only log on success (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const tenantId = resolveTenantId(req) || req.body?.tenantId || data?.tenant_id;
        const resourceId = opts.getResourceId
          ? opts.getResourceId(req, data)
          : req.params?.id || data?.id || null;

        const details = opts.getDetails
          ? opts.getDetails(req, data)
          : undefined;

        logAudit({
          tenantId,
          userId: req.user?.userId,
          userEmail: req.user?.email,
          action,
          resource,
          resourceId: String(resourceId),
          details,
          req,
        });
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { logAudit, auditAction };
