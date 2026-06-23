import { createHmac } from "node:crypto";
import { serve } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authForToken, buildMcpServer, agentNameByToken } from "./mcp.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { desc, eq, and, max, ne, ilike, or } from "drizzle-orm";
import {
  specs,
  orgs,
  userOrgs,
  providerKeys,
  breakdowns,
  tasks,
  taskDeps,
  signoffs,
  playbookDocs,
  connections,
  syncMappings,
  events,
  contextDocs,
  teams,
  teamMembers,
  feedbackItems,
  feedbackThemes,
  feedbackItemThemes,
  competitors,
  marketSignals,
  initiatives,
  goals,
  keyResults,
  goalLinks,
  chatThreads,
  chatMessages,
  type ChatPart,
  deviceTokens,
  routines,
  routineRuns,
  ROUTINE_TRIGGERS,
  type RoutineAction,
  skills,
  agents,
  AGENT_WRITE_SCOPES,
  AGENT_MODEL_FALLBACKS,
  type SkillParam,
  user,
  SPEC_STATUSES,
  TASK_STATUSES,
  CONTEXT_KINDS,
  ROLE_TYPES,
  TEAM_ROLES,
  FEEDBACK_SOURCES,
  SIGNAL_TYPES,
  SIGNAL_SEVERITY,
  INITIATIVE_HORIZONS,
  INITIATIVE_STATUSES,
  GOAL_STATUSES,
  KR_STATUSES,
  CONFIDENCE,
} from "@burrow/core";
import { db } from "./db.js";
import { auth } from "./auth.js";
import { encryptSecret } from "./crypto.js";
import {
  streamBreakdown,
  streamAssist,
  generateInsights,
  clusterFeedback,
  summarizeSignal,
  NoProviderKeyError,
} from "./ai.js";
import { surfaceInsightsFor } from "./insights.js";
import { slugify, contentHash, clampAllowlist, ConflictError } from "./sharing.js";
import { currentSpecVersion } from "./signoffs.js";
import { logEvent } from "./events.js";
import { reembedDoc, reindexWorkspace, reindexSpecByYdoc } from "./context.js";
import { extractText } from "./extract.js";
import { streamChatTurn, MUTATING_TOOLS } from "./chat.js";
import { startScheduler } from "./routines.js";
import {
  type ConnectionConfig,
  TARGET_DEFAULTS,
  probeConnection,
  pushTasks,
  encryptSecret as encryptConnSecret,
} from "./connectors.js";
import { decryptSecret } from "./crypto.js";

type Env = {
  Variables: {
    userId: string;
    userName: string;
    orgId: string;
    role: "admin" | "member";
    roleType: string;
    sessionToken: string;
  };
};

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "burrow-server" }));

// Better Auth owns /api/auth/* (sign-up, sign-in, session, sign-out)
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// ---------- MCP (agent bridge) ----------
// Stateless Streamable HTTP: one transport+server per request. Bearer token =
// Burrow session token (from /api/collab-token or `burrow auth`). Lives outside
// the /api/* cookie middleware on purpose — agents send headers, not cookies.
app.post("/mcp", async (c) => {
  const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const mcpAuth = await authForToken(token);
  if (!mcpAuth) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "invalid or missing bearer token" }, id: null },
      401,
    );
  }
  const { incoming, outgoing } = c.env as unknown as {
    incoming: import("node:http").IncomingMessage;
    outgoing: import("node:http").ServerResponse;
  };
  const body = await c.req.json();
  // Stateless endpoint: stash the agent's client name (sent on `initialize`)
  // keyed by its bearer token so later tool-call requests can attribute the
  // actor in the activity feed.
  if (body?.method === "initialize") {
    const name = body?.params?.clientInfo?.name;
    if (typeof name === "string" && name) agentNameByToken.set(token, name);
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  const server = buildMcpServer(mcpAuth, agentNameByToken.get(token) ?? "agent");
  await server.connect(transport);
  await transport.handleRequest(incoming, outgoing, body);
  outgoing.on("close", () => {
    transport.close();
    server.close();
  });
  return RESPONSE_ALREADY_SENT;
});

// Internal: the collab server calls this when a Spec's prose is persisted, so
// the Context Graph stays live on edits (which don't emit activity events).
// Guarded by a shared internal secret, not a user session.
app.post("/internal/reindex-spec", async (c) => {
  const secret = c.req.header("x-burrow-internal");
  if (secret !== (process.env.BURROW_INTERNAL_SECRET ?? "dev-internal-secret")) {
    return c.json({ error: "forbidden" }, 403);
  }
  const body = await c.req.json<{ ydocId?: string }>().catch(() => ({}) as { ydocId?: string });
  if (!body.ydocId) return c.json({ error: "ydocId required" }, 400);
  const ok = await reindexSpecByYdoc(body.ydocId).catch((e) => {
    console.error("[graph] reindex-spec failed:", e);
    return false;
  });
  return c.json({ ok });
});

// Inbound webhook receiver (Layer 2 — MCP is pull-only, so external status
// changes arrive here). Outside the cookie middleware: trackers POST with their
// own HMAC, not a Burrow session. Maps external id → task via sync_mappings.
app.post("/webhooks/:connectionId", async (c) => {
  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, c.req.param("connectionId")));
  if (!conn) return c.json({ error: "unknown connection" }, 404);
  const cfg = conn.config as ConnectionConfig;
  const body = await c.req
    .json<{ externalId?: string; status?: string }>()
    .catch(() => ({}) as { externalId?: string; status?: string });
  // HMAC verification when a secret is configured (header set by the sender).
  if (cfg.webhookSecretEncrypted) {
    const secret = decryptSecret(cfg.webhookSecretEncrypted);
    const sig = c.req.header("x-burrow-signature");
    const expected = createHmac("sha256", secret)
      .update(JSON.stringify(body))
      .digest("hex");
    if (sig !== expected) return c.json({ error: "bad signature" }, 401);
  }
  if (!body.externalId || !body.status) return c.json({ error: "externalId and status required" }, 400);
  const [mapping] = await db
    .select()
    .from(syncMappings)
    .where(
      and(
        eq(syncMappings.connectionId, conn.id),
        eq(syncMappings.externalId, body.externalId),
      ),
    );
  if (!mapping) return c.json({ ok: true, note: "no mapped task" });
  // Translate the external status into our task vocabulary (lenient mapping).
  const mapped = mapExternalStatus(body.status);
  if (mapped) {
    await db
      .update(tasks)
      .set({ status: mapped, updatedAt: new Date() })
      .where(eq(tasks.id, mapping.entityId));
  }
  return c.json({ ok: true, taskId: mapping.entityId, status: mapped ?? "unchanged" });
});

function mapExternalStatus(external: string): (typeof TASK_STATUSES)[number] | null {
  const s = external.toLowerCase().replace(/[\s_-]/g, "");
  if (["done", "closed", "resolved", "complete", "completed"].includes(s)) return "done";
  if (["inprogress", "started", "doing", "active"].includes(s)) return "in_progress";
  if (["todo", "open", "backlog", "pending", "new"].includes(s)) return "pending";
  if (["inreview", "review"].includes(s)) return "review";
  return null;
}

// CLI device-code auth (#19). start + token poll are unauthenticated (the CLI
// has no session yet); confirm is authenticated (the browser does).
app.post("/api/cli/device", async (c) => {
  const deviceCode = crypto.randomUUID().replace(/-/g, "");
  const userCode =
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  await db.insert(deviceTokens).values({
    deviceCode,
    userCode,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  const base = process.env.WEB_URL ?? "http://localhost:3000";
  return c.json({
    deviceCode,
    userCode,
    verificationUri: `${base}/device?code=${userCode}`,
    interval: 3,
    expiresIn: 300,
  });
});

app.post("/api/cli/device/token", async (c) => {
  const body = await c.req.json<{ deviceCode?: string }>();
  const [row] = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.deviceCode, body.deviceCode ?? ""));
  if (!row) return c.json({ error: "invalid device code" }, 400);
  if (row.expiresAt < new Date()) return c.json({ error: "expired" }, 400);
  if (!row.sessionToken) return c.json({ status: "authorization_pending" }, 202);
  return c.json({ token: row.sessionToken, orgId: row.orgId });
});

// Everything under /api/* below requires a session; org comes from membership
app.use("/api/*", async (c, next) => {
  // Cookie session (browser) first; bearer-token fallback for the CLI (#19) —
  // the token is a Burrow session token, validated like the MCP bridge does.
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  let userId: string, userName: string, token: string;
  if (session) {
    userId = session.user.id;
    userName = session.user.name;
    token = session.session.token;
  } else {
    const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const auth2 = bearer ? await authForToken(bearer) : null;
    if (!auth2) return c.json({ error: "unauthorized" }, 401);
    userId = auth2.userId;
    const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
    userName = u?.name ?? "";
    token = bearer;
  }
  const [membership] = await db.select().from(userOrgs).where(eq(userOrgs.userId, userId));
  if (!membership) return c.json({ error: "no org membership" }, 403);
  c.set("userId", userId);
  c.set("userName", userName);
  c.set("orgId", membership.orgId);
  c.set("role", membership.role);
  c.set("roleType", membership.roleType);
  c.set("sessionToken", token);
  await next();
});

// The collab server validates this token in onAuthenticate. Reusing the session
// token keeps it simple; short-lived signed collab JWT is milestone-7 hardening.
app.get("/api/collab-token", (c) => c.json({ token: c.get("sessionToken") }));

// Browser confirms a CLI device code → promotes the caller's session token.
app.post("/api/cli/device/confirm", async (c) => {
  const body = await c.req.json<{ userCode?: string }>();
  const [row] = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.userCode, (body.userCode ?? "").toUpperCase()));
  if (!row) return c.json({ error: "invalid code" }, 404);
  if (row.expiresAt < new Date()) return c.json({ error: "expired" }, 400);
  await db
    .update(deviceTokens)
    .set({ sessionToken: c.get("sessionToken"), orgId: c.get("orgId") })
    .where(eq(deviceTokens.id, row.id));
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  // Read from the middleware context so this works for both cookie and bearer
  // (CLI) auth. Look up email from the user table by the resolved userId.
  const [u] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, c.get("userId")));
  return c.json({
    user: u ? { name: u.name, email: u.email } : null,
    orgId: c.get("orgId"),
    role: c.get("role"),
    roleType: c.get("roleType"),
  });
});

