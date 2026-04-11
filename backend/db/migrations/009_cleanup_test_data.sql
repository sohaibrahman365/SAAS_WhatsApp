-- ============================================================
-- GeniSearch — Remove seed/test data
-- Migration: 009_cleanup_test_data.sql
-- Keeps: schema, system roles, permissions, plan_limits
-- Removes: fake tenants, products, customers, campaigns, users
-- ============================================================

-- Delete in dependency order (children first)
DELETE FROM customer_engagement_history WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM campaign_responses WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE tenant_id IN (
    SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
      OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
      OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
  )
);

DELETE FROM campaign_recipients WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE tenant_id IN (
    SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
      OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
      OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
  )
);

DELETE FROM campaigns WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM customers WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM products WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM tenant_settings WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM tenant_usage WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM tenant_usage_daily WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM alert_configurations WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

DELETE FROM audit_log WHERE tenant_id IN (
  SELECT id FROM tenants WHERE email LIKE '%@zarafashion.pk' OR email LIKE '%@freshmart.pk'
    OR email LIKE '%@autozone.pk' OR email LIKE '%@mediplus.pk'
    OR email LIKE '%@techgadgets.pk' OR email LIKE '%@edubridge.pk'
);

-- Remove fake tenant admin users (keep super_admin sohaib365@gmail.com)
DELETE FROM users WHERE email IN (
  'admin@zarafashion.pk', 'admin@freshmart.pk', 'admin@autozone.pk',
  'admin@mediplus.pk', 'admin@techgadgets.pk', 'admin@edubridge.pk'
);

-- Remove fake tenants
DELETE FROM tenants WHERE email IN (
  'admin@zarafashion.pk', 'admin@freshmart.pk', 'admin@autozone.pk',
  'admin@mediplus.pk', 'admin@techgadgets.pk', 'admin@edubridge.pk'
);
