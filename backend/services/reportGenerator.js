// Report Generator — daily summaries for tenants and platform owner
const pool = require('../config/db');

/**
 * Generate a daily summary for a single tenant.
 * Returns { text, html, data } with today's key metrics.
 */
async function generateDailySummary(tenantId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Active campaigns today
  const { rows: [campRow] } = await pool.query(
    `SELECT COUNT(*) AS active_campaigns
       FROM campaigns
      WHERE tenant_id = $1
        AND status = 'active'
        AND DATE(sent_at) = $2`,
    [tenantId, today]
  );

  // Messages sent today
  const { rows: [sentRow] } = await pool.query(
    `SELECT COUNT(*) AS messages_sent
       FROM campaign_recipients cr
       JOIN campaigns c ON c.id = cr.campaign_id
      WHERE c.tenant_id = $1
        AND cr.message_sent = true
        AND DATE(cr.sent_at) = $2`,
    [tenantId, today]
  );

  // Replies received today
  const { rows: [replyRow] } = await pool.query(
    `SELECT COUNT(*) AS replies_received
       FROM campaign_responses r
       JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.tenant_id = $1
        AND DATE(r.received_at) = $2`,
    [tenantId, today]
  );

  // Sentiment breakdown
  const { rows: sentimentRows } = await pool.query(
    `SELECT sentiment, COUNT(*) AS cnt
       FROM campaign_responses r
       JOIN campaigns c ON c.id = r.campaign_id
      WHERE c.tenant_id = $1
        AND DATE(r.received_at) = $2
        AND r.ai_analyzed = true
      GROUP BY sentiment`,
    [tenantId, today]
  );

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentRows) {
    if (sentiment.hasOwnProperty(row.sentiment)) {
      sentiment[row.sentiment] = parseInt(row.cnt, 10);
    }
  }

  // Top 3 customers by priority score
  const { rows: topCustomers } = await pool.query(
    `SELECT c.name, c.phone, ceh.priority_score
       FROM customer_engagement_history ceh
       JOIN customers c ON c.id = ceh.customer_id
      WHERE ceh.tenant_id = $1
      ORDER BY ceh.priority_score DESC
      LIMIT 3`,
    [tenantId]
  );

  const data = {
    date: today,
    activeCampaigns: parseInt(campRow.active_campaigns, 10),
    messagesSent: parseInt(sentRow.messages_sent, 10),
    repliesReceived: parseInt(replyRow.replies_received, 10),
    sentiment,
    topCustomers,
  };

  const text = formatDailySummaryText(data);
  const html = formatDailySummaryHtml(data);

  return { text, html, data };
}

function formatDailySummaryText(d) {
  let msg = `GeniSearch Daily Summary — ${d.date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Active Campaigns: ${d.activeCampaigns}\n`;
  msg += `Messages Sent: ${d.messagesSent}\n`;
  msg += `Replies Received: ${d.repliesReceived}\n`;
  msg += `Sentiment: +${d.sentiment.positive} / ~${d.sentiment.neutral} / -${d.sentiment.negative}\n`;
  if (d.topCustomers.length) {
    msg += `\nTop Customers:\n`;
    for (const c of d.topCustomers) {
      msg += `  • ${c.name || 'Unknown'} (${c.phone}) — Score: ${c.priority_score}\n`;
    }
  }
  return msg;
}