// ---------- Specs ----------

app.get("/api/specs", async (c) => {
  // Archived hidden unless ?includeArchived=1; optional ?teamId scopes to a team
  const includeArchived = c.req.query("includeArchived") === "1";
  const teamId = c.req.query("teamId");
  const conds = [eq(specs.orgId, c.get("orgId"))];
  if (!includeArchived) conds.push(ne(specs.status, "archived"));
  if (teamId) conds.push(eq(specs.teamId, teamId));
  const rows = await db
    .select()
    .from(specs)
    .where(and(...conds))
    .orderBy(desc(specs.updatedAt))
    .limit(200);
  return c.json(rows);
});

app.post("/api/specs", async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
  const count = await db.$count(specs, eq(specs.orgId, c.get("orgId")));
  const [row] = await db
    .insert(specs)
    .values({
      orgId: c.get("orgId"),
      title: body.title ?? "Untitled spec",
      displayId: `SPEC-${count + 1}`,
      ydocId: crypto.randomUUID(),
      createdBy: c.get("userId"),
    })
    .returning();
  await logEvent({
    orgId: c.get("orgId"),
    actorType: "human",
    actorName: c.get("userName"),
    kind: "spec_created",
    summary: `created ${row.displayId} · ${row.title}`,
    specId: row.id,
  });
  return c.json(row, 201);
});

app.get("/api/specs/:id", async (c) => {
  const [row] = await db
    .select()
    .from(specs)
    .where(and(eq(specs.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.patch("/api/specs/:id", async (c) => {
  const body = await c.req.json<{ title?: string; status?: string }>();
  if (body.status && !(SPEC_STATUSES as readonly string[]).includes(body.status)) {
    return c.json({ error: `invalid status: ${body.status}` }, 400);
  }
  const [row] = await db
    .update(specs)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.status !== undefined
        ? { status: body.status as (typeof SPEC_STATUSES)[number] }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(specs.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

// ---------- Org key vault (admin only) ----------

app.get("/api/keys", async (c) => {
  const rows = await db
    .select({
      id: providerKeys.id,
      provider: providerKeys.provider,
      createdAt: providerKeys.createdAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.orgId, c.get("orgId")));
  return c.json(rows); // never returns key material, even encrypted
});

app.post("/api/keys", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ provider: string; key: string }>();
  const allowed = ["anthropic", "openai", "google", "openrouter", "ollama"] as const;
  if (!allowed.includes(body.provider as (typeof allowed)[number])) {
    return c.json({ error: "unknown provider" }, 400);
  }
  if (!body.key?.trim()) return c.json({ error: "key required" }, 400);
  const [row] = await db
    .insert(providerKeys)
    .values({
      orgId: c.get("orgId"),
      provider: body.provider as (typeof allowed)[number],
      keyEncrypted: encryptSecret(body.key.trim()),
    })
    .returning({ id: providerKeys.id, provider: providerKeys.provider });
  return c.json(row, 201);
});

app.delete("/api/keys/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(providerKeys)
    .where(
      and(eq(providerKeys.id, c.req.param("id")), eq(providerKeys.orgId, c.get("orgId"))),
    );
  return c.json({ ok: true });
});

// ---------- Org + members ----------

app.get("/api/org", async (c) => {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, c.get("orgId")));
  const members = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: userOrgs.role,
    })
    .from(userOrgs)
    .innerJoin(user, eq(userOrgs.userId, user.id))
    .where(eq(userOrgs.orgId, c.get("orgId")));
  return c.json({ org, members, myRole: c.get("role") });
});

// ---------- AI assist (editor slash + empty-starter; BYO key, streamed) ----------

app.post("/api/specs/:id/assist", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ mode?: string; prompt?: string }>();
  let result: Awaited<ReturnType<typeof streamAssist>>;
  try {
    result = await streamAssist(
      c.get("orgId"),
      body.mode ?? "draft",
      body.prompt ?? "",
      await import("./ai.js").then((m) => m.specText(spec.ydocId)),
      c.get("roleType"),
    );
  } catch (err) {
    if (err instanceof NoProviderKeyError) return c.json({ error: "no_provider_key" }, 422);
    return c.json({ error: (err as Error).message }, 400);
  }
  return streamSSE(c, async (sse) => {
    try {
      for await (const delta of result.textStream) {
        await sse.writeSSE({ event: "delta", data: JSON.stringify(delta) });
      }
      await sse.writeSSE({ event: "done", data: "{}" });
    } catch (err) {
      await sse.writeSSE({ event: "error", data: JSON.stringify({ message: (err as Error).message }) });
    }
  });
});

// Re-index the whole workspace into the Context Graph (#17): Context docs,
// Spec prose, Breakdown tasks, Sign-off comments. Incremental (skips unchanged).
app.post("/api/context-graph/reindex", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const counts = await reindexWorkspace(c.get("orgId"));
  return c.json({ ok: true, indexed: counts });
});

// AI summary + gaps for a Spec (Sign-off tab, list, Dashboard). Degrades to
// null when no key is set — never an error path for a passive insight.
app.get("/api/specs/:id/insights", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  try {
    const insights = await generateInsights(c.get("orgId"), spec.ydocId);
    return c.json({ insights });
  } catch {
    return c.json({ insights: null });
  }
});

// Surface insights (item 1: insights everywhere). Roadmap + backlog get the
// same Context-Graph grounding as a Spec. Payload + generation live in
// insights.ts so the MCP tools (mcp.ts) share the identical view with the UI.
// { insights: null } on no key — passive, never an error path.
app.get("/api/insights/:surface", async (c) => {
  const insights = await surfaceInsightsFor(c.get("orgId"), c.req.param("surface"));
  return c.json({ insights });
});

// Global search (UX review #3). Powers the Cmd-K palette + `/` search. Fuzzy-ish
// substring match across the org's primary entities, each result carrying the
// route to jump to. Keep it lean and fast — substring ILIKE, capped per type.
// No external index; runs on the embedded Postgres like everything else.
app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ results: [] });
  const orgId = c.get("orgId");
  const like = `%${q}%`;
  const results: { type: string; id: string; label: string; sublabel: string; href: string }[] = [];

  const specRows = await db
    .select({ id: specs.id, displayId: specs.displayId, title: specs.title, status: specs.status })
    .from(specs)
    .where(and(eq(specs.orgId, orgId), or(ilike(specs.title, like), ilike(specs.displayId, like))))
    .orderBy(desc(specs.updatedAt))
    .limit(8);
  for (const s of specRows)
    results.push({ type: "spec", id: s.id, label: s.title, sublabel: `${s.displayId} · ${s.status}`, href: `/specs/${s.id}` });

  const initRows = await db
    .select({ id: initiatives.id, title: initiatives.title, horizon: initiatives.horizon })
    .from(initiatives)
    .where(and(eq(initiatives.orgId, orgId), ilike(initiatives.title, like)))
    .limit(5);
  for (const i of initRows)
    results.push({ type: "initiative", id: i.id, label: i.title, sublabel: `Initiative · ${i.horizon}`, href: "/roadmap" });

  const goalRows = await db
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), ilike(goals.title, like)))
    .limit(5);
  for (const g of goalRows) results.push({ type: "goal", id: g.id, label: g.title, sublabel: "Goal", href: "/goals" });

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.orgId, orgId), ilike(teams.name, like)))
    .limit(5);
  for (const t of teamRows) results.push({ type: "team", id: t.id, label: t.name, sublabel: "Team", href: `/teams/${t.id}` });

  const themeRows = await db
    .select({ id: feedbackThemes.id, label: feedbackThemes.label })
    .from(feedbackThemes)
    .where(and(eq(feedbackThemes.orgId, orgId), ilike(feedbackThemes.label, like)))
    .limit(5);
  for (const t of themeRows) results.push({ type: "feedback", id: t.id, label: t.label, sublabel: "Feedback theme", href: "/feedback" });

  const signalRows = await db
    .select({ id: marketSignals.id, title: marketSignals.title })
    .from(marketSignals)
    .where(and(eq(marketSignals.orgId, orgId), ilike(marketSignals.title, like)))
    .limit(5);
  for (const s of signalRows) results.push({ type: "market", id: s.id, label: s.title, sublabel: "Market signal", href: "/market" });

  return c.json({ results });
});

// ---------- Dashboard (the AI-native home aggregate) ----------

app.get("/api/dashboard", async (c) => {
  const orgId = c.get("orgId");
  const userId = c.get("userId");

  // Recent activity (humans + agents + AI), most recent first
  const recentActivity = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(desc(events.createdAt))
    .limit(15);

  // Agents at work: distinct agents that acted in the last 24h, with their last action
  const agentEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), eq(events.actorType, "agent")))
    .orderBy(desc(events.createdAt))
    .limit(20);
  const agentsAtWork: { name: string; summary: string; at: Date }[] = [];
  const seenAgents = new Set<string>();
  for (const e of agentEvents) {
    if (seenAgents.has(e.actorName)) continue;
    seenAgents.add(e.actorName);
    agentsAtWork.push({ name: e.actorName, summary: e.summary, at: e.createdAt });
  }

  // Needs your attention: specs where this user has an open ask
  const orgSpecs = await db
    .select()
    .from(specs)
    .where(and(eq(specs.orgId, orgId), ne(specs.status, "archived")))
    .orderBy(desc(specs.updatedAt));
  const attention: { specId: string; displayId: string; title: string; reason: string }[] = [];
  for (const s of orgSpecs.slice(0, 30)) {
    if (s.status === "in_review") {
      const mine = await db
        .select()
        .from(signoffs)
        .where(and(eq(signoffs.specId, s.id), eq(signoffs.userId, userId)));
      if (mine.length === 0) {
        attention.push({ specId: s.id, displayId: s.displayId, title: s.title, reason: "In review — waiting on your sign-off" });
      }
    }
    if (attention.length >= 5) break;
  }

  // Suggestions: approved specs with no breakdown, etc.
  const suggestions: { kind: string; specId: string; displayId: string; title: string; text: string }[] = [];
  for (const s of orgSpecs.slice(0, 30)) {
    if (s.status === "approved" || s.status === "in_progress") {
      const bk = await db.$count(breakdowns, eq(breakdowns.specId, s.id));
      if (bk === 0) {
        suggestions.push({ kind: "generate_breakdown", specId: s.id, displayId: s.displayId, title: s.title, text: `${s.displayId} is ${s.status.replace("_", " ")} but has no Breakdown — generate one` });
      }
    }
    if (suggestions.length >= 4) break;
  }

  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return c.json({
    user: me?.name ?? "",
    counts: { needsYou: attention.length, agentsWorking: seenAgents.size },
    attention,
    agentsAtWork: agentsAtWork.slice(0, 5),
    suggestions,
    recentActivity,
  });
});

