import Anthropic from "@anthropic-ai/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const ANALYSIS_SYSTEM_PROMPT = `You are a customer response analyst for a WhatsApp marketing platform.
Analyze customer messages and return ONLY valid JSON with this exact shape:
{
  "sentiment": "positive" | "neutral" | "negative",
  "intent": "interested" | "inquiry" | "order" | "feedback" | "unsubscribe" | "other",
  "priority_score": <number 1-100>,
  "key_phrases": [<up to 5 short phrases>],
  "suggested_reply": "<concise follow-up message under 160 chars>",
  "confidence": <0.0-1.0>
}
Priority score: 80-100 = hot lead/order intent, 50-79 = warm/inquiry, 20-49 = neutral, 1-19 = negative/unsubscribe.`;

export function registerAiTools(server: McpServer) {
  // Analyze a single customer response
  server.registerTool(
    "ai_analyze_response",
    {
      description:
        "Use Claude to analyze a WhatsApp customer reply. Returns sentiment, intent, " +
        "priority score (1–100), key phrases, and a suggested reply.",
      inputSchema: {
        responseText: z.string().describe("The customer's WhatsApp message text"),
        context: z
          .string()
          .optional()
          .describe("Optional context: product name, campaign offer, previous messages"),
      },
    },
    async ({ responseText, context }) => {
      const userMessage = context
        ? `Context: ${context}\n\nCustomer message: "${responseText}"`
        : `Customer message: "${responseText}"`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text : "";
      return {
        content: [{ type: "text", text: raw }],
      };
    }
  );

  // Batch analyze multiple responses
  server.registerTool(
    "ai_analyze_responses_batch",
    {
      description:
        "Analyze up to 20 customer responses in a single call. " +
        "Returns an array of analysis objects in the same order as the input.",
      inputSchema: {
        responses: z
          .array(
            z.object({
              id: z.union([z.string(), z.number()]).describe("Response ID for correlation"),
              text: z.string().describe("Customer message text"),
              context: z.string().optional().describe("Optional product/campaign context"),
            })
          )
          .min(1)
          .max(20),
      },
    },
    async ({ responses }) => {
      const results = await Promise.all(
        responses.map(async ({ id, text, context }) => {
          const userMessage = context
            ? `Context: ${context}\n\nCustomer message: "${text}"`
            : `Customer message: "${text}"`;

          const message = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001", // faster/cheaper for batch
            max_tokens: 512,
            system: ANALYSIS_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          });

          const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
          try {
            return { id, analysis: JSON.parse(raw) };
          } catch {
            return { id, analysis: null, raw };
          }
        })
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // Generate a campaign message for a product
  server.registerTool(
    "ai_generate_campaign_message",
    {
      description:
        "Generate a WhatsApp campaign message for a product. " +
        "Returns 3 variants (professional, casual, urgent) ready for A/B testing.",
      inputSchema: {
        productName: z.string().describe("Product name"),
        productDescription: z.string().optional().describe("Short product description"),
        offer: z.string().optional().describe("Discount or offer details (e.g. '20% off today only')"),
        targetAudience: z
          .string()
          .optional()
          .describe("Audience description (e.g. 'women 25-40, fashion-conscious')"),
        language: z.string().default("English").describe("Language for the message"),
      },
    },
    async ({ productName, productDescription, offer, targetAudience, language }) => {
      const prompt = [
        `Product: ${productName}`,
        productDescription ? `Description: ${productDescription}` : null,
        offer ? `Offer: ${offer}` : null,
        targetAudience ? `Target audience: ${targetAudience}` : null,
        `Language: ${language}`,
        "",
        "Generate 3 WhatsApp message variants (professional, casual, urgent). Keep each under 160 characters.",
        "Use {{customer_name}} as a placeholder where appropriate.",
        "Return ONLY valid JSON: { professional: string, casual: string, urgent: string }",
      ]
        .filter(Boolean)
        .join("\n");

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
      return {
        content: [{ type: "text", text: raw }],
      };
    }
  );
}
