const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { sendTextMessage }  = require('../services/whatsapp');

const router = express.Router();

// ── GET /api/crm/customers — Main CRM list with filters + pagination ──
router.get('/customers', requireAuth, requirePermission('crm', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const {
      search,
      sentiment,
      tags,
      priority_min,
      priority_max,
      city,
      page = 1,
      limit = 50,
      sort = 'priority_score',
      order = 'desc',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset   = (pageNum - 1) * limitNum;

    // Whitelist sortable columns
    const sortableColumns = {
      priority_score:          'COALESCE(e.priority_score, 0)',
      name:                    'c.name',
      city:                    'c.city',
      avg_sentiment_score:     'COALESCE(e.avg_sentiment_score, 0)',
      reply_rate:              'COALESCE(e.reply_rate, 0)',
      conversion_rate:         'COALESCE(e.conversion_rate, 0)',
      last_engagement_date:    'e.last_engagement_date',
      total_campaigns_targeted:'COALESCE(e.total_campaigns_targeted, 0)',
      created_at:              'c.created_at',
    };
    const sortCol = sortableColumns[sort] || sortableColumns.priority_score;
    const sortDir = order && order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build dynamic WHERE clauses
    const conditions = ['c.tenant_id = $1'];
    const params     = [tenantId];
    let paramIdx     = 2;

    if (search) {
      conditions.push(`(c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (sentiment) {
      const s = sentiment.toLowerCase();
      if (s === 'positive') {
        conditions.push(`COALESCE(e.avg_sentiment_score, 0) > 0.3`);
      } else if (s === 'negative') {
        conditions.push(`COALESCE(e.avg_sentiment_score, 0) < -0.3`);
      } else if (s === 'neutral') {
        conditions.push(`COALESCE(e.avg_sentiment_score, 0) BETWEEN -0.3 AND 0.3`);
      }
    }

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        conditions.push(`c.id IN (SELECT customer_id FROM customer_tags WHERE tag = ANY($${paramIdx}) AND tenant_id = $1)`);
        params.push(tagList);
        paramIdx++;
      }
    }

    if (priority_min != null && priority_min !== '') {
      conditions.push(`COALESCE(e.priority_score, 0) >= $${paramIdx}`);
      params.push(parseFloat(priority_min));
      paramIdx++;
    }

    if (priority_max != null && priority_max !== '') {
      conditions.push(`COALESCE(e.priority_score, 0) <= $${paramIdx}`);
      params.push(parseFloat(priority_max));
      paramIdx++;
    }

    if (city) {
      conditions.push(`c.city ILIKE $${paramIdx}`);
      params.push(`%${city}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM customers c
      LEFT JOIN customer_engagement_history e ON e.customer_id = c.id AND e.tenant_id = c.tenant_id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Data query
    const dataSql = `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.city,
        c.region,
        c.country,
        COALESCE(e.priority_score, 0)            AS priority_score,
        COALESCE(e.avg_sentiment_score, 0)        AS avg_sentiment_score,
        COALESCE(e.reply_rate, 0)                 AS reply_rate,
        COALESCE(e.conversion_rate, 0)            AS conversion_rate,
        COALESCE(e.total_campaigns_targeted, 0)   AS total_campaigns_targeted,
        COALESCE(e.positive_responses, 0)         AS positive_responses,
        COALESCE(e.negative_responses, 0)         AS negative_responses,
        COALESCE(e.neutral_responses, 0)          AS neutral_responses,
        e.last_engagement_date,
        COALESCE(t.tags, ARRAY[]::text[])         AS tags
      FROM customers c
      LEFT JOIN customer_engagement_history e
        ON e.customer_id = c.id AND e.tenant_id = c.tenant_id
      LEFT JOIN (
        SELECT customer_id, array_agg(tag) AS tags
        FROM customer_tags
        WHERE tenant_id = $1
        GROUP BY customer_id
      ) AS t ON t.customer_id = c.id
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    params.push(limitNum, offset);

    const { rows } = await pool.query(dataSql, params);

    res.json({
      customers: rows,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/crm/tags — All distinct tags for the tenant ──
router.get('/tags', requireAuth, requirePermission('crm', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const { rows } = await pool.query(
      `SELECT tag, COUNT(*) AS count
       FROM customer_tags
       WHERE tenant_id = $1
       GROUP BY tag
       ORDER BY count DESC`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/crm/stats — Quick stats for the tenant ──
router.get('/stats', requireAuth, requirePermission('crm', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    // Total customers
    const totalRes = await pool.query(
      'SELECT COUNT(*) AS total FROM customers WHERE tenant_id = $1',
      [tenantId]
    );

    // Avg priority & sentiment breakdown
    const engRes = await pool.query(
      `SELECT
         COALESCE(AVG(priority_score), 0)           AS avg_priority,
         COUNT(*) FILTER (WHERE avg_sentiment_score > 0.3)  AS positive_count,
         COUNT(*) FILTER (WHERE avg_sentiment_score < -0.3) AS negative_count,
         COUNT(*) FILTER (WHERE avg_sentiment_score BETWEEN -0.3 AND 0.3) AS neutral_count
       FROM customer_engagement_history
       WHERE tenant_id = $1`,
      [tenantId]
    );

    // Tag counts (top 10)
    const tagRes = await pool.query(
      `SELECT tag, COUNT(*) AS count
       FROM customer_tags
       WHERE tenant_id = $1
       GROUP BY tag
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    // VIP count
    const vipRes = await pool.query(
      `SELECT COUNT(*) AS count
       FROM customer_tags
       WHERE tenant_id = $1 AND LOWER(tag) = 'vip'`,
      [tenantId]
    );

    const eng = engRes.rows[0] || {};
    res.json({
      total_customers:  parseInt(totalRes.rows[0].total, 10),
      avg_priority:     parseFloat(eng.avg_priority) || 0,
      positive_count:   parseInt(eng.positive_count, 10) || 0,
      negative_count:   parseInt(eng.negative_count, 10) || 0,
      neutral_count:    parseInt(eng.neutral_count, 10) || 0,
      vip_count:        parseInt(vipRes.rows[0].count, 10) || 0,
      top_tags:         tagRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/crm/customers/:id — Full customer detail ──
router.get('/customers/:id', requireAuth, requirePermission('crm', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const customerId = req.params.id;

    // Customer + engagement
    const custRes = await pool.query(
      `SELECT
         c.*,
         COALESCE(e.priority_score, 0)            AS priority_score,
         COALESCE(e.avg_sentiment_score, 0)        AS avg_sentiment_score,
         COALESCE(e.reply_rate, 0)                 AS reply_rate,
         COALESCE(e.conversion_rate, 0)            AS conversion_rate,
         COALESCE(e.total_campaigns_targeted, 0)   AS total_campaigns_targeted,
         COALESCE(e.total_messages_received, 0)    AS total_messages_received,
         COALESCE(e.total_messages_replied, 0)     AS total_messages_replied,
         COALESCE(e.total_conversions, 0)          AS total_conversions,
         COALESCE(e.positive_responses, 0)         AS positive_responses,
         COALESCE(e.negative_responses, 0)         AS negative_responses,
         COALESCE(e.neutral_responses, 0)          AS neutral_responses,
         e.last_engagement_date,
         e.first_contact_date
       FROM customers c
       LEFT JOIN customer_engagement_history e
         ON e.customer_id = c.id AND e.tenant_id = c.tenant_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [customerId, tenantId]
    );

    if (!custRes.rows[0]) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = custRes.rows[0];

    // Tags
    const tagRes = await pool.query(
      'SELECT id, tag, source, created_at FROM customer_tags WHERE customer_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [customerId, tenantId]
    );
    customer.tags = tagRes.rows;

    // Recent campaign responses (last 10)
    const respRes = await pool.query(
      `SELECT cr.id, cr.campaign_id, cr.response_text, cr.sentiment, cr.intent,
              cr.key_phrases, cr.suggested_reply, cr.received_at
       FROM campaign_responses cr
       JOIN campaign_recipients rec ON rec.id = cr.recipient_id
       WHERE rec.customer_id = $1
       ORDER BY cr.received_at DESC
       LIMIT 10`,
      [customerId]
    );
    customer.recent_responses = respRes.rows;

    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/crm/customers/:id/tags — Add tags ──
router.post('/customers/:id/tags', requireAuth, requirePermission('crm', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const customerId = req.params.id;
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'tags must be a non-empty array' });
    }

    // Verify customer belongs to tenant
    const custCheck = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );
    if (!custCheck.rows[0]) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const inserted = [];
    for (const tag of tags) {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) continue;
      try {
        const { rows } = await pool.query(
          `INSERT INTO customer_tags (tenant_id, customer_id, tag, source)
           VALUES ($1, $2, $3, 'manual')
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [tenantId, customerId, trimmed]
        );
        if (rows[0]) inserted.push(rows[0]);
      } catch (e) {
        // Skip duplicates silently
      }
    }

    res.status(201).json({ added: inserted.length, tags: inserted });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/crm/customers/:id/tags/:tag — Remove tag ──
router.delete('/customers/:id/tags/:tag', requireAuth, requirePermission('crm', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const customerId = req.params.id;
    const tag        = req.params.tag.trim().toLowerCase();

    const { rowCount } = await pool.query(
      'DELETE FROM customer_tags WHERE tenant_id = $1 AND customer_id = $2 AND LOWER(tag) = $3',
      [tenantId, customerId, tag]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/crm/bulk/whatsapp — Bulk WhatsApp send ──
router.post('/bulk/whatsapp', requireAuth, requirePermission('crm', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant assigned' });

    const { customerIds, message } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: 'customerIds must be a non-empty array' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Fetch customer phones (only for this tenant)
    const { rows: customers } = await pool.query(
      'SELECT id, name, phone FROM customers WHERE id = ANY($1) AND tenant_id = $2',
      [customerIds, tenantId]
    );

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const cust of customers) {
      if (!cust.phone) {
        failed++;
        results.push({ id: cust.id, name: cust.name, status: 'no_phone' });
        continue;
      }
      try {
        // Replace {{customer_name}} placeholder
        const personalizedMsg = message.replace(/\{\{customer_name\}\}/gi, cust.name || 'Customer');
        await sendTextMessage(cust.phone, personalizedMsg, tenantId);
        sent++;
        results.push({ id: cust.id, name: cust.name, status: 'sent' });
      } catch (e) {
        failed++;
        results.push({ id: cust.id, name: cust.name, status: 'failed', error: e.message });
      }
    }

    res.json({ sent, failed, total: customers.length, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
