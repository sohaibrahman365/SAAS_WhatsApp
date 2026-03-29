import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";

// Known n8n webhook paths for GeniSearch workflows
const WORKFLOWS = {
  campaign_sent: "campaign-sent",           // Triggered after a campaign is dispatched
  response_received: "response-received",   // Triggered when a customer replies
  high_value_lead: "high-value-lead",       // Posts to Slack + CRM for priority >= 80
  feedback_submitted: "feedback-submitted", // Logs feedback to Google Sheets
  daily_report: "daily-report",            // Sends scheduled BI summary email
} as const;

type WorkflowKey = keyof typeof WORKFLOWS;

function webhookUrl(path: string) {
  return `${config.n8n.webhookBaseUrl}/${path}`;
}

export function registerN8nTools(server: McpServer) {
  // Trigger any workflow by name
  server.registerTool(
    "n8n_trigger_workflow",
    {
      description:
        "Trigger an n8n automation workflow by name. " +
        `Known workflows: ${Object.keys(WORKFLOWS).join(", ")}`,
      inputSchema: {
        workflow: z
          .enum(Object.keys(WORKFLOWS) as [WorkflowKey, ...WorkflowKey[]])
          .describe("Workflow name to trigger"),
        payload: z
          .record(z.unknown())
          .optional()
          .describe("JSON payload to pass to the webhook"),
      },
    },
    async ({ workflow, payload }) => {
      const path = WORKFLOWS[workflow as WorkflowKey];
      const response = await axios.post(webhookUrl(path), payload ?? {}, {
        headers: {
          "Content-Type": "application/json",
          ...(config.n8n.apiKey ? { "X-N8N-API-KEY": config.n8n.apiKey } : {}),
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: response.status, data: response.data }, null, 2),
          },
        ],
      };
    }
  );

  // Convenience: notify high-value lead
  server.registerTool(
    "n8n_notify_high_value_lead",
    {
      description:
        "Send a high-value lead notification through n8n (posts to Slack and syncs to CRM). " +
        "Use when a customer has priority score >= 80 or expressed purchase intent.",
      inputSchema: {
        customerPhone: z.string().describe("Customer phone in E.164 format"),
        customerName: z.string().optional().describe("Customer display name"),
        priorityScore: z.number().min(1).max(100).describe("Calculated priority score"),
        campaignId: z.number().describe("Source campaign ID"),
        intent: z
          .enum(["interested", "order", "inquiry"])
          .describe("Detected customer intent"),
        responseText: z.string().describe("The customer's reply message"),
      },
    },
    async (payload) => {
      const response = await axios.post(webhookUrl(WORKFLOWS.high_value_lead), payload, {
        headers: {
          "Content-Type": "application/json",
          ...(config.n8n.apiKey ? { "X-N8N-API-KEY": config.n8n.apiKey } : {}),
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: response.status, data: response.data }, null, 2),
          },
        ],
      };
    }
  );
}
