import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  specs,
  breakdowns,
  tasks,
  taskDeps,
  signoffs,
  playbookDocs,
  skills,
  agents,
  user,
  userOrgs,
  session,
  TASK_STATUSES,
} from "@burrow/core";
import { db } from "./db.js";
import { specText } from "./ai.js";
import { logEvent } from "./events.js";
import { surfaceInsightsFor } from "./insights.js";

// The agent bridge: a lean MCP tool surface (<3K tokens of definitions is the
// budget) so coding agents pull specs/tasks with full context and push status
// back. Auth: Bearer token validated against the Better Auth session table.
// OAuth 2.1 + discovery is milestone-7 hardening.

// The canonical set of tool names this bridge exposes. A skill/agent's
// tool_allowlist is clamped to this set on import/push (24-PLATFORM-SHARING §3):
// an allowlist may only reference tools that actually exist here, so an imported
// definition can never grant access to a tool the server doesn't have.
export const MCP_TOOL_NAMES = [
  "list_specs",
  "get_spec",
  "get_breakdown",
  "get_next_task",
  "update_task_status",
  "get_signoff_timeline",
  "get_insights",
  "list_skills",
  "list_agents",
  "list_playbook",
] as const;

export type McpAuth = { userId: string; orgId: string };

export async function authForToken(token: string): Promise<McpAuth | null> {
  if (!token) return null;
  const [row] = await db
    .select({ userId: session.userId, orgId: userOrgs.orgId })
    .from(session)
    .innerJoin(userOrgs, eq(userOrgs.userId, session.userId))
    .where(eq(session.token, token));
  if (!row) return null;
  return row;
}

async function latestBreakdown(specId: string) {
  const [b] = await db
    .select()
    .from(breakdowns)
    .where(eq(breakdowns.specId, specId))
    .orderBy(desc(breakdowns.generation))
    .limit(1);
  return b;
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }],
});

// The calling agent's MCP client name keyed by bearer token. Our /mcp endpoint
// is stateless (a fresh server per request), so getClientVersion() isn't
// available on the tool-call request — but the same agent reuses its token, so
// the /mcp handler stashes the name it saw on `initialize` here for tool calls
// to read. Best-effort: falls back to "agent".
export const agentNameByToken = new Map<string, string>();

