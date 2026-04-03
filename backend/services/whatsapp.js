// WhatsApp Cloud API client
// Supports per-tenant credentials via tenant_settings table
// Falls back to platform env vars, then stub mode

const { getWhatsAppCredentials } = require('./tenantSettings');

const API_VERSION = 'v19.0';

function isStubMode() {
  const token = process.env.WHATSAPP_API_TOKEN;
  return !token || token.startsWith('xxx');
}

// Send a plain-text WhatsApp message (supports per-tenant credentials)
async function sendTextMessage(to, body, tenantId) {
  const creds = tenantId
    ? await getWhatsAppCredentials(tenantId)
    : { token: process.env.WHATSAPP_API_TOKEN, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID };

  const token = creds.token;
  const phoneNumberId = creds.phoneNumberId;

  if (!token || token.startsWith('xxx')) {
    const stubId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[whatsapp:stub] → ${to}: ${body.slice(0, 80)}`);
    return { messages: [{ id: stubId }] };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `WhatsApp API error ${res.status}`);
  }
  return json;
}

// Replace {{customer_name}}, {{product_name}}, {{discount}} in template
function personalizeMessage(template, vars) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// Send a WhatsApp image message with optional caption
async function sendImageMessage(to, imageUrl, caption, tenantId) {
  const creds = tenantId
    ? await getWhatsAppCredentials(tenantId)
    : { token: process.env.WHATSAPP_API_TOKEN, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID };

  const token = creds.token;
  const phoneNumberId = creds.phoneNumberId;

  if (!token || token.startsWith('xxx')) {
    const stubId = `stub_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[whatsapp:stub] → ${to}: [IMAGE] ${imageUrl} | ${(caption || '').slice(0, 60)}`);
    return { messages: [{ id: stubId }] };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption: caption || '' },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `WhatsApp API error ${res.status}`);
  }
  return json;
}

module.exports = { sendTextMessage, sendImageMessage, personalizeMessage, isStubMode };
