/**
 * End-to-end UAT harness. Exercises every feature surface against a running
 * server with a real session, over the seeded Northwind org.
 *
 *   1. Seed first:  tsx scripts/seed-demo.ts
 *   2. Run:         tsx scripts/uat.mts   (reads BURROW_API, default :8787)
 *
 * It mints a short-lived session row for the PM (the server accepts a
 * session.token as a bearer), runs read checks across all 14 features, then a
 * few self-cleaning write flows, and writes a markdown report to
 * scripts/UAT-RESULTS.md. Read-only against seeded data except the write flows,
 * which revert themselves.
 */
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db.js";
import { user, session } from "@burrow/core";

const API = process.env.BURROW_API ?? "http://localhost:8787";
const PM_EMAIL = "priya@northwind.dev";

type Result = { area: string; name: string; status: "PASS" | "FAIL" | "WARN"; detail: string };
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
  return { status: res.status, json };
}

function record(area: string, name: string, ok: boolean, detail: string, warn = false) {
  results.push({ area, name, status: ok ? "PASS" : warn ? "WARN" : "FAIL", detail });
  const tag = ok ? "✓" : warn ? "~" : "✗";
  console.log(`  ${tag} [${area}] ${name} — ${detail}`);
}

// A GET that should be 200 and (optionally) return a non-empty array/count.
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
  console.log(`\nUAT against ${API}\n${"=".repeat(48)}`);

  // ── Mint a PM session (bearer = session.token) ───────────────────────────
  const [pm] = await db.select().from(user).where(eq(user.email, PM_EMAIL));
  if (!pm) {
    console.error(`No user ${PM_EMAIL}. Sign up + seed first.`);
    process.exit(1);
  }
  token = `uat_${randomUUID()}`;
  await db.insert(session).values({
    id: `uat_${randomUUID()}`,
    token,
    userId: pm.id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  // ── Identity ─────────────────────────────────────────────────────────────
  const me = await http("GET", "/api/me");
  record("Identity", "GET /api/me", me.status === 200 && me.json?.role, `role=${me.json?.role}, org=${me.json?.orgId?.slice(0, 8)}`);
  await getCheck("Identity", "GET /api/org", "/api/org", false);
  await getCheck("Identity", "GET /api/onboarding", "/api/onboarding", false);

  // ── Dashboard ────────────────────────────────────────────────────────────
  const dash = await http("GET", "/api/dashboard");
  record("Dashboard", "GET /api/dashboard", dash.status === 200, `needsYou=${dash.json?.counts?.needsYou}, attention=${dash.json?.attention?.length}, suggestions=${dash.json?.suggestions?.length}, activity=${dash.json?.recentActivity?.length}`);

  // ── Specs ────────────────────────────────────────────────────────────────
  const specs = await getCheck("Specs", "GET /api/specs", "/api/specs");
  const specId = Array.isArray(specs) && specs[0]?.id;
  if (specId) {
    await getCheck("Specs", "GET /api/specs/:id", `/api/specs/${specId}`, false);
    await getCheck("Specs", "GET /api/specs/:id/breakdown", `/api/specs/${specId}/breakdown`, false);
    await getCheck("Specs", "GET /api/specs/:id/insights", `/api/specs/${specId}/insights`, false);
    await getCheck("Specs", "GET /api/specs/:id/activity", `/api/specs/${specId}/activity`, false);
    await getCheck("Specs", "GET /api/specs/:id/timeline", `/api/specs/${specId}/timeline`, false);
    await getCheck("Specs", "GET /api/specs/:id/agents", `/api/specs/${specId}/agents`, false);
  }

  // ── Search (UX #3) ───────────────────────────────────────────────────────
  const search = await http("GET", "/api/search?q=billing");
  record("Search", "GET /api/search?q=billing", search.status === 200 && Array.isArray(search.json?.results), `${search.json?.results?.length ?? 0} results`);
  const searchEmpty = await http("GET", "/api/search?q=");
  record("Search", "empty q → []", searchEmpty.status === 200 && searchEmpty.json?.results?.length === 0, `${searchEmpty.json?.results?.length} (expect 0)`);

  // ── Insights (item 1) — degrade to null without a key, never 500 ─────────
  for (const s of ["roadmap", "backlog"]) {
    const r = await http("GET", `/api/insights/${s}`);
    record("Insights", `GET /api/insights/${s}`, r.status === 200 && "insights" in (r.json ?? {}), `insights=${r.json?.insights === null ? "null (no-key degrade)" : "present"}`);
  }

  // ── Teams ────────────────────────────────────────────────────────────────
  const teams = await getCheck("Teams", "GET /api/teams", "/api/teams");
  const teamId = Array.isArray(teams) && teams[0]?.id;
  if (teamId) {
    await getCheck("Teams", "GET /api/teams/:id/members", `/api/teams/${teamId}/members`);
    await getCheck("Teams", "GET /api/teams/:id/specs", `/api/teams/${teamId}/specs`, false);
  }

  // ── Roadmap ──────────────────────────────────────────────────────────────
  const inits = await getCheck("Roadmap", "GET /api/initiatives", "/api/initiatives");
  const initId = Array.isArray(inits) && inits[0]?.id;
  if (initId) await getCheck("Roadmap", "GET /api/initiatives/:id/specs", `/api/initiatives/${initId}/specs`, false);

  // ── Goals ────────────────────────────────────────────────────────────────
  const goals = await getCheck("Goals", "GET /api/goals", "/api/goals");
  const goalId = Array.isArray(goals) && goals[0]?.id;
  if (goalId) await getCheck("Goals", "GET /api/goals/:id/links", `/api/goals/${goalId}/links`, false);

  // ── Feedback ─────────────────────────────────────────────────────────────
  await getCheck("Feedback", "GET /api/feedback", "/api/feedback");
  await getCheck("Feedback", "GET /api/feedback/themes", "/api/feedback/themes");

  // ── Market ───────────────────────────────────────────────────────────────
  await getCheck("Market", "GET /api/competitors", "/api/competitors");
  await getCheck("Market", "GET /api/market-signals", "/api/market-signals");

  // ── Context ──────────────────────────────────────────────────────────────
  const ctx = await getCheck("Context", "GET /api/context", "/api/context");
  const ctxId = Array.isArray(ctx) && ctx[0]?.id;
  if (ctxId) await getCheck("Context", "GET /api/context/:id", `/api/context/${ctxId}`, false);

  // ── Connections ──────────────────────────────────────────────────────────
  await getCheck("Connections", "GET /api/connections", "/api/connections");

  // ── Automations (routines) ───────────────────────────────────────────────
  const routines = await getCheck("Automations", "GET /api/routines", "/api/routines");
  const routineId = Array.isArray(routines) && routines[0]?.id;
  if (routineId) await getCheck("Automations", "GET /api/routines/:id/runs", `/api/routines/${routineId}/runs`, false);

  // ── Library (skills + agents) ────────────────────────────────────────────
  const skills = await getCheck("Library", "GET /api/skills", "/api/skills");
  const skillSlug = Array.isArray(skills) && skills[0]?.slug;
  if (skillSlug) await getCheck("Library", "GET /api/skills/:slug", `/api/skills/${skillSlug}`, false);
  const agents = await getCheck("Library", "GET /api/agents", "/api/agents");
  const agentSlug = Array.isArray(agents) && agents[0]?.slug;
  if (agentSlug) await getCheck("Library", "GET /api/agents/:slug", `/api/agents/${agentSlug}`, false);

  // ── Misc reads ───────────────────────────────────────────────────────────
  await getCheck("Misc", "GET /api/playbook", "/api/playbook", false);
  await getCheck("Misc", "GET /api/keys", "/api/keys", false);
  await getCheck("Misc", "GET /api/activity", "/api/activity", false);
  await getCheck("Misc", "GET /api/chat/threads", "/api/chat/threads", false);
  const collab = await http("GET", "/api/collab-token");
  record("Misc", "GET /api/collab-token", collab.status === 200 && !!collab.json?.token, "token issued");

  // ── Write flows (self-cleaning) ──────────────────────────────────────────
  // Routine create → delete round-trip.
  const cr = await http("POST", "/api/routines", { name: "UAT temp routine", triggerType: "schedule", schedule: "daily", actions: [{ type: "log", message: "uat" }] });
  if (cr.status === 201 && cr.json?.id) {
    record("Write", "POST /api/routines", true, `created ${cr.json.id.slice(0, 8)}`);
    const del = await http("DELETE", `/api/routines/${cr.json.id}`);
    record("Write", "DELETE /api/routines/:id", del.status === 200, `cleanup HTTP ${del.status}`);
  } else {
    record("Write", "POST /api/routines", false, `HTTP ${cr.status}`);
  }

  // Initiative move (UX #10) → revert.
  if (initId && Array.isArray(inits)) {
    const orig = inits[0].horizon;
    const target = orig === "now" ? "later" : "now";
    const mv = await http("PATCH", `/api/initiatives/${initId}`, { horizon: target });
    const back = await http("PATCH", `/api/initiatives/${initId}`, { horizon: orig });
    record("Write", "PATCH initiative horizon (move + revert)", mv.status === 200 && back.status === 200, `${orig}→${target}→${orig}`);
  }

  // Sign-off approve (UX #9) on an in_review spec → revert with "cleared".
  if (Array.isArray(specs)) {
    const inReview = specs.find((s: any) => s.status === "in_review");
    if (inReview) {
      const ap = await http("POST", `/api/specs/${inReview.id}/signoffs`, { verdict: "approved" });
      const cl = await http("POST", `/api/specs/${inReview.id}/signoffs`, { verdict: "cleared" });
      record("Write", "POST signoff approve + clear", ap.status < 300 && cl.status < 300, `${inReview.displayId}: approve=${ap.status}, clear=${cl.status}`);
    } else {
      record("Write", "POST signoff approve", true, "no in_review spec to approve (skipped)", true);
    }
  }

  // Skill conflict contract (Phase 1): create → stale push → 409 → cleanup.
  const s1 = await http("PUT", "/api/skills/uat-conflict", { name: "UAT Conflict", body: "v1" });
  if (s1.status === 200 && s1.json?.sourceHash) {
    const stale = await http("PUT", "/api/skills/uat-conflict", { name: "UAT Conflict", body: "v2", baseHash: "WRONG" });
    record("Write", "skill 409 conflict contract", stale.status === 409, `stale push → HTTP ${stale.status} (expect 409)`);
    await http("DELETE", "/api/skills/uat-conflict");
  } else {
    record("Write", "skill upsert", false, `HTTP ${s1.status}`);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"=".repeat(48)}\n${pass} PASS · ${warn} WARN · ${fail} FAIL  (of ${results.length})\n`);

  const byArea = [...new Set(results.map((r) => r.area))];
  const md = [
    "# E2E UAT Results",
    "",
    `**Run:** against \`${API}\` over the seeded Northwind org.`,
    `**Result:** ${pass} PASS · ${warn} WARN · ${fail} FAIL (of ${results.length} checks).`,
    "",
    "| Area | Check | Status | Detail |",
    "|---|---|---|---|",
    ...byArea.flatMap((a) =>
      results.filter((r) => r.area === a).map((r) => `| ${a} | ${r.name} | ${r.status === "PASS" ? "✅" : r.status === "WARN" ? "⚠️" : "❌"} | ${r.detail.replace(/\|/g, "\\|")} |`),
    ),
    "",
  ].join("\n");
  writeFileSync(new URL("./UAT-RESULTS.md", import.meta.url), md);
  console.log("Report written to apps/server/scripts/UAT-RESULTS.md");

  // Clean up the UAT session.
  await db.delete(session).where(eq(session.token, token));
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
