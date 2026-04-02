const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendTextMessage, personalizeMessage, isStubMode } = require('../services/whatsapp');
const { analyzeResponse } = require('../services/ai');

const router = express.Router();

// ── Webhook verification (Meta calls this once during setup) ───
// GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[whatsapp] Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Webhook verification failed' });
});

// ── Incoming events from Meta ──────────────────────────────────
// POST /api/whatsapp/webhook
router.post('/webhook', async (req, res) => {
  // Always respond 200 immediately — Meta retries on failure
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Incoming messages
        for (const message of value.messages || []) {
          await handleIncomingMessage(message).catch(err =>
            console.error('[whatsapp] handleIncomingMessage error:', err.message)
          );
        }

        // Delivery / read status updates
        for (const status of value.statuses || []) {
          await handleStatusUpdate(status).catch(err =>
            console.error('[whatsapp] handleStatusUpdate error:', err.message)
          );
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] webhook processing error:', err.message);
  }
});

async function handleIncomingMessage(message) {
  const from = message.from;                        // phone without '+'
  const text = message.text?.body || '';

  // Find customer by phone
  const { rows: customers } = await pool.query(
    'SELECT id FROM customers WHERE phone = $1 LIMIT 1',
    [from]
  );
  if (!customers[0]) {
    console.log(`[whatsapp] Unrecognised sender: ${from}`);
    return;
  }
  const customerId = customers[0].id;

  // Find the most recent active campaign recipient for this customer
  const { rows: recipients } = await pool.query(
    `SELECT cr.id, cr.campaign_id
       FROM campaign_recipients cr
       JOIN campaigns c ON c.id = cr.campaign_id
      WHERE cr.customer_id = $1
        AND cr.message_sent = true
        AND c.status IN ('active', 'completed')
      ORDER BY cr.sent_at DESC
      LIMIT 1`,
    [customerId]
  );
  if (!recipients[0]) {
    console.log(`[whatsapp] No active campaign recipient for customer ${customerId}`);
    return;
  }
  const { id: recipientId, campaign_id: campaignId } = recipients[0];

  // Record the reply
  await pool.query(
    `UPDATE campaign_recipients
        SET replied = true, reply_count = reply_count + 1
      WHERE id = $1`,
    [recipientId]
  );

  await pool.query(
    'UPDATE campaigns SET reply_count = reply_count + 1 WHERE id = $1',
    [campaignId]
  );

  // Insert response row
  const { rows: inserted } = await pool.query(
    `INSERT INTO campaign_responses (campaign_id, recipient_id, response_text, response_type)
     VALUES ($1, $2, $3, 'text') RETURNING id`,
    [campaignId, recipientId, text]
  );

  console.log(`[whatsapp] Reply from ${from} → campaign ${campaignId}`);

  // Auto-analyze with Claude AI (async — don't block webhook)
  const responseId = inserted[0]?.id;
  if (responseId) {
    // Fetch campaign context for AI
    const { rows: ctx } = await pool.query(
      `SELECT c.name AS campaign_name, c.message_template, p.name AS product_name
         FROM campaigns c LEFT JOIN products p ON p.id = c.product_id
        WHERE c.id = $1`,
      [campaignId]
    );
    const cc = ctx[0] || {};

    analyzeResponse(text, {
      campaignName: cc.campaign_name,
      productName: cc.product_name,
      messageTemplate: cc.message_template,
    }).then(analysis =>
      pool.query(
        `UPDATE campaign_responses
            SET sentiment = $1, sentiment_score = $2, intent = $3,
                key_phrases = $4, extracted_info = $5, suggested_reply = $6,
                ai_confidence = $7, ai_analyzed = true
          WHERE id = $8`,
        [
          analysis.sentiment, analysis.sentiment_score, analysis.intent,
          JSON.stringify(analysis.key_phrases || []),
          JSON.stringify(analysis.extracted_info || {}),
          analysis.suggested_reply, analysis.confidence, responseId,
        ]
      )
    ).catch(err => console.error(`[ai:auto] Failed for response ${responseId}:`, err.message));
  }
}

async function handleStatusUpdate(status) {
  const { id: waMessageId, status: newStatus } = status;

  if (newStatus === 'delivered') {
    await pool.query(
      `UPDATE campaign_recipients SET delivered = true, delivered_at = NOW() WHERE wa_message_id = $1`,
      [waMessageId]
    );
    await pool.query(
      `UPDATE campaigns SET delivery_count = delivery_count + 1
        WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE wa_message_id = $1 LIMIT 1)`,
      [waMessageId]
    );
  } else if (newStatus === 'read') {
    await pool.query(
      `UPDATE campaign_recipients SET read = true, read_at = NOW() WHERE wa_message_id = $1`,
      [waMessageId]
    );
    await pool.query(
      `UPDATE campaigns SET read_count = read_count + 1
        WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE wa_message_id = $1 LIMIT 1)`,
      [waMessageId]
    );
  }
}

// ── Manual send (for testing individual messages) ─────────────
// POST /api/whatsapp/send
// Body: { to, message }
router.post('/send', requireAuth, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    const result = await sendTextMessage(to, message);
    res.json({
      stub: isStubMode(),
      wa_message_id: result.messages?.[0]?.id,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp/status — quick check of WhatsApp config
router.get('/status', requireAuth, requireRole('super_admin', 'admin'), (req, res) => {
  res.json({
    configured: !isStubMode(),
    stub_mode: isStubMode(),
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID
      ? `...${process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4)}`
      : null,
  });
});

module.exports = router;
