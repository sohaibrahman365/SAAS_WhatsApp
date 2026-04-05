// Alert dispatcher — checks config, formats messages, sends via WhatsApp + Email
const pool = require('../config/db');
const { sendTextMessage } = require('./whatsapp');
const { sendEmail } = require('./email');
const { generateDailySummary } = require('./reportGenerator');

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes — prevent alert storms

/**
 * Main entry point: check if alert is configured + enabled, then dispatch.
 *
 * @param {string} tenantId
 * @param {string} alertType  e.g. 'negative_sentiment', 'high_priority_customer', 'campaign_complete', 'daily_summary'
 * @param {object} data       context data for the message formatter
 */
async function checkAndSendAlert(tenantId, alertType, data = {}) {
  // 1. Query alert_configurations for this tenant + alertType
  const { rows } = await pool.query(
    `SELECT * FROM alert_configurations
      WHERE tenant_id = $1 AND alert_type = $2`,
    [tenantId, alertType]
  );

  const config = rows[0];

  // 2. If not found or not enabled, return silently
  if (!config || !config.enabled) return;

  // 3. Cooldown check — skip if last alert was < 5 minutes ago
  if (config.last_sent_at) {
    const elapsed = Date.now() - new Date(config.last_sent_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      console.log(`[alerts] Cooldown active for ${alertType} (tenant ${tenantId}), skipping`);
      return;
    }
  }

  // 4. Format message
  let message;
  if (alertType === 'daily_summary') {
    message = await generateDailySummary(tenantId);
  } else {
    message = formatAlertMessage(alertType, data);
  }

  const phones = config.notify_phones || [];
  const emails = config.notify_emails || [];

  // 5. Dispatch to all recipients in parallel
  await dispatchToRecipients(tenantId, alertType, message, phones, emails, data);

  // 6. Update last_sent_at
  await pool.query(
    `UPDATE alert_configurations SET last_sent_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1 AND alert_type = $2`,
    [tenantId, alertType]
  );
}

/**
 * Send alert to all phones (WhatsApp) and emails in parallel.
 * @param {string} statusPrefix — use '' for real alerts, 'test_' for test alerts
 * @returns {Array<{channel, recipient, status, error?}>}
 */
async function dispatchToRecipients(tenantId, alertType, message, phones, emails, data, statusPrefix = '') {
  const results = [];

  const whatsappTasks = phones.map(async (phone) => {
    try {
      await sendTextMessage(phone, message.text, tenantId);
      await logAlert(tenantId, alertType, 'whatsapp', phone, message.text, `${statusPrefix}sent`);
      results.push({ channel: 'whatsapp', recipient: phone, status: 'sent' });
    } catch (err) {
      console.error(`[alerts] WhatsApp send failed to ${phone}:`, err.message);
      await logAlert(tenantId, alertType, 'whatsapp', phone, message.text, `${statusPrefix}failed`, err.message);
      results.push({ channel: 'whatsapp', recipient: phone, status: 'failed', error: err.message });
    }
  });

  const subject = `${statusPrefix ? '[TEST] ' : ''}${getAlertSubject(alertType, data)}`;
  const emailText = statusPrefix ? `[TEST ALERT]\n\n${message.text}` : message.text;
  const emailHtml = statusPrefix
    ? `<div style="background:#fff3cd;padding:8px 12px;margin-bottom:12px;border-radius:4px;"><strong>TEST ALERT</strong></div>${message.html}`
    : message.html;

  const emailTasks = emails.map(async (email) => {
    try {
      const result = await sendEmail(tenantId, { to: email, subject, text: emailText, html: emailHtml });
      const status = result.sent || result.stub ? 'sent' : 'failed';
      await logAlert(tenantId, alertType, 'email', email, message.text, `${statusPrefix}${status}`, result.error);
      results.push({ channel: 'email', recipient: email, status, stub: result.stub });
    } catch (err) {
      console.error(`[alerts] Email send failed to ${email}:`, err.message);
      await logAlert(tenantId, alertType, 'email', email, message.text, `${statusPrefix}failed`, err.message);
      results.push({ channel: 'email', recipient: email, status: 'failed', error: err.message });
    }
  });

  await Promise.all([...whatsappTasks, ...emailTasks]);
  return results;
}

/**
 * Format an alert message based on type and data.
 * @returns {{ text: string, html: string }}
 */
