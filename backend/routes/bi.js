const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// Level 1 — SaaS Platform Dashboard (super_admin only)
// GET /api/bi/saas-platform/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/saas-platform/dashboard', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [overview, tenants, recentCampaigns, sentimentBreakdown] = await Promise.all([
      // Platform KPIs
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS total_tenants,
          (SELECT COUNT(*) FROM products) AS total_products,
          (SELECT COUNT(*) FROM customers) AS total_customers,
          (SELECT COUNT(*) FROM campaigns) AS total_campaigns,
          (SELECT COUNT(*) FROM campaigns WHERE status = 'active') AS active_campaigns,
          (SELECT COALESCE(SUM(sent_count),0) FROM campaigns) AS total_messages_sent,
          (SELECT COALESCE(SUM(reply_count),0) FROM campaigns) AS total_replies,
          (SELECT COALESCE(SUM(conversion_count),0) FROM campaigns) AS total_conversions,
          (SELECT COALESCE(SUM(mrr),0) FROM tenants WHERE status = 'active') AS total_mrr
      `),
      // Per-tenant summary
      pool.query(`
        SELECT t.id, t.name, t.plan, t.mrr, t.status,
               COUNT(DISTINCT p.id) AS product_count,
               COUNT(DISTINCT c.id) AS campaign_count,
               COUNT(DISTINCT cu.id) AS customer_count
          FROM tenants t
          LEFT JOIN products p ON p.tenant_id = t.id
          LEFT JOIN campaigns c ON c.tenant_id = t.id
          LEFT JOIN customers cu ON cu.tenant_id = t.id
         GROUP BY t.id
         ORDER BY t.mrr DESC
      `),
      // Recent campaigns
      pool.query(`
        SELECT c.id, c.name, c.status, c.sent_count, c.reply_count, c.conversion_count,
               t.name AS tenant_name, c.created_at
          FROM campaigns c
          JOIN tenants t ON t.id = c.tenant_id
         ORDER BY c.created_at DESC
         LIMIT 10
      `),
      // Sentiment breakdown
      pool.query(`
        SELECT sentiment, COUNT(*) AS count
          FROM campaign_responses
         WHERE sentiment IS NOT NULL
         GROUP BY sentiment
      `),
    ]);

    res.json({
      overview: overview.rows[0],
      tenants: tenants.rows,
      recent_campaigns: recentCampaigns.rows,
      sentiment_breakdown: sentimentBreakdown.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// Level 2 — Tenant Dashboard
// GET /api/bi/tenant/:tenantId/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/tenant/:tenantId/dashboard', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    if (req.user.role !== 'super_admin' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [tenant, kpis, products, campaigns, topCustomers] = await Promise.all([
      pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS product_count,
          (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) AS customer_count,
          (SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1) AS campaign_count,
          (SELECT COALESCE(SUM(sent_count),0) FROM campaigns WHERE tenant_id = $1) AS messages_sent,
          (SELECT COALESCE(SUM(reply_count),0) FROM campaigns WHERE tenant_id = $1) AS total_replies,
          (SELECT COALESCE(SUM(conversion_count),0) FROM campaigns WHERE tenant_id = $1) AS total_conversions
      `, [tenantId]),
      pool.query(`
        SELECT id, name, price, customer_count, status, created_at
          FROM products WHERE tenant_id = $1
         ORDER BY created_at DESC
      `, [tenantId]),
      pool.query(`
        SELECT id, name, status, sent_count, reply_count, conversion_count, created_at
          FROM campaigns WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT 10
      `, [tenantId]),
      pool.query(`
        SELECT c.id, c.name, c.phone, ceh.priority_score, ceh.reply_rate, ceh.conversion_rate
          FROM customers c
          LEFT JOIN customer_engagement_history ceh ON ceh.customer_id = c.id AND ceh.tenant_id = $1
         WHERE c.tenant_id = $1
         ORDER BY ceh.priority_score DESC NULLS LAST
         LIMIT 10
      `, [tenantId]),
    ]);

    if (!tenant.rows[0]) return res.status(404).json({ error: 'Tenant not found' });

    res.json({
      tenant: tenant.rows[0],
      kpis: kpis.rows[0],
      products: products.rows,
      recent_campaigns: campaigns.rows,
      top_customers: topCustomers.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// Level 3 — Product Dashboard
// GET /api/bi/product/:productId/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/product/:productId/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { rows: products } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.productId]);
    if (!products[0]) return res.status(404).json({ error: 'Product not found' });
    const product = products[0];

    if (req.user.role !== 'super_admin' && req.user.tenantId !== product.tenant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [campaigns, sentimentBreakdown] = await Promise.all([
      pool.query(`
        SELECT id, name, status, sent_count, delivery_count, read_count,
               reply_count, conversion_count, created_at
          FROM campaigns WHERE product_id = $1
         ORDER BY created_at DESC
      `, [product.id]),
      pool.query(`
        SELECT cr.sentiment, COUNT(*) AS count
          FROM campaign_responses cr
          JOIN campaigns c ON c.id = cr.campaign_id
         WHERE c.product_id = $1 AND cr.sentiment IS NOT NULL
         GROUP BY cr.sentiment
      `, [product.id]),
    ]);

    res.json({
      product,
      campaigns: campaigns.rows,
      sentiment_breakdown: sentimentBreakdown.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// Level 4 — Campaign Dashboard
// GET /api/bi/campaign/:campaignId/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/campaign/:campaignId/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { rows: campaigns } = await pool.query(
      `SELECT c.*, p.name AS product_name
         FROM campaigns c
         LEFT JOIN products p ON p.id = c.product_id
        WHERE c.id = $1`, [req.params.campaignId]
    );
    if (!campaigns[0]) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = campaigns[0];

    if (req.user.role !== 'super_admin' && req.user.tenantId !== campaign.tenant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [funnel, sentimentBreakdown, intentBreakdown, recipients, responses] = await Promise.all([
      // Delivery funnel
      pool.query(`
        SELECT
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE message_sent) AS sent,
          COUNT(*) FILTER (WHERE delivered) AS delivered,
          COUNT(*) FILTER (WHERE read) AS read,
          COUNT(*) FILTER (WHERE replied) AS replied,
          COUNT(*) FILTER (WHERE converted) AS converted
          FROM campaign_recipients WHERE campaign_id = $1
      `, [campaign.id]),
      pool.query(`
        SELECT sentiment, COUNT(*) AS count
          FROM campaign_responses
         WHERE campaign_id = $1 AND sentiment IS NOT NULL
         GROUP BY sentiment
      `, [campaign.id]),
      pool.query(`
        SELECT intent, COUNT(*) AS count
          FROM campaign_responses
         WHERE campaign_id = $1 AND intent IS NOT NULL
         GROUP BY intent
      `, [campaign.id]),
      pool.query(`
        SELECT cr.id, cr.customer_name, cr.customer_phone, cr.message_sent,
               cr.delivered, cr.read, cr.replied, cr.converted
          FROM campaign_recipients cr
         WHERE cr.campaign_id = $1
         ORDER BY cr.replied DESC, cr.sent_at DESC
         LIMIT 50
      `, [campaign.id]),
      pool.query(`
        SELECT crp.id, crp.response_text, crp.sentiment, crp.intent,
               crp.suggested_reply, crp.ai_analyzed, crp.received_at,
               cr.customer_name, cr.customer_phone
          FROM campaign_responses crp
          JOIN campaign_recipients cr ON cr.id = crp.recipient_id
         WHERE crp.campaign_id = $1
         ORDER BY crp.received_at DESC
         LIMIT 50
      `, [campaign.id]),
    ]);

    res.json({
      campaign,
      funnel: funnel.rows[0],
      sentiment_breakdown: sentimentBreakdown.rows,
      intent_breakdown: intentBreakdown.rows,
      recipients: recipients.rows,
      responses: responses.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// Level 5 — Response Detail
// GET /api/bi/response/:responseId
// ═══════════════════════════════════════════════════════════════
router.get('/response/:responseId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT crp.*,
             cr.customer_name, cr.customer_phone,
             c.name AS campaign_name, c.message_template,
             p.name AS product_name,
             cu.email AS customer_email, cu.city, cu.region, cu.country,
             ceh.priority_score, ceh.reply_rate, ceh.conversion_rate,
             ceh.avg_sentiment_score, ceh.total_campaigns_targeted
        FROM campaign_responses crp
        JOIN campaign_recipients cr ON cr.id = crp.recipient_id
        JOIN campaigns c ON c.id = crp.campaign_id
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN customers cu ON cu.id = cr.customer_id
        LEFT JOIN customer_engagement_history ceh
          ON ceh.customer_id = cr.customer_id AND ceh.tenant_id = c.tenant_id
       WHERE crp.id = $1
    `, [req.params.responseId]);

    if (!rows[0]) return res.status(404).json({ error: 'Response not found' });

    const row = rows[0];
    if (req.user.role !== 'super_admin') {
      const { rows: camp } = await pool.query('SELECT tenant_id FROM campaigns WHERE id = $1', [row.campaign_id]);
      if (camp[0]?.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// Customer engagement endpoint
// GET /api/bi/customer/:phone/engagement
// ═══════════════════════════════════════════════════════════════
router.get('/customer/:phone/engagement', requireAuth, async (req, res, next) => {
  try {
    const { rows: customers } = await pool.query(
      'SELECT * FROM customers WHERE phone = $1', [req.params.phone]
    );
    if (!customers[0]) return res.status(404).json({ error: 'Customer not found' });
    const customer = customers[0];

    if (req.user.role !== 'super_admin' && req.user.tenantId !== customer.tenant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [engagement, recentResponses, feedback, preferences] = await Promise.all([
      pool.query(
        'SELECT * FROM customer_engagement_history WHERE customer_id = $1 AND tenant_id = $2',
        [customer.id, customer.tenant_id]
      ),
      pool.query(`
        SELECT crp.response_text, crp.sentiment, crp.intent, crp.received_at,
               c.name AS campaign_name
          FROM campaign_responses crp
          JOIN campaign_recipients cr ON cr.id = crp.recipient_id
          JOIN campaigns c ON c.id = crp.campaign_id
         WHERE cr.customer_id = $1
         ORDER BY crp.received_at DESC LIMIT 10
      `, [customer.id]),
      pool.query(
        'SELECT * FROM customer_feedback WHERE customer_id = $1 ORDER BY submitted_at DESC LIMIT 5',
        [customer.id]
      ),
      pool.query(
        'SELECT * FROM customer_preferences WHERE customer_id = $1 AND tenant_id = $2',
        [customer.id, customer.tenant_id]
      ),
    ]);

    res.json({
      customer,
      engagement: engagement.rows[0] || null,
      recent_responses: recentResponses.rows,
      feedback: feedback.rows,
      preferences: preferences.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