// Active agents on a Spec — for agent presence in the spec header. Agents that
// acted on this spec in the recent window.
app.get("/api/specs/:id/agents", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.specId, spec.id),
        eq(events.actorType, "agent"),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(30);
  const agents: { name: string; lastSummary: string; at: Date }[] = [];
  const seen = new Set<string>();
  for (const e of rows) {
    if (seen.has(e.actorName)) continue;
    seen.add(e.actorName);
    agents.push({ name: e.actorName, lastSummary: e.summary, at: e.createdAt });
  }
  return c.json({ agents });
});

// ---------- Activity feed (humans + agents, the AI-native surface) ----------

app.get("/api/activity", async (c) => {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, c.get("orgId")))
    .orderBy(desc(events.createdAt))
    .limit(Number(c.req.query("limit") ?? 50));
  return c.json(rows);
});

app.get("/api/specs/:id/activity", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, c.get("orgId")), eq(events.specId, spec.id)))
    .orderBy(desc(events.createdAt))
    .limit(100);
  return c.json(rows);
});

// ---------- Teams (own people AND work; scoping, not an access gate) ----------

app.get("/api/teams", async (c) => {
  const rows = await db.select().from(teams).where(eq(teams.orgId, c.get("orgId")));
  const out = [];
  for (const t of rows) {
    const memberCount = await db.$count(teamMembers, eq(teamMembers.teamId, t.id));
    out.push({ id: t.id, name: t.name, leadUserId: t.leadUserId, memberCount, createdAt: t.createdAt });
  }
  return c.json(out);
});

app.post("/api/teams", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ name?: string; leadUserId?: string }>();
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const [t] = await db
    .insert(teams)
    .values({ orgId: c.get("orgId"), name: body.name.trim(), leadUserId: body.leadUserId ?? null })
    .returning();
  if (body.leadUserId) {
    await db.insert(teamMembers).values({ teamId: t.id, userId: body.leadUserId, roleInTeam: "lead" });
  }
  await logEvent({ orgId: c.get("orgId"), actorType: "human", actorName: c.get("userName"), kind: "team_created", summary: `created team ${t.name}` });
  return c.json(t, 201);
});

app.patch("/api/teams/:teamId", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ name?: string; leadUserId?: string | null }>();
  const [t] = await db
    .update(teams)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.leadUserId !== undefined ? { leadUserId: body.leadUserId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teams.id, c.req.param("teamId")), eq(teams.orgId, c.get("orgId"))))
    .returning();
  if (!t) return c.json({ error: "not found" }, 404);
  if (body.leadUserId) {
    // one lead per team: demote any existing lead, then set the new one
    await db.update(teamMembers).set({ roleInTeam: "member" }).where(eq(teamMembers.teamId, t.id));
    await db
      .insert(teamMembers)
      .values({ teamId: t.id, userId: body.leadUserId, roleInTeam: "lead" })
      .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { roleInTeam: "lead" } });
  }
  return c.json(t);
});

app.delete("/api/teams/:teamId", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const [t] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, c.req.param("teamId")), eq(teams.orgId, c.get("orgId"))));
  if (!t) return c.json({ error: "not found" }, 404);
  await db.update(specs).set({ teamId: null }).where(eq(specs.teamId, t.id));
  await db.delete(teamMembers).where(eq(teamMembers.teamId, t.id));
  await db.delete(teams).where(eq(teams.id, t.id));
  return c.json({ ok: true });
});

app.get("/api/teams/:teamId/members", async (c) => {
  const rows = await db
    .select({
      userId: teamMembers.userId,
      name: user.name,
      email: user.email,
      roleInTeam: teamMembers.roleInTeam,
      addedAt: teamMembers.addedAt,
    })
    .from(teamMembers)
    .innerJoin(user, eq(teamMembers.userId, user.id))
    .where(eq(teamMembers.teamId, c.req.param("teamId")));
  return c.json(rows);
});

app.post("/api/teams/:teamId/members", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const teamId = c.req.param("teamId");
  const [t] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.orgId, c.get("orgId"))));
  if (!t) return c.json({ error: "team not found" }, 404);
  const body = await c.req.json<{ userId?: string; roleInTeam?: string }>();
  if (!body.userId) return c.json({ error: "userId required" }, 400);
  const role = (TEAM_ROLES as readonly string[]).includes(body.roleInTeam ?? "")
    ? (body.roleInTeam as (typeof TEAM_ROLES)[number])
    : "member";
  if (role === "lead") {
    await db.update(teamMembers).set({ roleInTeam: "member" }).where(eq(teamMembers.teamId, teamId));
    await db.update(teams).set({ leadUserId: body.userId }).where(eq(teams.id, teamId));
  }
  await db
    .insert(teamMembers)
    .values({ teamId, userId: body.userId, roleInTeam: role })
    .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { roleInTeam: role } });
  await logEvent({ orgId: c.get("orgId"), actorType: "human", actorName: c.get("userName"), kind: "team_member_added", summary: `added a member to ${t.name}` });
  return c.json({ ok: true }, 201);
});

app.delete("/api/teams/:teamId/members/:userId", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const teamId = c.req.param("teamId");
  const userId = c.req.param("userId");
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  await db.update(teams).set({ leadUserId: null }).where(and(eq(teams.id, teamId), eq(teams.leadUserId, userId)));
  await logEvent({ orgId: c.get("orgId"), actorType: "human", actorName: c.get("userName"), kind: "team_member_removed", summary: `removed a member from a team` });
  return c.json({ ok: true });
});

app.get("/api/teams/:teamId/specs", async (c) => {
  const rows = await db
    .select()
    .from(specs)
    .where(and(eq(specs.orgId, c.get("orgId")), eq(specs.teamId, c.req.param("teamId"))))
    .orderBy(desc(specs.updatedAt));
  return c.json(rows);
});

// Assign a Spec to a team (any member) — focused, auditable endpoint
app.patch("/api/specs/:id/team", async (c) => {
  const body = await c.req.json<{ teamId: string | null }>();
  if (body.teamId) {
    const [t] = await db.select().from(teams).where(and(eq(teams.id, body.teamId), eq(teams.orgId, c.get("orgId"))));
    if (!t) return c.json({ error: "team not in your org" }, 400);
  }
  const [row] = await db
    .update(specs)
    .set({ teamId: body.teamId, updatedAt: new Date() })
    .where(and(eq(specs.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  await logEvent({ orgId: c.get("orgId"), actorType: "human", actorName: c.get("userName"), kind: "spec_team_changed", summary: `moved ${row.displayId} to a team`, specId: row.id });
  return c.json(row);
});

// ---------- Tasks (in-app status changes; mirrors the MCP tool) ----------

app.patch("/api/tasks/:id", async (c) => {
  const body = await c.req.json<{ status: string }>();
  if (!(TASK_STATUSES as readonly string[]).includes(body.status)) {
    return c.json({ error: `invalid status: ${body.status}` }, 400);
  }
  // org check via task -> breakdown -> spec join
  const [owned] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(breakdowns, eq(tasks.breakdownId, breakdowns.id))
    .innerJoin(specs, eq(breakdowns.specId, specs.id))
    .where(and(eq(tasks.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))));
  if (!owned) return c.json({ error: "not found" }, 404);
  const [row] = await db
    .update(tasks)
    .set({ status: body.status as (typeof TASK_STATUSES)[number], updatedAt: new Date() })
    .where(eq(tasks.id, c.req.param("id")))
    .returning();
  await logEvent({
    orgId: c.get("orgId"),
    actorType: "human",
    actorName: c.get("userName"),
    kind: "task_status_changed",
    summary: `moved ${row.displayId} → ${body.status.replace("_", " ")}`,
    taskId: row.id,
    detail: { status: body.status },
  });
  return c.json(row);
});

// ---------- Playbook (org knowledge; injected into every Breakdown) ----------

app.get("/api/playbook", async (c) => {
  const rows = await db
    .select()
    .from(playbookDocs)
    .where(eq(playbookDocs.orgId, c.get("orgId")))
    .orderBy(desc(playbookDocs.updatedAt));
  return c.json(rows);
});

app.post("/api/playbook", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ title?: string; markdown?: string }>();
  const [row] = await db
    .insert(playbookDocs)
    .values({
      orgId: c.get("orgId"),
      title: body.title?.trim() || "Untitled doc",
      markdown: body.markdown ?? "",
    })
    .returning();
  return c.json(row, 201);
});

app.patch("/api/playbook/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ title?: string; markdown?: string }>();
  const [row] = await db
    .update(playbookDocs)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.markdown !== undefined ? { markdown: body.markdown } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(playbookDocs.id, c.req.param("id")), eq(playbookDocs.orgId, c.get("orgId"))),
    )
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.delete("/api/playbook/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(playbookDocs)
    .where(
      and(eq(playbookDocs.id, c.req.param("id")), eq(playbookDocs.orgId, c.get("orgId"))),
    );
  return c.json({ ok: true });
});

// ---------- Context (typed org knowledge, retrieved into every AI feature) ----------

app.get("/api/context", async (c) => {
  const rows = await db
    .select({
      id: contextDocs.id,
      title: contextDocs.title,
      kind: contextDocs.kind,
      source: contextDocs.source,
      fileName: contextDocs.fileName,
      embedded: contextDocs.embedded,
      updatedAt: contextDocs.updatedAt,
    })
    .from(contextDocs)
    .where(eq(contextDocs.orgId, c.get("orgId")))
    .orderBy(desc(contextDocs.updatedAt));
  return c.json(rows);
});

