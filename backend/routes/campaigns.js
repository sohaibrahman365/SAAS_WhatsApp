const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { sendTextMessage, personalizeMessage } = require('../services/whatsapp');
const { enforceCampaignLimit, enforceMessageLimit } = require('../middleware/planLimits');
const { auditAction } = require('../middleware/audit');
const { incrementUsage } = require('../services/planLimits');

const router = express.Router();

// GET /api/campaigns
router.get('/', requireAuth, requirePermission('campaigns', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC';
      params = [tenantId];
    } else if (req.user.role === 'super_admin') {
      query  = 'SELECT * FROM campaigns ORDER BY created_at DESC';
      params = [];
    } else {
      return res.status(400).json({ error: 'No tenant assigned' });
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/campaigns
router.post('/', requireAuth, requirePermission('campaigns', 'create'), enforceCampaignLimit, auditAction('create', 'campaign'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req) || req.body.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const {
      product_id, name, description, category,
      region, country, province, city,
      target_age_min, target_age_max, target_genders,
      message_template, language, ai_generated,
      target_segment, scheduled_for,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO campaigns
         (tenant_id, product_id, name, description, category,
          region, country, province, city,
          target_age_min, target_age_max, target_genders,
          message_template, language, ai_generated,
          target_segment, scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        tenantId,
        product_id      || null,
        name,
        description     || null,
        category        || null,
        region          || null,
        country         || null,
        province        || null,
        city            || null,
        target_age_min  ?? null,
        target_age_max  ?? null,
        JSON.stringify(target_genders || []),
        message_template || null,
        language         || 'en',
        ai_generated     || false,
        target_segment   || 'all',
        scheduled_for    || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/campaigns/:id
router.get('/:id', requireAuth, requirePermission('campaigns', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    let query, params;
    if (tenantId) {
      query  = 'SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2';
      params = [req.params.id, tenantId];
    } else {
      query  = 'SELECT * FROM campaigns WHERE id = $1';
      params = [req.params.id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/campaigns/:id — edit campaign details (only draft/scheduled)
router.put('/:id', requireAuth, requirePermission('campaigns', 'edit'), auditAction('update', 'campaign', { getResourceId: (req) => req.params.id }), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { name, message_template, product_id, target_segment, region, country, city } = req.body;

    // Only allow editing draft/scheduled campaigns
    const check = tenantId
      ? await pool.query('SELECT status FROM campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])
      : await pool.query('SELECT status FROM campaigns WHERE id = $1', [req.params.id]);

    if (!check.rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    if (!['draft', 'scheduled'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Can only edit draft or scheduled campaigns' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined)             { sets.push('name = $' + idx++); params.push(name); }
    if (message_template !== undefined)  { sets.push('message_template = $' + idx++); params.push(message_template); }
    if (product_id !== undefined)        { sets.push('product_id = $' + idx++); params.push(product_id || null); }
    if (target_segment !== undefined)    { sets.push('target_segment = $' + idx++); params.push(target_segment); }
    if (region !== undefined)            { sets.push('region = $' + idx++); params.push(region || null); }
    if (country !== undefined)           { sets.push('country = $' + idx++); params.push(country || null); }
    if (city !== undefined)              { sets.push('city = $' + idx++); params.push(city || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push('updated_at = NOW()');

    let query = 'UPDATE campaigns SET ' + sets.join(', ') + ' WHERE id = $' + idx++;
    params.push(req.params.id);

    if (tenantId) {
      query += ' AND tenant_id = $' + idx++;
      params.push(tenantId);
    }

    query += ' RETURNING *';
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/campaigns/:id/status — update status (e.g. draft → active → completed)
router.patch('/:id/status', requireAuth, requirePermission('campaigns', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { status } = req.body;
    const allowed = ['draft', 'scheduled', 'active', 'completed', 'paused'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    let query, params;
    const extra = status === 'active' ? ', sent_at = NOW()' : status === 'completed' ? ', completed_at = NOW()' : '';
    if (tenantId) {
      query  = `UPDATE campaigns SET status = $1${extra} WHERE id = $2 AND tenant_id = $3 RETURNING *`;
      params = [status, req.params.id, tenantId];
    } else {
      query  = `UPDATE campaigns SET status = $1${extra} WHERE id = $2 RETURNING *`;
      params = [status, req.params.id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/campaigns/:id/launch
// Finds all matching customers, sends WhatsApp messages, creates recipient rows
router.post('/:id/launch', requireAuth, requirePermission('campaigns', 'launch'), enforceMessageLimit, auditAction('launch', 'campaign', { getResourceId: (req) => req.params.id }), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);

    // Fetch campaign + product name
    let cQuery, cParams;
    if (tenantId) {
      cQuery  = `SELECT c.*, p.name AS product_name
                   FROM campaigns c
                   LEFT JOIN products p ON p.id = c.product_id
                  WHERE c.id = $1 AND c.tenant_id = $2`;
      cParams = [req.params.id, tenantId];
    } else {
      cQuery  = `SELECT c.*, p.name AS product_name
                   FROM campaigns c
                   LEFT JOIN products p ON p.id = c.product_id
                  WHERE c.id = $1`;
      cParams = [req.params.id];
    }
    const { rows: camps } = await pool.query(cQuery, cParams);
    if (!camps[0]) return res.status(404).json({ error: 'Campaign not found' });

    const campaign = camps[0];
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Campaign must be draft or scheduled to launch' });
    }

    // Build customer query scoped to campaign targeting
    const conditions = ['cu.tenant_id = $1'];
    const vals       = [campaign.tenant_id];

    if (campaign.region)  conditions.push(`cu.region  = $${vals.push(campaign.region)}`);
    if (campaign.country) conditions.push(`cu.country = $${vals.push(campaign.country)}`);
    if (campaign.city)    conditions.push(`cu.city    = $${vals.push(campaign.city)}`);

    const { rows: customers } = await pool.query(
      `SELECT cu.id, cu.name, cu.phone
         FROM customers cu
         LEFT JOIN customer_preferences cp
           ON cp.customer_id = cu.id AND cp.tenant_id = cu.tenant_id
        WHERE ${conditions.join(' AND ')}
          AND (cp.do_not_contact IS NULL OR cp.do_not_contact = false)`,
      vals
    );

    if (customers.length === 0) {
      return res.status(400).json({ error: 'No matching customers found for this campaign' });
    }

    // Mark campaign active
    await pool.query(
      `UPDATE campaigns SET status = 'active', sent_at = NOW() WHERE id = $1`,
      [campaign.id]
    );

    let sent = 0, failed = 0, lastError = null;

    for (const customer of customers) {
      try {
        const message = personalizeMessage(campaign.message_template || '', {
          customer_name: customer.name || 'Valued Customer',
          product_name:  campaign.product_name || '',
          discount:      '',
        });

        const result     = await sendTextMessage(customer.phone, message, campaign.tenant_id);
        const waMessageId = result.messages?.[0]?.id || null;

        await pool.query(
          `INSERT INTO campaign_recipients
             (campaign_id, customer_id, customer_name, customer_phone, message_sent, sent_at, wa_message_id)
           VALUES ($1,$2,$3,$4,true,NOW(),$5)
           ON CONFLICT (campaign_id, customer_id) DO UPDATE
             SET message_sent = true, sent_at = NOW(), wa_message_id = $5`,
          [campaign.id, customer.id, customer.name, customer.phone, waMessageId]
        );

        sent++;
      } catch (err) {
        console.error(`[campaigns:launch] Failed for ${customer.phone}:`, err.message);
        failed++;
        // Store last error for response
        if (!lastError) lastError = err.message;
      }
    }

    await pool.query('UPDATE campaigns SET sent_count = $1 WHERE id = $2', [sent, campaign.id]);

    // Track usage (fire-and-forget)
    if (sent > 0) {
      for (let i = 0; i < sent; i++) {
        incrementUsage(campaign.tenant_id, 'wa_messages').catch(() => {});
      }
      incrementUsage(campaign.tenant_id, 'campaigns_created').catch(() => {});
    }

    // Trigger campaign_complete alert (fire-and-forget)
    const { checkAndSendAlert } = require('../services/alerts');
    checkAndSendAlert(campaign.tenant_id, 'campaign_complete', {
      campaign_name: campaign.name,
      sent,
      failed,
      total: customers.length,
    }).catch(err => console.error('[alert]', err.message));

    res.json({ launched: true, sent, failed, total: customers.length, error: lastError });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
