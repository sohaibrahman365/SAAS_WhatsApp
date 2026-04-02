-- ============================================================
-- GeniSearch — Dynamic Roles & Permissions + AI Knowledge Base
-- Migration: 004_roles_permissions.sql
-- ============================================================

-- ── ROLES TABLE ─────────────────────────────────────────────
-- Dynamic roles per tenant (replaces hard-coded admin/manager/analyst)
CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-level role
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL,       -- machine-friendly: 'admin', 'campaign_manager', etc.
    description TEXT,
    is_system   BOOLEAN DEFAULT FALSE,       -- system roles can't be deleted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- ── PERMISSIONS TABLE ───────────────────────────────────────
-- Every page/module/action that can be granted
CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module      VARCHAR(100) NOT NULL,       -- 'dashboard','products','customers','campaigns','conversations','bi','reports','settings','team'
    action      VARCHAR(100) NOT NULL,       -- 'view','create','edit','delete','export','launch','manage'
    description TEXT,
    UNIQUE (module, action)
);

-- ── ROLE_PERMISSIONS (junction) ─────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE (role_id, permission_id)
);

-- ── Add role_id to users table ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- ── AI Knowledge fields on tenant_settings ──────────────────
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ai_business_semantics  TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ai_reply_tone          VARCHAR(50) DEFAULT 'professional';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ai_industry            VARCHAR(100);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ai_target_audience     TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ai_sample_replies      TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS business_webpage_url   TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS business_knowledge_base TEXT;

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ══════════════════════════════════════════════════════════════
-- SEED: Default permissions (all modules × actions)
-- ══════════════════════════════════════════════════════════════
INSERT INTO permissions (module, action, description) VALUES
  -- Dashboard
  ('dashboard', 'view', 'View dashboard and KPIs'),
  -- Products
  ('products', 'view', 'View product list'),
  ('products', 'create', 'Add new products'),
  ('products', 'edit', 'Edit existing products'),
  ('products', 'delete', 'Delete products'),
  -- Customers
  ('customers', 'view', 'View customer list'),
  ('customers', 'create', 'Add new customers'),
  ('customers', 'edit', 'Edit customer details'),
  ('customers', 'delete', 'Delete customers'),
  ('customers', 'export', 'Export customer data'),
  -- Campaigns
  ('campaigns', 'view', 'View campaign list'),
  ('campaigns', 'create', 'Create new campaigns'),
  ('campaigns', 'edit', 'Edit campaigns'),
  ('campaigns', 'delete', 'Delete campaigns'),
  ('campaigns', 'launch', 'Launch campaigns to send messages'),
  -- Conversations
  ('conversations', 'view', 'View WhatsApp conversations'),
  ('conversations', 'reply', 'Send replies to customers'),
  ('conversations', 'analyze', 'Run AI analysis on responses'),
  -- BI Analytics
  ('bi', 'view', 'View BI analytics dashboards'),
  ('bi', 'drilldown', 'Access drill-down analytics'),
  -- Reports
  ('reports', 'view', 'View reports'),
  ('reports', 'export', 'Export reports as CSV'),
  ('reports', 'trigger', 'Trigger daily summary webhooks'),
  -- Settings
  ('settings', 'view', 'View settings'),
  ('settings', 'manage_api', 'Configure API keys and integrations'),
  ('settings', 'manage_tenant', 'Manage tenant details'),
  -- Team
  ('team', 'view', 'View team members'),
  ('team', 'invite', 'Invite new team members'),
  ('team', 'manage', 'Change roles, suspend, or remove members'),
  -- Roles
  ('roles', 'view', 'View roles and permissions'),
  ('roles', 'manage', 'Create, edit, and delete roles')
ON CONFLICT (module, action) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SEED: Default platform-level system roles
-- ══════════════════════════════════════════════════════════════

-- Admin role (all permissions)
INSERT INTO roles (tenant_id, name, slug, description, is_system)
VALUES (NULL, 'Admin', 'admin', 'Full access to all features', TRUE)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Manager role
INSERT INTO roles (tenant_id, name, slug, description, is_system)
VALUES (NULL, 'Manager', 'manager', 'Can manage products, customers, campaigns, and view analytics', TRUE)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Analyst role
INSERT INTO roles (tenant_id, name, slug, description, is_system)
VALUES (NULL, 'Analyst', 'analyst', 'View-only access to dashboards and reports', TRUE)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Campaign Manager role
INSERT INTO roles (tenant_id, name, slug, description, is_system)
VALUES (NULL, 'Campaign Manager', 'campaign_manager', 'Manage campaigns and view conversations', TRUE)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Viewer role
INSERT INTO roles (tenant_id, name, slug, description, is_system)
VALUES (NULL, 'Viewer', 'viewer', 'Read-only access to dashboards', TRUE)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SEED: Assign permissions to default roles
-- ══════════════════════════════════════════════════════════════

-- Admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- Manager gets most except team/roles/settings management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'manager' AND r.tenant_id IS NULL
  AND NOT (p.module = 'roles')
  AND NOT (p.module = 'team' AND p.action = 'manage')
  AND NOT (p.module = 'settings' AND p.action IN ('manage_api', 'manage_tenant'))
ON CONFLICT DO NOTHING;

-- Analyst gets view + export only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'analyst' AND r.tenant_id IS NULL
  AND p.action IN ('view', 'export', 'drilldown')
ON CONFLICT DO NOTHING;

-- Campaign Manager gets campaign + conversation + product/customer view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'campaign_manager' AND r.tenant_id IS NULL
  AND (
    p.module = 'dashboard'
    OR p.module = 'campaigns'
    OR p.module = 'conversations'
    OR (p.module IN ('products', 'customers') AND p.action = 'view')
    OR (p.module IN ('bi', 'reports') AND p.action = 'view')
  )
ON CONFLICT DO NOTHING;

-- Viewer gets view-only on dashboard, bi, reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'viewer' AND r.tenant_id IS NULL
  AND p.module IN ('dashboard', 'bi', 'reports') AND p.action = 'view'
ON CONFLICT DO NOTHING;
