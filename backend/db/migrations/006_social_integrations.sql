-- Migration 006: Social media integration fields on tenant_settings
-- Each tenant connects their own social media accounts

-- ── TikTok Shop ─────────────────────────────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tiktok_shop_id TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;

-- ── Google ──────────────────────────────────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS google_api_key TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS google_my_business_id TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS google_ads_customer_id TEXT;

-- ── YouTube ─────────────────────────────────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS youtube_api_key TEXT;

-- ── Instagram (via META Graph API, same token as FB) ────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS instagram_business_id TEXT;

-- ── Snapchat (future-proof) ─────────────────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS snapchat_access_token TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS snapchat_ad_account_id TEXT;

-- ── Platform-level config tracking ──────────────────────────
-- Track which integrations are enabled at the platform level
-- so the super_admin can see a unified status
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS integrations_enabled JSONB DEFAULT '{}';
