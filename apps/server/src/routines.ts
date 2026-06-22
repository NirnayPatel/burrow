import { eq, and } from "drizzle-orm";
import { routines, routineRuns, specs, connections, type RoutineAction } from "@burrow/core";
import { db } from "./db.js";
import { notifyViaConnection, type ConnectionConfig } from "./connectors.js";

// Routines engine (#20). Event triggers fire from the events log; schedule
// triggers fire from an in-process ticker (self-host friendly — no Redis/pg-boss;
// pg-boss is the production upgrade behind this same dispatch). A routine that
// fails AUTO_DISABLE_AFTER times in a row disables itself.
const AUTO_DISABLE_AFTER = 5;

type EventShape = {
  orgId: string;
  kind: string;
  summary: string;
  detail?: Record<string, unknown>;
};

function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

async function runActions(orgId: string, routineId: string, actions: RoutineAction[], userId: string | null): Promise<void> {
  for (const action of actions) {
    if (action.type === "log") {
      await db.insert(routineRuns).values({ routineId, orgId, status: "ok", message: action.message });
    } else if (action.type === "create_spec") {
      const count = await db.$count(specs, eq(specs.orgId, orgId));
      const [spec] = await db
        .insert(specs)
        .values({ orgId, title: action.title || "Untitled", displayId: `SPEC-${count + 1}`, ydocId: crypto.randomUUID(), createdBy: userId })
        .returning();
      await db.insert(routineRuns).values({ routineId, orgId, status: "ok", message: `created ${spec.displayId}` });
    } else if (action.type === "notify") {
      // Live push over the org's connected MCP server (Slack, etc.). If no
      // matching connection, record that clearly rather than failing the run.
      const [conn] = await db
        .select()
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.target, action.target)));
      if (!conn) {
        await db.insert(routineRuns).values({ routineId, orgId, status: "ok", message: `no ${action.target} connection — skipped notify` });
      } else {
        const tool = await notifyViaConnection(conn.config as ConnectionConfig, action.target, action.message);
        await db.insert(routineRuns).values({ routineId, orgId, status: "ok", message: `notified ${action.target} via ${tool}` });
      }
    }
  }
}

// Called from logEvent AFTER the event is persisted — in its OWN error scope so
// a routine failure is VISIBLE (console.error), never swallowed (the spec's
// flagged hardening). Returns nothing; failures are logged + recorded.
export async function dispatchEvent(ev: EventShape): Promise<void> {
  let matched;
  try {
    matched = await db
      .select()
      .from(routines)
      .where(and(eq(routines.orgId, ev.orgId), eq(routines.triggerType, "event"), eq(routines.enabled, true), eq(routines.eventKind, ev.kind)));
  } catch (err) {
    console.error("[routines] failed to load routines for event dispatch:", err);
    return;
  }
  for (const r of matched) {
    if (r.conditionField) {
      const actual = readPath(ev, r.conditionField);
      if (String(actual) !== String(r.conditionEquals)) continue;
    }
    try {
      await runActions(ev.orgId, r.id, r.actions, r.createdBy);
      await db.update(routines).set({ failureCount: 0, lastRunAt: new Date() }).where(eq(routines.id, r.id));
    } catch (err) {
      console.error(`[routines] action failed for routine ${r.id}:`, err);
      const failures = r.failureCount + 1;
      await db
        .update(routines)
        .set({ failureCount: failures, enabled: failures < AUTO_DISABLE_AFTER, lastRunAt: new Date() })
        .where(eq(routines.id, r.id));
      await db.insert(routineRuns).values({ routineId: r.id, orgId: ev.orgId, status: "error", message: (err as Error).message });
    }
  }
}

// Simple in-process scheduler: every minute, run schedule routines whose period
// has elapsed since lastRunAt. Coarse by design (hourly/daily/weekly).
const PERIOD_MS = { hourly: 3600_000, daily: 86_400_000, weekly: 604_800_000 } as const;

export function startScheduler(): void {
  setInterval(async () => {
    try {
      const due = await db.select().from(routines).where(and(eq(routines.triggerType, "schedule"), eq(routines.enabled, true)));
      const now = Date.now();
      for (const r of due) {
        const period = PERIOD_MS[(r.schedule ?? "daily") as keyof typeof PERIOD_MS];
        if (r.lastRunAt && now - r.lastRunAt.getTime() < period) continue;
        try {
          await runActions(r.orgId, r.id, r.actions, r.createdBy);
          await db.update(routines).set({ failureCount: 0, lastRunAt: new Date() }).where(eq(routines.id, r.id));
        } catch (err) {
          console.error(`[routines] scheduled action failed for ${r.id}:`, err);
          await db.insert(routineRuns).values({ routineId: r.id, orgId: r.orgId, status: "error", message: (err as Error).message });
        }
      }
    } catch (err) {
      console.error("[routines] scheduler tick failed:", err);
    }
  }, 60_000);
}
