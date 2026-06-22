/**
 * Realistic demo content. Run once against a running stack:
 *   1. curl sign-up the PM (priya@northwind.dev) so she has a real password.
 *   2. tsx scripts/seed-demo.ts — fills her org with teammates, Playbook docs,
 *      and Specs across the lifecycle (prose, Breakdowns, tasks, Sign-offs).
 * Idempotent: clears Priya's org content first, then rebuilds.
 */
import * as Y from "yjs";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { eq, inArray } from "drizzle-orm";
import {
  orgs,
  userOrgs,
  user,
  specs,
  ydocs,
  breakdowns,
  tasks,
  taskDeps,
  signoffs,
  playbookDocs,
  skills,
  agents,
  events,
  teams,
  teamMembers,
  initiatives,
  goals,
  keyResults,
  goalLinks,
  contextDocs,
  feedbackItems,
  feedbackThemes,
  feedbackItemThemes,
  competitors,
  marketSignals,
  routines,
  connections,
  syncMappings,
  type RoutineAction,
} from "@burrow/core";
import { db } from "../src/db.js";
import { contentHash } from "../src/sharing.js";

const PM_EMAIL = "priya@northwind.dev";

// Hand-built Yjs XML does NOT hydrate in BlockNote — on bind it overwrites the
// doc with an empty default block. The only reliable path is BlockNote's own
// serializer: markdown → blocks → Y.Doc keyed on the same "document-store"
// fragment the collab editor binds to.
const sbn = ServerBlockNoteEditor.create();
async function docState(paragraphs: string[]): Promise<Buffer> {
  const blocks = await sbn.tryParseMarkdownToBlocks(paragraphs.join("\n\n"));
  const ydoc = sbn.blocksToYDoc(blocks, "document-store");
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}

type Member = { name: string; email: string; role: "admin" | "member" };
const TEAMMATES: Member[] = [
  { name: "Marcus Lee", email: "marcus@northwind.dev", role: "member" },
  { name: "Dana Okoro", email: "dana@northwind.dev", role: "member" },
  { name: "Sam Rivera", email: "sam@northwind.dev", role: "member" },
];

const PLAYBOOK = [
  {
    title: "Product principles",
    markdown:
      "We build for small teams shipping fast with AI agents.\n\n- Ship the smallest thing that proves the value, then widen.\n- Every feature must work self-hosted with the customer's own keys.\n- Prefer one obvious path over five configurable ones.\n- Trust is earned with mechanisms, not adjectives.",
  },
  {
    title: "Engineering conventions",
    markdown:
      "Stack: TypeScript end to end, Postgres, no service we can't self-host.\n\n- Small PRs, reviewed within a day.\n- Tests cover the contract, not the implementation.\n- No telemetry in the product, ever.\n- Errors say what happened and what to do, in that order.",
  },
  {
    title: "Who we build for",
    markdown:
      "Primary persona: a PM on a 2-10 person team already using Claude Code or Cursor, planning in scattered markdown today. They want their team aligned without a per-seat tool, and their data on their own infrastructure.",
  },
];

type SpecSeed = {
  title: string;
  status: "draft" | "in_review" | "approved" | "in_progress" | "done" | "archived";
  prose: string[];
  authorIdx: number; // -1 = PM, else TEAMMATES index
  tasks?: { title: string; description: string; priority: number; status: string; ac: string[] }[];
  signoffs?: { byIdx: number; verdict: "approved" | "flagged" | "cleared"; comment?: string; staleVersion?: boolean }[];
};

