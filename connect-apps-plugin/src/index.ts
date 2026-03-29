#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerWhatsAppTools } from "./tools/whatsapp.js";
import { registerDatabaseTools } from "./tools/database.js";
import { registerN8nTools } from "./tools/n8n.js";
import { registerAiTools } from "./tools/ai.js";

const server = new McpServer({
  name: "genisearch-connect-apps",
  version: "1.0.0",
});

registerWhatsAppTools(server);
registerDatabaseTools(server);
registerN8nTools(server);
registerAiTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GeniSearch Connect Apps MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