app.get("/api/context/:id", async (c) => {
  const [row] = await db
    .select()
    .from(contextDocs)
    .where(and(eq(contextDocs.id, c.req.param("id")), eq(contextDocs.orgId, c.get("orgId"))));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.post("/api/context", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ title?: string; kind?: string; bodyText?: string }>();
  const kind = (CONTEXT_KINDS as readonly string[]).includes(body.kind ?? "")
    ? (body.kind as (typeof CONTEXT_KINDS)[number])
    : "other";
  const [row] = await db
    .insert(contextDocs)
    .values({
      orgId: c.get("orgId"),
      title: body.title?.trim() || "Untitled context",
      kind,
      source: "text",
      bodyText: body.bodyText ?? "",
      updatedBy: c.get("userId"),
    })
    .returning();
  await reembedDoc(c.get("orgId"), row.id); // no-op without an embedding key
  return c.json(row, 201);
});

app.post("/api/context/upload", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "no file" }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  let extracted;
  try {
    extracted = await extractText(file.name, bytes);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  if (!extracted.text) {
    return c.json(
      { error: "no text found in this file (scanned image?) — paste the text instead" },
      400,
    );
  }
  const [row] = await db
    .insert(contextDocs)
    .values({
      orgId: c.get("orgId"),
      title: file.name.replace(/\.[^.]+$/, ""),
      kind: "other",
      source: "file",
      fileName: file.name,
      bodyText: extracted.text,
      updatedBy: c.get("userId"),
    })
    .returning();
  await reembedDoc(c.get("orgId"), row.id);
  return c.json(row, 201);
});

app.patch("/api/context/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ title?: string; kind?: string; bodyText?: string }>();
  const [row] = await db
    .update(contextDocs)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.kind !== undefined && (CONTEXT_KINDS as readonly string[]).includes(body.kind)
        ? { kind: body.kind as (typeof CONTEXT_KINDS)[number] }
        : {}),
      ...(body.bodyText !== undefined ? { bodyText: body.bodyText } : {}),
      updatedBy: c.get("userId"),
      updatedAt: new Date(),
    })
    .where(and(eq(contextDocs.id, c.req.param("id")), eq(contextDocs.orgId, c.get("orgId"))))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  if (body.bodyText !== undefined) await reembedDoc(c.get("orgId"), row.id);
  return c.json(row);
});

