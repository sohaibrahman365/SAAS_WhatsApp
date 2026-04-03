const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

function isN8nConfigured() {
  return N8N_WEBHOOK_URL && !N8N_WEBHOOK_URL.startsWith('xxx');
}

// Fire-and-forget webhook to n8n
async function fireWebhook(event, data) {
  if (!isN8nConfigured()) {
    console.log(`[webhooks:stub] ${event}:`, JSON.stringify(data).slice(0, 120));
    return;
  }

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
    });
    console.log(`[webhooks] Sent ${event} to n8n`);
  } catch (err) {
    console.error(`[webhooks] Failed to send ${event}:`, err.message);
  }
}

// GET /api/webhooks/status — check n8n config
router.get('/status', requireAuth, requirePermission('webhooks', 'view'), (req, res) => {
  res.json({
    configured: isN8nConfigured(),
    stub_mode: !isN8nConfigured(),
  });
});

// ── Trigger endpoints — manually fire n8n automations ──────

// POST /api/webhooks/campaign-launched
// Fires when a campaign is launched (also called automatically from campaign launch)
router.post('/campaign-launched', requireAuth, requirePermission('webhooks', 'trigger'), async (req, res, next) => {
  try {
    const { campaignId } = req.body;
    if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.status, c.sent_count, c.tenant_id,
              t.name AS tenant_name, p.name AS product_name
         FROM campaigns c
         JOIN tenants t ON t.id = c.tenant_id
         LEFT JOIN products p ON p.id = c.product_id
        WHERE c.id = $1`, [campaignId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });

    await fireWebhook('campaign.launched', rows[0]);
    res.json({ sent: true, event: 'campaign.launched' });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/new-reply
// Fires when a customer replies (for Slack alerts, CRM sync, Google Sheets logging)
router.post('/new-reply', requireAuth, requirePermission('webhooks', 'trigger'), async (req, res, next) => {
  try {
    const { responseId } = req.body;
    if (!responseId) return res.status(400).json({ error: 'responseId is required' });

    const { rows } = await pool.query(`
      SELECT crp.id, crp.response_text, crp.sentiment, crp.intent,
             crp.suggested_reply, crp.received_at,
             cr.customer_name, cr.customer_phone,
             c.name AS campaign_name, t.name AS tenant_name
        FROM campaign_responses crp
        JOIN campaign_recipients cr ON cr.id = crp.recipient_id
        JOIN campaigns c ON c.id = crp.campaign_id
        JOIN tenants t ON t.id = c.tenant_id
       WHERE crp.id = $1
    `, [responseId]);
    if (!rows[0]) return res.status(404).json({ error: 'Response not found' });

    await fireWebhook('customer.replied', rows[0]);
    res.json({ sent: true, event: 'customer.replied' });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/high-priority-alert
// Fires when a high-priority customer engages (priority_score >= 80)
router.post('/high-priority-alert', requireAuth, requirePermission('webhooks', 'trigger'), async (req, res, next) => {
  try {
    const { customerId, tenantId } = req.body;
    if (!customerId || !tenantId) {
      return res.status(400).json({ error: 'customerId and tenantId are required' });
    }

    const { rows } = await pool.query(`
      SELECT c.name, c.phone, c.email,
             ceh.priority_score, ceh.reply_rate, ceh.conversion_rate,
             t.name AS tenant_name
        FROM customers c
        JOIN customer_engagement_history ceh
          ON ceh.customer_id = c.id AND ceh.tenant_id = $2
        JOIN tenants t ON t.id = $2
       WHERE c.id = $1
    `, [customerId, tenantId]);
    if (!rows[0]) return res.status(404).json({ error: 'Customer or engagement not found' });

    await fireWebhook('customer.high_priority', rows[0]);
    res.json({ sent: true, event: 'customer.high_priority' });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/negative-sentiment-alert
// Fires for negative sentiment responses — triggers CRM escalation
router.post('/negative-sentiment-alert', requireAuth, requirePermission('webhooks', 'trigger'), async (req, res, next) => {
  try {
    const { responseId } = req.body;
    if (!responseId) return res.status(400).json({ error: 'responseId is required' });

    const { rows } = await pool.query(`
      SELECT crp.id, crp.response_text, crp.sentiment, crp.intent,
             crp.key_phrases, crp.suggested_reply,
             cr.customer_name, cr.customer_phone,
             c.name AS campaign_name, t.name AS tenant_name
        FROM campaign_responses crp
        JOIN campaign_recipients cr ON cr.id = crp.recipient_id
        JOIN campaigns c ON c.id = crp.campaign_id
        JOIN tenants t ON t.id = c.tenant_id
       WHERE crp.id = $1 AND crp.sentiment = 'negative'
    `, [responseId]);
    if (!rows[0]) return res.status(404).json({ error: 'Negative response not found' });

    await fireWebhook('sentiment.negative_alert', rows[0]);
    res.json({ sent: true, event: 'sentiment.negative_alert' });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/daily-summary
// Triggers a daily summary webhook — intended to be called by a cron job or n8n schedule
router.post('/daily-summary', requireAuth, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM campaigns WHERE sent_at >= NOW() - INTERVAL '24 hours') AS campaigns_sent_today,
        (SELECT COALESCE(SUM(reply_count),0) FROM campaigns WHERE sent_at >= NOW() - INTERVAL '24 hours') AS replies_today,
        (SELECT COUNT(*) FROM campaign_responses WHERE received_at >= NOW() - INTERVAL '24 hours' AND sentiment = 'positive') AS positive_today,
        (SELECT COUNT(*) FROM campaign_responses WHERE received_at >= NOW() - INTERVAL '24 hours' AND sentiment = 'negative') AS negative_today,
        (SELECT COUNT(*) FROM customers WHERE created_at >= NOW() - INTERVAL '24 hours') AS new_customers_today
    `);

    await fireWebhook('daily.summary', rows[0]);
    res.json({ sent: true, event: 'daily.summary', data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Export fireWebhook so other modules can trigger webhooks internally
module.exports = router;
module.exports.fireWebhook = fireWebhook;
