-- ============================================================
-- GeniSearch — Seed Users
-- Seeds: 002_users.sql
-- Passwords are set via POST /api/auth/register or Google OAuth.
-- Super admin has no password (Google OAuth only in production).
-- ============================================================

-- Super Admin
INSERT INTO users (email, name, role, status) VALUES
('sohaib365@gmail.com', 'Sohaib', 'super_admin', 'active')
ON CONFLICT (email) DO NOTHING;

-- Tenant Admins (one per tenant — no password; use /api/auth/register to set)
INSERT INTO users (email, name, role, tenant_id, status) VALUES
('admin@zarafashion.pk',  'Zara Admin',     'admin', '11111111-0000-0000-0000-000000000001', 'active'),
('admin@freshmart.pk',    'FreshMart Admin','admin', '11111111-0000-0000-0000-000000000002', 'active'),
('admin@autozone.pk',     'AutoZone Admin', 'admin', '11111111-0000-0000-0000-000000000003', 'active'),
('admin@mediplus.pk',     'MediPlus Admin', 'admin', '11111111-0000-0000-0000-000000000004', 'active'),
('admin@techgadgets.pk',  'TechGadgets Admin','admin','11111111-0000-0000-0000-000000000005','active'),
('admin@edubridge.pk',    'EduBridge Admin','admin', '11111111-0000-0000-0000-000000000006', 'active')
ON CONFLICT (email) DO NOTHING;