app.delete("/api/context/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(contextDocs)
    .where(and(eq(contextDocs.id, c.req.param("id")), eq(contextDocs.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

// ---------- Onboarding (lightweight: role + optional context, skippable) ----------

app.get("/api/onboarding", async (c) => {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, c.get("orgId")));
  return c.json({ onboarded: !!org?.onboardedAt, roleType: c.get("roleType") });
});

app.post("/api/onboarding/role", async (c) => {
  const body = await c.req.json<{ roleType?: string }>();
  if (!(ROLE_TYPES as readonly string[]).includes(body.roleType ?? "")) {
    return c.json({ error: "invalid role" }, 400);
  }
  await db
    .update(userOrgs)
    .set({ roleType: body.roleType as (typeof ROLE_TYPES)[number] })
    .where(and(eq(userOrgs.userId, c.get("userId")), eq(userOrgs.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

app.post("/api/onboarding/complete", async (c) => {
  const body = await c.req.json<{
    roleType?: string;
    context?: { title: string; kind?: string; bodyText: string }[];
  }>();
  if (body.roleType && (ROLE_TYPES as readonly string[]).includes(body.roleType)) {
    await db
      .update(userOrgs)
      .set({ roleType: body.roleType as (typeof ROLE_TYPES)[number] })
      .where(and(eq(userOrgs.userId, c.get("userId")), eq(userOrgs.orgId, c.get("orgId"))));
  }
  for (const doc of body.context ?? []) {
    if (!doc.bodyText?.trim()) continue;
    const [row] = await db
      .insert(contextDocs)
      .values({
        orgId: c.get("orgId"),
        title: doc.title?.trim() || "Company & product",
        kind: (CONTEXT_KINDS as readonly string[]).includes(doc.kind ?? "")
          ? (doc.kind as (typeof CONTEXT_KINDS)[number])
          : "company",
        source: "text",
        bodyText: doc.bodyText,
        updatedBy: c.get("userId"),
      })
      .returning();
    await reembedDoc(c.get("orgId"), row.id);
  }
  await db.update(orgs).set({ onboardedAt: new Date() }).where(eq(orgs.id, c.get("orgId")));
  return c.json({ ok: true });
});

// ---------- Customer feedback (#2): ingest, AI-cluster, link to Specs ----------

app.get("/api/feedback", async (c) => {
  const items = await db
    .select()
    .from(feedbackItems)
    .where(eq(feedbackItems.orgId, c.get("orgId")))
    .orderBy(desc(feedbackItems.createdAt))
    .limit(500);
  return c.json(items);
});

app.post("/api/feedback", async (c) => {
  const body = await c.req.json<{
    text?: string;
    items?: string[];
    source?: string;
    customer?: string;
    segment?: string;
  }>();
  const source = (FEEDBACK_SOURCES as readonly string[]).includes(body.source ?? "")
    ? (body.source as (typeof FEEDBACK_SOURCES)[number])
    : "manual";
  // Accept a single text or a bulk array (one item per line / element)
  const texts = (body.items ?? (body.text ? [body.text] : []))
    .flatMap((t) => t.split(/\n{2,}/))
    .map((t) => t.trim())
    .filter(Boolean);
  if (!texts.length) return c.json({ error: "no feedback text" }, 400);
  const inserted = await db
    .insert(feedbackItems)
    .values(
      texts.map((text) => ({
        orgId: c.get("orgId"),
        source,
        customer: body.customer ?? null,
        segment: body.segment ?? null,
        text,
      })),
    )
    .returning();
  return c.json({ inserted: inserted.length }, 201);
});

app.delete("/api/feedback/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(feedbackItems)
    .where(and(eq(feedbackItems.id, c.req.param("id")), eq(feedbackItems.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

// AI re-clusters all org feedback into themes (admin). Rebuilds themes wholesale.
app.post("/api/feedback/cluster", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const orgId = c.get("orgId");
  const items = await db.select().from(feedbackItems).where(eq(feedbackItems.orgId, orgId));
  if (!items.length) return c.json({ error: "no feedback to cluster" }, 400);
  let clusters;
  try {
    clusters = await clusterFeedback(orgId, items.map((i) => i.text));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  if (clusters === null) return c.json({ error: "no_provider_key" }, 422);

  // wipe prior themes, write new ones + joins, update per-item sentiment
  const prior = await db.select().from(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));
  for (const p of prior) await db.delete(feedbackItemThemes).where(eq(feedbackItemThemes.themeId, p.id));
  await db.delete(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));

  for (let s = 0; s < items.length; s++) {
    const sentiment = clusters.itemSentiments[s];
    if (sentiment) await db.update(feedbackItems).set({ sentiment }).where(eq(feedbackItems.id, items[s].id));
  }
  for (const theme of clusters.themes) {
    const memberIds = theme.itemIndices.filter((i) => i >= 0 && i < items.length).map((i) => items[i].id);
    const [row] = await db
      .insert(feedbackThemes)
      .values({ orgId, label: theme.label, summary: theme.summary, sentiment: theme.sentiment, size: memberIds.length })
      .returning();
    for (const itemId of memberIds) {
      await db.insert(feedbackItemThemes).values({ themeId: row.id, itemId }).onConflictDoNothing();
    }
  }
  const themes = await db.select().from(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));
  return c.json({ themes });
});

app.get("/api/feedback/themes", async (c) => {
  const themes = await db
    .select()
    .from(feedbackThemes)
    .where(eq(feedbackThemes.orgId, c.get("orgId")))
    .orderBy(desc(feedbackThemes.size));
  return c.json(themes);
});

// Spin a Spec out of a theme — the feedback → Spec bridge that makes
// prioritization evidence-backed.
app.post("/api/feedback/themes/:id/create-spec", async (c) => {
  const [theme] = await db
    .select()
    .from(feedbackThemes)
    .where(and(eq(feedbackThemes.id, c.req.param("id")), eq(feedbackThemes.orgId, c.get("orgId"))));
  if (!theme) return c.json({ error: "not found" }, 404);
  const count = await db.$count(specs, eq(specs.orgId, c.get("orgId")));
  const [spec] = await db
    .insert(specs)
    .values({
      orgId: c.get("orgId"),
      title: theme.label,
      displayId: `SPEC-${count + 1}`,
      ydocId: crypto.randomUUID(),
      createdBy: c.get("userId"),
    })
    .returning();
  await db.update(feedbackThemes).set({ specId: spec.id }).where(eq(feedbackThemes.id, theme.id));
  await logEvent({
    orgId: c.get("orgId"),
    actorType: "human",
    actorName: c.get("userName"),
    kind: "spec_created",
    summary: `created ${spec.displayId} from feedback theme "${theme.label}" (${theme.size} items)`,
    specId: spec.id,
  });
  return c.json(spec, 201);
});

// ---------- Market signals (#1): competitors + AI-summarized moves ----------

app.get("/api/competitors", async (c) => {
  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.orgId, c.get("orgId")))
    .orderBy(competitors.name);
  return c.json(rows);
});

app.post("/api/competitors", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ name?: string; url?: string; notes?: string }>();
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const [row] = await db
    .insert(competitors)
    .values({ orgId: c.get("orgId"), name: body.name.trim(), url: body.url ?? null, notes: body.notes ?? null })
    .returning();
  return c.json(row, 201);
});

app.delete("/api/competitors/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(competitors)
    .where(and(eq(competitors.id, c.req.param("id")), eq(competitors.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

app.get("/api/market-signals", async (c) => {
  const rows = await db
    .select()
    .from(marketSignals)
    .where(eq(marketSignals.orgId, c.get("orgId")))
    .orderBy(desc(marketSignals.createdAt))
    .limit(200);
  return c.json(rows);
});

// Create a signal. Paste an article (rawText) → AI summarizes into a typed,
// severity-scored signal; or pass a fully-formed signal manually.
app.post("/api/market-signals", async (c) => {
  const orgId = c.get("orgId");
  const body = await c.req.json<{
    competitorId?: string;
    rawText?: string;
    url?: string;
    title?: string;
    summary?: string;
    type?: string;
    severity?: string;
  }>();

  let competitorName: string | undefined;
  if (body.competitorId) {
    const [comp] = await db
      .select()
      .from(competitors)
      .where(and(eq(competitors.id, body.competitorId), eq(competitors.orgId, orgId)));
    competitorName = comp?.name;
  }

  let draft: { title: string; summary: string; type: string; severity: string; soWhat?: string };
  if (body.rawText?.trim()) {
    const ai = await summarizeSignal(orgId, body.rawText, competitorName);
    if (ai === null) return c.json({ error: "no_provider_key" }, 422);
    draft = ai;
  } else if (body.title?.trim() && body.summary?.trim()) {
    draft = {
      title: body.title.trim(),
      summary: body.summary.trim(),
      type: body.type ?? "other",
      severity: body.severity ?? "medium",
    };
  } else {
    return c.json({ error: "provide rawText (for AI) or a manual title + summary" }, 400);
  }

  const [row] = await db
    .insert(marketSignals)
    .values({
      orgId,
      competitorId: body.competitorId ?? null,
      type: (SIGNAL_TYPES as readonly string[]).includes(draft.type)
        ? (draft.type as (typeof SIGNAL_TYPES)[number])
        : "other",
      title: draft.title,
      summary: draft.summary,
      soWhat: draft.soWhat ?? null,
      url: body.url ?? null,
      severity: (SIGNAL_SEVERITY as readonly string[]).includes(draft.severity)
        ? (draft.severity as (typeof SIGNAL_SEVERITY)[number])
        : "medium",
    })
    .returning();
  return c.json(row, 201);
});

app.delete("/api/market-signals/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db
    .delete(marketSignals)
    .where(and(eq(marketSignals.id, c.req.param("id")), eq(marketSignals.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

// Link a signal to a Spec (the "respond to this move" bridge)
app.patch("/api/market-signals/:id/spec", async (c) => {
  const body = await c.req.json<{ specId: string | null }>();
  const [row] = await db
    .update(marketSignals)
    .set({ specId: body.specId })
    .where(and(eq(marketSignals.id, c.req.param("id")), eq(marketSignals.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

// ---------- Roadmap: Initiatives (Timeline horizons) (#4) ----------

app.get("/api/initiatives", async (c) => {
  const teamId = c.req.query("teamId");
  const conds = [eq(initiatives.orgId, c.get("orgId"))];
  if (teamId) conds.push(eq(initiatives.teamId, teamId));
  const rows = await db.select().from(initiatives).where(and(...conds)).orderBy(desc(initiatives.updatedAt));
  // roll up spec progress per initiative
  const out = [];
  for (const i of rows) {
    const specRows = await db
      .select({ status: specs.status })
      .from(specs)
      .where(eq(specs.initiativeId, i.id));
    const done = specRows.filter((s) => s.status === "done").length;
    out.push({ ...i, specCount: specRows.length, specsDone: done });
  }
  return c.json(out);
});

app.post("/api/initiatives", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; horizon?: string; teamId?: string }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  const [row] = await db
    .insert(initiatives)
    .values({
      orgId: c.get("orgId"),
      title: body.title.trim(),
      description: body.description ?? null,
      horizon: (INITIATIVE_HORIZONS as readonly string[]).includes(body.horizon ?? "")
        ? (body.horizon as (typeof INITIATIVE_HORIZONS)[number])
        : "next",
      teamId: body.teamId ?? null,
      createdBy: c.get("userId"),
    })
    .returning();
  return c.json(row, 201);
});

app.patch("/api/initiatives/:id", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; horizon?: string; status?: string; teamId?: string | null }>();
  const [row] = await db
    .update(initiatives)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.horizon && (INITIATIVE_HORIZONS as readonly string[]).includes(body.horizon)
        ? { horizon: body.horizon as (typeof INITIATIVE_HORIZONS)[number] }
        : {}),
      ...(body.status && (INITIATIVE_STATUSES as readonly string[]).includes(body.status)
        ? { status: body.status as (typeof INITIATIVE_STATUSES)[number] }
        : {}),
      ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(initiatives.id, c.req.param("id")), eq(initiatives.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.delete("/api/initiatives/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db.update(specs).set({ initiativeId: null }).where(eq(specs.initiativeId, c.req.param("id")));
  await db.delete(initiatives).where(and(eq(initiatives.id, c.req.param("id")), eq(initiatives.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

app.get("/api/initiatives/:id/specs", async (c) => {
  const rows = await db
    .select()
    .from(specs)
    .where(and(eq(specs.orgId, c.get("orgId")), eq(specs.initiativeId, c.req.param("id"))))
    .orderBy(desc(specs.updatedAt));
  return c.json(rows);
});

app.patch("/api/specs/:id/initiative", async (c) => {
  const body = await c.req.json<{ initiativeId: string | null }>();
  if (body.initiativeId) {
    const [i] = await db.select().from(initiatives).where(and(eq(initiatives.id, body.initiativeId), eq(initiatives.orgId, c.get("orgId"))));
    if (!i) return c.json({ error: "initiative not in your org" }, 400);
  }
  const [row] = await db
    .update(specs)
    .set({ initiativeId: body.initiativeId, updatedAt: new Date() })
    .where(and(eq(specs.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

// ---------- Goals + Key Results (OKR first) (#4) ----------

app.get("/api/goals", async (c) => {
  const rows = await db.select().from(goals).where(eq(goals.orgId, c.get("orgId"))).orderBy(desc(goals.createdAt));
  const out = [];
  for (const g of rows) {
    const krs = await db.select().from(keyResults).where(eq(keyResults.goalId, g.id));
    const links = await db.select().from(goalLinks).where(eq(goalLinks.goalId, g.id));
    out.push({ ...g, keyResults: krs, linkCount: links.length });
  }
  return c.json(out);
});

app.post("/api/goals", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; teamId?: string; startPeriod?: string; endPeriod?: string }>();
  if (!body.title?.trim()) return c.json({ error: "objective required" }, 400);
  const [row] = await db
    .insert(goals)
    .values({
      orgId: c.get("orgId"),
      title: body.title.trim(),
      description: body.description ?? null,
      teamId: body.teamId ?? null,
      startPeriod: body.startPeriod ?? null,
      endPeriod: body.endPeriod ?? null,
      createdBy: c.get("userId"),
    })
    .returning();
  return c.json(row, 201);
});

app.patch("/api/goals/:id", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; status?: string }>();
  const [row] = await db
    .update(goals)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status && (GOAL_STATUSES as readonly string[]).includes(body.status)
        ? { status: body.status as (typeof GOAL_STATUSES)[number] }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, c.req.param("id")), eq(goals.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.delete("/api/goals/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db.delete(goals).where(and(eq(goals.id, c.req.param("id")), eq(goals.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

app.post("/api/goals/:id/key-results", async (c) => {
  const body = await c.req.json<{ title?: string; metricUnit?: string; target?: number; current?: number; baseline?: number }>();
  if (!body.title?.trim()) return c.json({ error: "key result title required" }, 400);
  const [g] = await db.select().from(goals).where(and(eq(goals.id, c.req.param("id")), eq(goals.orgId, c.get("orgId"))));
  if (!g) return c.json({ error: "goal not found" }, 404);
  const [row] = await db
    .insert(keyResults)
    .values({
      goalId: g.id,
      orgId: c.get("orgId"),
      title: body.title.trim(),
      metricUnit: body.metricUnit ?? null,
      target: body.target ?? null,
      current: body.current ?? 0,
      baseline: body.baseline ?? 0,
    })
    .returning();
  return c.json(row, 201);
});

app.patch("/api/key-results/:id", async (c) => {
  const body = await c.req.json<{ current?: number; status?: string; confidence?: string }>();
  const [row] = await db
    .update(keyResults)
    .set({
      ...(body.current !== undefined ? { current: body.current } : {}),
      ...(body.status ? { status: body.status as (typeof KR_STATUSES)[number] } : {}),
      ...(body.confidence ? { confidence: body.confidence as (typeof CONFIDENCE)[number] } : {}),
    })
    .where(and(eq(keyResults.id, c.req.param("id")), eq(keyResults.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.post("/api/goals/:id/links", async (c) => {
  const body = await c.req.json<{ entityType: "spec" | "initiative"; entityId: string; keyResultId?: string }>();
  if (!["spec", "initiative"].includes(body.entityType) || !body.entityId) {
    return c.json({ error: "entityType (spec|initiative) and entityId required" }, 400);
  }
  const [g] = await db.select().from(goals).where(and(eq(goals.id, c.req.param("id")), eq(goals.orgId, c.get("orgId"))));
  if (!g) return c.json({ error: "goal not found" }, 404);
  const [row] = await db
    .insert(goalLinks)
    .values({ goalId: g.id, orgId: c.get("orgId"), entityType: body.entityType, entityId: body.entityId, keyResultId: body.keyResultId ?? null })
    .returning();
  return c.json(row, 201);
});

app.get("/api/goals/:id/links", async (c) => {
  const rows = await db.select().from(goalLinks).where(eq(goalLinks.goalId, c.req.param("id")));
  return c.json(rows);
});

// ---------- AI Chat (#16): persistent, tool-using, BYO-key ----------

app.get("/api/chat/threads", async (c) => {
  const scope = c.req.query("scope");
  const specId = c.req.query("specId");
  const conds = [eq(chatThreads.orgId, c.get("orgId"))];
  if (scope === "workspace" || scope === "spec") conds.push(eq(chatThreads.scope, scope));
  if (specId) conds.push(eq(chatThreads.specId, specId));
  const rows = await db
    .select({ id: chatThreads.id, scope: chatThreads.scope, specId: chatThreads.specId, title: chatThreads.title, updatedAt: chatThreads.updatedAt })
    .from(chatThreads)
    .where(and(...conds))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(50);
  return c.json(rows);
});

app.post("/api/chat/threads", async (c) => {
  const body = await c.req.json<{ scope?: string; specId?: string }>().catch(() => ({}) as { scope?: string; specId?: string });
  const scope = body.scope === "spec" ? "spec" : "workspace";
  const [row] = await db
    .insert(chatThreads)
    .values({ orgId: c.get("orgId"), scope, specId: scope === "spec" ? body.specId ?? null : null, createdBy: c.get("userId") })
    .returning();
  return c.json(row, 201);
});

app.get("/api/chat/threads/:id", async (c) => {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, c.req.param("id")), eq(chatThreads.orgId, c.get("orgId"))));
  if (!thread) return c.json({ error: "not found" }, 404);
  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, thread.id))
    .orderBy(chatMessages.createdAt);
  return c.json({ thread, messages });
});

app.delete("/api/chat/threads/:id", async (c) => {
  await db.delete(chatThreads).where(and(eq(chatThreads.id, c.req.param("id")), eq(chatThreads.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

// Stream an assistant turn. Persists the user turn, runs the tool loop, streams
// text + any proposed (unconfirmed) mutating tool-calls, persists the result.
app.post("/api/chat/threads/:id/messages", async (c) => {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, c.req.param("id")), eq(chatThreads.orgId, c.get("orgId"))));
  if (!thread) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ text?: string }>();
  if (!body.text?.trim()) return c.json({ error: "text required" }, 400);

  // prior turns → model messages (text parts only)
  const prior = await db.select().from(chatMessages).where(eq(chatMessages.threadId, thread.id)).orderBy(chatMessages.createdAt);
  const history = prior
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: (m.parts as ChatPart[]).filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n"),
    }))
    .filter((m) => m.content);

  // persist the user turn; set the thread title from the first message
  await db.insert(chatMessages).values({ threadId: thread.id, orgId: c.get("orgId"), role: "user", parts: [{ type: "text", text: body.text }], createdBy: c.get("userId") });
  if (prior.length === 0) {
    await db.update(chatThreads).set({ title: body.text.slice(0, 60), updatedAt: new Date() }).where(eq(chatThreads.id, thread.id));
  }

  let turn;
  try {
    turn = await streamChatTurn({ orgId: c.get("orgId"), roleType: c.get("roleType"), thread: { scope: thread.scope, specId: thread.specId }, history, userText: body.text });
  } catch (err) {
    if (err instanceof NoProviderKeyError) return c.json({ error: "no_provider_key" }, 422);
    return c.json({ error: (err as Error).message }, 400);
  }

  return streamSSE(c, async (sse) => {
    let text = "";
    try {
      for await (const delta of turn.textStream) {
        text += delta;
        await sse.writeSSE({ event: "delta", data: JSON.stringify(delta) });
      }
      // proposed mutating tool-calls (no execute) → persist unconfirmed for the UI
      const calls = await turn.toolCalls;
      const proposed: ChatPart[] = calls
        .filter((tc) => (MUTATING_TOOLS as readonly string[]).includes(tc.toolName))
        .map((tc) => ({ type: "tool-call", toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.input }));
      const parts: ChatPart[] = [{ type: "text", text }, ...proposed];
      await db.insert(chatMessages).values({ threadId: thread.id, orgId: c.get("orgId"), role: "assistant", parts });
      await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, thread.id));
      for (const p of proposed) await sse.writeSSE({ event: "tool-proposal", data: JSON.stringify(p) });
      await sse.writeSSE({ event: "done", data: "{}" });
    } catch (err) {
      await sse.writeSSE({ event: "error", data: JSON.stringify({ message: (err as Error).message }) });
    }
  });
});

// Execute a previously-proposed mutating tool call (create_spec / generate_breakdown)
app.post("/api/chat/threads/:id/confirm", async (c) => {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, c.req.param("id")), eq(chatThreads.orgId, c.get("orgId"))));
  if (!thread) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ toolCallId?: string }>();
  const msgs = await db.select().from(chatMessages).where(eq(chatMessages.threadId, thread.id));
  let call: ChatPart | undefined;
  for (const m of msgs) for (const p of m.parts as ChatPart[]) if (p.type === "tool-call" && p.toolCallId === body.toolCallId) call = p;
  if (!call || call.type !== "tool-call") return c.json({ error: "tool call not found" }, 404);

  let result: unknown;
  if (call.toolName === "create_spec") {
    const args = call.args as { title: string };
    const count = await db.$count(specs, eq(specs.orgId, c.get("orgId")));
    const [spec] = await db
      .insert(specs)
      .values({ orgId: c.get("orgId"), title: args.title || "Untitled spec", displayId: `SPEC-${count + 1}`, ydocId: crypto.randomUUID(), createdBy: c.get("userId") })
      .returning();
    await logEvent({ orgId: c.get("orgId"), actorType: "human", actorName: c.get("userName"), kind: "spec_created", summary: `created ${spec.displayId} via chat`, specId: spec.id });
    result = { specId: spec.id, displayId: spec.displayId };
  } else {
    result = { note: "Open the Spec and use Generate breakdown to run it." };
  }
  await db.insert(chatMessages).values({ threadId: thread.id, orgId: c.get("orgId"), role: "tool", parts: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, result }] });
  return c.json({ ok: true, result });
});

// ---------- Routines / automations (#20) ----------

app.get("/api/routines", async (c) => {
  const rows = await db.select().from(routines).where(eq(routines.orgId, c.get("orgId"))).orderBy(desc(routines.createdAt));
  return c.json(rows);
});

app.post("/api/routines", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{
    name?: string;
    triggerType?: string;
    eventKind?: string;
    schedule?: string;
    conditionField?: string;
    conditionEquals?: string;
    actions?: RoutineAction[];
  }>();
  if (!body.name?.trim() || !(ROUTINE_TRIGGERS as readonly string[]).includes(body.triggerType ?? "")) {
    return c.json({ error: "name and triggerType (event|schedule) required" }, 400);
  }
  const [row] = await db
    .insert(routines)
    .values({
      orgId: c.get("orgId"),
      name: body.name.trim(),
      slug: await uniqueRoutineSlug(c.get("orgId"), slugify(body.name)),
      triggerType: body.triggerType as (typeof ROUTINE_TRIGGERS)[number],
      eventKind: body.eventKind ?? null,
      schedule: (body.schedule as "hourly" | "daily" | "weekly") ?? null,
      conditionField: body.conditionField ?? null,
      conditionEquals: body.conditionEquals ?? null,
      actions: body.actions ?? [],
      sourceHash: contentHash({ name: body.name.trim(), actions: body.actions ?? [] }),
      createdBy: c.get("userId"),
    })
    .returning();
  return c.json(row, 201);
});

// A routine slug is unique per org. On create we derive it from the name and
// suffix on collision so the file key never clashes (24-PLATFORM-SHARING).
async function uniqueRoutineSlug(orgId: string, base: string): Promise<string> {
  const taken = new Set(
    (await db.select({ slug: routines.slug }).from(routines).where(eq(routines.orgId, orgId))).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

// Pull/push one routine by its file key (CLI burrow routine pull|push). PUT is
// the same source_hash upsert contract as skills/agents; the routine's
// executable definition lives entirely in these fields.
app.get("/api/routines/by-slug/:slug", async (c) => {
  const [row] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.orgId, c.get("orgId")), eq(routines.slug, c.req.param("slug"))));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.put("/api/routines/by-slug/:slug", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const slug = slugify(c.req.param("slug"));
  const body = await c.req.json<{
    name?: string;
    enabled?: boolean;
    published?: boolean;
    triggerType?: string;
    eventKind?: string;
    schedule?: string;
    conditionField?: string;
    conditionEquals?: string;
    actions?: RoutineAction[];
    baseHash?: string;
    importedFrom?: string;
  }>();
  if (!body.name?.trim() || !(ROUTINE_TRIGGERS as readonly string[]).includes(body.triggerType ?? "")) {
    return c.json({ error: "name and triggerType (event|schedule) required" }, 400);
  }
  const fields = {
    name: body.name.trim(),
    enabled: body.enabled ?? true,
    published: body.published ?? true,
    triggerType: body.triggerType as (typeof ROUTINE_TRIGGERS)[number],
    eventKind: body.eventKind ?? null,
    schedule: (body.schedule as "hourly" | "daily" | "weekly") ?? null,
    conditionField: body.conditionField ?? null,
    conditionEquals: body.conditionEquals ?? null,
    actions: body.actions ?? [],
  };
  const hash = contentHash({
    name: fields.name,
    triggerType: fields.triggerType,
    eventKind: fields.eventKind,
    schedule: fields.schedule,
    conditionField: fields.conditionField,
    conditionEquals: fields.conditionEquals,
    actions: fields.actions,
    enabled: fields.enabled,
    published: fields.published,
  });
  const orgId = c.get("orgId");
  const [existing] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.orgId, orgId), eq(routines.slug, slug)));
  if (existing) {
    if (body.baseHash !== undefined && body.baseHash !== "" && body.baseHash !== existing.sourceHash) {
      return c.json({ error: "conflict", serverHash: existing.sourceHash, serverRevision: existing.revision }, 409);
    }
    const [row] = await db
      .update(routines)
      .set({ ...fields, slug, sourceHash: hash, revision: existing.revision + 1, importedFrom: body.importedFrom ?? existing.importedFrom })
      .where(and(eq(routines.orgId, orgId), eq(routines.slug, slug)))
      .returning();
    return c.json(row);
  }
  const [row] = await db
    .insert(routines)
    .values({ ...fields, orgId, slug, sourceHash: hash, revision: 1, importedFrom: body.importedFrom ?? null, createdBy: c.get("userId") })
    .returning();
  return c.json(row, 201);
});

app.patch("/api/routines/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{ enabled?: boolean; name?: string }>();
  const [row] = await db
    .update(routines)
    .set({
      ...(body.enabled !== undefined ? { enabled: body.enabled, failureCount: body.enabled ? 0 : undefined } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    })
    .where(and(eq(routines.id, c.req.param("id")), eq(routines.orgId, c.get("orgId"))))
    .returning();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.delete("/api/routines/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db.delete(routines).where(and(eq(routines.id, c.req.param("id")), eq(routines.orgId, c.get("orgId"))));
  return c.json({ ok: true });
});

app.get("/api/routines/:id/runs", async (c) => {
  const rows = await db
    .select()
    .from(routineRuns)
    .where(and(eq(routineRuns.routineId, c.req.param("id")), eq(routineRuns.orgId, c.get("orgId"))))
    .orderBy(desc(routineRuns.createdAt))
    .limit(50);
  return c.json(rows);
});

// ---------- Skills + Agents (24-PLATFORM-SHARING Phase 1) ----------
// Slug-keyed, file-native CRUD. Git is the VCS; the row caches the published
// file. PUT is an upsert that enforces the source_hash conflict contract (409 on
// a concurrent edit) and clamps any tool allowlist to tools that exist on the
// MCP bridge. Members read; admins write. The CLI (burrow skill/agent push|pull)
// and the Settings UI both drive these.

// Fields that feed the content hash for a skill (never revision/timestamps/hash).
function skillHashInput(v: { name: string; description: string | null; body: string; params: SkillParam[]; toolAllowlist: string[]; published: boolean }) {
  return { name: v.name, description: v.description, body: v.body, params: v.params, toolAllowlist: v.toolAllowlist, published: v.published };
}
function agentHashInput(v: { name: string; role: string | null; model: string | null; modelFallback: string; skillSlugs: string[]; toolAllowlist: string[]; writeScope: string; published: boolean }) {
  return { name: v.name, role: v.role, model: v.model, modelFallback: v.modelFallback, skillSlugs: v.skillSlugs, toolAllowlist: v.toolAllowlist, writeScope: v.writeScope, published: v.published };
}

// Shared upsert for skills + agents. The source_hash conflict contract: a caller
// supplies the hash it pulled at (baseHash); if the stored row moved on, that's a
// concurrent edit → ConflictError → 409. New file (no existing row) → revision 1.
// Drizzle can't express "one of these two tables" for a dynamic write, so the
// table is cast internally; the columns these helpers touch exist on both.
type ShareTable = typeof skills | typeof agents;
async function upsertShared(
  c: Context<Env>,
  table: ShareTable,
  slug: string,
  fields: Record<string, unknown>,
  hash: string,
  baseHash: string | undefined,
  importedFrom: string | undefined,
) {
  const orgId = c.get("orgId");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  const existingRows = (await db.select().from(t).where(and(eq(t.orgId, orgId), eq(t.slug, slug)))) as any[];
  const existing = existingRows[0];
  if (existing) {
    if (baseHash !== undefined && baseHash !== "" && baseHash !== existing.sourceHash) {
      throw new ConflictError(existing.sourceHash, existing.revision);
    }
    const updated = (await db
      .update(t)
      .set({ ...fields, slug, sourceHash: hash, revision: existing.revision + 1, importedFrom: importedFrom ?? existing.importedFrom, updatedAt: new Date() })
      .where(and(eq(t.orgId, orgId), eq(t.slug, slug)))
      .returning()) as any[];
    return updated[0];
  }
  const inserted = (await db
    .insert(t)
    .values({ ...fields, orgId, slug, sourceHash: hash, revision: 1, importedFrom: importedFrom ?? null, createdBy: c.get("userId") })
    .returning()) as any[];
  return inserted[0];
}

// Flip the draft/published latch. Body: { published: boolean }.
async function setPublished(c: Context<Env>, table: ShareTable) {
  const body = await c.req.json<{ published?: boolean }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  const rows = (await db
    .update(t)
    .set({ published: body.published === true, updatedAt: new Date() })
    .where(and(eq(t.orgId, c.get("orgId")), eq(t.slug, c.req.param("slug"))))
    .returning()) as any[];
  return rows[0] ? c.json(rows[0]) : c.json({ error: "not found" }, 404);
}

app.get("/api/skills", async (c) => {
  const rows = await db.select().from(skills).where(eq(skills.orgId, c.get("orgId"))).orderBy(skills.slug);
  return c.json(rows);
});

app.get("/api/skills/:slug", async (c) => {
  const [row] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, c.get("orgId")), eq(skills.slug, c.req.param("slug"))));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.put("/api/skills/:slug", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const slug = slugify(c.req.param("slug"));
  const body = await c.req.json<{
    name?: string;
    description?: string;
    body?: string;
    params?: SkillParam[];
    toolAllowlist?: string[];
    published?: boolean;
    baseHash?: string; // the hash the file was pulled at; "" or absent for a new file
    importedFrom?: string;
  }>();
  if (!body.name?.trim() || typeof body.body !== "string") {
    return c.json({ error: "name and body required" }, 400);
  }
  const { kept, dropped } = clampAllowlist(body.toolAllowlist);
  const fields = {
    name: body.name.trim(),
    description: body.description ?? null,
    body: body.body,
    params: body.params ?? [],
    toolAllowlist: kept,
    published: body.published ?? false,
  };
  const hash = contentHash(skillHashInput(fields));
  try {
    const row = await upsertShared(c, skills, slug, fields, hash, body.baseHash, body.importedFrom);
    return c.json({ ...row, droppedTools: dropped });
  } catch (e) {
    if (e instanceof ConflictError) return c.json({ error: "conflict", serverHash: e.serverHash, serverRevision: e.serverRevision }, 409);
    throw e;
  }
});

app.delete("/api/skills/:slug", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db.delete(skills).where(and(eq(skills.orgId, c.get("orgId")), eq(skills.slug, c.req.param("slug"))));
  return c.json({ ok: true });
});

app.get("/api/agents", async (c) => {
  const rows = await db.select().from(agents).where(eq(agents.orgId, c.get("orgId"))).orderBy(agents.slug);
  return c.json(rows);
});

app.get("/api/agents/:slug", async (c) => {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, c.get("orgId")), eq(agents.slug, c.req.param("slug"))));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.put("/api/agents/:slug", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const slug = slugify(c.req.param("slug"));
  const body = await c.req.json<{
    name?: string;
    role?: string;
    model?: string;
    modelFallback?: string;
    skillSlugs?: string[];
    toolAllowlist?: string[];
    writeScope?: string;
    published?: boolean;
    baseHash?: string;
    importedFrom?: string;
  }>();
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const { kept, dropped } = clampAllowlist(body.toolAllowlist);
  const fields = {
    name: body.name.trim(),
    role: body.role ?? null,
    model: body.model ?? null,
    modelFallback: (AGENT_MODEL_FALLBACKS as readonly string[]).includes(body.modelFallback ?? "")
      ? (body.modelFallback as (typeof AGENT_MODEL_FALLBACKS)[number])
      : "default",
    skillSlugs: body.skillSlugs ?? [],
    toolAllowlist: kept,
    writeScope: (AGENT_WRITE_SCOPES as readonly string[]).includes(body.writeScope ?? "")
      ? (body.writeScope as (typeof AGENT_WRITE_SCOPES)[number])
      : "none",
    published: body.published ?? false,
  };
  const hash = contentHash(agentHashInput(fields));
  try {
    const row = await upsertShared(c, agents, slug, fields, hash, body.baseHash, body.importedFrom);
    return c.json({ ...row, droppedTools: dropped });
  } catch (e) {
    if (e instanceof ConflictError) return c.json({ error: "conflict", serverHash: e.serverHash, serverRevision: e.serverRevision }, 409);
    throw e;
  }
});

app.delete("/api/agents/:slug", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  await db.delete(agents).where(and(eq(agents.orgId, c.get("orgId")), eq(agents.slug, c.req.param("slug"))));
  return c.json({ ok: true });
});

// Admin toggle for the draft/published latch (Settings UI). Imported skills and
// agents land published:false; flipping to true is the explicit review action.
app.patch("/api/skills/:slug/published", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  return setPublished(c, skills);
});
app.patch("/api/agents/:slug/published", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  return setPublished(c, agents);
});

// ---------- Connections (MCP-first integrations: Jira/Confluence/Slack) ----------

app.get("/api/connections", async (c) => {
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.orgId, c.get("orgId")));
  // Never leak the encrypted token / secret to the client.
  return c.json(
    rows.map((r) => {
      const cfg = r.config as ConnectionConfig;
      return {
        id: r.id,
        target: r.target,
        mcpUrl: cfg.mcpUrl,
        hasAuth: !!cfg.authEncrypted,
        createdAt: r.createdAt,
      };
    }),
  );
});

