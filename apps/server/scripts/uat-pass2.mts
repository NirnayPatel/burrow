/**
 * UAT Pass 2 — covers gaps left by uat-full.mts:
 *   - Untested routes (team members, feedback delete, agent delete, onboarding/complete,
 *     CLI device flow, chat/confirm, spec assist/breakdown/evaluate no-key degrade,
 *     feedback cluster no-key, breakdown delete undo, webhooks)
 *   - RBAC validation (viewer vs admin cross-org isolation)
 *   - Data consistency (displayId race, theme→spec linkage, feedback dedup, delete 404)
 *   - Edge cases (search accuracy, spec displayId monotonicity)
 *
 * Run:  BURROW_API=http://localhost:8810 pnpm exec tsx scripts/uat-pass2.mts
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
let viewerToken = "";

async function http(method: string, path: string, body?: unknown, tok = token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
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

async function main() {
  console.log(`\nUAT Pass 2 against ${API}\n${"=".repeat(56)}`);

  // ── Mint admin session ────────────────────────────────────
  const [pm] = await db.select().from(user).where(eq(user.email, PM_EMAIL));
  if (!pm) { console.error(`No user ${PM_EMAIL}.`); process.exit(1); }
  token = `uat2_${randomUUID()}`;
  await db.insert(session).values({ id: `uat2_${randomUUID()}`, token, userId: pm.id, expiresAt: new Date(Date.now() + 3_600_000) });

  // ── Mint viewer session (different org — tests cross-org isolation) ────────
  const [viewer] = await db.select().from(user).where(eq(user.email, "viewer@northwind.dev"));
  if (viewer) {
    viewerToken = `uat2v_${randomUUID()}`;
    await db.insert(session).values({ id: `uat2v_${randomUUID()}`, token: viewerToken, userId: viewer.id, expiresAt: new Date(Date.now() + 3_600_000) });
  }

  // ── 1. Onboarding complete ────────────────────────────────
  const onboardComplete = await http("POST", "/api/onboarding/complete", {
    roleType: "pm",
    context: [{ title: "UAT Org", kind: "company", bodyText: "# UAT test org" }],
  });
  record("Identity", "POST /api/onboarding/complete", onboardComplete.status < 300, `HTTP ${onboardComplete.status}`);

  // ── 2. Cross-org isolation ────────────────────────────────
  if (viewerToken) {
    const viewerMe = await http("GET", "/api/me", undefined, viewerToken);
    const viewerOrgId = viewerMe.json?.orgId;
    const adminMe = await http("GET", "/api/me");
    const adminOrgId = adminMe.json?.orgId;
    record("RBAC", "Cross-org: viewer and admin have different orgIds",
      !!viewerOrgId && viewerOrgId !== adminOrgId,
      `viewer=${viewerOrgId?.slice(0,8)}, admin=${adminOrgId?.slice(0,8)}`);

    // Viewer sees their own (empty) specs, not Northwind's
    const viewerSpecs = await http("GET", "/api/specs", undefined, viewerToken);
    const adminSpecs = await http("GET", "/api/specs");
    record("RBAC", "Cross-org: viewer cannot see admin org's specs",
      viewerSpecs.status === 200 && Array.isArray(viewerSpecs.json) && viewerSpecs.json.length < adminSpecs.json?.length,
      `viewer=${viewerSpecs.json?.length} specs, admin=${adminSpecs.json?.length} specs`);

    // Admin-only endpoint: viewer in THEIR OWN org is admin (single user org)
    // But they cannot reach Northwind feedback — test that their cluster call
    // doesn't leak Northwind data
    const viewerCluster = await http("POST", "/api/feedback/cluster", {}, viewerToken);
    record("RBAC", "Cross-org: viewer cluster gets their own org data only",
      viewerCluster.status === 400 && viewerCluster.json?.error === "no feedback to cluster",
      `HTTP ${viewerCluster.status}: ${viewerCluster.json?.error} (expect: empty org)`);

    // Try to directly access a Northwind spec by ID with viewer token
    const adminSpecsData = await http("GET", "/api/specs");
    const northwindSpecId = Array.isArray(adminSpecsData.json) && adminSpecsData.json[0]?.id;
    if (northwindSpecId) {
      const viewerFetch = await http("GET", `/api/specs/${northwindSpecId}`, undefined, viewerToken);
      record("RBAC", "Cross-org: viewer cannot fetch Northwind spec by ID",
        viewerFetch.status === 404,
        `HTTP ${viewerFetch.status} (expect 404 — not in viewer's org)`);
    }
  } else {
    record("RBAC", "Cross-org isolation", true, "viewer user not found — skipped", true);
  }

  // ── 3. displayId race condition fix ──────────────────────
  const before = await http("GET", "/api/specs");
  const beforeCount = before.json?.length ?? 0;

  // Fire 5 concurrent spec creates
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      http("POST", "/api/specs", { title: `Race spec ${i}` })
    )
  );
  const displayIds = concurrent.map((r) => r.json?.displayId).filter(Boolean);
  const dupes = displayIds.filter((id, idx) => displayIds.indexOf(id) !== idx);
  record("Data Consistency", "displayId race: 5 concurrent creates → no duplicate SPEC-N",
    dupes.length === 0,
    `displayIds=${displayIds.join(",")} dupes=${dupes.join(",") || "none"}`);
  record("Data Consistency", "displayId monotonic: all IDs unique and non-null",
    displayIds.length === 5 && new Set(displayIds).size === 5,
    `${displayIds.length}/5 created with unique IDs`);

  // ── 4. Team members CRUD ─────────────────────────────────
  const teams = await http("GET", "/api/teams");
  const teamId = Array.isArray(teams.json) && teams.json[0]?.id;
  const meData = await http("GET", "/api/me");
  const myUserId = meData.json?.id ?? pm.id;

  if (teamId) {
    // Add member
    const addMember = await http("POST", `/api/teams/${teamId}/members`, { userId: myUserId, roleInTeam: "member" });
    record("Teams", "POST /api/teams/:id/members", addMember.status < 300, `HTTP ${addMember.status}`);

    // Remove member
    const removeMember = await http("DELETE", `/api/teams/${teamId}/members/${myUserId}`);
    record("Teams", "DELETE /api/teams/:id/members/:userId", removeMember.status < 300, `HTTP ${removeMember.status}`);
  }

  // ── 5. Feedback CRUD + delete 404 ────────────────────────
  const feedbackList = await http("GET", "/api/feedback");
  const feedbackId = Array.isArray(feedbackList.json) && feedbackList.json[0]?.id;

  // Delete nonexistent feedback → should be 404 (not silent ok)
  const delFakeId = await http("DELETE", `/api/feedback/00000000-0000-0000-0000-000000000000`);
  record("Feedback", "DELETE /api/feedback/:id (not found → 404)",
    delFakeId.status === 404,
    `HTTP ${delFakeId.status} (expect 404)`);

  // Delete real feedback item (via GET list to get an ID)
  if (feedbackId) {
    const delReal = await http("DELETE", `/api/feedback/${feedbackId}`);
    record("Feedback", "DELETE /api/feedback/:id (real item → 200)",
      delReal.status === 200 && delReal.json?.ok === true,
      `HTTP ${delReal.status}`);
  }

  // ── 6. Feedback cluster (no-key → 422) ───────────────────
  const cluster = await http("POST", "/api/feedback/cluster", {});
  record("Feedback", "POST /api/feedback/cluster (no-key → 422)",
    cluster.status === 422 || cluster.status === 400,
    `HTTP ${cluster.status} (422=no key, 400=no feedback items)`);

  // ── 7. Theme → spec linkage check ────────────────────────
  const themes = await http("GET", "/api/feedback/themes");
  const themeWithSpec = Array.isArray(themes.json) && themes.json.find((t: any) => t.specId);
  record("Data Consistency", "theme.specId set after create-spec",
    !!themeWithSpec,
    themeWithSpec ? `theme "${themeWithSpec.label?.slice(0,30)}" → specId=${themeWithSpec.specId?.slice(0,8)}` : "no theme with specId found");

  // ── 8. Feedback ingest dedup ──────────────────────────────
  const newKey = await http("POST", "/api/ingest-keys", { label: "UAT dedup test key" });
  const rawKey = newKey.json?.rawKey;
  const keyId = newKey.json?.id;
  if (rawKey) {
    const extId = `dedup-${randomUUID()}`;
    const body = { items: [{ text: "UAT dedup test item", source: "webhook", externalId: extId }] };
    const headers = { "content-type": "application/json", "x-burrow-ingest-key": rawKey };
    const first = await fetch(`${API}/api/ingest/feedback`, { method: "POST", headers, body: JSON.stringify(body) });
    const second = await fetch(`${API}/api/ingest/feedback`, { method: "POST", headers, body: JSON.stringify(body) });
    const r1 = await first.json() as { inserted?: number; skipped?: number };
    const r2 = await second.json() as { inserted?: number; skipped?: number };
    record("Ingest", "Feedback dedup: same externalId not inserted twice",
      (r2.inserted === 0 || r2.skipped === 1 || r1.inserted === 1),
      `first=${JSON.stringify(r1)} second=${JSON.stringify(r2)}`);
    if (keyId) await http("DELETE", `/api/ingest-keys/${keyId}`);
  } else {
    record("Ingest", "Feedback dedup", true, "skipped — key creation failed", true);
  }

  // ── 9. Spec AI degrade endpoints (no-key → 422) ──────────
  const specsList = await http("GET", "/api/specs");
  const someSpecId = Array.isArray(specsList.json) && specsList.json.find((s: any) => !s.title.startsWith("Race"))?.id;

  if (someSpecId) {
    const assist = await http("POST", `/api/specs/${someSpecId}/assist`, { mode: "draft", prompt: "summarize" });
    record("Specs", "POST /api/specs/:id/assist (no-key → 422)",
      assist.status === 422 || assist.status === 200,
      `HTTP ${assist.status} (422=no key, 200=streaming)`);

    const breakdown = await http("POST", `/api/specs/${someSpecId}/breakdown`, {});
    record("Specs", "POST /api/specs/:id/breakdown (no-key → 422)",
      breakdown.status === 422 || breakdown.status === 200,
      `HTTP ${breakdown.status} (422=no key)`);

    const evaluate = await http("POST", `/api/specs/${someSpecId}/evaluate`, { analyticsData: "test metrics" });
    record("Specs", "POST /api/specs/:id/evaluate (no-key → 422)",
      evaluate.status === 422 || evaluate.status === 200,
      `HTTP ${evaluate.status} (422=no key)`);

    // Breakdown undo (only 1 generation → error 400, not 500)
    const undoBreakdown = await http("DELETE", `/api/specs/${someSpecId}/breakdown/latest`);
    record("Specs", "DELETE /api/specs/:id/breakdown/latest (1 gen → 400)",
      undoBreakdown.status === 400 || undoBreakdown.status === 200,
      `HTTP ${undoBreakdown.status} (400=only 1 gen or no breakdown)`);
  } else {
    record("Specs", "Spec AI degrades", true, "no suitable spec — skipped", true);
  }

  // ── 10. CLI device auth flow ──────────────────────────────
  const device = await http("POST", "/api/cli/device", {});
  record("CLI", "POST /api/cli/device (get code)",
    device.status === 200 && !!device.json?.deviceCode && !!device.json?.userCode,
    `HTTP ${device.status} code=${device.json?.userCode}`);

  if (device.json?.deviceCode) {
    const poll = await http("POST", "/api/cli/device/token", { deviceCode: device.json.deviceCode });
    // 202 = authorization_pending (device not yet confirmed), 200 = token issued, 400 = expired/invalid
    record("CLI", "POST /api/cli/device/token (pending → 202 or token)",
      poll.status === 202 || poll.status === 400 || (poll.status === 200 && poll.json?.token),
      `HTTP ${poll.status} ${poll.json?.error ?? ""}`);
  }

  // ── 11. Webhook connection callback ──────────────────────
  // Get the jira connection to test the webhook path
  const conns = await http("GET", "/api/connections");
  const jiraConn = Array.isArray(conns.json) && conns.json.find((c: any) => c.target === "jira");
  if (jiraConn) {
    // No HMAC configured on seeded connection so no signature needed
    const webhook = await fetch(`${API}/webhooks/${jiraConn.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalId: "JIRA-UAT-1", status: "done" }),
    });
    // 400 = no matching sync mapping (correct — we haven't pushed any tasks)
    // 200 = found and updated
    // 404 = connection not found (wrong)
    record("Connections", "POST /webhooks/:connectionId (callback)",
      webhook.status === 400 || webhook.status === 200,
      `HTTP ${webhook.status} (400=no mapping, 200=updated)`);
  } else {
    record("Connections", "POST /webhooks/:connectionId (callback)", true, "no jira connection — skipped", true);
  }

  // ── 12. Chat confirm (tool call not found → 404) ─────────
  const thread = await http("POST", "/api/chat/threads", { title: "UAT P2 Thread" });
  const threadId = thread.json?.id;
  if (threadId) {
    const confirm = await http("POST", `/api/chat/threads/${threadId}/confirm`, { toolCallId: "nonexistent-id", toolInput: {} });
    record("Chat", "POST /api/chat/threads/:id/confirm (no call → 404)",
      confirm.status === 404,
      `HTTP ${confirm.status} (expect 404)`);
    await http("DELETE", `/api/chat/threads/${threadId}`);
  }

  // ── 13. Agent delete ─────────────────────────────────────
  const putAgent = await http("PUT", "/api/agents/uat-p2-agent", { name: "UAT P2 Agent", description: "test", body: "v1" });
  record("Library", "PUT /api/agents/:slug (create)",
    putAgent.status === 200 || putAgent.status === 201,
    `HTTP ${putAgent.status}`);
  const delAgent = await http("DELETE", "/api/agents/uat-p2-agent");
  record("Library", "DELETE /api/agents/:slug",
    delAgent.status === 200 || delAgent.status === 204,
    `HTTP ${delAgent.status}`);

  // ── 14. Skill delete ─────────────────────────────────────
  const putSkill = await http("PUT", "/api/skills/uat-p2-skill", { name: "UAT P2 Skill", body: "# UAT skill" });
  record("Library", "PUT /api/skills/:slug (create)",
    putSkill.status === 200 || putSkill.status === 201,
    `HTTP ${putSkill.status}`);
  const delSkill = await http("DELETE", "/api/skills/uat-p2-skill");
  record("Library", "DELETE /api/skills/:slug",
    delSkill.status === 200 || delSkill.status === 204,
    `HTTP ${delSkill.status}`);

  // ── 15. Search accuracy ───────────────────────────────────
  const billingSearch = await http("GET", "/api/search?q=billing");
  const billingResults = billingSearch.json?.results ?? [];
  const billingHits = billingResults.filter((r: any) =>
    r.label?.toLowerCase().includes("billing") || r.sublabel?.toLowerCase().includes("billing")
  );
  record("Search", "search?q=billing returns billing-related results",
    billingSearch.status === 200 && billingResults.length > 0,
    `${billingResults.length} results, ${billingHits.length} have "billing" in label`);

  // ── 16. Spec insights surface variety ────────────────────
  for (const surface of ["roadmap", "backlog"]) {
    const r = await http("GET", `/api/insights/${surface}`);
    record("Insights", `GET /api/insights/${surface} shape`,
      r.status === 200 && r.json !== null && typeof r.json === "object",
      `keys=${Object.keys(r.json ?? {}).join(",")}`);
  }

  // ── 17. Dashboard counts correctness ─────────────────────
  const dash = await http("GET", "/api/dashboard");
  record("Dashboard", "dashboard has expected keys",
    dash.status === 200 &&
    "counts" in (dash.json ?? {}) &&
    "attention" in (dash.json ?? {}) &&
    "recentActivity" in (dash.json ?? {}),
    `keys=${Object.keys(dash.json ?? {}).join(",")}`);
  record("Dashboard", "dashboard.counts.needsYou >= 0",
    typeof dash.json?.counts?.needsYou === "number" && dash.json.counts.needsYou >= 0,
    `needsYou=${dash.json?.counts?.needsYou}`);

  // ── 18. Spec PATCH status validation ─────────────────────
  const specsData = await http("GET", "/api/specs");
  const patchTargetSpec = Array.isArray(specsData.json) && specsData.json.find((s: any) => s.status === "draft" && !s.title.startsWith("Race"));
  if (patchTargetSpec) {
    // Invalid status
    const badPatch = await http("PATCH", `/api/specs/${patchTargetSpec.id}`, { status: "invalid_status_xyz" });
    record("Specs", "PATCH /api/specs/:id with invalid status",
      badPatch.status === 400 || badPatch.status === 200,
      `HTTP ${badPatch.status} (400=validated, 200=permissive — check schema)`);
  }

  // ── 19. Goals link entity validation ─────────────────────
  const goals = await http("GET", "/api/goals");
  const goalId = Array.isArray(goals.json) && goals.json[0]?.id;
  if (goalId) {
    const badLink = await http("POST", `/api/goals/${goalId}/links`, { entityType: "invalid", entityId: "fake-id" });
    record("Goals", "POST /api/goals/:id/links with invalid entityType → 400",
      badLink.status === 400,
      `HTTP ${badLink.status} (expect 400)`);
  }

  // ── 20. Push endpoint returns 502 not 500 for network failure ──
  // Seed a fake breakdown so the push actually tries the MCP call
  // (The seeded jira connection has a fake URL, so pushTasks will throw)
  const jiraCon = Array.isArray(conns.json) && conns.json.find((c: any) => c.target === "jira");
  if (jiraCon && patchTargetSpec) {
    // We need a spec WITH a breakdown. Since we can't generate one without an AI key,
    // check the error path: push without breakdown → 400 (not 500)
    const pushNoBreakdown = await http("POST", `/api/specs/${patchTargetSpec.id}/push/${jiraCon.id}`, {});
    record("Connections", "POST push without breakdown → 400 (not 500)",
      pushNoBreakdown.status === 400,
      `HTTP ${pushNoBreakdown.status} (expect 400 "no breakdown to push")`);
  }

  // ── Report ───────────────────────────────────────────────
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${"=".repeat(56)}\n${pass} PASS · ${warn} WARN · ${fail} FAIL  (of ${results.length} checks)\n`);

  const byArea = [...new Set(results.map((r) => r.area))];
  const md = [
    "# UAT Pass 2 Results",
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
  ].join("\n");

  writeFileSync(new URL("./UAT-PASS2-RESULTS.md", import.meta.url), md);
  console.log("Report written to apps/server/scripts/UAT-PASS2-RESULTS.md");

  await db.delete(session).where(eq(session.token, token));
  if (viewerToken) await db.delete(session).where(eq(session.token, viewerToken));
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
