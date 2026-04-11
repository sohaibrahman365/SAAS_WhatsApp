-- ============================================================
-- GeniSearch — Add missing permissions used by routes
-- Migration: 010_fix_missing_permissions.sql
-- ============================================================

-- Add permissions that routes check but were never seeded
INSERT INTO permissions (module, action, description) VALUES
  -- Analytics (used by bi.js routes)
  ('analytics', 'view', 'View BI analytics dashboards'),
  ('analytics', 'drilldown', 'Access drill-down analytics'),
  -- CRM (used by crm.js routes)
  ('crm', 'view', 'View CRM customer data'),
  ('crm', 'edit', 'Edit CRM tags and send bulk messages'),
  -- AI (used by ai.js routes)
  ('ai', 'view', 'View AI analysis status'),
  ('ai', 'analyze', 'Run AI sentiment/intent analysis'),
  -- Settings extras (used by tenantSettings.js)
  ('settings', 'edit', 'Edit tenant settings'),
  ('settings', 'manage_api_keys', 'Add or remove API keys'),
  -- Team extras (used by roles.js and team.js)
  ('team', 'edit_role', 'Create, edit, and delete roles'),
  ('team', 'remove', 'Remove team members')
ON CONFLICT (module, action) DO NOTHING;

-- Grant all new permissions to the admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- Grant view permissions to manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'manager' AND r.tenant_id IS NULL
  AND p.module IN ('analytics', 'crm', 'ai')
  AND p.action IN ('view', 'drilldown', 'analyze')
ON CONFLICT DO NOTHING;

-- Grant view permissions to analyst role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'analyst' AND r.tenant_id IS NULL
  AND p.module IN ('analytics', 'crm', 'ai')
  AND p.action IN ('view', 'drilldown')
ON CONFLICT DO NOTHING;
