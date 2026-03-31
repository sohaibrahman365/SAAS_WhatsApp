-- ============================================================
-- GeniSearch — Users Table
-- Migration: 002_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = super_admin
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(255),
    google_id     VARCHAR(100),
    password_hash VARCHAR(255),
    role          VARCHAR(20) NOT NULL DEFAULT 'analyst', -- super_admin, admin, manager, analyst
    status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, suspended
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