app.post("/api/connections", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const body = await c.req.json<{
    target?: string;
    mcpUrl?: string;
    authToken?: string;
    webhookSecret?: string;
    createTool?: string;
  }>();
  const defaults = TARGET_DEFAULTS[body.target ?? "custom"];
  if (!defaults) return c.json({ error: "unknown target" }, 400);
  if (!body.mcpUrl) return c.json({ error: "mcpUrl required" }, 400);

  const cfg: ConnectionConfig = {
    mcpUrl: body.mcpUrl,
    authEncrypted: body.authToken?.trim() ? encryptConnSecret(body.authToken.trim()) : undefined,
    createTool: body.createTool?.trim() || defaults.createTool,
    externalIdField: defaults.externalIdField,
    webhookSecretEncrypted: body.webhookSecret?.trim()
      ? encryptConnSecret(body.webhookSecret.trim())
      : undefined,
  };

  // Fail fast: probe the external MCP server before saving.
  let tools: string[];
  try {
    tools = await probeConnection(cfg);
  } catch (err) {
    return c.json({ error: `could not reach MCP server: ${(err as Error).message}` }, 400);
  }
  if (!tools.includes(cfg.createTool)) {
    return c.json(
      { error: `server has no "${cfg.createTool}" tool. Available: ${tools.join(", ")}` },
      400,
    );
  }

  const [row] = await db
    .insert(connections)
    .values({ orgId: c.get("orgId"), kind: "mcp", target: body.target ?? "custom", config: cfg })
    .returning();
  return c.json({ id: row.id, target: row.target, tools }, 201);
});

