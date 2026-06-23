/**
 * Seed a believable activity stream for the demo org so the Dashboard, Runs,
 * and Activity surfaces have real content. Non-destructive: reads existing
 * specs/tasks and inserts staggered events. Run after seed-demo.ts.
 *   tsx scripts/seed-activity.ts
 */
import { eq, inArray, desc } from "drizzle-orm";
import { orgs, userOrgs, user, specs, breakdowns, tasks, events } from "@burrow/core";
import { db } from "../src/db.js";

const PM_EMAIL = "priya@northwind.dev";
const MIN = 60_000;
const HOUR = 60 * MIN;

async function main() {
  const [pm] = await db.select().from(user).where(eq(user.email, PM_EMAIL));
  if (!pm) throw new Error(`${PM_EMAIL} not found — run seed-demo.ts first.`);
  const [m] = await db.select().from(userOrgs).where(eq(userOrgs.userId, pm.id));
  const orgId = m.orgId;
  await db.delete(events).where(eq(events.orgId, orgId));

  const orgSpecs = await db
    .select()
    .from(specs)
    .where(eq(specs.orgId, orgId))
    .orderBy(desc(specs.displayId));
  const byTitle = (frag: string) => orgSpecs.find((s) => s.title.toLowerCase().includes(frag));

  const billing = byTitle("billing");
  const onboarding = byTitle("onboarding");
  const audit = byTitle("audit");
  const presence = byTitle("presence");

  // task lookups for the billing breakdown (for realistic task references)
  let billingTasks: { id: string; displayId: string; title: string }[] = [];
  if (billing) {
    const [bk] = await db.select().from(breakdowns).where(eq(breakdowns.specId, billing.id));
    if (bk) {
      billingTasks = await db
        .select({ id: tasks.id, displayId: tasks.displayId, title: tasks.title })
        .from(tasks)
        .where(eq(tasks.breakdownId, bk.id));
    }
  }

  const now = Date.now();
  type Ev = {
    actorType: "human" | "agent" | "system";
    actorName: string;
    kind: (typeof events.kind.enumValues)[number];
    summary: string;
    specId?: string;
    taskId?: string;
    ago: number;
  };

  const stream: Ev[] = [
    { actorType: "human", actorName: "Priya Shah", kind: "spec_created", summary: "created SPEC-2 · Usage-based billing v1", specId: billing?.id, ago: 8 * HOUR },
    { actorType: "human", actorName: "Priya Shah", kind: "breakdown_generated", summary: "generated a 4-task Breakdown for SPEC-2", specId: billing?.id, ago: 7.5 * HOUR },
    { actorType: "human", actorName: "Marcus Lee", kind: "signoff_recorded", summary: "approved SPEC-2", specId: billing?.id, ago: 6 * HOUR },
    { actorType: "agent", actorName: "claude-code", kind: "task_picked_up", summary: `picked up ${billingTasks[0]?.displayId ?? "SPEC-2.1"} · ${billingTasks[0]?.title ?? "Usage meter"}`, specId: billing?.id, taskId: billingTasks[0]?.id, ago: 3 * HOUR },
    { actorType: "agent", actorName: "claude-code", kind: "task_status_changed", summary: `moved ${billingTasks[0]?.displayId ?? "SPEC-2.1"} → done`, specId: billing?.id, taskId: billingTasks[0]?.id, ago: 2.6 * HOUR },
    { actorType: "agent", actorName: "claude-code", kind: "task_picked_up", summary: `picked up ${billingTasks[1]?.displayId ?? "SPEC-2.2"} · ${billingTasks[1]?.title ?? "Invoice builder"}`, specId: billing?.id, taskId: billingTasks[1]?.id, ago: 40 * MIN },
    { actorType: "human", actorName: "Sam Rivera", kind: "spec_created", summary: "created SPEC-3 · Onboarding checklist redesign", specId: onboarding?.id, ago: 5 * HOUR },
    { actorType: "human", actorName: "Dana Okoro", kind: "signoff_recorded", summary: "flagged SPEC-3: the auto-second-cursor idea reads gimmicky", specId: onboarding?.id, ago: 90 * MIN },
    { actorType: "human", actorName: "Marcus Lee", kind: "review_requested", summary: "requested review on SPEC-4 · Audit log export", specId: audit?.id, ago: 70 * MIN },
    { actorType: "agent", actorName: "cursor", kind: "task_picked_up", summary: "picked up SPEC-6.1 · Awareness wiring", specId: presence?.id, ago: 25 * MIN },
    { actorType: "agent", actorName: "cursor", kind: "task_status_changed", summary: "moved SPEC-6.1 → done", specId: presence?.id, ago: 12 * MIN },
    { actorType: "agent", actorName: "claude-code", kind: "task_status_changed", summary: `moved ${billingTasks[1]?.displayId ?? "SPEC-2.2"} → review`, specId: billing?.id, taskId: billingTasks[1]?.id, ago: 4 * MIN },
  ];

  for (const e of stream) {
    await db.insert(events).values({
      orgId,
      actorType: e.actorType,
      actorName: e.actorName,
      kind: e.kind,
      summary: e.summary,
      specId: e.specId ?? null,
      taskId: e.taskId ?? null,
      createdAt: new Date(now - e.ago),
    });
  }
  console.log(`Seeded ${stream.length} activity events for the demo org.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
