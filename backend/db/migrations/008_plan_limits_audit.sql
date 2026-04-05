-- ============================================================
-- GeniSearch — Plan Limits, Feature Flags, Usage Tracking & Audit Trail
-- Migration: 008_plan_limits_audit.sql
-- ============================================================

-- ── PLAN LIMITS ─────────────────────────────────────────────
-- Defines resource limits and feature gates per plan tier
CREATE TABLE IF NOT EXISTS plan_limits (
    plan              VARCHAR(50) PRIMARY KEY,
    max_products      INT NOT NULL DEFAULT 100,
    max_customers     INT NOT NULL DEFAULT 500,
    max_campaigns_mo  INT NOT NULL DEFAULT 10,       -- per month
    max_team_members  INT NOT NULL DEFAULT 3,
    max_wa_messages_day INT NOT NULL DEFAULT 100,     -- WhatsApp messages per day
    max_ai_calls_day  INT NOT NULL DEFAULT 50,        -- AI analysis calls per day
    features          JSONB NOT NULL DEFAULT '{}',    -- feature flags
    retention_days    INT NOT NULL DEFAULT 90,        -- data retention
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plan tiers
INSERT INTO plan_limits (plan, max_products, max_customers, max_campaigns_mo, max_team_members, max_wa_messages_day, max_ai_calls_day, features, retention_days)
VALUES
  ('starter',    100,   500,   5,   3,   100,   50,
   '{"bi_drilldown": false, "crm": false, "bulk_messaging": false, "report_export": false, "custom_roles": false, "api_access": false, "white_label": false}',
   30),
  ('pro',        1000,  5000,  30,  10,  500,   200,
   '{"bi_drilldown": true, "crm": true, "bulk_messaging": true, "report_export": true, "custom_roles": false, "api_access": false, "white_label": false}',
   90),
  ('business',   5000,  25000, 100, 25,  2000,  1000,
   '{"bi_drilldown": true, "crm": true, "bulk_messaging": true, "report_export": true, "custom_roles": true, "api_access": true, "white_label": false}',
   365),
  ('enterprise', -1,    -1,    -1,  -1,  -1,    -1,
   '{"bi_drilldown": true, "crm": true, "bulk_messaging": true, "report_export": true, "custom_roles": true, "api_access": true, "white_label": true}',
   -1)
ON CONFLICT (plan) DO NOTHING;

-- ── USAGE TRACKING ──────────────────────────────────────────
-- Monthly usage counters per tenant
CREATE TABLE IF NOT EXISTS tenant_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period          VARCHAR(7) NOT NULL,  -- 'YYYY-MM'
    wa_messages     INT NOT NULL DEFAULT 0,
    ai_calls        INT NOT NULL DEFAULT 0,
    campaigns_created INT NOT NULL DEFAULT 0,
    api_calls       INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, period)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage(tenant_id, period);

-- Daily usage counters (for daily rate limits)
CREATE TABLE IF NOT EXISTS tenant_usage_daily (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day             DATE NOT NULL DEFAULT CURRENT_DATE,
    wa_messages     INT NOT NULL DEFAULT 0,
    ai_calls        INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, day)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_daily ON tenant_usage_daily(tenant_id, day);

-- ── AUDIT TRAIL ─────────────────────────────────────────────
-- Logs all significant user actions across all tenants
CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email      VARCHAR(255),
    action          VARCHAR(50) NOT NULL,    -- 'create', 'update', 'delete', 'login', 'export', 'launch', 'invite'
    resource        VARCHAR(50) NOT NULL,    -- 'product', 'customer', 'campaign', 'settings', 'team', 'role'
    resource_id     VARCHAR(255),            -- ID of affected resource
    details         JSONB,                   -- changed fields, old/new values
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource, resource_id);
