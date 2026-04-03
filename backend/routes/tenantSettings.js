const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { clearCache } = require('../services/tenantSettings');

const router = express.Router();

// ── GET /api/tenant-settings ────────────────────────────────
// Returns settings for the caller's tenant (or ?tenantId= for super_admin)
router.get('/', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { rows } = await pool.query(
      'SELECT * FROM tenant_settings WHERE tenant_id = $1',
      [tenantId]
    );

    if (!rows[0]) {
      return res.json({ tenant_id: tenantId, configured: false });
    }

    // Mask sensitive keys for display
    const s = { ...rows[0] };
    if (s.whatsapp_api_token) s.whatsapp_api_token = maskKey(s.whatsapp_api_token);
    if (s.anthropic_api_key) s.anthropic_api_key = maskKey(s.anthropic_api_key);
    s.configured = true;

    res.json(s);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/tenant-settings ────────────────────────────────
// Create or update settings for a tenant (upsert)
router.put('/', requireAuth, requirePermission('settings', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const {
      whatsapp_api_token, whatsapp_phone_number_id, whatsapp_verify_token, whatsapp_business_name,
      anthropic_api_key, ai_prompt_context, ai_model,
      n8n_webhook_url,
      business_domain, business_logo_url, business_description,
      meta_page_id, google_analytics_id,
      default_language, timezone,
    } = req.body;

    const { rows } = await pool.query(`
      INSERT INTO tenant_settings (
        tenant_id,
        whatsapp_api_token, whatsapp_phone_number_id, whatsapp_verify_token, whatsapp_business_name,
        anthropic_api_key, ai_prompt_context, ai_model,
        n8n_webhook_url,
        business_domain, business_logo_url, business_description,
        meta_page_id, google_analytics_id,
        default_language, timezone
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (tenant_id) DO UPDATE SET
        whatsapp_api_token      = COALESCE(NULLIF($2,''), tenant_settings.whatsapp_api_token),
        whatsapp_phone_number_id = COALESCE(NULLIF($3,''), tenant_settings.whatsapp_phone_number_id),
        whatsapp_verify_token   = COALESCE(NULLIF($4,''), tenant_settings.whatsapp_verify_token),
        whatsapp_business_name  = COALESCE(NULLIF($5,''), tenant_settings.whatsapp_business_name),
        anthropic_api_key       = COALESCE(NULLIF($6,''), tenant_settings.anthropic_api_key),
        ai_prompt_context       = COALESCE($7, tenant_settings.ai_prompt_context),
        ai_model                = COALESCE(NULLIF($8,''), tenant_settings.ai_model),
        n8n_webhook_url         = COALESCE(NULLIF($9,''), tenant_settings.n8n_webhook_url),
        business_domain         = COALESCE(NULLIF($10,''), tenant_settings.business_domain),
        business_logo_url       = COALESCE(NULLIF($11,''), tenant_settings.business_logo_url),
        business_description    = COALESCE($12, tenant_settings.business_description),
        meta_page_id            = COALESCE(NULLIF($13,''), tenant_settings.meta_page_id),
        google_analytics_id     = COALESCE(NULLIF($14,''), tenant_settings.google_analytics_id),
        default_language        = COALESCE(NULLIF($15,''), tenant_settings.default_language),
        timezone                = COALESCE(NULLIF($16,''), tenant_settings.timezone),
        updated_at              = NOW()
      RETURNING *
    `, [
      tenantId,
      whatsapp_api_token, whatsapp_phone_number_id, whatsapp_verify_token, whatsapp_business_name,
      anthropic_api_key, ai_prompt_context, ai_model,
      n8n_webhook_url,
      business_domain, business_logo_url, business_description,
      meta_page_id, google_analytics_id,
      default_language, timezone,
    ]);

    clearCache(tenantId);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/tenant-settings/status ─────────────────────────
// Quick status check: which integrations are configured for this tenant?
router.get('/status', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { rows } = await pool.query(
      'SELECT * FROM tenant_settings WHERE tenant_id = $1', [tenantId]
    );
    const s = rows[0];
    const hasEnvWA = !!(process.env.WHATSAPP_API_TOKEN && !process.env.WHATSAPP_API_TOKEN.startsWith('xxx'));
    const hasEnvAI = !!(process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('xxx'));
    const hasEnvN8N = !!(process.env.N8N_WEBHOOK_URL && !process.env.N8N_WEBHOOK_URL.startsWith('xxx'));

    res.json({
      whatsapp: { configured: !!(s?.whatsapp_api_token || hasEnvWA), source: s?.whatsapp_api_token ? 'tenant' : hasEnvWA ? 'platform' : 'none' },
      ai:       { configured: !!(s?.anthropic_api_key || hasEnvAI),  source: s?.anthropic_api_key ? 'tenant' : hasEnvAI ? 'platform' : 'none' },
      webhooks: { configured: !!(s?.n8n_webhook_url || hasEnvN8N),   source: s?.n8n_webhook_url ? 'tenant' : hasEnvN8N ? 'platform' : 'none' },
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/tenant-settings/key/:field ───────────────────
// Clear a specific API key (set to NULL)
router.delete('/key/:field', requireAuth, requirePermission('settings', 'manage_api_keys'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const allowed = [
      'whatsapp_api_token', 'whatsapp_phone_number_id', 'whatsapp_verify_token',
      'anthropic_api_key', 'n8n_webhook_url', 'meta_page_id', 'google_analytics_id',
    ];
    const field = req.params.field;
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });

    await pool.query(
      `UPDATE tenant_settings SET ${field} = NULL, updated_at = NOW() WHERE tenant_id = $1`,
      [tenantId]
    );
    clearCache(tenantId);
    res.json({ cleared: field });
  } catch (err) {
    next(err);
  }
});

function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = router;
