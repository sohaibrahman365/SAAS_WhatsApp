-- Migration 007: Alerts system, Email config, CRM tags, Google OAuth support
-- Covers: WhatsApp alerts, email reports, customer tagging, auth provider tracking

-- ── 1. Google OAuth: auth provider tracking ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';

-- ── 2. Alert configurations ────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_configurations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type      VARCHAR(50) NOT NULL,
    enabled         BOOLEAN DEFAULT TRUE,
    notify_phones   JSONB DEFAULT '[]',
    notify_emails   JSONB DEFAULT '[]',
    threshold       JSONB DEFAULT '{}',
    schedule        VARCHAR(30),
    report_format   VARCHAR(20) DEFAULT 'text',
    last_sent_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_alert_config_tenant ON alert_configurations(tenant_id);

-- Alert log
CREATE TABLE IF NOT EXISTS alert_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type      VARCHAR(50) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    recipient       VARCHAR(255) NOT NULL,
    message_preview TEXT,
    status          VARCHAR(20) DEFAULT 'sent',
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_tenant ON alert_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_created ON alert_log(created_at);

-- ── 3. Customer tags for CRM ───────────────────────────────
CREATE TABLE IF NOT EXISTS customer_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tag         VARCHAR(50) NOT NULL,
    source      VARCHAR(20) DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, customer_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant ON customer_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_customer ON customer_tags(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag ON customer_tags(tag);

-- ── 4. Email config on tenant_settings ─────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_port INT DEFAULT 587;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_pass TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sendgrid_api_key TEXT;

-- ── 5. SaaS owner alert config ─────────────────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS alert_phones JSONB DEFAULT '[]';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS alert_emails JSONB DEFAULT '[]';

-- ── 6. New permissions ─────────────────────────────────────
INSERT INTO permissions (module, action, description) VALUES
  ('alerts', 'view', 'View alert configurations'),
  ('alerts', 'manage', 'Configure alert settings'),
  ('crm', 'view', 'View CRM dashboard'),
  ('crm', 'edit', 'Edit customer tags and details'),
  ('crm', 'bulk_action', 'Perform bulk WhatsApp/Email actions'),
  ('email', 'view', 'View email configuration'),
  ('email', 'manage', 'Configure email settings'),
  ('email', 'send', 'Send emails')
ON CONFLICT (module, action) DO NOTHING;

-- Grant new permissions to admin system role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND r.tenant_id IS NULL
  AND p.module IN ('alerts', 'crm', 'email')
ON CONFLICT DO NOTHING;

-- Trigger for alert_configurations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_config_updated ON alert_configurations;
CREATE TRIGGER trg_alert_config_updated
    BEFORE UPDATE ON alert_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
