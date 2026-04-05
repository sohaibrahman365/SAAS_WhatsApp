// Alerts API — configure, test, and view alert history
const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { checkAndSendAlert, sendTestAlert } = require('../services/alerts');
const { generateDailySummary, generateSaasSummary } = require('../services/reportGenerator');

const router = express.Router();

// ── GET /api/alerts — List all alert configs for tenant ────────
router.get('/', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { rows } = await pool.query(
      `SELECT * FROM alert_configurations
        WHERE tenant_id = $1
        ORDER BY alert_type`,
      [tenantId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/alerts/:alertType — Upsert alert config ──────────
router.put('/:alertType', requireAuth, requirePermission('settings', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { alertType } = req.params;
    const allowedTypes = ['negative_sentiment', 'high_priority_customer', 'campaign_complete', 'daily_summary'];
    if (!allowedTypes.includes(alertType)) {
      return res.status(400).json({ error: `alert_type must be one of: ${allowedTypes.join(', ')}` });
    }

    const { enabled, notify_phones, notify_emails, threshold, schedule, report_format } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO alert_configurations
         (tenant_id, alert_type, enabled, notify_phones, notify_emails, threshold, schedule, report_format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, alert_type) DO UPDATE SET
         enabled = COALESCE($3, alert_configurations.enabled),
         notify_phones = COALESCE($4, alert_configurations.notify_phones),
         notify_emails = COALESCE($5, alert_configurations.notify_emails),
         threshold = COALESCE($6, alert_configurations.threshold),
         schedule = COALESCE($7, alert_configurations.schedule),
         report_format = COALESCE($8, alert_configurations.report_format),
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        alertType,
        enabled ?? true,
        notify_phones ? JSON.stringify(notify_phones) : null,
        notify_emails ? JSON.stringify(notify_emails) : null,
        threshold ? JSON.stringify(threshold) : null,
        schedule || null,
        report_format || null,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/alerts/log — Alert history with pagination ────────
router.get('/log', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: [countRow] }] = await Promise.all([
      pool.query(
        `SELECT * FROM alert_log
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM alert_log WHERE tenant_id = $1`,
        [tenantId]
      ),
    ]);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRow.total, 10),
        totalPages: Math.ceil(parseInt(countRow.total, 10) / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/alerts/test/:alertType — Send test alert ─────────
router.post('/test/:alertType', requireAuth, requirePermission('settings', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const result = await sendTestAlert(tenantId, req.params.alertType);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/alerts/send-summary — Manually trigger daily summary ──
router.post('/send-summary', requireAuth, requirePermission('settings', 'edit'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    await checkAndSendAlert(tenantId, 'daily_summary', {});
    res.json({ sent: true, message: 'Daily summary alert dispatched' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/alerts/preview-summary/:type — Preview summary without sending ──
router.get('/preview-summary/:type', requireAuth, requirePermission('settings', 'view'), async (req, res, next) => {
  try {
    const { type } = req.params;

    if (type === 'saas') {
      const summary = await generateSaasSummary();
      return res.json(summary);
    }

    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const summary = await generateDailySummary(tenantId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
