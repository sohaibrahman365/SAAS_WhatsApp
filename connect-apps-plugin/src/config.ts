import "dotenv/config";

export const config = {
  whatsapp: {
    token: process.env.WHATSAPP_API_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v19.0",
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    },
  },
  database: {
    url: process.env.DATABASE_URL ?? "",
  },
  n8n: {
    webhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL ?? "",
    apiKey: process.env.N8N_API_KEY ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },
};
