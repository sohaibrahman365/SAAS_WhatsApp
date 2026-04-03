// Shared tenant resolution — extracts the effective tenant ID from the request.
// super_admin can override via ?tenantId query param; others always use their JWT tenant.

function resolveTenantId(req) {
  if (req.user.role === 'super_admin' && req.query.tenantId) return req.query.tenantId;
  return req.user.tenantId;
}

module.exports = { resolveTenantId };
