// Email sending service — per-tenant SMTP/SendGrid with platform fallback
const nodemailer = require('nodemailer');
const { getEmailCredentials } = require('./tenantSettings');

// Cache transports per config fingerprint to avoid re-creating
const transportCache = new Map();

function getTransportKey(creds) {
  if (creds.sendgridApiKey) return `sg:${creds.sendgridApiKey.slice(-8)}`;
  if (creds.smtpHost) return `smtp:${creds.smtpHost}:${creds.smtpPort}:${creds.smtpUser || ''}`;
  return 'stub';
}

function createTransport(creds) {
  // SendGrid takes priority
  if (creds.sendgridApiKey) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: creds.sendgridApiKey,
      },
    });
  }

  // SMTP credentials
  if (creds.smtpHost && creds.smtpPass) {
    return nodemailer.createTransport({
      host: creds.smtpHost,
      port: parseInt(creds.smtpPort, 10) || 587,
      secure: parseInt(creds.smtpPort, 10) === 465,
      auth: creds.smtpUser
        ? { user: creds.smtpUser, pass: creds.smtpPass }
        : undefined,
    });
  }

  // Stub — no transport
  return null;
}

function getOrCreateTransport(creds) {
  const key = getTransportKey(creds);
  if (key === 'stub') return null;

  let transport = transportCache.get(key);
  if (!transport) {
    transport = createTransport(creds);
    if (transport) transportCache.set(key, transport);
  }
  return transport;
}

/**
 * Send an email using tenant-level or platform-level credentials.
 * Falls back to stub mode (console.log) when nothing is configured.
 *
 * @param {string} tenantId
 * @param {{ to: string|string[], subject: string, text?: string, html?: string }} options
 * @returns {Promise<{ sent: boolean, messageId?: string, stub?: boolean }>}
 */
async function sendEmail(tenantId, { to, subject, text, html }) {
  const creds = await getEmailCredentials(tenantId);
  const transport = getOrCreateTransport(creds);

  if (!transport) {
    // Stub mode — log and return
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    console.log(`[email:stub] → ${recipients} | Subject: ${subject}`);
    if (text) console.log(`[email:stub] Body: ${text.slice(0, 200)}`);
    return { sent: false, stub: true };
  }

  const from = creds.fromName
    ? `"${creds.fromName}" <${creds.fromEmail}>`
    : creds.fromEmail;

  try {
    const info = await transport.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
    });

    console.log(`[email] Sent to ${to} | messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Send failed to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Check if email is in stub mode for a tenant.
 */
async function isStubMode(tenantId) {
  const creds = await getEmailCredentials(tenantId);
  return !creds.isConfigured;
}

module.exports = { sendEmail, isStubMode };
