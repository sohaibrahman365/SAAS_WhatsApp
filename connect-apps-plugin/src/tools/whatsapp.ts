import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";

export function registerWhatsAppTools(server: McpServer) {
  // Send a single WhatsApp text message
  server.registerTool(
    "whatsapp_send_message",
    {
      description: "Send a WhatsApp text message to a single phone number",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format (e.g. +923001234567)"),
        message: z.string().describe("Message body text"),
      },
    },
    async ({ to, message }) => {
      const response = await axios.post(
        `${config.whatsapp.baseUrl}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
    }
  );

  // Send a template message (for campaign blasts — required after 24h window)
  server.registerTool(
    "whatsapp_send_template",
    {
      description:
        "Send a pre-approved WhatsApp template message. Required for outbound marketing campaigns.",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        templateName: z.string().describe("Approved template name"),
        languageCode: z.string().default("en").describe("Language code (e.g. en, ur)"),
        parameters: z
          .array(z.string())
          .optional()
          .describe("Ordered list of body parameter values to inject into the template"),
      },
    },
    async ({ to, templateName, languageCode, parameters }) => {
      const components =
        parameters && parameters.length > 0
          ? [
              {
                type: "body",
                parameters: parameters.map((value) => ({ type: "text", text: value })),
              },
            ]
          : undefined;

      const response = await axios.post(
        `${config.whatsapp.baseUrl}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components ? { components } : {}),
          },
        },
        { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
    }
  );

  // Get message delivery status
  server.registerTool(
    "whatsapp_get_message_status",
    {
      description: "Retrieve delivery/read status for a sent WhatsApp message by message ID",
      inputSchema: {
        messageId: z.string().describe("WhatsApp message ID returned by the send API"),
      },
    },
    async ({ messageId }) => {
      const response = await axios.get(
        `https://graph.facebook.com/${config.whatsapp.apiVersion}/${messageId}`,
        { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
    }
  );
}
