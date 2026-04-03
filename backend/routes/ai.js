const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { analyzeResponse, isStubMode } = require('../services/ai');

const router = express.Router();

// GET /api/ai/status — check if Claude API is configured
router.get('/status', requireAuth, requirePermission('ai', 'view'), (req, res) => {
  res.json({
    configured: !isStubMode(),
    stub_mode: isStubMode(),
  });
});

// POST /api/ai/analyze — manually analyze a text
// Body: { text, campaignId? }
router.post('/analyze', requireAuth, requirePermission('ai', 'analyze'), async (req, res, next) => {
  try {
    const { text, campaignId } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    let campaignContext = {};
    if (campaignId) {
      const { rows } = await pool.query(
        `SELECT c.name AS campaign_name, c.message_template, p.name AS product_name
           FROM campaigns c
           LEFT JOIN products p ON p.id = c.product_id
          WHERE c.id = $1`,
        [campaignId]
      );
      if (rows[0]) {
        campaignContext = {
          campaignName:    rows[0].campaign_name,
          productName:     rows[0].product_name,
          messageTemplate: rows[0].message_template,
        };
      }
    }

    const analysis = await analyzeResponse(text, campaignContext);
    res.json({ stub: isStubMode(), analysis });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/analyze-response/:responseId — analyze an existing campaign_response row
router.post('/analyze-response/:responseId', requireAuth, requirePermission('ai', 'analyze'), async (req, res, next) => {
  try {
    const { rows: responses } = await pool.query(
      `SELECT cr.response_text, cr.campaign_id,
              c.name AS campaign_name, c.message_template,
              p.name AS product_name
         FROM campaign_responses cr
         JOIN campaigns c ON c.id = cr.campaign_id
         LEFT JOIN products p ON p.id = c.product_id
        WHERE cr.id = $1`,
      [req.params.responseId]
    );

    if (!responses[0]) return res.status(404).json({ error: 'Response not found' });
    const row = responses[0];

    const analysis = await analyzeResponse(row.response_text, {
      campaignName:    row.campaign_name,
      productName:     row.product_name,
      messageTemplate: row.message_template,
    });

    // Update the response row with AI analysis
    await pool.query(
      `UPDATE campaign_responses
          SET sentiment       = $1,
              sentiment_score = $2,
              intent          = $3,
              key_phrases     = $4,
              extracted_info  = $5,
              suggested_reply = $6,
              ai_confidence   = $7,
              ai_analyzed     = true
        WHERE id = $8`,
      [
        analysis.sentiment,
        analysis.sentiment_score,
        analysis.intent,
        JSON.stringify(analysis.key_phrases || []),
        JSON.stringify(analysis.extracted_info || {}),
        analysis.suggested_reply,
        analysis.confidence,
        req.params.responseId,
      ]
    );

    res.json({ stub: isStubMode(), analysis });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/bulk-analyze/:campaignId — analyze all unanalyzed responses for a campaign
router.post('/bulk-analyze/:campaignId', requireAuth, requirePermission('ai', 'analyze'), async (req, res, next) => {
  try {
    const { rows: responses } = await pool.query(
      `SELECT cr.id, cr.response_text, c.name AS campaign_name, c.message_template, p.name AS product_name
         FROM campaign_responses cr
         JOIN campaigns c ON c.id = cr.campaign_id
         LEFT JOIN products p ON p.id = c.product_id
        WHERE cr.campaign_id = $1 AND cr.ai_analyzed = false`,
      [req.params.campaignId]
    );

    if (responses.length === 0) {
      return res.json({ message: 'No unanalyzed responses', analyzed: 0 });
    }

    let analyzed = 0, failed = 0;

    for (const row of responses) {
      try {
        const analysis = await analyzeResponse(row.response_text, {
          campaignName:    row.campaign_name,
          productName:     row.product_name,
          messageTemplate: row.message_template,
        });

        await pool.query(
          `UPDATE campaign_responses
              SET sentiment       = $1,
                  sentiment_score = $2,
                  intent          = $3,
                  key_phrases     = $4,
                  extracted_info  = $5,
                  suggested_reply = $6,
                  ai_confidence   = $7,
                  ai_analyzed     = true
            WHERE id = $8`,
          [
            analysis.sentiment,
            analysis.sentiment_score,
            analysis.intent,
            JSON.stringify(analysis.key_phrases || []),
            JSON.stringify(analysis.extracted_info || {}),
            analysis.suggested_reply,
            analysis.confidence,
            row.id,
          ]
        );
        analyzed++;
      } catch (err) {
        console.error(`[ai] Failed to analyze response ${row.id}:`, err.message);
        failed++;
      }
    }

    res.json({ analyzed, failed, total: responses.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
