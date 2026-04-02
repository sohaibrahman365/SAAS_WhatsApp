// Claude AI Analysis Service
// Supports per-tenant credentials and custom AI prompts
// Falls back to platform env vars, then stub mode

const { getAICredentials } = require('./tenantSettings');

function isStubMode() {
  const key = process.env.ANTHROPIC_API_KEY;
  return !key || key.startsWith('xxx');
}

// Analyze a WhatsApp reply — returns sentiment, intent, key phrases, suggested reply
async function analyzeResponse(responseText, campaignContext, tenantId) {
  const creds = tenantId
    ? await getAICredentials(tenantId)
    : { apiKey: process.env.ANTHROPIC_API_KEY, promptContext: '', model: 'claude-haiku-4-5-20250401' };

  const apiKey = creds.apiKey;

  if (!apiKey || apiKey.startsWith('xxx')) {
    console.log(`[ai:stub] Analyzing: "${responseText.slice(0, 60)}"`);
    return stubAnalysis(responseText);
  }

  // Build rich business context from tenant's AI knowledge base
  let businessContext = '';
  if (creds.industry) businessContext += `Industry: ${creds.industry}\n`;
  if (creds.targetAudience) businessContext += `Target audience: ${creds.targetAudience}\n`;
  if (creds.businessSemantics) businessContext += `Business semantics & terminology: ${creds.businessSemantics}\n`;
  if (creds.knowledgeBase) businessContext += `Business knowledge: ${creds.knowledgeBase}\n`;
  if (creds.webpageUrl) businessContext += `Business website: ${creds.webpageUrl}\n`;
  if (creds.sampleReplies) businessContext += `Example ideal replies:\n${creds.sampleReplies}\n`;
  if (creds.promptContext) businessContext += `Additional context: ${creds.promptContext}\n`;

  const toneInstruction = creds.replyTone
    ? `\nIMPORTANT: The suggested_reply must use a ${creds.replyTone} tone.`
    : '';

  const prompt = `You are analyzing a customer's WhatsApp reply to a marketing campaign.
${businessContext ? '\n--- BUSINESS CONTEXT ---\n' + businessContext + '--- END CONTEXT ---\n' : ''}
Campaign context:
- Campaign: ${campaignContext.campaignName || 'N/A'}
- Product: ${campaignContext.productName || 'N/A'}
- Original message: ${campaignContext.messageTemplate || 'N/A'}

Customer reply: "${responseText}"

Analyze and return ONLY valid JSON (no markdown, no code fences):
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": 0.00-1.00,
  "intent": "interested" | "not_interested" | "inquiry" | "order" | "feedback" | "complaint" | "unsubscribe",
  "key_phrases": ["phrase1", "phrase2"],
  "extracted_info": { "any relevant structured data" },
  "suggested_reply": "A helpful follow-up message",
  "confidence": 0.00-1.00
}${toneInstruction}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: creds.model || 'claude-haiku-4-5-20250401',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('[ai] Anthropic API error:', json.error?.message || res.status);
    return stubAnalysis(responseText);
  }

  const text = json.content?.[0]?.text || '{}';
  try {
    return JSON.parse(text);
  } catch {
    console.error('[ai] Failed to parse Claude response:', text);
    return stubAnalysis(responseText);
  }
}

// Keyword-based stub analysis for when API key is not configured
function stubAnalysis(text) {
  const lower = text.toLowerCase();

  let sentiment = 'neutral';
  let sentiment_score = 0.5;
  let intent = 'feedback';

  const positiveWords = ['yes', 'interested', 'buy', 'want', 'love', 'great', 'order', 'please', 'send', 'price'];
  const negativeWords = ['no', 'stop', 'not interested', 'unsubscribe', 'remove', 'don\'t', 'expensive', 'spam'];

  const posCount = positiveWords.filter(w => lower.includes(w)).length;
  const negCount = negativeWords.filter(w => lower.includes(w)).length;

  if (posCount > negCount) {
    sentiment = 'positive';
    sentiment_score = Math.min(0.6 + posCount * 0.1, 1.0);
    intent = lower.includes('order') || lower.includes('buy') ? 'order' : 'interested';
  } else if (negCount > posCount) {
    sentiment = 'negative';
    sentiment_score = Math.max(0.4 - negCount * 0.1, 0.0);
    intent = lower.includes('unsubscribe') || lower.includes('stop') ? 'unsubscribe' : 'not_interested';
  }

  if (lower.includes('?') || lower.includes('how') || lower.includes('what') || lower.includes('when')) {
    intent = 'inquiry';
  }

  return {
    sentiment,
    sentiment_score,
    intent,
    key_phrases: text.split(/\s+/).slice(0, 5),
    extracted_info: {},
    suggested_reply: sentiment === 'positive'
      ? 'Thank you for your interest! How can we help you further?'
      : sentiment === 'negative'
        ? 'We appreciate your feedback. Is there anything we can improve?'
        : 'Thank you for your response. Would you like more information?',
    confidence: 0.5,
  };
}

module.exports = { analyzeResponse, isStubMode };
