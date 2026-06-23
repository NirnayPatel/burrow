import { events, type EVENT_KINDS } from "@burrow/core";
import { db } from "./db.js";
import { dispatchEvent } from "./routines.js";
import { indexSpec, indexLatestBreakdownForSpec } from "./context.js";

type Kind = (typeof EVENT_KINDS)[number];

// Live graph indexing: re-index the affected entity when a relevant event
// fires. Own error scope (console.error) — an index failure never breaks the
// action. Spec PROSE edits don't emit events; the collab store triggers those
// via /internal/reindex-spec.
async function indexFromEvent(e: { orgId: string; kind: Kind; specId?: string }): Promise<void> {
  try {
    if (!e.specId) return;
    if (e.kind === "spec_created") await indexSpec(e.orgId, e.specId);
    else if (e.kind === "breakdown_generated") await indexLatestBreakdownForSpec(e.orgId, e.specId);
  } catch (err) {
    console.error("[graph] live index failed:", err);
  }
}

// Append an activity event. Best-effort: a logging failure must never break the
// action that triggered it, so callers fire-and-forget (await but swallow).
export async function logEvent(e: {
  orgId: string;
  actorType: "human" | "agent" | "system";
  actorName: string;
  kind: Kind;
  summary: string;
  specId?: string;
  taskId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(events).values({
      orgId: e.orgId,
      actorType: e.actorType,
      actorName: e.actorName,
      kind: e.kind,
      summary: e.summary,
      specId: e.specId ?? null,
      taskId: e.taskId ?? null,
      detail: e.detail,
    });
  } catch {
    // activity logging is non-critical
  }
  // Routine dispatch runs in its OWN error scope (NOT the swallow above), so a
  // trigger failure is visible in logs rather than silently dropped (#20).
  await dispatchEvent({ orgId: e.orgId, kind: e.kind, summary: e.summary, detail: e.detail });
  // Live graph re-index for the affected entity (#17 live indexing).
  await indexFromEvent({ orgId: e.orgId, kind: e.kind, specId: e.specId });
}
