// Plan Limits Middleware — enforces resource limits per tenant plan
const { resolveTenantId } = require('./tenantScope');
const {
  checkProductLimit,
  checkCustomerLimit,
  checkCampaignLimit,
  checkTeamLimit,
  checkDailyUsage,
  hasFeature,
} = require('../services/planLimits');

function limitError(res, resource, result) {
  return res.status(402).json({
    error: `Plan limit reached: ${resource}`,
    limit: result.limit,
    current: result.current,
    plan: result.plan,
    upgrade: 'Upgrade your plan to increase limits',
  });
}

// Middleware factories for resource limits
function enforceProductLimit(req, res, next) {
  const tenantId = resolveTenantId(req) || req.body.tenantId;
  if (!tenantId) return next();
  // super_admin bypass
  if (req.user.role === 'super_admin') return next();

  checkProductLimit(tenantId)
    .then(r => r.allowed ? next() : limitError(res, 'products', r))
    .catch(next);
}

function enforceCustomerLimit(req, res, next) {
  const tenantId = resolveTenantId(req) || req.body.tenantId;
  if (!tenantId) return next();
  if (req.user.role === 'super_admin') return next();

  checkCustomerLimit(tenantId)
    .then(r => r.allowed ? next() : limitError(res, 'customers', r))
    .catch(next);
}

function enforceCampaignLimit(req, res, next) {
  const tenantId = resolveTenantId(req) || req.body.tenantId;
  if (!tenantId) return next();
  if (req.user.role === 'super_admin') return next();

  checkCampaignLimit(tenantId)
    .then(r => r.allowed ? next() : limitError(res, 'campaigns', r))
    .catch(next);
}

function enforceTeamLimit(req, res, next) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) return next();
  if (req.user.role === 'super_admin') return next();

  checkTeamLimit(tenantId)
    .then(r => r.allowed ? next() : limitError(res, 'team_members', r))
    .catch(next);
}

function enforceMessageLimit(req, res, next) {
  const tenantId = resolveTenantId(req) || req.body.tenantId;
  if (!tenantId) return next();
  if (req.user.role === 'super_admin') return next();

  checkDailyUsage(tenantId, 'wa_messages')
    .then(r => r.allowed ? next() : limitError(res, 'daily WhatsApp messages', r))
    .catch(next);
}

function enforceAILimit(req, res, next) {
  const tenantId = resolveTenantId(req) || req.body.tenantId;
  if (!tenantId) return next();
  if (req.user.role === 'super_admin') return next();

  checkDailyUsage(tenantId, 'ai_calls')
    .then(r => r.allowed ? next() : limitError(res, 'daily AI calls', r))
    .catch(next);
}

// Feature flag middleware factory
function requireFeature(feature) {
  return (req, res, next) => {
    if (req.user.role === 'super_admin') return next();

    const tenantId = resolveTenantId(req);
    if (!tenantId) return next();

    hasFeature(tenantId, feature)
      .then(has => {
        if (has) return next();
        res.status(402).json({
          error: `Feature not available: ${feature}`,
          plan: 'Upgrade your plan to access this feature',
        });
      })
      .catch(next);
  };
}

module.exports = {
  enforceProductLimit,
  enforceCustomerLimit,
  enforceCampaignLimit,
  enforceTeamLimit,
  enforceMessageLimit,
  enforceAILimit,
  requireFeature,
};