app.delete("/api/connections/:id", async (c) => {
  if (c.get("role") !== "admin") return c.json({ error: "admin only" }, 403);
  const [conn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, c.req.param("id")), eq(connections.orgId, c.get("orgId"))));
  if (!conn) return c.json({ error: "not found" }, 404);
  await db.delete(syncMappings).where(eq(syncMappings.connectionId, conn.id));
  await db.delete(connections).where(eq(connections.id, conn.id));
  return c.json({ ok: true });
});

// Push a spec's latest Breakdown tasks to the connected tracker, recording a
// sync_mapping per task so inbound webhooks can flow status back.
app.post("/api/specs/:id/push/:connectionId", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const [conn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, c.req.param("connectionId")), eq(connections.orgId, c.get("orgId"))));
  if (!conn) return c.json({ error: "connection not found" }, 404);

  const [latest] = await db
    .select()
    .from(breakdowns)
    .where(eq(breakdowns.specId, spec.id))
    .orderBy(desc(breakdowns.generation))
    .limit(1);
  if (!latest) return c.json({ error: "no breakdown to push — generate one first" }, 400);
  const taskRows = await db.select().from(tasks).where(eq(tasks.breakdownId, latest.id));

  const results = await pushTasks(conn.config as ConnectionConfig, taskRows);
  // Record mappings for tasks that got an external id (idempotent-ish: skip dupes)
  for (const r of results) {
    if (!r.externalId) continue;
    const existing = await db
      .select()
      .from(syncMappings)
      .where(and(eq(syncMappings.connectionId, conn.id), eq(syncMappings.entityId, r.taskId)));
    if (existing.length === 0) {
      await db.insert(syncMappings).values({
        connectionId: conn.id,
        entityType: "task",
        entityId: r.taskId,
        externalId: r.externalId,
      });
    }
  }
  const pushed = results.filter((r) => r.externalId).length;
  await logEvent({
    orgId: c.get("orgId"),
    actorType: "human",
    actorName: c.get("userName"),
    kind: "tasks_pushed",
    summary: `pushed ${pushed} task${pushed === 1 ? "" : "s"} from ${spec.displayId} to ${conn.target}`,
    specId: spec.id,
    detail: { connection: conn.target, pushed },
  });
  return c.json({ pushed, total: results.length, results });
});

