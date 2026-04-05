const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All platform config endpoints are super_admin only
router.use(requireAuth, requireRole('super_admin'));

// ── GET /api/platform/config ────────────────────────────────
// Shows which master-level integrations are configured (never exposes raw keys)
router.get('/config', (req, res) => {
  const maskEnv = (key) => {
    const val = process.env[key];
    if (!val || val.startsWith('xxx')) return { set: false, value: null };
    return { set: true, value: val.slice(0, 4) + '****' + val.slice(-4) };
  };

  const boolEnv = (key) => {
    const val = process.env[key];
    return { set: !!(val && !val.startsWith('xxx')), value: val ? '(configured)' : null };
  };

  res.json({
    platform: 'GeniSearch SaaS',
    environment: process.env.NODE_ENV || 'development',

    // Master-level integrations (SaaS owner pays)
    master: {
      database:  { configured: true, note: 'PostgreSQL connected via DATABASE_URL' },
      auth:      { configured: !!process.env.JWT_SECRET, note: 'JWT signing' },
      anthropic: maskEnv('ANTHROPIC_API_KEY'),
      n8n:       maskEnv('N8N_WEBHOOK_URL'),
      whatsapp: {
        token:         maskEnv('WHATSAPP_API_TOKEN'),
        phoneNumberId: boolEnv('WHATSAPP_PHONE_NUMBER_ID'),
        apiVersion:    { set: true, value: process.env.WHATSAPP_API_VERSION || 'v19.0' },
        webhookVerify: boolEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
      },
      google_oauth: {
        clientId:     boolEnv('GOOGLE_CLIENT_ID'),
        clientSecret: boolEnv('GOOGLE_CLIENT_SECRET'),
        callbackUrl:  { set: !!process.env.GOOGLE_CALLBACK_URL, value: process.env.GOOGLE_CALLBACK_URL || null },
      },
      cors: { value: process.env.CORS_ORIGIN || '*' },
    },

    // What tenants can connect (tenant-level — just show the schema)
    tenant_integrations: [
      { key: 'whatsapp',  label: 'WhatsApp Business', fields: ['whatsapp_api_token', 'whatsapp_phone_number_id', 'whatsapp_verify_token', 'whatsapp_business_name'], note: 'Own WhatsApp Business number' },
      { key: 'meta',      label: 'META (Facebook/Instagram)', fields: ['meta_access_token', 'meta_page_id', 'meta_catalog_id', 'instagram_business_id'], note: 'Product catalog, page insights, Instagram' },
      { key: 'tiktok',    label: 'TikTok Shop', fields: ['tiktok_access_token', 'tiktok_shop_id', 'tiktok_pixel_id'], note: 'Product catalog sync, ad pixel' },
      { key: 'google',    label: 'Google Business', fields: ['google_api_key', 'google_my_business_id', 'google_ads_customer_id', 'google_analytics_id'], note: 'Reviews, ads, analytics' },
      { key: 'youtube',   label: 'YouTube', fields: ['youtube_channel_id', 'youtube_api_key'], note: 'Product videos, channel analytics' },
      { key: 'snapchat',  label: 'Snapchat', fields: ['snapchat_access_token', 'snapchat_ad_account_id'], note: 'Ad campaigns' },
      { key: 'ai',        label: 'Anthropic (Override)', fields: ['anthropic_api_key', 'ai_model'], note: 'Custom AI key (optional — platform provides default)' },
      { key: 'n8n',       label: 'n8n Webhooks (Override)', fields: ['n8n_webhook_url'], note: 'Custom automation workflows' },
    ],
  });
});

// ── PUT /api/platform/env ───────────────────────────────────
// Update a master-level env var (writes to process.env at runtime)
// Note: For persistence, these must also be set on Railway/hosting
router.put('/env', (req, res) => {
  const allowed = [
    'ANTHROPIC_API_KEY', 'N8N_WEBHOOK_URL',
    'WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL',
    'CORS_ORIGIN',
  ];

  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key) && typeof value === 'string') {
      process.env[key] = value;
      updates[key] = true;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided' });
  }

  res.json({
    updated: Object.keys(updates),
    note: 'Runtime updated. Set these on Railway for persistence across deploys.',
  });
});

// ── GET /api/platform/health ────────────────────────────────
// Deep health check — tests each master integration
router.get('/health', async (req, res) => {
  const checks = {};

  // Test Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && !anthropicKey.startsWith('xxx')) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      checks.anthropic = { status: r.ok ? 'ok' : 'error', code: r.status };
    } catch (e) {
      checks.anthropic = { status: 'error', error: e.message };
    }
  } else {
    checks.anthropic = { status: 'not_configured' };
  }

  // Test WhatsApp
  const waToken = process.env.WHATSAPP_API_TOKEN;
  const waPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (waToken && waPhone && !waToken.startsWith('xxx')) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${waPhone}?access_token=${waToken}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const d = await r.json();
      checks.whatsapp = { status: r.ok ? 'ok' : 'error', name: d.verified_name || d.display_phone_number || null };
    } catch (e) {
      checks.whatsapp = { status: 'error', error: e.message };
    }
  } else {
    checks.whatsapp = { status: 'not_configured' };
  }

  // n8n — just check if URL is set (no auth-free ping endpoint guaranteed)
  checks.n8n = process.env.N8N_WEBHOOK_URL && !process.env.N8N_WEBHOOK_URL.startsWith('xxx')
    ? { status: 'configured', url: process.env.N8N_WEBHOOK_URL.replace(/\/[^/]+$/, '/...') }
    : { status: 'not_configured' };

  res.json({ checks, timestamp: new Date().toISOString() });
});

module.exports = router;
