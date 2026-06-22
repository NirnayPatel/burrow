import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

// MCP-first integration layer. Burrow acts as an MCP *client*, connecting to an
// external MCP server (mcp-atlassian for Jira/Confluence, the official Slack MCP)
// with the org's own credentials. We build once against the MCP protocol and
// support any tool the server exposes — no bespoke REST clients per vendor.

export type ConnectionConfig = {
  mcpUrl: string;
  authEncrypted?: string;
  // Tool the external server exposes to create a tracker item, plus how its
  // result reports the external id. Defaults per target; overridable.
  createTool: string;
  externalIdField: string;
  // Shared secret for verifying inbound webhooks (HMAC), encrypted at rest.
  webhookSecretEncrypted?: string;
};

// Sensible defaults per integration target. The exact tool names match the
// community/official MCP servers we target; they're config, not hardcoded.
export const TARGET_DEFAULTS: Record<string, { createTool: string; externalIdField: string; label: string }> = {
  jira: { createTool: "jira_create_issue", externalIdField: "key", label: "Jira" },
  confluence: { createTool: "confluence_create_page", externalIdField: "id", label: "Confluence" },
  slack: { createTool: "slack_post_message", externalIdField: "ts", label: "Slack" },
  // Generic target for self-hosted / custom MCP servers and our test mock.
  custom: { createTool: "create_issue", externalIdField: "key", label: "Custom MCP" },
};

export async function withMcpClient<T>(
  cfg: ConnectionConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const token = cfg.authEncrypted ? decryptSecret(cfg.authEncrypted) : undefined;
  const transport = new StreamableHTTPClientTransport(new URL(cfg.mcpUrl), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const client = new Client({ name: "burrow", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// Probe a connection: returns the tool names the external server exposes, or
// throws if unreachable/unauthorized. Used on connect to fail fast in the UI.
export async function probeConnection(cfg: ConnectionConfig): Promise<string[]> {
  return withMcpClient(cfg, async (client) => {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name);
  });
}

// Parse an external id out of an MCP tool result. Tool results are content
// blocks; we look for a JSON block carrying the configured id field.
function extractExternalId(result: unknown, field: string): string | null {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      try {
        const obj = JSON.parse(block.text);
        if (obj && typeof obj === "object" && field in obj) return String(obj[field]);
      } catch {
        // not JSON — ignore
      }
    }
  }
  return null;
}

export type PushResult = { taskId: string; externalId: string | null; error?: string };

// Push tasks to the external tracker by calling its create tool once per task.
export async function pushTasks(
  cfg: ConnectionConfig,
  tasks: { id: string; title: string; description: string | null; acceptanceCriteria: string[] | null }[],
): Promise<PushResult[]> {
  return withMcpClient(cfg, async (client) => {
    const results: PushResult[] = [];
    for (const task of tasks) {
      try {
        const body = [
          task.description ?? "",
          task.acceptanceCriteria?.length
            ? "\n\nAcceptance criteria:\n" + task.acceptanceCriteria.map((a) => `- ${a}`).join("\n")
            : "",
        ].join("");
        const result = await client.callTool({
          name: cfg.createTool,
          arguments: { title: task.title, summary: task.title, description: body, body },
        });
        results.push({ taskId: task.id, externalId: extractExternalId(result, cfg.externalIdField) });
      } catch (err) {
        results.push({ taskId: task.id, externalId: null, error: (err as Error).message });
      }
    }
    return results;
  });
}

// Send a message to a connected tracker/Slack over its MCP server (#20 notify).
// Tries the target's known post-message tool, falling back to any tool whose
// name suggests messaging. Throws on failure so the caller records a run error.
const POST_TOOLS: Record<string, string> = {
  slack: "slack_post_message",
  custom: "post_message",
};

export async function notifyViaConnection(cfg: ConnectionConfig, target: string, message: string): Promise<string> {
  return withMcpClient(cfg, async (client) => {
    const { tools } = await client.listTools();
    const preferred = POST_TOOLS[target];
    const toolName =
      (preferred && tools.find((t) => t.name === preferred)?.name) ??
      tools.find((t) => /post|message|send|notify/i.test(t.name))?.name;
    if (!toolName) throw new Error(`no message tool on the ${target} MCP server`);
    await client.callTool({ name: toolName, arguments: { text: message, message } });
    return toolName;
  });
}

export { encryptSecret };
