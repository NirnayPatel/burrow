import { and, desc, eq } from "drizzle-orm";
import { specs, initiatives, goals, keyResults, marketSignals, feedbackThemes } from "@burrow/core";
import { db } from "./db.js";
import { generateSurfaceInsights, type SurfaceInsights } from "./ai.js";

// Surface insights (item 1: insights everywhere). A compact text picture of a
// surface, fed to generateSurfaceInsights so the same Context Graph that grounds
// a Spec also grounds the roadmap and the backlog. Lives in its own module so
// BOTH the web routes (index.ts) and the MCP tools (mcp.ts) can call it without
// the two importing each other — agents and humans get the identical view.

export async function roadmapPayload(orgId: string): Promise<string> {
  const inits = await db.select().from(initiatives).where(eq(initiatives.orgId, orgId));
  const goalRows = await db.select().from(goals).where(eq(goals.orgId, orgId));
  const krRows = await db.select().from(keyResults).where(eq(keyResults.orgId, orgId));
  const sigRows = await db
    .select()
    .from(marketSignals)
    .where(eq(marketSignals.orgId, orgId))
    .orderBy(desc(marketSignals.createdAt))
    .limit(12);
  const specCounts = new Map<string, number>();
  for (const i of inits) {
    specCounts.set(i.id, await db.$count(specs, eq(specs.initiativeId, i.id)));
  }
  const lines: string[] = [];
  lines.push("Initiatives by horizon:");
  for (const h of ["now", "next", "later"]) {
    const items = inits.filter((i) => i.horizon === h);
    lines.push(`  ${h} (${items.length}):`);
    for (const i of items) {
      lines.push(`    - "${i.title}" [${i.status}] · ${specCounts.get(i.id) ?? 0} specs`);
    }
  }
  if (goalRows.length) {
    lines.push("Goals:");
    for (const g of goalRows) {
      const krs = krRows.filter((k) => k.goalId === g.id);
      const offTrack = krs.filter((k) => k.status === "off_track" || k.status === "at_risk").length;
      lines.push(`  - "${g.title}" [${g.status}] · ${krs.length} KRs, ${offTrack} at risk or off track`);
    }
  }
  if (sigRows.length) {
    lines.push("Recent market signals:");
    for (const s of sigRows)
      lines.push(`  - [${s.severity}/${s.type}] ${s.title}${s.soWhat ? ` — ${s.soWhat}` : ""}`);
  }
  return lines.join("\n");
}

export async function backlogPayload(orgId: string): Promise<string> {
  const specRows = await db
    .select({ displayId: specs.displayId, title: specs.title, status: specs.status })
    .from(specs)
    .where(eq(specs.orgId, orgId))
    .orderBy(desc(specs.updatedAt))
    .limit(60);
  const themeRows = await db.select().from(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));
  const goalRows = await db.select().from(goals).where(eq(goals.orgId, orgId));
  const lines: string[] = [];
  lines.push(`Specs (${specRows.length}):`);
  for (const s of specRows) lines.push(`  - ${s.displayId} "${s.title}" [${s.status}]`);
  if (themeRows.length) {
    lines.push("Customer feedback themes:");
    for (const t of themeRows)
      lines.push(
        `  - "${t.label}" (${t.size} items, ${t.sentiment ?? "?"})${t.specId ? " — has Spec" : " — NO Spec yet"}`,
      );
  }
  if (goalRows.length) {
    lines.push("Goals:");
    for (const g of goalRows) lines.push(`  - "${g.title}" [${g.status}]`);
  }
  return lines.join("\n");
}

const PAYLOADS: Record<string, (orgId: string) => Promise<string>> = {
  roadmap: roadmapPayload,
  backlog: backlogPayload,
};

// One entry point both surfaces use. Unknown surface → null (no throw).
export async function surfaceInsightsFor(
  orgId: string,
  surface: string,
): Promise<SurfaceInsights | null> {
  const build = PAYLOADS[surface];
  if (!build) return null;
  try {
    return await generateSurfaceInsights(orgId, surface, await build(orgId));
  } catch {
    return null;
  }
}
