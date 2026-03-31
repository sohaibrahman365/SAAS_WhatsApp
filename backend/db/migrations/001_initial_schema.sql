-- ============================================================
-- GeniSearch — Initial Database Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. TENANTS ──────────────────────────────────────────────
-- Each tenant is a business using the GeniSearch platform
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    phone       VARCHAR(20),
    plan        VARCHAR(50)  NOT NULL DEFAULT 'starter',  -- starter, pro, business, enterprise
    status      VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active, suspended, trial
    mrr         NUMERIC(12,2) DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. PRODUCTS ─────────────────────────────────────────────
-- Products uploaded by each tenant
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    price           NUMERIC(12,2),
    description     TEXT,
    image_url       TEXT,
    categories      JSONB DEFAULT '[]',       -- ["Fashion","Formal Wear"]
    -- Geographic targeting
    region          VARCHAR(50),
    country         VARCHAR(100),
    province        VARCHAR(100),
    city            VARCHAR(100),
    timezone        VARCHAR(50),
    -- Demographic targeting
    target_age_min  INT,
    target_age_max  INT,
    target_genders  JSONB DEFAULT '[]',       -- ["Male","Female"]
    preferences     JSONB DEFAULT '[]',       -- ["Premium","Eco-friendly"]
    activity_filter VARCHAR(20) DEFAULT '7d', -- 24h,48h,72h,7d,30d,all
    -- Stats
    customer_count  INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. CUSTOMERS ────────────────────────────────────────────
-- Customers discovered via web search for each tenant
CREATE TABLE IF NOT EXISTS customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255),
    phone       VARCHAR(20)  NOT NULL,
    email       VARCHAR(255),
    age         INT,
    gender      VARCHAR(50),
    city        VARCHAR(100),
    region      VARCHAR(100),
    country     VARCHAR(100),
    source      VARCHAR(50) DEFAULT 'web_search', -- meta, tiktok, google, linkedin
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, phone)
);

-- ── 4. CAMPAIGNS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    category            VARCHAR(100),
    -- Targeting snapshot (copied from product at campaign creation)
    region              VARCHAR(50),
    country             VARCHAR(100),
    province            VARCHAR(100),
    city                VARCHAR(100),
    target_age_min      INT,
    target_age_max      INT,
    target_genders      JSONB DEFAULT '[]',
    -- Message
    message_template    TEXT,
    language            VARCHAR(10) DEFAULT 'en',
    ai_generated        BOOLEAN DEFAULT FALSE,
    -- Targeting segment
    target_segment      VARCHAR(50) DEFAULT 'all', -- all, high_priority, new, inactive
    -- Status & counters
    status              VARCHAR(20) DEFAULT 'draft', -- draft,scheduled,active,completed,paused
    sent_count          INT DEFAULT 0,
    delivery_count      INT DEFAULT 0,
    read_count          INT DEFAULT 0,
    reply_count         INT DEFAULT 0,
    conversion_count    INT DEFAULT 0,
    -- Timestamps
    scheduled_for       TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. CAMPAIGN_RECIPIENTS ──────────────────────────────────
-- One row per customer per campaign
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    -- Customer snapshot at send time
    customer_name   VARCHAR(255),
    customer_phone  VARCHAR(20) NOT NULL,
    -- Delivery status
    message_sent    BOOLEAN DEFAULT FALSE,
    sent_at         TIMESTAMPTZ,
    delivered       BOOLEAN DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    read            BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    -- Engagement
    replied         BOOLEAN DEFAULT FALSE,
    reply_count     INT DEFAULT 0,
    converted       BOOLEAN DEFAULT FALSE,
    -- WhatsApp message ID for status tracking
    wa_message_id   VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, customer_id)
);