// ---------- Sign-offs (append-only — a changed mind is a new row) ----------

app.get("/api/specs/:id/timeline", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select({
      id: signoffs.id,
      verdict: signoffs.verdict,
      comment: signoffs.comment,
      specVersion: signoffs.specVersion,
      createdAt: signoffs.createdAt,
      userId: signoffs.userId,
      userName: user.name,
    })
    .from(signoffs)
    .innerJoin(user, eq(signoffs.userId, user.id))
    .where(eq(signoffs.specId, spec.id))
    .orderBy(desc(signoffs.createdAt))
    .limit(200);
  const currentVersion = await currentSpecVersion(spec.ydocId);
  // Standing verdicts: each user's latest sign-off, ignoring 'cleared'
  const standing = new Map<string, (typeof rows)[number]>();
  for (const r of [...rows].reverse()) standing.set(r.userId, r);
  const counts = { approved: 0, flagged: 0 };
  for (const r of standing.values()) {
    if (r.verdict === "approved") counts.approved += 1;
    if (r.verdict === "flagged") counts.flagged += 1;
  }
  return c.json({ timeline: rows, currentVersion, counts });
});

app.post("/api/specs/:id/signoffs", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ verdict: string; comment?: string }>();
  if (!["approved", "flagged", "cleared"].includes(body.verdict)) {
    return c.json({ error: "verdict must be approved, flagged, or cleared" }, 400);
  }
  if (body.verdict === "flagged" && !body.comment?.trim()) {
    return c.json({ error: "flagging requires a comment — say what concerns you" }, 400);
  }
  const [row] = await db
    .insert(signoffs)
    .values({
      specId: spec.id,
      userId: c.get("userId"),
      verdict: body.verdict as "approved" | "flagged" | "cleared",
      comment: body.comment?.trim() || null,
      specVersion: await currentSpecVersion(spec.ydocId),
    })
    .returning();
  await logEvent({
    orgId: c.get("orgId"),
    actorType: "human",
    actorName: c.get("userName"),
    kind: "signoff_recorded",
    summary:
      body.verdict === "approved"
        ? `approved ${spec.displayId}`
        : body.verdict === "flagged"
          ? `flagged ${spec.displayId}: ${body.comment}`
          : `cleared their verdict on ${spec.displayId}`,
    specId: spec.id,
    detail: { verdict: body.verdict },
  });
  return c.json(row, 201);
});

// ---------- Breakdowns ----------

async function ownedSpec(c: { req: { param: (k: "id") => string }; get: (k: "orgId") => string }) {
  const [spec] = await db
    .select()
    .from(specs)
    .where(and(eq(specs.id, c.req.param("id")), eq(specs.orgId, c.get("orgId"))));
  return spec;
}

app.get("/api/specs/:id/breakdown", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const [latest] = await db
    .select()
    .from(breakdowns)
    .where(eq(breakdowns.specId, spec.id))
    .orderBy(desc(breakdowns.generation))
    .limit(1);
  if (!latest) return c.json({ breakdown: null, tasks: [] });
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.breakdownId, latest.id))
    .orderBy(tasks.displayId);
  return c.json({ breakdown: latest, tasks: taskRows });
});

// Streamed generation. Each completed task is one SSE event; prior generations
// are kept so regeneration is undoable.
app.post("/api/specs/:id/breakdown", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);

  let gen: Awaited<ReturnType<typeof streamBreakdown>>;
  try {
    gen = await streamBreakdown(c.get("orgId"), spec.ydocId, c.get("roleType"));
  } catch (err) {
    if (err instanceof NoProviderKeyError) {
      return c.json({ error: "no_provider_key" }, 422);
    }
    return c.json({ error: (err as Error).message }, 400);
  }

  const [{ maxGen }] = await db
    .select({ maxGen: max(breakdowns.generation) })
    .from(breakdowns)
    .where(eq(breakdowns.specId, spec.id));
  const [breakdown] = await db
    .insert(breakdowns)
    .values({ specId: spec.id, generation: (maxGen ?? 0) + 1 })
    .returning();

  return streamSSE(c, async (sse) => {
    const inserted: { id: string }[] = [];
    let index = 0;
    try {
      for await (const el of gen.stream.elementStream) {
        const [row] = await db
          .insert(tasks)
          .values({
            breakdownId: breakdown.id,
            displayId: `${spec.displayId}.${index + 1}`,
            title: el.title,
            description: el.description,
            details: el.details,
            priority: el.priority,
            acceptanceCriteria: el.acceptanceCriteria,
          })
          .returning();
        inserted.push(row);
        for (const dep of el.dependsOn ?? []) {
          if (dep >= 0 && dep < index) {
            await db
              .insert(taskDeps)
              .values({ taskId: row.id, dependsOnId: inserted[dep].id });
          }
        }
        await sse.writeSSE({ event: "task", data: JSON.stringify(row) });
        index += 1;
      }
      if (gen.errors.length > 0) {
        // Provider failed (bad key, rate limit, network). Drop the empty
        // generation so undo state stays clean, then surface the real error.
        if (index === 0) await db.delete(breakdowns).where(eq(breakdowns.id, breakdown.id));
        const first = gen.errors[0];
        await sse.writeSSE({
          event: "error",
          data: JSON.stringify({
            message: first instanceof Error ? first.message : String(first),
          }),
        });
      } else {
        await logEvent({
          orgId: c.get("orgId"),
          actorType: "human",
          actorName: c.get("userName"),
          kind: "breakdown_generated",
          summary: `generated a ${index}-task Breakdown for ${spec.displayId}`,
          specId: spec.id,
          detail: { count: index, generation: breakdown.generation },
        });
        await sse.writeSSE({
          event: "done",
          data: JSON.stringify({ breakdownId: breakdown.id, count: index }),
        });
      }
    } catch (err) {
      await sse.writeSSE({
        event: "error",
        data: JSON.stringify({ message: (err as Error).message }),
      });
    }
  });
});

// Undo regeneration: drop the latest generation, the previous one becomes
// current again. Refused when only one generation exists.
app.delete("/api/specs/:id/breakdown/latest", async (c) => {
  const spec = await ownedSpec(c);
  if (!spec) return c.json({ error: "not found" }, 404);
  const gens = await db
    .select()
    .from(breakdowns)
    .where(eq(breakdowns.specId, spec.id))
    .orderBy(desc(breakdowns.generation));
  if (gens.length < 2) {
    return c.json({ error: "nothing to undo — only one generation exists" }, 400);
  }
  const latest = gens[0];
  const taskRows = await db.select().from(tasks).where(eq(tasks.breakdownId, latest.id));
  for (const t of taskRows) {
    await db.delete(taskDeps).where(eq(taskDeps.taskId, t.id));
    await db.delete(taskDeps).where(eq(taskDeps.dependsOnId, t.id));
  }
  await db.delete(tasks).where(eq(tasks.breakdownId, latest.id));
  await db.delete(breakdowns).where(eq(breakdowns.id, latest.id));
  return c.json({ ok: true, restoredGeneration: gens[1].generation });
});

// Backfill file keys for routines created before slug existed (24-PLATFORM-
// SHARING). Self-healing + idempotent: only touches rows with an empty slug, so
// they become file-syncable without a manual migration.
async function backfillRoutineSlugs(): Promise<void> {
  try {
    const rows = await db.select({ id: routines.id, orgId: routines.orgId, name: routines.name, slug: routines.slug }).from(routines);
    const seen = new Map<string, Set<string>>(); // orgId -> taken slugs
    for (const r of rows) if (r.slug) (seen.get(r.orgId) ?? seen.set(r.orgId, new Set()).get(r.orgId)!).add(r.slug);
    for (const r of rows) {
      if (r.slug) continue;
      const taken = seen.get(r.orgId) ?? seen.set(r.orgId, new Set()).get(r.orgId)!;
      let slug = slugify(r.name);
      for (let i = 2; taken.has(slug); i++) slug = `${slugify(r.name)}-${i}`;
      taken.add(slug);
      await db.update(routines).set({ slug }).where(eq(routines.id, r.id));
    }
  } catch (err) {
    console.error("[sharing] routine slug backfill failed:", err);
  }
}

const port = Number(process.env.SERVER_PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`server: hono listening on :${port}`);
startScheduler(); // routines: schedule triggers (in-process ticker, #20)
backfillRoutineSlugs(); // give pre-slug routines a file key (24-PLATFORM-SHARING)
