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
    const sensitiveFields = [
      'whatsapp_api_token', 'anthropic_api_key', 'meta_access_token',
      'tiktok_access_token', 'google_api_key', 'youtube_api_key',
      'snapchat_access_token',
    ];
    for (const f of sensitiveFields) {
      if (s[f]) s[f] = maskKey(s[f]);
    }
    s.configured = true;

    res.json(s);
  } catch (err) {
    next(err);
  }
});

// ── PUT|PATCH /api/tenant-settings ─────────────────────────
// Create or update settings for a tenant (upsert)
const upsertHandler = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const b = req.body;

    // All supported fields — order matters for parameter positions
    const fields = [
      'whatsapp_api_token', 'whatsapp_phone_number_id', 'whatsapp_verify_token', 'whatsapp_business_name',
      'anthropic_api_key', 'ai_prompt_context', 'ai_model',
      'n8n_webhook_url',
      'business_domain', 'business_logo_url', 'business_description',
      'meta_page_id', 'meta_catalog_id', 'meta_access_token', 'google_analytics_id',
      'default_language', 'timezone',
      // Social media integrations (tenant-level)
      'tiktok_access_token', 'tiktok_shop_id', 'tiktok_pixel_id',
      'google_api_key', 'google_my_business_id', 'google_ads_customer_id',
      'youtube_channel_id', 'youtube_api_key',
      'instagram_business_id',
      'snapchat_access_token', 'snapchat_ad_account_id',
    ];

    // Text fields that accept empty-string updates (free-text content)
    const textFields = new Set([
      'ai_prompt_context', 'business_description',
    ]);

    const values = fields.map(f => b[f] !== undefined ? b[f] : null);
    const placeholders = fields.map((_, i) => `$${i + 2}`).join(',');
    const insertCols = fields.join(', ');
    const updateClauses = fields.map((f, i) => {
      const p = `$${i + 2}`;
      return textFields.has(f)
        ? `${f} = COALESCE(${p}, tenant_settings.${f})`
        : `${f} = COALESCE(NULLIF(${p},''), tenant_settings.${f})`;
    }).join(',\n        ');

    const { rows } = await pool.query(`
      INSERT INTO tenant_settings (tenant_id, ${insertCols})
      VALUES ($1, ${placeholders})
      ON CONFLICT (tenant_id) DO UPDATE SET
        ${updateClauses},
        updated_at = NOW()
      RETURNING *
    `, [tenantId, ...values]);

    clearCache(tenantId);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};
router.put('/', requireAuth, requirePermission('settings', 'edit'), upsertHandler);
router.patch('/', requireAuth, requirePermission('settings', 'edit'), upsertHandler);

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
      whatsapp:  { configured: !!(s?.whatsapp_api_token || hasEnvWA), source: s?.whatsapp_api_token ? 'tenant' : hasEnvWA ? 'platform' : 'none' },
      ai:        { configured: !!(s?.anthropic_api_key || hasEnvAI),  source: s?.anthropic_api_key ? 'tenant' : hasEnvAI ? 'platform' : 'none' },
      webhooks:  { configured: !!(s?.n8n_webhook_url || hasEnvN8N),   source: s?.n8n_webhook_url ? 'tenant' : hasEnvN8N ? 'platform' : 'none' },
      meta:      { configured: !!(s?.meta_access_token),              source: s?.meta_access_token ? 'tenant' : 'none' },
      tiktok:    { configured: !!(s?.tiktok_access_token),            source: s?.tiktok_access_token ? 'tenant' : 'none' },
      google:    { configured: !!(s?.google_api_key || s?.google_my_business_id), source: s?.google_api_key ? 'tenant' : 'none' },
      youtube:   { configured: !!(s?.youtube_api_key),                source: s?.youtube_api_key ? 'tenant' : 'none' },
      instagram: { configured: !!(s?.instagram_business_id),          source: s?.instagram_business_id ? 'tenant' : 'none' },
      snapchat:  { configured: !!(s?.snapchat_access_token),          source: s?.snapchat_access_token ? 'tenant' : 'none' },
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
      'anthropic_api_key', 'n8n_webhook_url', 'meta_page_id', 'meta_access_token', 'google_analytics_id',
      'tiktok_access_token', 'tiktok_shop_id', 'tiktok_pixel_id',
      'google_api_key', 'google_my_business_id', 'google_ads_customer_id',
      'youtube_channel_id', 'youtube_api_key',
      'instagram_business_id',
      'snapchat_access_token', 'snapchat_ad_account_id',
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