const SPECS: SpecSeed[] = [
  {
    title: "Passwordless email login",
    status: "done",
    authorIdx: -1,
    prose: [
      "Replace password login with a magic-link flow. Passwords are our top support burden and a security liability we don't need to carry.",
      "Goal: a new user signs in with just an email, receives a one-time link, and lands in their workspace in under 30 seconds.",
      "Constraints: self-hosted SMTP only (no third-party email vendor required), links expire in 15 minutes, one active link per address.",
    ],
    tasks: [
      { title: "Magic-link token model", description: "One-time tokens, 15-min expiry, single active per email.", priority: 0, status: "done", ac: ["Tokens expire", "Reuse is rejected"] },
      { title: "Send + verify endpoints", description: "Request link, verify, mint session.", priority: 0, status: "done", ac: ["Verify mints a session", "Expired link shows a clear error"] },
      { title: "Sign-in UI", description: "Single email field, sent-state, resend.", priority: 1, status: "done", ac: ["Resend throttled to 60s"] },
    ],
    signoffs: [
      { byIdx: 0, verdict: "approved", comment: "Clean. Ship it." },
      { byIdx: -1, verdict: "approved" },
    ],
  },
  {
    title: "Usage-based billing v1",
    status: "in_progress",
    authorIdx: -1,
    prose: [
      "Introduce metered billing for the managed-hosting tier. Self-hosters always stay free; this only touches the hosted plan.",
      "Meter on active Specs per month. Invoice monthly with a clear line-item breakdown. No surprise charges — show projected cost in-app before the period closes.",
      "Constraints: must reconcile to the cent, must survive a billing-provider outage without dropping events.",
    ],
    tasks: [
      { title: "Usage meter", description: "Count active Specs per org per period, idempotent.", priority: 0, status: "done", ac: ["Idempotent on replay"] },
      { title: "Invoice builder", description: "Line items, projected vs final.", priority: 0, status: "in_progress", ac: ["Reconciles to the cent"] },
      { title: "In-app cost preview", description: "Projected cost before period close.", priority: 1, status: "pending", ac: ["Updates daily"] },
      { title: "Outage-safe event queue", description: "Buffer + retry billing events.", priority: 1, status: "pending", ac: ["No event lost across a 1h outage"] },
    ],
    signoffs: [
      { byIdx: 1, verdict: "flagged", comment: "Projected-cost math needs a spec of its own before we build it.", staleVersion: true },
      { byIdx: 1, verdict: "approved", comment: "Resolved — split into its own task." },
      { byIdx: 0, verdict: "approved" },
    ],
  },
  {
    title: "Onboarding checklist redesign",
    status: "in_review",
    authorIdx: 3,
    prose: [
      "The first-run checklist has a 40% drop-off at step two (connect a repo). Rework it so the multiplayer moment comes first, before any integration.",
      "New order: write a Spec, invite a teammate, generate a Breakdown. Connecting a tracker moves to optional, after the aha moment.",
      "Open question: do we auto-open a second cursor in a demo Spec to show multiplayer, or is that too gimmicky?",
    ],
    tasks: [
      { title: "Reorder checklist steps", description: "Spec → invite → breakdown; tracker optional.", priority: 0, status: "pending", ac: ["Tracker step is skippable"] },
      { title: "Seeded demo Spec", description: "Pre-populated Spec to act on immediately.", priority: 1, status: "pending", ac: ["Editable, non-empty"] },
    ],
    signoffs: [
      { byIdx: 0, verdict: "approved", comment: "Right call leading with multiplayer." },
      { byIdx: 1, verdict: "flagged", comment: "The auto-second-cursor idea reads gimmicky to me — let's A/B it, not assume." },
    ],
  },
  {
    title: "Audit log export for SOC 2",
    status: "approved",
    authorIdx: 1,
    prose: [
      "Enterprise prospects need an immutable, exportable audit log. We already keep an append-only record of Sign-offs and status changes — surface it.",
      "Deliver a per-org export (JSON + CSV) covering who did what, when, and against which Spec version. Read-only, tamper-evident, downloadable by org admins.",
      "Constraints: no PII beyond names already in the workspace, export must paginate for orgs with 10k+ events.",
    ],
    tasks: [
      { title: "Event view over existing tables", description: "Union sign-offs + status changes into one timeline.", priority: 0, status: "pending", ac: ["Ordered, paginated"] },
      { title: "JSON + CSV export", description: "Admin-only, streamed for large orgs.", priority: 0, status: "pending", ac: ["Streams 10k+ rows"] },
    ],
    signoffs: [
      { byIdx: 0, verdict: "approved" },
      { byIdx: -1, verdict: "approved", comment: "Append-only design pays off here." },
    ],
  },
  {
    title: "Dark mode for the workspace",
    status: "draft",
    authorIdx: 2,
    prose: [
      "Ship a real dark theme, not an inverted hack. PMs live in this tool all day and half the team asked for it.",
      "Use the existing warm-neutral token system — dark surfaces in the same hue family, accent green lightened for contrast. The editor must follow the app theme, no white popovers on dark.",
    ],
  },
  {
    title: "Realtime presence cursors",
    status: "done",
    authorIdx: 2,
    prose: [
      "Show live cursors and a presence avatar stack so teammates can see who's in a Spec and where they're editing.",
      "Each collaborator gets a stable color, name flag on their cursor, and an avatar in the header. Idle past a minute, dim them.",
    ],
    tasks: [
      { title: "Awareness wiring", description: "Derive collaborators from Yjs awareness.", priority: 0, status: "done", ac: ["Self first, idle dimmed"] },
      { title: "Avatar stack + overflow", description: "Max 5 + count pill.", priority: 1, status: "done", ac: ["Colors match cursors"] },
    ],
    signoffs: [{ byIdx: 0, verdict: "approved" }],
  },
];

