-- Migration 005: Product imports tracking + META catalog fields
-- Tracks all product import jobs (URL scrape, file upload, META catalog)

CREATE TABLE IF NOT EXISTS product_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source        VARCHAR(20) NOT NULL CHECK (source IN ('website', 'file', 'meta')),
  source_url    TEXT,
  file_name     TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_found   INT DEFAULT 0,
  total_imported INT DEFAULT 0,
  error_message TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_imports_tenant ON product_imports(tenant_id);

-- Add image fields to products if not already present
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES product_imports(id);

-- META catalog fields on tenant_settings
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS meta_catalog_id TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS meta_access_token TEXT;