-- ── 6. CAMPAIGN_RESPONSES ───────────────────────────────────
-- AI-analyzed replies from customers
CREATE TABLE IF NOT EXISTS campaign_responses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    recipient_id        UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    -- The reply
    response_text       TEXT NOT NULL,
    response_type       VARCHAR(50) DEFAULT 'text', -- text, image, order, inquiry
    -- AI Analysis (stubbed until Phase 5)
    sentiment           VARCHAR(20),        -- positive, neutral, negative
    sentiment_score     NUMERIC(3,2),       -- 0.00-1.00
    intent              VARCHAR(50),        -- interested, not_interested, inquiry, order, feedback
    key_phrases         JSONB DEFAULT '[]', -- ["discount","want to buy"]
    extracted_info      JSONB DEFAULT '{}',
    -- AI-suggested reply
    suggested_reply     TEXT,
    ai_confidence       NUMERIC(3,2),
    ai_analyzed         BOOLEAN DEFAULT FALSE,
    -- Timestamps
    received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. CUSTOMER_ENGAGEMENT_HISTORY ──────────────────────────
-- Aggregated per-customer engagement metrics (updated after each campaign)
CREATE TABLE IF NOT EXISTS customer_engagement_history (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id                 UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    -- Metrics
    total_messages_received     INT DEFAULT 0,
    total_messages_replied      INT DEFAULT 0,
    reply_rate                  NUMERIC(5,2) DEFAULT 0,
    total_campaigns_targeted    INT DEFAULT 0,
    total_conversions           INT DEFAULT 0,
    conversion_rate             NUMERIC(5,2) DEFAULT 0,
    -- Sentiment
    avg_sentiment_score         NUMERIC(3,2) DEFAULT 0.5,
    positive_responses          INT DEFAULT 0,
    neutral_responses           INT DEFAULT 0,
    negative_responses          INT DEFAULT 0,
    -- Priority score 1-100
    priority_score              INT DEFAULT 50,
    -- Recency
    last_engagement_date        TIMESTAMPTZ,
    last_engagement_type        VARCHAR(50),
    first_contact_date          TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, customer_id)
);

-- ── 8. CUSTOMER_FEEDBACK ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_feedback (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    campaign_id             UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    -- Ratings
    overall_rating          INT CHECK (overall_rating BETWEEN 1 AND 5),
    service_quality_rating  INT CHECK (service_quality_rating BETWEEN 1 AND 5),
    product_quality_rating  INT CHECK (product_quality_rating BETWEEN 1 AND 5),
    price_rating            INT CHECK (price_rating BETWEEN 1 AND 5),
    -- Comment & AI analysis
    comment                 TEXT,
    sentiment               VARCHAR(20),
    key_themes              JSONB DEFAULT '[]',
    action_items            JSONB DEFAULT '[]',
    -- Timestamps
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. CUSTOMER_PREFERENCES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_preferences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    preferred_categories    JSONB DEFAULT '[]',
    preferred_price_min     NUMERIC(12,2),
    preferred_price_max     NUMERIC(12,2),
    communication_freq      VARCHAR(20) DEFAULT 'weekly', -- daily, weekly, monthly
    preferred_language      VARCHAR(10) DEFAULT 'en',
    do_not_contact          BOOLEAN DEFAULT FALSE,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, customer_id)
);

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_tenant        ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant       ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone        ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant       ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_product      ON campaigns(product_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status       ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign    ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recipients_customer    ON campaign_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_recipients_replied     ON campaign_recipients(replied);
CREATE INDEX IF NOT EXISTS idx_responses_campaign     ON campaign_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_responses_recipient    ON campaign_responses(recipient_id);
CREATE INDEX IF NOT EXISTS idx_responses_sentiment    ON campaign_responses(sentiment);
CREATE INDEX IF NOT EXISTS idx_responses_analyzed     ON campaign_responses(ai_analyzed);
CREATE INDEX IF NOT EXISTS idx_engagement_tenant      ON customer_engagement_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_engagement_priority    ON customer_engagement_history(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant        ON customer_feedback(tenant_id);

-- ── AUTO-UPDATE updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_engagement_updated_at
    BEFORE UPDATE ON customer_engagement_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