async function main() {
  const [pm] = await db.select().from(user).where(eq(user.email, PM_EMAIL));
  if (!pm) {
    throw new Error(`Sign up ${PM_EMAIL} first (curl the sign-up endpoint), then re-run.`);
  }
  const [membership] = await db.select().from(userOrgs).where(eq(userOrgs.userId, pm.id));
  const orgId = membership.orgId;
  await db.update(orgs).set({ name: "Northwind" }).where(eq(orgs.id, orgId));

  // --- clear prior content in this org (idempotent) ---
  // Events reference specs/tasks (FKs), so they must go before the specs they
  // point at — runtime activity accumulates events that would otherwise block
  // the spec delete on re-seed.
  await db.delete(events).where(eq(events.orgId, orgId));
  // feedbackThemes.spec_id and marketSignals.spec_id reference specs, so these
  // must be cleared BEFORE the specs delete below (initiatives, which specs
  // reference, are cleared AFTER specs further down).
  {
    const themes = await db.select().from(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));
    const themeIds = themes.map((t) => t.id);
    if (themeIds.length) await db.delete(feedbackItemThemes).where(inArray(feedbackItemThemes.themeId, themeIds));
  }
  await db.delete(feedbackThemes).where(eq(feedbackThemes.orgId, orgId));
  await db.delete(feedbackItems).where(eq(feedbackItems.orgId, orgId));
  await db.delete(marketSignals).where(eq(marketSignals.orgId, orgId));
  await db.delete(competitors).where(eq(competitors.orgId, orgId));
  const orgSpecs = await db.select().from(specs).where(eq(specs.orgId, orgId));
  const specIds = orgSpecs.map((s) => s.id);
  if (specIds.length) {
    const bks = await db.select().from(breakdowns).where(inArray(breakdowns.specId, specIds));
    const bkIds = bks.map((b) => b.id);
    if (bkIds.length) {
      const ts = await db.select().from(tasks).where(inArray(tasks.breakdownId, bkIds));
      const tIds = ts.map((t) => t.id);
      if (tIds.length) await db.delete(taskDeps).where(inArray(taskDeps.taskId, tIds));
      await db.delete(tasks).where(inArray(tasks.breakdownId, bkIds));
    }
    await db.delete(breakdowns).where(inArray(breakdowns.specId, specIds));
    await db.delete(signoffs).where(inArray(signoffs.specId, specIds));
    await db.delete(ydocs).where(inArray(ydocs.name, orgSpecs.map((s) => `spec:${s.ydocId}`)));
    await db.delete(specs).where(eq(specs.orgId, orgId));
  }
  await db.delete(playbookDocs).where(eq(playbookDocs.orgId, orgId));

  // --- clear new entities (FK-safe: children/join rows before parents) ---
  // goalLinks → goals/keyResults; keyResults → goals.
  await db.delete(goalLinks).where(eq(goalLinks.orgId, orgId));
  await db.delete(keyResults).where(eq(keyResults.orgId, orgId));
  await db.delete(goals).where(eq(goals.orgId, orgId));
  // (feedback + market cleared above, before the specs delete, due to spec_id FKs)
  await db.delete(contextDocs).where(eq(contextDocs.orgId, orgId));
  await db.delete(routines).where(eq(routines.orgId, orgId));
  // syncMappings → connections (no orgId of its own; scope via the org's conns).
  {
    const conns = await db.select({ id: connections.id }).from(connections).where(eq(connections.orgId, orgId));
    if (conns.length) {
      await db.delete(syncMappings).where(inArray(syncMappings.connectionId, conns.map((c) => c.id)));
    }
  }
  await db.delete(connections).where(eq(connections.orgId, orgId));
  // initiatives → teams; specs already cleared above (so no dangling initiativeId FK).
  await db.delete(initiatives).where(eq(initiatives.orgId, orgId));
  // teamMembers → teams. Scope by the org's team ids.
  {
    const orgTeams = await db.select().from(teams).where(eq(teams.orgId, orgId));
    const teamIds = orgTeams.map((t) => t.id);
    if (teamIds.length) await db.delete(teamMembers).where(inArray(teamMembers.teamId, teamIds));
  }
  await db.delete(teams).where(eq(teams.orgId, orgId));

  // --- teammates (data records; they don't log in but author sign-offs) ---
  const memberIds: string[] = [];
  for (const m of TEAMMATES) {
    let [u] = await db.select().from(user).where(eq(user.email, m.email));
    if (!u) {
      [u] = await db
        .insert(user)
        .values({ id: `usr_${crypto.randomUUID()}`, name: m.name, email: m.email, emailVerified: true })
        .returning();
    }
    await db
      .delete(userOrgs)
      .where(eq(userOrgs.userId, u.id));
    await db.insert(userOrgs).values({ userId: u.id, orgId, role: m.role });
    memberIds.push(u.id);
  }
  const authorId = (idx: number) => (idx === -1 ? pm.id : memberIds[idx]);

  // --- playbook ---
  for (const p of PLAYBOOK) {
    await db.insert(playbookDocs).values({ orgId, title: p.title, markdown: p.markdown });
  }

  // --- specs ---
  const specIdByTitle: Record<string, string> = {};
  let n = 0;
  for (const s of SPECS) {
    n += 1;
    const ydocId = crypto.randomUUID();
    await db.insert(ydocs).values({ name: `spec:${ydocId}`, state: await docState(s.prose) });
    const [spec] = await db
      .insert(specs)
      .values({
        orgId,
        title: s.title,
        displayId: `SPEC-${n}`,
        status: s.status,
        ydocId,
        createdBy: authorId(s.authorIdx),
      })
      .returning();
    specIdByTitle[s.title] = spec.id;

    if (s.tasks?.length) {
      const [bk] = await db
        .insert(breakdowns)
        .values({ specId: spec.id, generation: 1, model: "claude-sonnet-4-6" })
        .returning();
      let ti = 0;
      const inserted: string[] = [];
      for (const t of s.tasks) {
        ti += 1;
        const [row] = await db
          .insert(tasks)
          .values({
            breakdownId: bk.id,
            displayId: `${spec.displayId}.${ti}`,
            title: t.title,
            description: t.description,
            priority: t.priority,
            status: t.status as "pending" | "in_progress" | "done" | "review" | "deferred" | "cancelled",
            acceptanceCriteria: t.ac,
          })
          .returning();
        if (inserted.length) {
          await db.insert(taskDeps).values({ taskId: row.id, dependsOnId: inserted[inserted.length - 1] });
        }
        inserted.push(row.id);
      }
    }

    if (s.signoffs?.length) {
      for (const so of s.signoffs) {
        await db.insert(signoffs).values({
          specId: spec.id,
          userId: authorId(so.byIdx),
          verdict: so.verdict,
          comment: so.comment ?? null,
          specVersion: so.staleVersion ? "older00000001" : "v" + ydocId.slice(0, 10),
        });
      }
    }
  }

  // --- teams + team members (14-TEAMS-SPEC) ---
  // PM leads Core Platform; teammates spread across teams, one lead each.
  const [corePlatform] = await db
    .insert(teams)
    .values({ orgId, name: "Core Platform", leadUserId: pm.id })
    .returning();
  const [growth] = await db
    .insert(teams)
    .values({ orgId, name: "Growth", leadUserId: memberIds[0] })
    .returning();
  const [billing] = await db
    .insert(teams)
    .values({ orgId, name: "Billing", leadUserId: memberIds[2] })
    .returning();

  await db.insert(teamMembers).values([
    { teamId: corePlatform.id, userId: pm.id, roleInTeam: "lead" },
    { teamId: corePlatform.id, userId: memberIds[1], roleInTeam: "member" },
    { teamId: growth.id, userId: memberIds[0], roleInTeam: "lead" },
    { teamId: growth.id, userId: pm.id, roleInTeam: "member" },
    { teamId: billing.id, userId: memberIds[2], roleInTeam: "lead" },
    { teamId: billing.id, userId: memberIds[1], roleInTeam: "member" },
  ]);

  // --- initiatives (Roadmap layer, #4) ---
  const INITIATIVES = [
    {
      title: "Frictionless onboarding",
      description: "Get a new team to their first multiplayer Spec in under five minutes — the aha moment before any integration.",
      horizon: "now" as const,
      status: "active" as const,
      teamId: growth.id,
    },
    {
      title: "Hosted billing GA",
      description: "Ship metered, reconcilable billing for the managed-hosting tier so we can take revenue without touching self-hosters.",
      horizon: "now" as const,
      status: "active" as const,
      teamId: billing.id,
    },
    {
      title: "Enterprise readiness",
      description: "Close the table-stakes gaps — audit export, SSO, data residency — that block six-figure deals.",
      horizon: "next" as const,
      status: "planned" as const,
      teamId: corePlatform.id,
    },
    {
      title: "Realtime collaboration polish",
      description: "Make co-editing feel inevitable: presence, cursors, conflict-free merges across the whole workspace.",
      horizon: "next" as const,
      status: "planned" as const,
      teamId: corePlatform.id,
    },
    {
      title: "Agent-native workflows",
      description: "Let coding agents drive Specs and Breakdowns end to end over the MCP bridge — the long-horizon bet.",
      horizon: "later" as const,
      status: "planned" as const,
      teamId: corePlatform.id,
    },
  ];
  const initiativeIds: Record<string, string> = {};
  for (const i of INITIATIVES) {
    const [row] = await db
      .insert(initiatives)
      .values({ orgId, ...i, createdBy: pm.id })
      .returning();
    initiativeIds[i.title] = row.id;
  }

  // Link existing specs into initiatives (specs.initiativeId, #4 roll-up).
  const SPEC_TO_INITIATIVE: Record<string, string> = {
    "Onboarding checklist redesign": "Frictionless onboarding",
    "Usage-based billing v1": "Hosted billing GA",
    "Audit log export for SOC 2": "Enterprise readiness",
    "Realtime presence cursors": "Realtime collaboration polish",
  };
  for (const [specTitle, initTitle] of Object.entries(SPEC_TO_INITIATIVE)) {
    const specId = specIdByTitle[specTitle];
    if (specId) {
      await db.update(specs).set({ initiativeId: initiativeIds[initTitle] }).where(eq(specs.id, specId));
    }
  }

  // Assign specs to owning teams (specs.teamId) so the Teams page shows work,
  // not just members. Distributed across all three teams.
  const SPEC_TO_TEAM: Record<string, string> = {
    "Passwordless email login": corePlatform.id,
    "Usage-based billing v1": billing.id,
    "Onboarding checklist redesign": growth.id,
    "Audit log export for SOC 2": corePlatform.id,
    "Realtime presence cursors": corePlatform.id,
    "Spec templates library": growth.id,
  };
  for (const [specTitle, teamId] of Object.entries(SPEC_TO_TEAM)) {
    const specId = specIdByTitle[specTitle];
    if (specId) await db.update(specs).set({ teamId }).where(eq(specs.id, specId));
  }

  // --- goals + key results + goal links (18-GOALS-SPEC) ---
  const [activationGoal] = await db
    .insert(goals)
    .values({
      orgId,
      teamId: growth.id,
      framework: "okr",
      title: "Make activation effortless",
      description: "A new workspace reaches its multiplayer aha moment fast and sticks.",
      status: "active",
      startPeriod: "Q3 2026",
      endPeriod: "Q3 2026",
      createdBy: pm.id,
    })
    .returning();
  const [activationKr1] = await db
    .insert(keyResults)
    .values({
      goalId: activationGoal.id,
      orgId,
      title: "New-workspace day-1 activation rate",
      metricUnit: "%",
      target: 60,
      current: 41,
      baseline: 28,
      status: "on_track",
      confidence: "medium",
    })
    .returning();
  await db.insert(keyResults).values({
    goalId: activationGoal.id,
    orgId,
    title: "Time to first multiplayer Spec",
    metricUnit: "minutes",
    target: 5,
    current: 11,
    baseline: 14,
    status: "at_risk",
    confidence: "low",
  });

  const [revenueGoal] = await db
    .insert(goals)
    .values({
      orgId,
      teamId: billing.id,
      framework: "okr",
      title: "Turn on hosted revenue",
      description: "Stand up metered billing the hosted tier can run on without surprises.",
      status: "active",
      startPeriod: "Q3 2026",
      endPeriod: "Q4 2026",
      createdBy: pm.id,
    })
    .returning();
  await db.insert(keyResults).values([
    {
      goalId: revenueGoal.id,
      orgId,
      title: "Hosted-tier MRR",
      metricUnit: "USD",
      target: 25000,
      current: 6200,
      baseline: 0,
      status: "off_track",
      confidence: "low",
    },
    {
      goalId: revenueGoal.id,
      orgId,
      title: "Invoice reconciliation accuracy",
      metricUnit: "%",
      target: 100,
      current: 99,
      baseline: 92,
      status: "on_track",
      confidence: "high",
    },
  ]);

  const [enterpriseGoal] = await db
    .insert(goals)
    .values({
      orgId,
      teamId: corePlatform.id,
      framework: "okr",
      title: "Be enterprise-ready",
      description: "Clear the security and compliance gates that block large deals.",
      status: "active",
      startPeriod: "Q3 2026",
      endPeriod: "Q4 2026",
      createdBy: pm.id,
    })
    .returning();
  const [enterpriseKr1] = await db
    .insert(keyResults)
    .values({
      goalId: enterpriseGoal.id,
      orgId,
      title: "SOC 2 audit-log requirements closed",
      metricUnit: "requirements",
      target: 8,
      current: 5,
      baseline: 0,
      status: "on_track",
      confidence: "medium",
    })
    .returning();

  // goalLinks: tie goals to the work that serves them (initiative + spec).
  await db.insert(goalLinks).values([
    {
      goalId: activationGoal.id,
      orgId,
      entityType: "initiative",
      entityId: initiativeIds["Frictionless onboarding"],
      keyResultId: activationKr1.id,
      weight: 5,
    },
    {
      goalId: revenueGoal.id,
      orgId,
      entityType: "initiative",
      entityId: initiativeIds["Hosted billing GA"],
      keyResultId: null,
      weight: 4,
    },
    {
      goalId: enterpriseGoal.id,
      orgId,
      entityType: "spec",
      entityId: specIdByTitle["Audit log export for SOC 2"],
      keyResultId: enterpriseKr1.id,
      weight: 5,
    },
  ]);

  // --- context docs (#17 Context Graph source material) ---
  const CONTEXT_DOCS = [
    {
      title: "Northwind company overview",
      kind: "company" as const,
      bodyText:
        "Northwind builds an AI-native product workspace for small software teams. We're a remote-first company of nine, profitable since month eight, with no outside funding.\n\nOur wedge is the 2-10 person team that already plans in scattered markdown and lives inside Claude Code or Cursor. They don't want another per-seat SaaS tool, and they want their data on infrastructure they control.\n\nWe sell two ways: self-hosted (free, bring your own keys, nothing leaves your box) and managed hosting (we run it, metered billing). The free tier is the funnel; hosting is the revenue.",
    },
    {
      title: "Northwind product overview",
      kind: "product" as const,
      bodyText:
        "The product is a collaborative workspace where Specs are the unit of work. A PM writes a Spec in a real-time editor, an AI generates a Breakdown into tasks, teammates record Sign-offs, and coding agents pick tasks up over an MCP bridge.\n\nEverything is append-only where it matters — Sign-offs and status changes form an immutable activity log that doubles as the audit trail. Feedback and market signals feed prioritization so the roadmap is evidence-backed, not vibes.\n\nDesign principle: one obvious path over five configurable ones. Every feature must work fully self-hosted.",
    },
    {
      title: "Who we build for",
      kind: "personas" as const,
      bodyText:
        "Primary persona — Priya, the player-coach PM. Runs product on a 2-10 person team, writes specs herself, lives in markdown and the terminal. Wants the team aligned without buying a per-seat tool, and wants the data self-hosted.\n\nSecondary persona — the staff engineer who reviews specs and records Sign-offs. Cares that the audit trail is real and tamper-evident.\n\nEmerging persona — the coding agent. Acts on tasks over MCP. Today its work is invisible; making it a first-class actor in the activity feed is a core bet.",
    },
    {
      title: "How we work",
      kind: "ways_of_working" as const,
      bodyText:
        "Small PRs, reviewed within a day. Tests cover the contract, not the implementation. Errors say what happened and what to do, in that order. No telemetry in the product, ever.\n\nWe ship the smallest thing that proves the value, then widen. Trust is earned with mechanisms, not adjectives. Decisions live in Specs and Sign-offs, not in Slack threads that scroll away.\n\nWeekly we review the roadmap against goals and the latest customer feedback. If a KR is at risk, we say so out loud and re-plan rather than letting it drift.",
    },
  ];
  for (const d of CONTEXT_DOCS) {
    await db.insert(contextDocs).values({
      orgId,
      title: d.title,
      kind: d.kind,
      source: "text",
      bodyText: d.bodyText,
      embedded: false,
      updatedBy: pm.id,
    });
  }

  // --- customer feedback (#2): items, themes, and item↔theme mapping ---
  const FEEDBACK_ITEMS: {
    source: "manual" | "upload" | "interview" | "review" | "support" | "sales";
    customer: string;
    segment: "SMB" | "Mid-market" | "Enterprise";
    text: string;
    sentiment: "positive" | "neutral" | "negative";
  }[] = [
    { source: "interview", customer: "Brightloom", segment: "SMB", text: "The multiplayer editing is the whole reason we switched. Watching my eng lead edit the spec live sold the team.", sentiment: "positive" },
    { source: "support", customer: "Cedar Labs", segment: "Mid-market", text: "Onboarding stalled at 'connect a repo'. Half my team never got past it and gave up.", sentiment: "negative" },
    { source: "sales", customer: "Helios Group", segment: "Enterprise", text: "We can't even start a pilot without an exportable, immutable audit log for our SOC 2 auditors.", sentiment: "negative" },
    { source: "review", customer: "Northstar Apps", segment: "SMB", text: "Self-hosting with our own keys was the dealbreaker feature. Nothing else let us keep data in our VPC.", sentiment: "positive" },
    { source: "support", customer: "Cedar Labs", segment: "Mid-market", text: "Billing showed a charge we didn't expect. There was no way to preview projected cost before the period closed.", sentiment: "negative" },
    { source: "interview", customer: "Quill", segment: "SMB", text: "I'd live in this all day if it had a dark mode. The white editor at midnight is rough.", sentiment: "neutral" },
    { source: "manual", customer: "Helios Group", segment: "Enterprise", text: "SSO and SCIM are hard requirements for us. Without them procurement won't sign.", sentiment: "negative" },
    { source: "sales", customer: "Fernwood", segment: "Mid-market", text: "The AI breakdown saved us a planning meeting. It turned a rough spec into tasks we actually shipped.", sentiment: "positive" },
    { source: "review", customer: "Quill", segment: "SMB", text: "Presence cursors make remote pairing feel real. Small thing, big difference.", sentiment: "positive" },
    { source: "support", customer: "Brightloom", segment: "SMB", text: "Wish the checklist led with writing a spec instead of integrations. The first real win is buried.", sentiment: "neutral" },
  ];
  const feedbackItemIds: string[] = [];
  for (const f of FEEDBACK_ITEMS) {
    const [row] = await db
      .insert(feedbackItems)
      .values({ orgId, source: f.source, customer: f.customer, segment: f.segment, text: f.text, sentiment: f.sentiment })
      .returning();
    feedbackItemIds.push(row.id);
  }

  // Themes cluster the items above; one links to the onboarding Spec it spawned.
  const [onboardingTheme] = await db
    .insert(feedbackThemes)
    .values({
      orgId,
      label: "Onboarding friction at integration step",
      summary: "New teams stall when the checklist demands a repo connection before any value. The aha moment is buried behind setup.",
      size: 3,
      sentiment: "negative",
      specId: specIdByTitle["Onboarding checklist redesign"] ?? null,
    })
    .returning();
  const [enterpriseTheme] = await db
    .insert(feedbackThemes)
    .values({
      orgId,
      label: "Enterprise compliance gaps block deals",
      summary: "Audit-log export, SSO, and SCIM are hard requirements that stop Enterprise pilots before they start.",
      size: 2,
      sentiment: "negative",
      specId: specIdByTitle["Audit log export for SOC 2"] ?? null,
    })
    .returning();
  const [multiplayerTheme] = await db
    .insert(feedbackThemes)
    .values({
      orgId,
      label: "Multiplayer + self-hosting drive adoption",
      summary: "Live co-editing and bring-your-own-keys self-hosting are the features customers cite as the reason they switched.",
      size: 4,
      sentiment: "positive",
      specId: null,
    })
    .returning();

  // item↔theme mapping (composite PK — distinct pairs only).
  // Index map: 0 Brightloom+,1 Cedar onboarding-,2 Helios audit-,3 Northstar+,
  // 4 Cedar billing-,5 Quill dark,6 Helios SSO-,7 Fernwood+,8 Quill cursors+,9 Brightloom checklist
  await db.insert(feedbackItemThemes).values([
    { themeId: onboardingTheme.id, itemId: feedbackItemIds[1] },
    { themeId: onboardingTheme.id, itemId: feedbackItemIds[9] },
    { themeId: onboardingTheme.id, itemId: feedbackItemIds[7] },
    { themeId: enterpriseTheme.id, itemId: feedbackItemIds[2] },
    { themeId: enterpriseTheme.id, itemId: feedbackItemIds[6] },
    { themeId: multiplayerTheme.id, itemId: feedbackItemIds[0] },
    { themeId: multiplayerTheme.id, itemId: feedbackItemIds[3] },
    { themeId: multiplayerTheme.id, itemId: feedbackItemIds[8] },
    { themeId: multiplayerTheme.id, itemId: feedbackItemIds[7] },
  ]);

  // --- competitors + market signals (#1) ---
  const [linearCo] = await db
    .insert(competitors)
    .values({ orgId, name: "Linear", url: "https://linear.app", notes: "Best-in-class issue tracker. Strong design bar, expanding into planning and docs." })
    .returning();
  const [notionCo] = await db
    .insert(competitors)
    .values({ orgId, name: "Notion", url: "https://notion.so", notes: "Horizontal docs + wiki. Pushing hard into AI and project management." })
    .returning();
  const [shipfastCo] = await db
    .insert(competitors)
    .values({ orgId, name: "Shipfast", url: "https://example.invalid/shipfast", notes: "Early-stage startup. AI-native spec tooling — closest to our wedge." })
    .returning();

  const MARKET_SIGNALS: {
    competitorId: string | null;
    type: "launch" | "pricing" | "positioning" | "funding" | "hiring" | "other";
    title: string;
    summary: string;
    soWhat: string;
    severity: "low" | "medium" | "high";
    occurredAt: Date;
  }[] = [
    {
      competitorId: shipfastCo.id,
      type: "launch",
      title: "Shipfast ships AI spec-to-tasks with agent execution",
      summary: "Shipfast launched a feature that turns a spec into tasks and hands them to coding agents over MCP — overlapping our core flow.",
      soWhat: "This is a direct hit on our wedge. Our differentiation has to be self-hosting and the immutable audit trail, not the breakdown itself.",
      severity: "high",
      occurredAt: new Date("2026-05-28"),
    },
    {
      competitorId: linearCo.id,
      type: "positioning",
      title: "Linear repositions around 'product planning', not just issues",
      summary: "Linear's new homepage leads with planning and specs, moving up-market from issue tracking into our space.",
      soWhat: "They have the design bar and the install base. We win on self-hosting and agent-native, not polish — lean into both.",
      severity: "medium",
      occurredAt: new Date("2026-05-15"),
    },
    {
      competitorId: notionCo.id,
      type: "pricing",
      title: "Notion raises AI add-on price 20%",
      summary: "Notion bumped its AI add-on from $10 to $12 per seat per month.",
      soWhat: "Per-seat AI pricing fatigue is real. Our bring-your-own-keys, no-per-seat story gets stronger every time they raise prices.",
      severity: "low",
      occurredAt: new Date("2026-06-01"),
    },
    {
      competitorId: shipfastCo.id,
      type: "funding",
      title: "Shipfast raises $6M seed",
      summary: "Shipfast closed a $6M seed led by a tier-1 fund to accelerate its agent-execution roadmap.",
      soWhat: "They'll outspend us on GTM. We can't win on volume — win on trust, self-hosting, and the teams that won't send data to a startup's cloud.",
      severity: "high",
      occurredAt: new Date("2026-06-05"),
    },
    {
      competitorId: linearCo.id,
      type: "hiring",
      title: "Linear hiring for 'AI agents' team",
      summary: "Linear posted several roles for an AI agents team focused on autonomous task execution.",
      soWhat: "Agent-native is becoming table stakes. Our MCP-bridge head start is real but the window is closing — keep shipping.",
      severity: "medium",
      occurredAt: new Date("2026-06-08"),
    },
  ];
  for (const sig of MARKET_SIGNALS) {
    await db.insert(marketSignals).values({
      orgId,
      competitorId: sig.competitorId,
      type: sig.type,
      title: sig.title,
      summary: sig.summary,
      soWhat: sig.soWhat,
      severity: sig.severity,
      occurredAt: sig.occurredAt,
    });
  }

  // --- routines / automation (#20) ---
  const ROUTINES: {
    name: string;
    slug: string;
    triggerType: "event" | "schedule";
    eventKind?: string;
    schedule?: "hourly" | "daily" | "weekly";
    conditionField?: string;
    conditionEquals?: string;
    actions: RoutineAction[];
  }[] = [
    {
      name: "Announce approved Sign-offs to Slack",
      slug: "announce-approved-signoffs",
      triggerType: "event",
      eventKind: "signoff_recorded",
      conditionField: "detail.verdict",
      conditionEquals: "approved",
      actions: [
        { type: "notify", target: "slack", message: "A Spec was just approved — nice work." },
        { type: "log", message: "Approved sign-off announced to #product." },
      ],
    },
    {
      name: "Weekly roadmap digest",
      slug: "weekly-roadmap-digest",
      triggerType: "schedule",
      schedule: "weekly",
      actions: [
        { type: "log", message: "Weekly digest: roadmap status, goal progress, and at-risk KRs compiled." },
      ],
    },
    {
      name: "Draft a Spec from high-severity signals",
      slug: "draft-spec-from-high-signal",
      triggerType: "event",
      eventKind: "spec_created",
      actions: [
        { type: "create_spec", title: "Response to competitive signal" },
        { type: "log", message: "Drafted a response Spec from a high-severity market signal." },
      ],
    },
  ];
  for (const r of ROUTINES) {
    await db.insert(routines).values({
      orgId,
      name: r.name,
      slug: r.slug,
      enabled: true,
      triggerType: r.triggerType,
      eventKind: r.eventKind ?? null,
      schedule: r.schedule ?? null,
      conditionField: r.conditionField ?? null,
      conditionEquals: r.conditionEquals ?? null,
      actions: r.actions,
      published: true,
      sourceHash: contentHash({
        name: r.name,
        slug: r.slug,
        triggerType: r.triggerType,
        eventKind: r.eventKind ?? null,
        schedule: r.schedule ?? null,
        conditionField: r.conditionField ?? null,
        conditionEquals: r.conditionEquals ?? null,
        actions: r.actions,
        published: true,
      }),
      revision: 1,
      createdBy: pm.id,
    });
  }

  // --- connections (MCP, non-functional placeholders — no real secrets) ---
  await db.insert(connections).values([
    {
      orgId,
      kind: "mcp",
      target: "slack",
      config: {
        mcpUrl: "https://example.invalid/mcp/slack",
        createTool: "post_message",
        externalIdField: "ts",
        defaultChannel: "#product",
      },
    },
    {
      orgId,
      kind: "mcp",
      target: "jira",
      config: {
        mcpUrl: "https://example.invalid/mcp/jira",
        createTool: "create_issue",
        externalIdField: "key",
        projectKey: "NW",
      },
    },
  ]);

  // --- skills + agents (24-PLATFORM-SHARING). Two of each so the Library has
  // real content and the file-sync round-trip has something to pull. ---
  await db.delete(agents).where(eq(agents.orgId, orgId));
  await db.delete(skills).where(eq(skills.orgId, orgId));

  const SKILLS = [
    {
      slug: "summarize-feedback",
      name: "Summarize Feedback",
      description: "Cluster raw feedback items into themes, each with a so-what.",
      body: "You are clustering customer feedback. Given {{items}}, produce at most {{max_themes}} themes. For each: a label, a one-line summary, and a **so-what** (why it matters for the product). Cite the source items.",
      params: [
        { name: "items", type: "text" as const, required: true },
        { name: "max_themes", type: "number" as const, required: false, default: 5 },
      ],
      toolAllowlist: ["list_specs", "get_spec"],
    },
    {
      slug: "draft-spec-from-signal",
      name: "Draft Spec from Signal",
      description: "Turn a market signal into a first-pass Spec outline.",
      body: "Given a market signal {{signal}}, draft a Spec outline: problem, who it affects, the proposed response, and 2-3 open questions. Ground it in the org's context. Neutral, concrete, no hype.",
      params: [{ name: "signal", type: "text" as const, required: true }],
      toolAllowlist: ["list_specs", "get_spec", "get_insights"],
    },
  ];
  for (const s of SKILLS) {
    await db.insert(skills).values({
      orgId,
      slug: s.slug,
      name: s.name,
      description: s.description,
      body: s.body,
      params: s.params,
      toolAllowlist: s.toolAllowlist,
      published: true,
      sourceHash: contentHash({ name: s.name, description: s.description, body: s.body, params: s.params, toolAllowlist: s.toolAllowlist, published: true }),
      createdBy: pm.id,
    });
  }

  const AGENTS = [
    {
      slug: "feedback-triage",
      name: "Feedback Triage",
      role: "Triages incoming customer feedback into themes and proposes (never creates) specs.",
      model: "claude-haiku-4-5-20251001",
      skillSlugs: ["summarize-feedback"],
      toolAllowlist: ["list_specs", "get_spec"],
      writeScope: "none" as const,
    },
    {
      slug: "spec-reviewer",
      name: "Spec Reviewer",
      role: "Reads a Spec against the org's context and flags gaps and risks as calm offers.",
      model: null,
      skillSlugs: ["draft-spec-from-signal"],
      toolAllowlist: ["list_specs", "get_spec", "get_signoff_timeline", "get_insights"],
      writeScope: "none" as const,
    },
  ];
  for (const a of AGENTS) {
    await db.insert(agents).values({
      orgId,
      slug: a.slug,
      name: a.name,
      role: a.role,
      model: a.model,
      skillSlugs: a.skillSlugs,
      toolAllowlist: a.toolAllowlist,
      writeScope: a.writeScope,
      published: true,
      sourceHash: contentHash({ name: a.name, role: a.role, model: a.model, modelFallback: "default", skillSlugs: a.skillSlugs, toolAllowlist: a.toolAllowlist, writeScope: a.writeScope, published: true }),
      createdBy: pm.id,
    });
  }

  console.log(
    `Seeded Northwind: ${SPECS.length} specs, ${TEAMMATES.length + 1} members, ${PLAYBOOK.length} playbook docs, ` +
      `3 teams, ${INITIATIVES.length} initiatives, 3 goals, 7 key results, 3 goal links, ` +
      `${CONTEXT_DOCS.length} context docs, ${FEEDBACK_ITEMS.length} feedback items, 3 feedback themes, ` +
      `3 competitors, ${MARKET_SIGNALS.length} market signals, ${ROUTINES.length} routines, 2 connections, ` +
      `${SKILLS.length} skills, ${AGENTS.length} agents.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
