/**
 * Mock external tracker as an MCP server — stands in for mcp-atlassian / the
 * Slack MCP so the connector layer can be tested end to end without real creds.
 * Exposes create_issue (returns {key}) and keeps an in-memory issue store that
 * a webhook test can reference. Run: tsx scripts/mock-tracker-mcp.ts
 */
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const issues = new Map<string, { key: string; title: string; status: string }>();
let counter = 0;

function build() {
  const server = new McpServer({ name: "mock-tracker", version: "0.1.0" });
  server.registerTool(
    "create_issue",
    {
      description: "Create a tracker issue.",
      inputSchema: { title: z.string(), description: z.string().optional() },
    },
    async ({ title }) => {
      counter += 1;
      const key = `MOCK-${counter}`;
      issues.set(key, { key, title, status: "todo" });
      return { content: [{ type: "text", text: JSON.stringify({ key, title, url: `https://tracker.example/${key}` }) }] };
    },
  );
  server.registerTool(
    "list_issues",
    { description: "List created issues.", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: JSON.stringify([...issues.values()]) }] }),
  );
  return server;
}

const httpServer = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = build();
    await server.connect(transport);
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await transport.handleRequest(req, res, body);
  });
});

const port = Number(process.env.MOCK_PORT ?? 8799);
httpServer.listen(port, () => console.log(`mock-tracker MCP listening on :${port}/mcp`));