function formatDailySummaryHtml(d) {
  let topRows = '';
  for (const c of d.topCustomers) {
    topRows += `<tr><td>${c.name || 'Unknown'}</td><td>${c.phone}</td><td>${c.priority_score}</td></tr>`;
  }

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1a73e8;">GeniSearch Daily Summary</h2>
      <p style="color:#666;">${d.date}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Active Campaigns</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.activeCampaigns}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Messages Sent</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.messagesSent}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Replies Received</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.repliesReceived}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Sentiment (+/~/−)</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">
              <span style="color:#34a853;">${d.sentiment.positive}</span> /
              <span style="color:#fbbc04;">${d.sentiment.neutral}</span> /
              <span style="color:#ea4335;">${d.sentiment.negative}</span>
            </td></tr>
      </table>
      ${d.topCustomers.length ? `
        <h3>Top Customers</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;">Name</th>
              <th style="padding:8px;text-align:left;">Phone</th>
              <th style="padding:8px;text-align:left;">Score</th></tr>
          ${topRows}
        </table>` : ''}
    </div>`;
}

/**
 * Generate a SaaS platform-wide summary (for super_admin / platform owner).
 */
async function generateSaasSummary() {
  const today = new Date().toISOString().slice(0, 10);

  // Total active tenants
  const { rows: [tenantRow] } = await pool.query(
    `SELECT COUNT(DISTINCT id) AS active_tenants
       FROM tenants
      WHERE status = 'active'`
  );

  // Total campaigns across all tenants today
  const { rows: [campRow] } = await pool.query(
    `SELECT COUNT(*) AS total_campaigns
       FROM campaigns
      WHERE status = 'active'
        AND DATE(sent_at) = $1`,
    [today]
  );

  // Total messages, replies, conversions today
  const { rows: [msgRow] } = await pool.query(
    `SELECT COUNT(*) AS total_messages
       FROM campaign_recipients
      WHERE message_sent = true
        AND DATE(sent_at) = $1`,
    [today]
  );

  const { rows: [replyRow] } = await pool.query(
    `SELECT COUNT(*) AS total_replies
       FROM campaign_responses
      WHERE DATE(received_at) = $1`,
    [today]
  );

  const { rows: [convRow] } = await pool.query(
    `SELECT COALESCE(SUM(conversion_count), 0) AS total_conversions
       FROM campaigns
      WHERE DATE(sent_at) = $1`,
    [today]
  );

  // MRR total (from tenants table or billing — use plan_price if available)
  let mrr = 0;
  try {
    const { rows: [mrrRow] } = await pool.query(
      `SELECT COALESCE(SUM(
        CASE plan WHEN 'starter' THEN 49 WHEN 'growth' THEN 149 WHEN 'enterprise' THEN 499 ELSE 0 END
       ), 0) AS mrr
       FROM tenants WHERE status = 'active'`
    );
    mrr = parseFloat(mrrRow.mrr);
  } catch {
    // plan column may not exist — that's fine
  }

  const data = {
    date: today,
    activeTenants: parseInt(tenantRow.active_tenants, 10),
    totalCampaigns: parseInt(campRow.total_campaigns, 10),
    totalMessages: parseInt(msgRow.total_messages, 10),
    totalReplies: parseInt(replyRow.total_replies, 10),
    totalConversions: parseInt(convRow.total_conversions, 10),
    mrr,
  };

  const text = formatSaasSummaryText(data);
  const html = formatSaasSummaryHtml(data);

  return { text, html, data };
}

function formatSaasSummaryText(d) {
  let msg = `GeniSearch Platform Summary — ${d.date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Active Tenants: ${d.activeTenants}\n`;
  msg += `Campaigns Today: ${d.totalCampaigns}\n`;
  msg += `Messages Sent: ${d.totalMessages}\n`;
  msg += `Replies: ${d.totalReplies}\n`;
  msg += `Conversions: ${d.totalConversions}\n`;
  msg += `MRR: $${d.mrr.toLocaleString()}\n`;
  return msg;
}

function formatSaasSummaryHtml(d) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1a73e8;">GeniSearch Platform Summary</h2>
      <p style="color:#666;">${d.date}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Active Tenants</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.activeTenants}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Campaigns Today</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.totalCampaigns}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Messages Sent</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.totalMessages}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Replies</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.totalReplies}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">Conversions</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${d.totalConversions}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">MRR</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#34a853;">$${d.mrr.toLocaleString()}</td></tr>
      </table>
    </div>`;
}

module.exports = { generateDailySummary, generateSaasSummary };
