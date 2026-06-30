/**
 * Seed routine templates for Gaps 2, 4, and 5.
 *
 * Run against any org (pass the admin email as first arg):
 *   tsx scripts/seed-routines.ts priya@northwind.dev
 *
 * Idempotent: uses upsert-by-slug so re-running is safe.
 * Templates are seeded DISABLED — admins enable them after wiring the relevant
 * connections (Slack MCP for Gap 2, PostHog MCP for Gap 5).
 */
import { eq, and } from "drizzle-orm";
import { orgs, userOrgs, user, routines, type RoutineAction } from "@burrow/core";
import { db } from "../src/db.js";
import { contentHash } from "../src/sharing.js";

const adminEmail = process.argv[2];
if (!adminEmail) {
  console.error("Usage: tsx scripts/seed-routines.ts <admin-email>");
  process.exit(1);
}

const adminUser = await db
  .select()
  .from(user)
  .where(eq(user.email, adminEmail))
  .then((r) => r[0]);
if (!adminUser) {
  console.error(`No user found with email: ${adminEmail}`);
  process.exit(1);
}

const membership = await db
  .select({ orgId: userOrgs.orgId })
  .from(userOrgs)
  .where(and(eq(userOrgs.userId, adminUser.id), eq(userOrgs.role, "admin")))
  .then((r) => r[0]);
if (!membership) {
  console.error(`User ${adminEmail} is not an admin of any org`);
  process.exit(1);
}
const orgId = membership.orgId;

type RoutineTemplate = {
  name: string;
  slug: string;
  triggerType: "event" | "schedule";
  eventKind?: string;
  schedule?: "hourly" | "daily" | "weekly";
  conditionField?: string;
  conditionEquals?: string;
  actions: RoutineAction[];
};

const TEMPLATES: RoutineTemplate[] = [
  // Gap 2 — Jira/Slack
  {
    name: "Notify Slack on signoff approved",
    slug: "notify-slack-signoff-approved",
    triggerType: "event",
    eventKind: "signoff_recorded",
    conditionField: "detail.verdict",
    conditionEquals: "approved",
    actions: [
      {
        type: "notify",
        target: "slack",
        message: "A spec was just approved — check Burrow for next steps.",
      },
      { type: "log", message: "Slack notified on signoff approval." },
    ],
  },
  {
    name: "Push tasks to Jira when spec moves to in_progress",
    slug: "push-tasks-jira-on-in-progress",
    triggerType: "event",
    eventKind: "spec_status_changed",
    conditionField: "detail.newStatus",
    conditionEquals: "in_progress",
    actions: [
      {
        type: "log",
        message: "Spec moved to in_progress — use the Push button to sync tasks to Jira.",
      },
    ],
  },

  // Gap 1 — Feedback ingestion observability marker
  {
    name: "Daily feedback sync (observability marker)",
    slug: "daily-feedback-sync-marker",
    triggerType: "schedule",
    schedule: "daily",
    actions: [
      {
        type: "sync_feedback",
        source: "external",
      },
      {
        type: "log",
        message: "Daily feedback sync: ensure your n8n workflow is running and posting to /api/ingest/feedback.",
      },
    ],
  },

  // Gap 4 — Opportunity ranking
  {
    name: "Weekly opportunity refresh",
    slug: "weekly-opportunity-refresh",
    triggerType: "schedule",
    schedule: "weekly",
    actions: [
      { type: "refresh_opportunities" },
      {
        type: "log",
        message: "Opportunities re-scored — visit /opportunities on the dashboard to review.",
      },
    ],
  },

  // Gap 5 — Post-launch analytics
  {
    name: "Auto-schedule evaluation 30d after approval",
    slug: "auto-eval-on-approval",
    triggerType: "event",
    eventKind: "signoff_recorded",
    conditionField: "detail.verdict",
    conditionEquals: "approved",
    actions: [
      {
        type: "schedule_evaluation",
        specId: "{{detail.specId}}",
        delayDays: 30,
      },
      {
        type: "log",
        message: "Post-launch evaluation scheduled for 30 days after approval.",
      },
    ],
  },
];

let upserted = 0;
let skipped = 0;

for (const t of TEMPLATES) {
  const hash = contentHash({
    name: t.name,
    slug: t.slug,
    triggerType: t.triggerType,
    eventKind: t.eventKind,
    schedule: t.schedule,
    conditionField: t.conditionField,
    conditionEquals: t.conditionEquals,
    actions: t.actions,
  });

  const existing = await db
    .select({ id: routines.id, sourceHash: routines.sourceHash })
    .from(routines)
    .where(and(eq(routines.orgId, orgId), eq(routines.slug, t.slug)))
    .then((r) => r[0]);

  if (existing) {
    if (existing.sourceHash === hash) {
      console.log(`  skip  ${t.slug} (unchanged)`);
      skipped++;
      continue;
    }
    await db
      .update(routines)
      .set({
        name: t.name,
        triggerType: t.triggerType,
        eventKind: t.eventKind ?? null,
        schedule: t.schedule ?? null,
        conditionField: t.conditionField ?? null,
        conditionEquals: t.conditionEquals ?? null,
        actions: t.actions,
        sourceHash: hash,
      })
      .where(eq(routines.id, existing.id));
    console.log(`  update ${t.slug}`);
  } else {
    await db.insert(routines).values({
      orgId,
      name: t.name,
      slug: t.slug,
      enabled: false, // admin enables after wiring connections
      triggerType: t.triggerType,
      eventKind: t.eventKind ?? null,
      schedule: t.schedule ?? null,
      conditionField: t.conditionField ?? null,
      conditionEquals: t.conditionEquals ?? null,
      actions: t.actions,
      published: true,
      sourceHash: hash,
      revision: 1,
      createdBy: adminUser.id,
    });
    console.log(`  insert ${t.slug}`);
  }
  upserted++;
}

console.log(`\nDone. ${upserted} upserted, ${skipped} unchanged.`);
process.exit(0);
