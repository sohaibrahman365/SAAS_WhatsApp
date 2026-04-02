-- ============================================================
-- GeniSearch — Tenant Settings & Team Management
-- Migration: 003_tenant_settings.sql
-- ============================================================

-- ── TENANT SETTINGS ─────────────────────────────────────────
-- Per-tenant API credentials, business info, and configuration
CREATE TABLE IF NOT EXISTS tenant_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- WhatsApp Cloud API (per-tenant)
    whatsapp_api_token      TEXT,
    whatsapp_phone_number_id VARCHAR(50),
    whatsapp_verify_token   VARCHAR(255),
    whatsapp_business_name  VARCHAR(255),
    -- AI / Anthropic (per-tenant)
    anthropic_api_key       TEXT,
    ai_prompt_context       TEXT,           -- custom business context for AI analysis
    ai_model                VARCHAR(100) DEFAULT 'claude-haiku-4-5-20250401',
    -- n8n Automation (per-tenant)
    n8n_webhook_url         TEXT,
    -- Business Info
    business_domain         VARCHAR(255),
    business_logo_url       TEXT,
    business_description    TEXT,
    -- External Integrations
    meta_page_id            VARCHAR(100),
    google_analytics_id     VARCHAR(50),
    -- Defaults
    default_language        VARCHAR(10) DEFAULT 'en',
    timezone                VARCHAR(50) DEFAULT 'Asia/Karachi',
    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);

-- Auto-update trigger
CREATE OR REPLACE TRIGGER trg_tenant_settings_updated_at
    BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Add invitation fields to users table ────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