function formatAlertMessage(alertType, data) {
  switch (alertType) {
    case 'negative_sentiment': {
      const text = `Alert: Negative sentiment detected from ${data.customer_name || 'Unknown'} (${data.phone || 'N/A'}) in campaign '${data.campaign_name || 'N/A'}'. Message: '${data.response_text || ''}'. Sentiment score: ${data.sentiment_score ?? 'N/A'}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-left:4px solid #ea4335;padding:16px;">
          <h3 style="color:#ea4335;margin-top:0;">Negative Sentiment Alert</h3>
          <p><strong>Customer:</strong> ${escapeHtml(data.customer_name || 'Unknown')} (${escapeHtml(data.phone || 'N/A')})</p>
          <p><strong>Campaign:</strong> ${escapeHtml(data.campaign_name || 'N/A')}</p>
          <p><strong>Message:</strong> &ldquo;${escapeHtml(data.response_text || '')}&rdquo;</p>
          <p><strong>Sentiment Score:</strong> ${data.sentiment_score ?? 'N/A'}</p>
        </div>`;
      return { text, html };
    }

    case 'high_priority_customer': {
      const text = `High Priority: Customer ${data.name || 'Unknown'} (${data.phone || 'N/A'}) has reached priority score ${data.score || 'N/A'}. ${data.context || ''}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-left:4px solid #fbbc04;padding:16px;">
          <h3 style="color:#fbbc04;margin-top:0;">High Priority Customer</h3>
          <p><strong>Customer:</strong> ${escapeHtml(data.name || 'Unknown')} (${escapeHtml(data.phone || 'N/A')})</p>
          <p><strong>Priority Score:</strong> ${data.score || 'N/A'}</p>
          ${data.context ? `<p>${escapeHtml(data.context)}</p>` : ''}
        </div>`;
      return { text, html };
    }

    case 'campaign_complete': {
      const text = `Campaign '${data.campaign_name || 'N/A'}' completed. Sent: ${data.sent ?? 0}, Delivered: ${data.delivered ?? 'N/A'}, Replies: ${data.replies ?? 'N/A'}, Conversions: ${data.conversions ?? 'N/A'}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border-left:4px solid #34a853;padding:16px;">
          <h3 style="color:#34a853;margin-top:0;">Campaign Complete</h3>
          <p><strong>Campaign:</strong> ${escapeHtml(data.campaign_name || 'N/A')}</p>
          <table style="border-collapse:collapse;margin:12px 0;">
            <tr><td style="padding:4px 12px 4px 0;">Sent:</td><td style="font-weight:bold;">${data.sent ?? 0}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;">Delivered:</td><td style="font-weight:bold;">${data.delivered ?? 'N/A'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;">Replies:</td><td style="font-weight:bold;">${data.replies ?? 'N/A'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;">Conversions:</td><td style="font-weight:bold;">${data.conversions ?? 'N/A'}</td></tr>
          </table>
        </div>`;
      return { text, html };
    }

    default: {
      const text = `GeniSearch Alert [${alertType}]: ${JSON.stringify(data)}`;
      const html = `<div style="font-family:Arial,sans-serif;"><h3>Alert: ${alertType}</h3><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
      return { text, html };
    }
  }
}

/**
 * Get a subject line for email alerts.
 */
function getAlertSubject(alertType, data) {
  switch (alertType) {
    case 'negative_sentiment':
      return `[GeniSearch] Negative Sentiment — ${data.customer_name || 'Customer'}`;
    case 'high_priority_customer':
      return `[GeniSearch] High Priority Customer — ${data.name || 'Customer'}`;
    case 'campaign_complete':
      return `[GeniSearch] Campaign Complete — ${data.campaign_name || 'Campaign'}`;
    case 'daily_summary':
      return `[GeniSearch] Daily Summary — ${new Date().toISOString().slice(0, 10)}`;
    default:
      return `[GeniSearch] Alert — ${alertType}`;
  }
}

/**
 * Log an alert send attempt to the alert_log table.
 */
async function logAlert(tenantId, alertType, channel, recipient, messagePreview, status, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO alert_log (tenant_id, alert_type, channel, recipient, message_preview, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, alertType, channel, recipient, (messagePreview || '').slice(0, 500), status, errorMessage || null]
    );
  } catch (err) {
    console.error('[alerts] Failed to log alert:', err.message);
  }
}

/**
 * Send a test alert with sample data.
 */
async function sendTestAlert(tenantId, alertType) {
  const sampleData = {
    negative_sentiment: {
      customer_name: 'Test Customer',
      phone: '+1234567890',
      campaign_name: 'Test Campaign',
      response_text: 'I am not happy with this product at all!',
      sentiment_score: -0.85,
    },
    high_priority_customer: {
      name: 'VIP Customer',
      phone: '+1234567890',
      score: 95,
      context: 'Frequent buyer with high engagement rate.',
    },
    campaign_complete: {
      campaign_name: 'Summer Sale 2025',
      sent: 1000,
      delivered: 980,
      replies: 120,
      conversions: 45,
    },
    daily_summary: {}, // uses generateDailySummary
  };

  const data = sampleData[alertType] || { message: 'Test alert' };

  // For test alerts, bypass cooldown — send directly
  const { rows } = await pool.query(
    `SELECT * FROM alert_configurations
      WHERE tenant_id = $1 AND alert_type = $2`,
    [tenantId, alertType]
  );

  const config = rows[0];
  if (!config) {
    return { sent: false, reason: 'No alert configuration found. Create one first.' };
  }

  let message;
  if (alertType === 'daily_summary') {
    message = await generateDailySummary(tenantId);
  } else {
    message = formatAlertMessage(alertType, data);
  }

  const phones = config.notify_phones || [];
  const emails = config.notify_emails || [];
  const results = await dispatchToRecipients(tenantId, alertType, message, phones, emails, data, 'test_');

  return { sent: true, results };
}

module.exports = { checkAndSendAlert, sendTestAlert };
