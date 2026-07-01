/**
 * Full E2E UAT harness — covers every feature surface including gaps from v1.
 *
 *   Pre-reqs: pnpm dev:db, pnpm db:push, seed-demo.ts, seed-activity.ts, server running.
 *   Run:      BURROW_API=http://localhost:8810 pnpm exec tsx scripts/uat-full.mts
 */
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db.js";
import { user, session } from "@burrow/core";

const API = process.env.BURROW_API ?? "http://localhost:8787";
const PM_EMAIL = "priya@northwind.dev";

type Status = "PASS" | "FAIL" | "WARN";
type Result = { area: string; name: string; status: Status; detail: string };
const results: Result[] = [];
let token = "";

async function http(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, text };
}

function record(area: string, name: string, ok: boolean, detail: string, warn = false) {
  const status: Status = ok ? "PASS" : warn ? "WARN" : "FAIL";
  results.push({ area, name, status, detail });
  const tag = ok ? "✓" : warn ? "~" : "✗";
  console.log(`  ${tag} [${area}] ${name} — ${detail}`);
}

async function getCheck(area: string, name: string, path: string, expectNonEmpty = true) {
  try {
    const { status, json } = await http("GET", path);
    if (status !== 200) return record(area, name, false, `${path} → HTTP ${status}`);
    const arr = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : null;
    if (expectNonEmpty && arr && arr.length === 0) {
      return record(area, name, false, `${path} → 200 but EMPTY (expected seeded data)`, true);
    }
    const count = arr ? `${arr.length} rows` : "200 ok";
    record(area, name, true, `${path} → ${count}`);
    return json;
  } catch (e) {
    record(area, name, false, `${path} → threw ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  console.log(`\nFull UAT against ${API}\n${"=".repeat(56)}`);

  // ── Mint session ─────────────────────────────────────────
  const [pm] = await db.select().from(user).where(eq(user.email, PM_EMAIL));
  if (!pm) { console.error(`No user ${PM_EMAIL}.`); process.exit(1); }
  token = `uat_${randomUUID()}`;
  await db.insert(session).values({
    id: `uat_${randomUUID()}`,
    token,
    userId: pm.id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  // ── 1. Identity ──────────────────────────────────────────
  const me = await http("GET", "/api/me");
  record("Identity", "GET /api/me", me.status === 200 && !!me.json?.role, `role=${me.json?.role}, org=${me.json?.orgId?.slice(0,8)}`);
  await getCheck("Identity", "GET /api/org", "/api/org", false);
  await getCheck("Identity", "GET /api/onboarding", "/api/onboarding", false);
  const onboardRole = await http("POST", "/api/onboarding/role", { roleType: "pm" });
  record("Identity", "POST /api/onboarding/role", onboardRole.status < 300, `HTTP ${onboardRole.status}`);

  // ── 2. Dashboard ─────────────────────────────────────────
  const dash = await http("GET", "/api/dashboard");
  record("Dashboard", "GET /api/dashboard", dash.status === 200 && "counts" in (dash.json ?? {}),
    `needsYou=${dash.json?.counts?.needsYou}, attention=${dash.json?.attention?.length}, activity=${dash.json?.recentActivity?.length}`);

  // ── 3. Specs (read) ──────────────────────────────────────
  const specs = await getCheck("Specs", "GET /api/specs", "/api/specs");
  const specId = Array.isArray(specs) && specs[0]?.id;
  if (specId) {
    await getCheck("Specs", "GET /api/specs/:id", `/api/specs/${specId}`, false);
    await getCheck("Specs", "GET /api/specs/:id/breakdown", `/api/specs/${specId}/breakdown`, false);
    await getCheck("Specs", "GET /api/specs/:id/insights", `/api/specs/${specId}/insights`, false);
    await getCheck("Specs", "GET /api/specs/:id/activity", `/api/specs/${specId}/activity`, false);
    await getCheck("Specs", "GET /api/specs/:id/timeline", `/api/specs/${specId}/timeline`, false);
    await getCheck("Specs", "GET /api/specs/:id/agents", `/api/specs/${specId}/agents`, false);
    await getCheck("Specs", "GET /api/specs/:id/evaluations", `/api/specs/${specId}/evaluations`, false);
  }

  // ── 4. Spec write flows ──────────────────────────────────
  // Create a spec
  const newSpec = await http("POST", "/api/specs", { title: "UAT Temp Spec", status: "draft" });
  const newSpecId = newSpec.json?.id;
  record("Specs", "POST /api/specs", newSpec.status === 201 && !!newSpecId, `HTTP ${newSpec.status}, id=${newSpecId?.slice(0,8)}`);

  if (newSpecId) {
    // Patch the spec
    const patchSpec = await http("PATCH", `/api/specs/${newSpecId}`, { title: "UAT Temp Spec (updated)", status: "in_review" });
    record("Specs", "PATCH /api/specs/:id", patchSpec.status === 200, `HTTP ${patchSpec.status}`);

    // Sign-off approve
    const ap = await http("POST", `/api/specs/${newSpecId}/signoffs`, { verdict: "approved" });
    record("Specs", "POST /api/specs/:id/signoffs (approve)", ap.status < 300, `HTTP ${ap.status}`);
    // Sign-off clear (revert)
    const cl = await http("POST", `/api/specs/${newSpecId}/signoffs`, { verdict: "cleared" });
    record("Specs", "POST /api/specs/:id/signoffs (clear)", cl.status < 300, `HTTP ${cl.status}`);
  }

  // ── 5. Search ────────────────────────────────────────────
  const search = await http("GET", "/api/search?q=billing");
  record("Search", "GET /api/search?q=billing", search.status === 200 && Array.isArray(search.json?.results), `${search.json?.results?.length ?? 0} results`);
  const searchEmpty = await http("GET", "/api/search?q=");
  record("Search", "empty q → 0", searchEmpty.status === 200 && searchEmpty.json?.results?.length === 0, `${searchEmpty.json?.results?.length} (expect 0)`);
  // Search for something from seeded data
  const searchSpec = await http("GET", "/api/search?q=northwind");
  record("Search", "GET /api/search?q=northwind", searchSpec.status === 200, `${searchSpec.json?.results?.length ?? 0} results`);

  // ── 6. Insights (degrade OK without key) ─────────────────
  for (const s of ["roadmap", "backlog"]) {
    const r = await http("GET", `/api/insights/${s}`);
    record("Insights", `GET /api/insights/${s}`, r.status === 200 && "insights" in (r.json ?? {}), `insights=${r.json?.insights === null ? "null (no-key degrade)" : "present"}`);
  }

  // ── 7. Teams ─────────────────────────────────────────────
  const teams = await getCheck("Teams", "GET /api/teams", "/api/teams");
  const teamId = Array.isArray(teams) && teams[0]?.id;
  if (teamId) {
    await getCheck("Teams", "GET /api/teams/:id/members", `/api/teams/${teamId}/members`);
    await getCheck("Teams", "GET /api/teams/:id/specs", `/api/teams/${teamId}/specs`, false);
    // PATCH spec team assignment
    if (newSpecId) {
      const assignTeam = await http("PATCH", `/api/specs/${newSpecId}/team`, { teamId });
      record("Teams", "PATCH /api/specs/:id/team", assignTeam.status < 300, `HTTP ${assignTeam.status}`);
    }
  }
  // Create + delete team (write flow)
  const newTeam = await http("POST", "/api/teams", { name: "UAT Team", description: "temp" });
  const newTeamId = newTeam.json?.id;
  record("Teams", "POST /api/teams", newTeam.status === 201 && !!newTeamId, `HTTP ${newTeam.status}`);
  if (newTeamId) {
    const patchTeam = await http("PATCH", `/api/teams/${newTeamId}`, { name: "UAT Team (updated)" });
    record("Teams", "PATCH /api/teams/:id", patchTeam.status < 300, `HTTP ${patchTeam.status}`);
    const delTeam = await http("DELETE", `/api/teams/${newTeamId}`);
    record("Teams", "DELETE /api/teams/:id (cleanup)", delTeam.status < 300, `HTTP ${delTeam.status}`);
  }

  // ── 8. Roadmap / Initiatives ─────────────────────────────
  const inits = await getCheck("Roadmap", "GET /api/initiatives", "/api/initiatives");
  const init0 = Array.isArray(inits) && inits[0];
  const initId = init0?.id;
  if (initId) {
    await getCheck("Roadmap", "GET /api/initiatives/:id/specs", `/api/initiatives/${initId}/specs`, false);
    // Assign spec to initiative
    if (newSpecId) {
      const linkInit = await http("PATCH", `/api/specs/${newSpecId}/initiative`, { initiativeId: initId });
      record("Roadmap", "PATCH /api/specs/:id/initiative", linkInit.status < 300, `HTTP ${linkInit.status}`);
    }
    // Drag-to-move
    const origHorizon = init0.horizon;
    const target = origHorizon === "now" ? "later" : "now";
    const mv = await http("PATCH", `/api/initiatives/${initId}`, { horizon: target });
    const back = await http("PATCH", `/api/initiatives/${initId}`, { horizon: origHorizon });
    record("Roadmap", "PATCH initiative horizon (move + revert)", mv.status === 200 && back.status === 200, `${origHorizon}→${target}→${origHorizon}`);
  }
  // Create + delete initiative
  const newInit = await http("POST", "/api/initiatives", { title: "UAT Initiative", horizon: "later" });
  const newInitId = newInit.json?.id;
  record("Roadmap", "POST /api/initiatives", newInit.status === 201 && !!newInitId, `HTTP ${newInit.status}`);
  if (newInitId) {
    const delInit = await http("DELETE", `/api/initiatives/${newInitId}`);
    record("Roadmap", "DELETE /api/initiatives/:id (cleanup)", delInit.status < 300, `HTTP ${delInit.status}`);
  }

  // ── 9. Goals + Key Results ───────────────────────────────
  const goals = await getCheck("Goals", "GET /api/goals", "/api/goals");
  const goal0 = Array.isArray(goals) && goals[0];
  const goalId = goal0?.id;
  if (goalId) {
    await getCheck("Goals", "GET /api/goals/:id/links", `/api/goals/${goalId}/links`, false);
    // Add a key result
    const kr = await http("POST", `/api/goals/${goalId}/key-results`, { title: "UAT KR", target: 100, unit: "%" });
    const krId = kr.json?.id;
    record("Goals", "POST /api/goals/:id/key-results", kr.status < 300 && !!krId, `HTTP ${kr.status}`);
    if (krId) {
      const patchKr = await http("PATCH", `/api/key-results/${krId}`, { current: 42 });
      record("Goals", "PATCH /api/key-results/:id", patchKr.status < 300, `HTTP ${patchKr.status}`);
    }
    // Add goal link (requires entityType + entityId)
    if (newSpecId) {
      const addLink = await http("POST", `/api/goals/${goalId}/links`, { entityType: "spec", entityId: newSpecId });
      record("Goals", "POST /api/goals/:id/links", addLink.status < 300, `HTTP ${addLink.status}`);
    }
  }
  // Create + patch + delete goal
  const newGoal = await http("POST", "/api/goals", { title: "UAT Goal", framework: "okr" });
  const newGoalId = newGoal.json?.id;
  record("Goals", "POST /api/goals", newGoal.status === 201 && !!newGoalId, `HTTP ${newGoal.status}`);
  if (newGoalId) {
    const patchGoal = await http("PATCH", `/api/goals/${newGoalId}`, { title: "UAT Goal (updated)" });
    record("Goals", "PATCH /api/goals/:id", patchGoal.status < 300, `HTTP ${patchGoal.status}`);
    const delGoal = await http("DELETE", `/api/goals/${newGoalId}`);
    record("Goals", "DELETE /api/goals/:id (cleanup)", delGoal.status < 300, `HTTP ${delGoal.status}`);
  }

  // ── 10. Feedback ─────────────────────────────────────────
  await getCheck("Feedback", "GET /api/feedback", "/api/feedback");
  const themes = await getCheck("Feedback", "GET /api/feedback/themes", "/api/feedback/themes");
  const themeId = Array.isArray(themes) && themes[0]?.id;

  // Create feedback item + delete (returns {inserted:N} not {id:...})
  const newFb = await http("POST", "/api/feedback", { text: "UAT: The export button is hard to find.", source: "test", sentiment: "negative" });
  record("Feedback", "POST /api/feedback", newFb.status === 201, `HTTP ${newFb.status}`);

  // VoC report endpoint (POST — SSE, just check it opens the stream or returns 422 for no key)
  const vocReport = await http("POST", "/api/feedback/report", { themeIds: themeId ? [themeId] : [] });
  record("Feedback", "POST /api/feedback/report (VoC)",
    vocReport.status === 200 || vocReport.status === 422 || vocReport.status === 400,
    `HTTP ${vocReport.status} (200=stream, 422=no-key, 400=no themes)`);

  // Theme → create-spec (no key = 422 OK)
  if (themeId) {
    const tspec = await http("POST", `/api/feedback/themes/${themeId}/create-spec`, {});
    record("Feedback", "POST /api/feedback/themes/:id/create-spec",
      tspec.status === 201 || tspec.status === 422 || tspec.status === 200,
      `HTTP ${tspec.status} (201=created, 422=no-key)`);
  }

  // ── 11. Opportunities ────────────────────────────────────
  const opps = await getCheck("Opportunities", "GET /api/opportunities", "/api/opportunities");
  const oppsSample = Array.isArray(opps) && opps.slice(0, 2);
  if (oppsSample && oppsSample.length) {
    const insights = await http("POST", "/api/opportunities/insights", { opportunities: oppsSample });
    record("Opportunities", "POST /api/opportunities/insights",
      insights.status === 200 && "narratives" in (insights.json ?? {}),
      `HTTP ${insights.status}, narratives=${insights.json?.narratives?.length ?? 0} (0=no-key degrade)`);
  }

  // ── 12. Ingest Keys ──────────────────────────────────────
  const ingestKeysList = await getCheck("Ingest", "GET /api/ingest-keys", "/api/ingest-keys", false);
  const newKey = await http("POST", "/api/ingest-keys", { label: "UAT webhook key" });
  const keyId = newKey.json?.id;
  const rawKey = newKey.json?.rawKey;
  record("Ingest", "POST /api/ingest-keys", newKey.status === 201 && !!rawKey, `HTTP ${newKey.status}, rawKey shown once=${!!rawKey}`);

  // Test the ingest endpoint with the key (uses x-burrow-ingest-key header + items[] body)
  if (rawKey) {
    const ingestRes = await fetch(`${API}/api/ingest/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-burrow-ingest-key": rawKey },
      body: JSON.stringify({ items: [{ text: "UAT ingest: the search is broken on mobile", source: "webhook", sentiment: "negative", externalId: `uat-${randomUUID()}` }] }),
    });
    record("Ingest", "POST /api/ingest/feedback (webhook path)", ingestRes.status === 201 || ingestRes.status === 200, `HTTP ${ingestRes.status}`);
    // Delete the key
    if (keyId) {
      const delKey = await http("DELETE", `/api/ingest-keys/${keyId}`);
      record("Ingest", "DELETE /api/ingest-keys/:id (cleanup)", delKey.status < 300, `HTTP ${delKey.status}`);
    }
  }

  // ── 13. Market ───────────────────────────────────────────
  const competitors = await getCheck("Market", "GET /api/competitors", "/api/competitors");
  const signals = await getCheck("Market", "GET /api/market-signals", "/api/market-signals");
  const signalId = Array.isArray(signals) && signals[0]?.id;

  // Create competitor + delete
  const newComp = await http("POST", "/api/competitors", { name: "UAT Corp", description: "Test competitor" });
  const compId = newComp.json?.id;
  record("Market", "POST /api/competitors", newComp.status === 201 && !!compId, `HTTP ${newComp.status}`);
  if (compId) {
    const delComp = await http("DELETE", `/api/competitors/${compId}`);
    record("Market", "DELETE /api/competitors/:id (cleanup)", delComp.status < 300, `HTTP ${delComp.status}`);
  }
  // Create market signal (manual: title + summary required; rawText requires AI key)
  const newSig = await http("POST", "/api/market-signals", { title: "UAT Signal", summary: "competitor added AI search feature", severity: "high" });
  const sigId = newSig.json?.id;
  record("Market", "POST /api/market-signals", newSig.status === 201 && !!sigId, `HTTP ${newSig.status}`);
  if (sigId && newSpecId) {
    const linkSig = await http("PATCH", `/api/market-signals/${sigId}/spec`, { specId: newSpecId });
    record("Market", "PATCH /api/market-signals/:id/spec", linkSig.status < 300, `HTTP ${linkSig.status}`);
  }
  if (sigId) {
    const delSig = await http("DELETE", `/api/market-signals/${sigId}`);
    record("Market", "DELETE /api/market-signals/:id (cleanup)", delSig.status < 300, `HTTP ${delSig.status}`);
  }

  // ── 14. Context ──────────────────────────────────────────
  const ctx = await getCheck("Context", "GET /api/context", "/api/context");
  const ctxId = Array.isArray(ctx) && ctx[0]?.id;
  if (ctxId) {
    await getCheck("Context", "GET /api/context/:id", `/api/context/${ctxId}`, false);
    const patchCtx = await http("PATCH", `/api/context/${ctxId}`, { title: "UAT Context (updated)" });
    record("Context", "PATCH /api/context/:id", patchCtx.status < 300, `HTTP ${patchCtx.status}`);
    // Revert
    const origCtx = Array.isArray(ctx) && ctx[0];
    if (origCtx) await http("PATCH", `/api/context/${ctxId}`, { title: origCtx.title });
  }
  // Create + delete context doc
  const newCtx = await http("POST", "/api/context", { title: "UAT Context Doc", type: "company", body: "# UAT test org context" });
  const newCtxId = newCtx.json?.id;
  record("Context", "POST /api/context", newCtx.status === 201 && !!newCtxId, `HTTP ${newCtx.status}`);
  if (newCtxId) {
    const delCtx = await http("DELETE", `/api/context/${newCtxId}`);
    record("Context", "DELETE /api/context/:id (cleanup)", delCtx.status < 300, `HTTP ${delCtx.status}`);
  }

  // ── 15. Connections ──────────────────────────────────────
  const conns = await getCheck("Connections", "GET /api/connections", "/api/connections");
  const connId = Array.isArray(conns) && conns[0]?.id;
  // Probe the connection (test button) — seeded conn has fake URL, returns 400 {ok:false}
  if (connId) {
    const probe = await http("POST", `/api/connections/${connId}/probe`, {});
    record("Connections", "POST /api/connections/:id/probe",
      probe.status === 200 || probe.status === 400,
      `HTTP ${probe.status}, ok=${probe.json?.ok} (400/ok=false expected for fake MCP URL)`);
  }
  // POST /api/connections requires probing a live MCP URL — not testable without real server
  record("Connections", "POST /api/connections", true, "skipped — requires live MCP server; seeded connections cover all read paths", true);
  // DELETE seeded connection (use the slack one to avoid removing the jira one used for push)
  const connsArr = Array.isArray(conns) ? conns : [];
  const connToDelete = connsArr.find((c: any) => c.target === "slack");
  if (connToDelete) {
    const delConn = await http("DELETE", `/api/connections/${connToDelete.id}`);
    record("Connections", "DELETE /api/connections/:id", delConn.status < 300, `HTTP ${delConn.status}`);
  } else {
    record("Connections", "DELETE /api/connections/:id", true, "no spare connection — skipped", true);
  }

  // ── 16. Spec push to connection (no breakdown → 400; push error → 502, not 500) ───
  // Verify the error path: push without a breakdown returns 400, and network errors return 502 (not 500)
  if (specId && connId) {
    const pushSpec = await http("POST", `/api/specs/${specId}/push/${connId}`, {});
    // Without a breakdown: 400. With breakdown + bad URL: 502 (fixed from 500). Both are non-500.
    record("Connections", "POST /api/specs/:id/push/:connId (Jira push)",
      pushSpec.status !== 500,
      `HTTP ${pushSpec.status} (400=no breakdown, 502=push failed, 500=BUG)`);
  }

  // ── 17. Automations / Routines ───────────────────────────
  const routines = await getCheck("Automations", "GET /api/routines", "/api/routines");
  const routine0 = Array.isArray(routines) && routines[0];
  const routineId = routine0?.id;
  if (routineId) {
    await getCheck("Automations", "GET /api/routines/:id/runs", `/api/routines/${routineId}/runs`, false);
    // PATCH routine
    const patchRoutine = await http("PATCH", `/api/routines/${routineId}`, { name: routine0.name + " (uat)" });
    record("Automations", "PATCH /api/routines/:id", patchRoutine.status < 300, `HTTP ${patchRoutine.status}`);
    // Revert
    await http("PATCH", `/api/routines/${routineId}`, { name: routine0.name });
  }
  // Routine CRUD round-trip
  const cr = await http("POST", "/api/routines", { name: "UAT temp routine", triggerType: "schedule", schedule: "daily", actions: [{ type: "log", message: "uat" }] });
  const crId = cr.json?.id;
  record("Automations", "POST /api/routines", cr.status === 201 && !!crId, `HTTP ${cr.status}`);
  if (crId) {
    const del = await http("DELETE", `/api/routines/${crId}`);
    record("Automations", "DELETE /api/routines/:id (cleanup)", del.status === 200, `HTTP ${del.status}`);
  }
  // Routine by-slug round-trip (triggerType must be "event" or "schedule")
  const routineSlug = `uat-routine-${randomUUID().slice(0,8)}`;
  const putRoutine = await http("PUT", `/api/routines/by-slug/${routineSlug}`, {
    name: "UAT Slug Routine", triggerType: "schedule", schedule: "daily", actions: [{ type: "log", message: "slug-uat" }]
  });
  record("Automations", "PUT /api/routines/by-slug/:slug", putRoutine.status === 200 || putRoutine.status === 201, `HTTP ${putRoutine.status}`);
  const getRoutineBySlug = await http("GET", `/api/routines/by-slug/${routineSlug}`);
  record("Automations", "GET /api/routines/by-slug/:slug", getRoutineBySlug.status === 200, `HTTP ${getRoutineBySlug.status}`);
  if (getRoutineBySlug.json?.id) {
    await http("DELETE", `/api/routines/${getRoutineBySlug.json.id}`);
  }

  // ── 18. Library (skills + agents) ────────────────────────
  const skills = await getCheck("Library", "GET /api/skills", "/api/skills");
  const skillSlug = Array.isArray(skills) && skills[0]?.slug;
  if (skillSlug) {
    await getCheck("Library", "GET /api/skills/:slug", `/api/skills/${skillSlug}`, false);
    // Toggle published
    const skillPub = await http("PATCH", `/api/skills/${skillSlug}/published`, { published: false });
    record("Library", "PATCH /api/skills/:slug/published", skillPub.status < 300, `HTTP ${skillPub.status}`);
    await http("PATCH", `/api/skills/${skillSlug}/published`, { published: true }); // revert
  }
  const agents = await getCheck("Library", "GET /api/agents", "/api/agents");
  const agentSlug = Array.isArray(agents) && agents[0]?.slug;
  if (agentSlug) {
    await getCheck("Library", "GET /api/agents/:slug", `/api/agents/${agentSlug}`, false);
    const agentPub = await http("PATCH", `/api/agents/${agentSlug}/published`, { published: false });
    record("Library", "PATCH /api/agents/:slug/published", agentPub.status < 300, `HTTP ${agentPub.status}`);
    await http("PATCH", `/api/agents/${agentSlug}/published`, { published: true }); // revert
  }
  // Skill upsert + conflict contract
  const s1 = await http("PUT", "/api/skills/uat-conflict", { name: "UAT Conflict", body: "v1" });
  if (s1.status === 200 && s1.json?.sourceHash) {
    const stale = await http("PUT", "/api/skills/uat-conflict", { name: "UAT Conflict", body: "v2", baseHash: "WRONG" });
    record("Library", "skill 409 conflict contract", stale.status === 409, `stale push → HTTP ${stale.status} (expect 409)`);
    await http("DELETE", "/api/skills/uat-conflict");
  } else {
    record("Library", "skill upsert", s1.status === 200, `HTTP ${s1.status}`);
  }
  // Agent upsert + delete
  const a1 = await http("PUT", "/api/agents/uat-agent", { name: "UAT Agent", description: "test", body: "v1" });
  record("Library", "PUT /api/agents/:slug", a1.status === 200, `HTTP ${a1.status}`);
  await http("DELETE", "/api/agents/uat-agent");

  // ── 19. Chat ─────────────────────────────────────────────
  await getCheck("Chat", "GET /api/chat/threads", "/api/chat/threads", false);
  const newThread = await http("POST", "/api/chat/threads", { title: "UAT Thread" });
  const threadId = newThread.json?.id;
  record("Chat", "POST /api/chat/threads", newThread.status === 201 && !!threadId, `HTTP ${newThread.status}`);
  if (threadId) {
    const getThread = await http("GET", `/api/chat/threads/${threadId}`);
    record("Chat", "GET /api/chat/threads/:id", getThread.status === 200, `HTTP ${getThread.status}`);
    // Post a message (no-key → may SSE 422 or 200)
    const msgRes = await fetch(`${API}/api/chat/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: "What specs are in draft?" }),
    });
    record("Chat", "POST /api/chat/threads/:id/messages", msgRes.status < 500, `HTTP ${msgRes.status} (non-500 = handler reached)`);
    const delThread = await http("DELETE", `/api/chat/threads/${threadId}`);
    record("Chat", "DELETE /api/chat/threads/:id (cleanup)", delThread.status < 300, `HTTP ${delThread.status}`);
  }

  // ── 20. Misc ─────────────────────────────────────────────
  await getCheck("Misc", "GET /api/playbook", "/api/playbook", false);
  // Playbook create + delete
  const newPb = await http("POST", "/api/playbook", { title: "UAT Playbook Doc", body: "# UAT" });
  const pbId = newPb.json?.id;
  record("Misc", "POST /api/playbook", newPb.status === 201 && !!pbId, `HTTP ${newPb.status}`);
  if (pbId) {
    const patchPb = await http("PATCH", `/api/playbook/${pbId}`, { title: "UAT Playbook Doc (updated)" });
    record("Misc", "PATCH /api/playbook/:id", patchPb.status < 300, `HTTP ${patchPb.status}`);
    const delPb = await http("DELETE", `/api/playbook/${pbId}`);
    record("Misc", "DELETE /api/playbook/:id (cleanup)", delPb.status < 300, `HTTP ${delPb.status}`);
  }
  await getCheck("Misc", "GET /api/keys", "/api/keys", false);
  // Create + delete API key
  const newApiKey = await http("POST", "/api/keys", { provider: "anthropic", key: "sk-ant-test-key-uat" });
  const apiKeyId = newApiKey.json?.id;
  record("Misc", "POST /api/keys", newApiKey.status === 201 && !!apiKeyId, `HTTP ${newApiKey.status}`);
  if (apiKeyId) {
    const delApiKey = await http("DELETE", `/api/keys/${apiKeyId}`);
    record("Misc", "DELETE /api/keys/:id (cleanup)", delApiKey.status < 300, `HTTP ${delApiKey.status}`);
  }
  await getCheck("Misc", "GET /api/activity", "/api/activity", false);
  await getCheck("Misc", "GET /api/chat/threads", "/api/chat/threads", false);
  const collab = await http("GET", "/api/collab-token");
  record("Misc", "GET /api/collab-token", collab.status === 200 && !!collab.json?.token, "token issued");
  // Health check
  const health = await http("GET", "/health");
  record("Misc", "GET /health", health.status === 200 && health.json?.ok === true, `ok=${health.json?.ok}`);

  // ── 21. Context graph reindex ────────────────────────────
  const reindex = await http("POST", "/api/context-graph/reindex", {});
  record("Context", "POST /api/context-graph/reindex", reindex.status < 300, `HTTP ${reindex.status}`);

  // ── 22. Task update (from MCP agent) ────────────────────
  // Find a task from the first spec's breakdown
  if (specId) {
    const bdResp = await http("GET", `/api/specs/${specId}/breakdown`);
    const tasks = bdResp.json?.tasks;
    if (Array.isArray(tasks) && tasks.length) {
      const taskId = tasks[0].id;
      const origStatus = tasks[0].status;
      const taskPatch = await http("PATCH", `/api/tasks/${taskId}`, { status: "in_progress" });
      record("Specs", "PATCH /api/tasks/:id (status update)", taskPatch.status < 300, `HTTP ${taskPatch.status}`);
      // Revert
      await http("PATCH", `/api/tasks/${taskId}`, { status: origStatus });
    } else {
      record("Specs", "PATCH /api/tasks/:id (status update)", true, "no tasks seeded — skipped", true);
    }
  }

  // ── Cleanup temp spec ────────────────────────────────────
  // (no delete endpoint for specs in this version — just leave it; it's draft)

  // ── MCP endpoint reachable (needs Accept: application/json, text/event-stream) ──
  const mcpPing = await fetch(`${API}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "uat", version: "1" } } }),
  });
  record("MCP", "POST /mcp (initialize)", mcpPing.status === 200, `HTTP ${mcpPing.status}`);

  // ── Report ───────────────────────────────────────────────
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"=".repeat(56)}\n${pass} PASS · ${warn} WARN · ${fail} FAIL  (of ${results.length} checks)\n`);

  const byArea = [...new Set(results.map((r) => r.area))];
  const md = [
    "# Full E2E UAT Results",
    "",
    `**Run:** against \`${API}\` over the seeded Northwind org.`,
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Result:** ${pass} PASS · ${warn} WARN · ${fail} FAIL (of ${results.length} checks).`,
    "",
    "| Area | Check | Status | Detail |",
    "|---|---|---|---|",
    ...byArea.flatMap((a) =>
      results.filter((r) => r.area === a).map((r) =>
        `| ${a} | ${r.name} | ${r.status === "PASS" ? "✅" : r.status === "WARN" ? "⚠️" : "❌"} | ${r.detail.replace(/\|/g, "\\|")} |`
      )
    ),
    "",
    "## Coverage vs v1 UAT",
    "| New area | Checks added |",
    "|---|---|",
    "| Spec create/patch | 3 |",
    "| Spec evaluations | 1 |",
    "| Goals + key results CRUD | 6 |",
    "| Opportunities | 2 |",
    "| Ingest keys + webhook path | 4 |",
    "| Market signals CRUD + spec link | 5 |",
    "| Connections: probe + push-to-Jira | 3 |",
    "| Chat threads CRUD + messages | 4 |",
    "| Routines: patch + by-slug | 4 |",
    "| Feedback VoC + theme→spec | 2 |",
    "| Library: publish toggle + agent CRUD | 4 |",
    "| Playbook CRUD | 3 |",
    "| API keys CRUD | 2 |",
    "| Context: CRUD + reindex | 5 |",
    "| Teams: create/patch/delete + team assignment | 4 |",
    "| MCP initialize | 1 |",
    "| Task status update | 1 |",
  ].join("\n");

  writeFileSync(new URL("./UAT-RESULTS.md", import.meta.url), md);
  console.log("Report written to apps/server/scripts/UAT-RESULTS.md");

  await db.delete(session).where(eq(session.token, token));
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