export function buildMcpServer(auth: McpAuth, agentLabel = "agent"): McpServer {
  const server = new McpServer({ name: "burrow", version: "0.1.0" });
  const orgScope = eq(specs.orgId, auth.orgId);
  const agentName = () => agentLabel;

  server.registerTool(
    "list_specs",
    {
      description:
        "List the org's specs with id, displayId, title, and lifecycle status.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          id: specs.id,
          displayId: specs.displayId,
          title: specs.title,
          status: specs.status,
          updatedAt: specs.updatedAt,
        })
        .from(specs)
        .where(orgScope)
        .orderBy(desc(specs.updatedAt))
        .limit(50);
      return text(rows);
    },
  );

  server.registerTool(
    "get_spec",
    {
      description:
        "Get one spec: metadata plus the full prose text of the document.",
      inputSchema: { specId: z.string().describe("Spec id or displayId (e.g. SPEC-1)") },
    },
    async ({ specId }) => {
      const [spec] = await db
        .select()
        .from(specs)
        .where(
          and(
            orgScope,
            specId.startsWith("SPEC-")
              ? eq(specs.displayId, specId)
              : eq(specs.id, specId),
          ),
        );
      if (!spec) return text({ error: "spec not found" });
      return text({ ...spec, prose: await specText(spec.ydocId) });
    },
  );

  server.registerTool(
    "get_breakdown",
    {
      description:
        "Get the latest task breakdown for a spec: all tasks with acceptance criteria, priorities, and dependencies.",
      inputSchema: { specId: z.string() },
    },
    async ({ specId }) => {
      const [spec] = await db.select().from(specs).where(and(orgScope, eq(specs.id, specId)));
      if (!spec) return text({ error: "spec not found" });
      const b = await latestBreakdown(spec.id);
      if (!b) return text({ tasks: [] });
      const rows = await db.select().from(tasks).where(eq(tasks.breakdownId, b.id));
      const deps = rows.length
        ? await db
            .select()
            .from(taskDeps)
            .where(inArray(taskDeps.taskId, rows.map((t) => t.id)))
        : [];
      return text({
        generation: b.generation,
        tasks: rows.map((t) => ({
          ...t,
          dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnId),
        })),
      });
    },
  );

  server.registerTool(
    "get_next_task",
    {
      description:
        "Get the next actionable task for a spec: pending, all dependencies done, highest priority first. Includes the spec prose for context.",
      inputSchema: { specId: z.string() },
    },
    async ({ specId }) => {
      const [spec] = await db.select().from(specs).where(and(orgScope, eq(specs.id, specId)));
      if (!spec) return text({ error: "spec not found" });
      const b = await latestBreakdown(spec.id);
      if (!b) return text({ error: "no breakdown yet — generate one in Burrow first" });
      const rows = await db.select().from(tasks).where(eq(tasks.breakdownId, b.id));
      const deps = rows.length
        ? await db
            .select()
            .from(taskDeps)
            .where(inArray(taskDeps.taskId, rows.map((t) => t.id)))
        : [];
      const doneIds = new Set(rows.filter((t) => t.status === "done").map((t) => t.id));
      const next = rows
        .filter((t) => t.status === "pending")
        .filter((t) =>
          deps.filter((d) => d.taskId === t.id).every((d) => doneIds.has(d.dependsOnId)),
        )
        .sort((a, z2) => a.priority - z2.priority || a.displayId.localeCompare(z2.displayId))[0];
      if (!next) return text({ done: true, message: "no actionable tasks remain" });
      await logEvent({
        orgId: auth.orgId,
        actorType: "agent",
        actorName: agentName(),
        kind: "task_picked_up",
        summary: `picked up ${next.displayId} · ${next.title}`,
        specId: spec.id,
        taskId: next.id,
      });
      return text({ task: next, specTitle: spec.title, specProse: await specText(spec.ydocId) });
    },
  );

  server.registerTool(
    "update_task_status",
    {
      description: `Set a task's status. One of: ${TASK_STATUSES.join(", ")}. Status flows back to the team's board in real time.`,
      inputSchema: {
        taskId: z.string(),
        status: z.enum(TASK_STATUSES),
      },
    },
    async ({ taskId, status }) => {
      // org check via task -> breakdown -> spec join
      const [row] = await db
        .select({ taskId: tasks.id, specId: specs.id })
        .from(tasks)
        .innerJoin(breakdowns, eq(tasks.breakdownId, breakdowns.id))
        .innerJoin(specs, eq(breakdowns.specId, specs.id))
        .where(and(eq(tasks.id, taskId), orgScope));
      if (!row) return text({ error: "task not found" });
      const [updated] = await db
        .update(tasks)
        .set({ status, updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
        .returning();
      await logEvent({
        orgId: auth.orgId,
        actorType: "agent",
        actorName: agentName(),
        kind: "task_status_changed",
        summary: `moved ${updated.displayId} → ${status.replace("_", " ")}`,
        specId: row.specId,
        taskId,
        detail: { status },
      });
      return text({ ok: true, taskId, status });
    },
  );

  server.registerTool(
    "get_signoff_timeline",
    {
      description:
        "Get the append-only sign-off timeline for a spec (who approved/flagged which version, with comments).",
      inputSchema: { specId: z.string() },
    },
    async ({ specId }) => {
      const [spec] = await db.select().from(specs).where(and(orgScope, eq(specs.id, specId)));
      if (!spec) return text({ error: "spec not found" });
      const rows = await db
        .select({
          verdict: signoffs.verdict,
          comment: signoffs.comment,
          specVersion: signoffs.specVersion,
          createdAt: signoffs.createdAt,
          userName: user.name,
        })
        .from(signoffs)
        .innerJoin(user, eq(signoffs.userId, user.id))
        .where(eq(signoffs.specId, spec.id))
        .orderBy(desc(signoffs.createdAt))
        .limit(100);
      return text(rows);
    },
  );

  server.registerTool(
    "get_insights",
    {
      description:
        "Get AI insights grounded in the org's Context Graph for a surface — the same calm offers a human sees in Burrow. surface: 'roadmap' (initiative balance, coverage, signals the roadmap doesn't answer) or 'backlog' (overlapping specs, customer themes with no spec, goal gaps). Use before proposing roadmap or spec changes so your work reflects the org's signals.",
      inputSchema: { surface: z.enum(["roadmap", "backlog"]) },
    },
    async ({ surface }) => {
      const insights = await surfaceInsightsFor(auth.orgId, surface);
      if (!insights) return text({ insights: [], note: "no insights — set a provider key in Burrow settings" });
      return text(insights);
    },
  );

  server.registerTool(
    "list_skills",
    {
      description:
        "List the org's published skills — reusable, parameterized instructions an agent can run, each with its input params and the tools it's allowed to call. Use to discover what capabilities exist before proposing work.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          slug: skills.slug,
          name: skills.name,
          description: skills.description,
          params: skills.params,
          toolAllowlist: skills.toolAllowlist,
        })
        .from(skills)
        .where(and(eq(skills.orgId, auth.orgId), eq(skills.published, true)));
      return text(rows);
    },
  );

  server.registerTool(
    "list_agents",
    {
      description:
        "List the org's published agents — named, model-pinned personas with a skill set and a permission ceiling (tool allowlist + write scope). Use to discover which agent fits a task.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          slug: agents.slug,
          name: agents.name,
          role: agents.role,
          model: agents.model,
          skillSlugs: agents.skillSlugs,
          toolAllowlist: agents.toolAllowlist,
          writeScope: agents.writeScope,
        })
        .from(agents)
        .where(and(eq(agents.orgId, auth.orgId), eq(agents.published, true)));
      return text(rows);
    },
  );

  server.registerTool(
    "list_playbook",
    {
      description:
        "List the org's playbook docs — conventions, personas, and ways of working that work should honor.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({ title: playbookDocs.title, markdown: playbookDocs.markdown })
        .from(playbookDocs)
        .where(eq(playbookDocs.orgId, auth.orgId));
      return text(rows);
    },
  );

  return server;
}
