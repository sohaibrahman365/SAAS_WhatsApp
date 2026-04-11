-- ============================================================
-- GeniSearch — Fix duplicate system roles
-- Migration: 011_fix_duplicate_roles.sql
-- Problem: UNIQUE(tenant_id, slug) doesn't deduplicate when
--          tenant_id IS NULL (NULL ≠ NULL in SQL), so every
--          deploy inserted new system role rows.
-- ============================================================

-- Step 1: Reassign any role_permissions pointing to duplicate roles
-- Keep the oldest role (MIN id) for each slug, move permissions to it
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT slug, MIN(id::text)::uuid AS keep_id
    FROM roles
    WHERE tenant_id IS NULL AND is_system = TRUE
    GROUP BY slug
    HAVING COUNT(*) > 1
  LOOP
    -- Move role_permissions from duplicates to the keeper
    UPDATE role_permissions
    SET role_id = r.keep_id
    WHERE role_id IN (
      SELECT id FROM roles
      WHERE tenant_id IS NULL AND slug = r.slug AND id != r.keep_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp2
      WHERE rp2.role_id = r.keep_id AND rp2.permission_id = role_permissions.permission_id
    );

    -- Move users from duplicate roles to the keeper
    UPDATE users
    SET role_id = r.keep_id
    WHERE role_id IN (
      SELECT id FROM roles
      WHERE tenant_id IS NULL AND slug = r.slug AND id != r.keep_id
    );

    -- Delete orphaned role_permissions on duplicates
    DELETE FROM role_permissions
    WHERE role_id IN (
      SELECT id FROM roles
      WHERE tenant_id IS NULL AND slug = r.slug AND id != r.keep_id
    );

    -- Delete the duplicate roles
    DELETE FROM roles
    WHERE tenant_id IS NULL AND slug = r.slug AND id != r.keep_id;
  END LOOP;
END $$;

-- Step 2: Create a unique index that handles NULL tenant_id
-- This prevents future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_unique_platform_slug
ON roles (slug) WHERE tenant_id IS NULL;
