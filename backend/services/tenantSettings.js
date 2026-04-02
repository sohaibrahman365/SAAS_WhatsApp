// Tenant Settings Service — loads per-tenant API credentials with caching
const pool = require('../config/db');

// In-memory cache: tenantId → { settings, loadedAt }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTenantSettings(tenantId) {
  if (!tenantId) return null;

  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.settings;
  }

  const { rows } = await pool.query(
    'SELECT * FROM tenant_settings WHERE tenant_id = $1',
    [tenantId]
  );

  const settings = rows[0] || null;
  cache.set(tenantId, { settings, loadedAt: Date.now() });
  return settings;
}

function clearCache(tenantId) {
  if (tenantId) {
    cache.delete(tenantId);
  } else {
    cache.clear();
  }
}

// Get WhatsApp credentials for a tenant (falls back to platform env vars)
async function getWhatsAppCredentials(tenantId) {
  const ts = await getTenantSettings(tenantId);
  return {
    token: ts?.whatsapp_api_token || process.env.WHATSAPP_API_TOKEN,
    phoneNumberId: ts?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: ts?.whatsapp_verify_token || process.env.WHATSAPP_VERIFY_TOKEN,
    businessName: ts?.whatsapp_business_name || 'GeniSearch',
    isConfigured: !!(ts?.whatsapp_api_token || process.env.WHATSAPP_API_TOKEN),
  };
}

// Get AI credentials + knowledge base for a tenant (falls back to platform env vars)
async function getAICredentials(tenantId) {
  const ts = await getTenantSettings(tenantId);
  return {
    apiKey: ts?.anthropic_api_key || process.env.ANTHROPIC_API_KEY,
    promptContext: ts?.ai_prompt_context || '',
    businessSemantics: ts?.ai_business_semantics || '',
    replyTone: ts?.ai_reply_tone || 'professional',
    industry: ts?.ai_industry || '',
    targetAudience: ts?.ai_target_audience || '',
    sampleReplies: ts?.ai_sample_replies || '',
    webpageUrl: ts?.business_webpage_url || '',
    knowledgeBase: ts?.business_knowledge_base || '',
    model: ts?.ai_model || 'claude-haiku-4-5-20250401',
    isConfigured: !!(ts?.anthropic_api_key || process.env.ANTHROPIC_API_KEY),
  };
}

// Get n8n credentials for a tenant (falls back to platform env vars)
async function getWebhookCredentials(tenantId) {
  const ts = await getTenantSettings(tenantId);
  const url = ts?.n8n_webhook_url || process.env.N8N_WEBHOOK_URL;
  return {
    url,
    isConfigured: !!(url && !url.startsWith('xxx')),
  };
}

module.exports = {
  getTenantSettings,
  clearCache,
  getWhatsAppCredentials,
  getAICredentials,
  getWebhookCredentials,
};
