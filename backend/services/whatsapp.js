// WhatsApp Cloud API client
// Runs in stub mode when WHATSAPP_API_TOKEN is missing or starts with 'xxx'

const API_VERSION = 'v19.0';

function isStubMode() {
  const token = process.env.WHATSAPP_API_TOKEN;
  return !token || token.startsWith('xxx');
}

function apiUrl() {
  return `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

// Send a plain-text WhatsApp message to a phone number (international format, no '+')
async function sendTextMessage(to, body) {
  if (isStubMode()) {
    const stubId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[whatsapp:stub] → ${to}: ${body.slice(0, 80)}`);
    return { messages: [{ id: stubId }] };
  }

  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
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

module.exports = { sendTextMessage, personalizeMessage, isStubMode };
