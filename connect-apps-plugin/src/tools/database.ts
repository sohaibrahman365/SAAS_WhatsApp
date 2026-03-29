import pg from "pg";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";

const pool = new pg.Pool({ connectionString: config.database.url });

export function registerDatabaseTools(server: McpServer) {
  // Generic read-only query (SELECT only)
  server.registerTool(
    "db_query",
    {
      description:
        "Run a read-only SQL SELECT query against the GeniSearch PostgreSQL database. " +
        "Only SELECT statements are allowed.",
      inputSchema: {
        sql: z.string().describe("SQL SELECT statement to execute"),
        params: z
          .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe("Parameterized query values ($1, $2, ...)"),
      },
    },
    async ({ sql, params }) => {
      const trimmed = sql.trim().toUpperCase();
      if (!trimmed.startsWith("SELECT")) {
        return {
          content: [{ type: "text", text: "Error: only SELECT queries are permitted via db_query." }],
        };
      }
      const result = await pool.query(sql, params ?? []);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ rowCount: result.rowCount, rows: result.rows }, null, 2),
          },
        ],
      };
    }
  );

  // Get campaign analytics summary
  server.registerTool(
    "db_get_campaign_analytics",
    {
      description: "Fetch performance metrics for a specific campaign",
      inputSchema: {
        campaignId: z.number().describe("Campaign ID"),
      },
    },
    async ({ campaignId }) => {
      const result = await pool.query(
        `SELECT
           c.id, c.name, c.status,
           c.sent_count, c.reply_count, c.conversion_count,
           ROUND(c.reply_count::numeric / NULLIF(c.sent_count, 0) * 100, 2) AS reply_rate_pct,
           ROUND(c.conversion_count::numeric / NULLIF(c.reply_count, 0) * 100, 2) AS conversion_rate_pct,
           COUNT(cr.id) AS total_responses,
           SUM(CASE WHEN cr.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_count,
           SUM(CASE WHEN cr.sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_count
         FROM campaigns c
         LEFT JOIN campaign_responses cr ON cr.campaign_id = c.id
         WHERE c.id = $1
         GROUP BY c.id`,
        [campaignId]
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows[0] ?? null, null, 2) }],
      };
    }
  );

  // Get high-priority customers (score >= threshold)
  server.registerTool(
    "db_get_priority_customers",
    {
      description:
        "List customers above a priority score threshold, ordered by score descending. " +
        "Priority score is 1–100 based on engagement history.",
      inputSchema: {
        minScore: z.number().min(1).max(100).default(70).describe("Minimum priority score (1–100)"),
        limit: z.number().min(1).max(500).default(50).describe("Max rows to return"),
      },
    },
    async ({ minScore, limit }) => {
      const result = await pool.query(
        `SELECT customer_phone, customer_name, priority_score, reply_rate, sentiment_score
         FROM customer_engagement_history
         WHERE priority_score >= $1
         ORDER BY priority_score DESC
         LIMIT $2`,
        [minScore, limit]
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: result.rowCount, customers: result.rows }, null, 2),
          },
        ],
      };
    }
  );

  // Get unprocessed campaign responses (for batch AI analysis)
  server.registerTool(
    "db_get_unanalyzed_responses",
    {
      description: "Fetch campaign responses that have not yet been analyzed by AI",
      inputSchema: {
        limit: z.number().min(1).max(200).default(50).describe("Max rows to return"),
      },
    },
    async ({ limit }) => {
      const result = await pool.query(
        `SELECT id, campaign_id, customer_phone, response_text, responded_at
         FROM campaign_responses
         WHERE sentiment IS NULL
         ORDER BY responded_at ASC
         LIMIT $1`,
        [limit]
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: result.rowCount, responses: result.rows }, null, 2),
          },
        ],
      };
    }
  );
}
