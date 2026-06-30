import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  customType,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

// Schema v0 — orgs, specs, breakdowns, tasks, sign-offs, context, and BYO keys.
// Rows hold anything agents/sync/board queries; Yjs docs hold co-edited prose.

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // null = the lightweight onboarding wizard hasn't been completed yet
  onboardedAt: timestamp("onboarded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Role TYPE (what kind of work you do) is distinct from org ROLE (admin/member,
// a permission). Captured at onboarding; flows into AI prompts (role-adaptive).
export const ROLE_TYPES = ["pm", "eng", "design", "data", "leadership", "other"] as const;

export const userOrgs = pgTable(
  "user_orgs",
  {
    userId: text("user_id").notNull().references(() => user.id),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    // MVP keeps two roles; the 4-role + permission-flag model is post-MVP
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    roleType: text("role_type", { enum: ROLE_TYPES }).notNull().default("other"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

// Teams / squads / pods (14-TEAMS-SPEC). Own people AND work; orthogonal to
// org admin/member roles — a scoping layer, never an access gate.
export const TEAM_ROLES = ["lead", "member"] as const;

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  leadUserId: text("lead_user_id").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id),
    roleInTeam: text("role_in_team", { enum: TEAM_ROLES }).notNull().default("member"),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

// Initiatives — the Roadmap layer above Specs (#4). Grouped by Timeline
// horizon, owned by a team (reusing #3's nullable team_id pattern).
export const INITIATIVE_HORIZONS = ["now", "next", "later"] as const;
export const INITIATIVE_STATUSES = ["planned", "active", "shipped", "cancelled"] as const;

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  title: text("title").notNull(),
  description: text("description"),
  horizon: text("horizon", { enum: INITIATIVE_HORIZONS }).notNull().default("next"),
  status: text("status", { enum: INITIATIVE_STATUSES }).notNull().default("planned"),
  teamId: uuid("team_id").references(() => teams.id),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Goals + Key Results (#4 / 18-GOALS-SPEC). OKR ships first; framework is a
// label remap over the same tables, so the others slot in without migration.
export const GOAL_FRAMEWORKS = ["okr", "north_star", "ogsm", "v2mom", "aarrr", "heart"] as const;
export const GOAL_STATUSES = ["active", "paused", "achieved", "cancelled"] as const;
export const KR_STATUSES = ["on_track", "at_risk", "off_track", "achieved"] as const;
export const CONFIDENCE = ["low", "medium", "high"] as const;

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  teamId: uuid("team_id").references(() => teams.id),
  framework: text("framework", { enum: GOAL_FRAMEWORKS }).notNull().default("okr"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("active"),
  startPeriod: text("start_period"),
  endPeriod: text("end_period"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const keyResults = pgTable("key_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  title: text("title").notNull(),
  metricUnit: text("metric_unit"),
  target: integer("target"),
  current: integer("current").notNull().default(0),
  baseline: integer("baseline").notNull().default(0),
  status: text("status", { enum: KR_STATUSES }).notNull().default("on_track"),
  confidence: text("confidence", { enum: CONFIDENCE }).notNull().default("medium"),
});

// Polymorphic: a goal can be served by a Spec or an Initiative.
export const goalLinks = pgTable("goal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  entityType: text("entity_type", { enum: ["spec", "initiative"] }).notNull(),
  entityId: uuid("entity_id").notNull(),
  keyResultId: uuid("key_result_id").references(() => keyResults.id, { onDelete: "set null" }),
  weight: integer("weight").notNull().default(3),
});

// Org-level BYO provider keys — every AI call resolves these; we host no models
export const providerKeys = pgTable("provider_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  provider: text("provider", {
    enum: ["anthropic", "openai", "google", "openrouter", "ollama"],
  }).notNull(),
  // AES-GCM, master key from compose-generated secret — never plaintext at rest
  keyEncrypted: text("key_encrypted").notNull(),
  limits: jsonb("limits").$type<{ monthlyUsd?: number }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const SPEC_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "in_progress",
  "done",
  "archived",
] as const;

export const specs = pgTable("specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  displayId: text("display_id").notNull(),
  title: text("title").notNull().default("Untitled spec"),
  status: text("status", { enum: SPEC_STATUSES }).notNull().default("draft"),
  // Yjs document name in the collab server / ydocs table
  ydocId: text("ydoc_id").notNull(),
  // null = org-wide; non-null = owned by that team (14-TEAMS-SPEC)
  teamId: uuid("team_id").references(() => teams.id),
  // optional roll-up into a Roadmap initiative (#4)
  initiativeId: uuid("initiative_id").references(() => initiatives.id),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const breakdowns = pgTable("breakdowns", {
  id: uuid("id").primaryKey().defaultRandom(),
  specId: uuid("spec_id").notNull().references(() => specs.id),
  // Undoable regeneration: prior breakdown rows are kept, latest wins
  generation: integer("generation").notNull().default(1),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "review",
  "deferred",
  "cancelled",
] as const;

// Taskmaster-shaped on purpose (same conceptual fields + six statuses) so the
// deferred Phase 3 CLI engine bolts on without a schema migration — but no
// wire-format commitment in the MVP.
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  breakdownId: uuid("breakdown_id").notNull().references(() => breakdowns.id),
  parentId: uuid("parent_id"),
  displayId: text("display_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  details: text("details"),
  testStrategy: text("test_strategy"),
  status: text("status", { enum: TASK_STATUSES }).notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskDeps = pgTable(
  "task_deps",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id),
    dependsOnId: uuid("depends_on_id").notNull().references(() => tasks.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnId] })],
);

// Append-only by design: a changed verdict is a new row, never an update.
// This audit trail is the trust feature and is exportable for compliance.
export const signoffs = pgTable("signoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  specId: uuid("spec_id").notNull().references(() => specs.id),
  userId: text("user_id").notNull().references(() => user.id),
  verdict: text("verdict", { enum: ["approved", "flagged", "cleared"] }).notNull(),
  comment: text("comment"),
  // Groups timeline entries by the spec version they were cast against
  specVersion: text("spec_version").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Playbook v0 (deprecated by Context — kept one cycle for the data migration).
export const playbookDocs = pgTable("playbook_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  title: text("title").notNull(),
  markdown: text("markdown").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Context: typed org knowledge (text + uploaded files), semantically retrieved
// and injected into every AI feature. Replaces Playbook (see 13-CONTEXT-SPEC).
export const CONTEXT_KINDS = [
  "company", "product", "personas", "strategy", "ways_of_working", "other",
] as const;

export const contextDocs = pgTable("context_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  title: text("title").notNull(),
  kind: text("kind", { enum: CONTEXT_KINDS }).notNull().default("other"),
  source: text("source", { enum: ["text", "file"] }).notNull().default("text"),
  bodyText: text("body_text").notNull(), // extracted/plain text, always present
  fileName: text("file_name"),
  fileRef: text("file_ref"), // optional blob key; null = text stored in Postgres only
  embedded: boolean("embedded").notNull().default(false),
  updatedBy: text("updated_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Unified workspace index (Context Graph, #17). One chunk store for every
// indexable entity — Context docs AND Specs/Breakdowns/Sign-offs. The
// (entityType, entityId) pair is the pointer back to the source for citations;
// FKs between those entities ARE the graph edges (no separate node/edge store).
// Still float[] + app-side cosine — pgvector is the later swap.
export const GRAPH_ENTITY_TYPES = [
  "context_doc", "spec", "breakdown", "signoff",
] as const;

export const contextChunks = pgTable(
  "context_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id").references(() => contextDocs.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    entityType: text("entity_type", { enum: GRAPH_ENTITY_TYPES }).notNull().default("context_doc"),
    entityId: uuid("entity_id").notNull(),
    ord: integer("ord").notNull(),
    text: text("text").notNull(),
    embedding: jsonb("embedding").$type<number[]>(),
    model: text("model"),
    indexedAt: timestamp("indexed_at").notNull().defaultNow(),
  },
  (t) => [
    index("context_chunks_org_entity_idx").on(t.orgId, t.entityType),
    index("context_chunks_entity_idx").on(t.entityType, t.entityId),
  ],
);

// One row per indexed entity: content hash + model, so incremental indexing
// re-embeds only what actually changed.
export const graphIndexState = pgTable(
  "graph_index_state",
  {
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    entityType: text("entity_type", { enum: GRAPH_ENTITY_TYPES }).notNull(),
    entityId: uuid("entity_id").notNull(),
    hash: text("hash").notNull(),
    model: text("model"),
    indexedAt: timestamp("indexed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.entityType, t.entityId] })],
);

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  kind: text("kind", { enum: ["mcp", "webhook"] }).notNull(),
  target: text("target").notNull(), // e.g. "jira", "confluence", "slack"
  config: jsonb("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncMappings = pgTable("sync_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull().references(() => connections.id),
  entityType: text("entity_type").notNull(), // "task" | "spec"
  entityId: uuid("entity_id").notNull(),
  externalId: text("external_id").notNull(), // Jira issue key, Confluence page id
  tombstonedAt: timestamp("tombstoned_at"),
});

// Yjs persistence for the collab server: update log compacted into state.
// The week-1 spike validates this table's growth/compaction behavior.
export const ydocs = pgTable("ydocs", {
  name: text("name").primaryKey(),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Customer feedback (#2). Ingested manually or by upload; AI clusters items
// into themes (LLM over the items — works with any BYO key, no embedding
// required); themes link to Specs so prioritization is evidence-backed.
export const FEEDBACK_SOURCES = ["manual", "upload", "interview", "review", "support", "sales"] as const;

export const feedbackItems = pgTable("feedback_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  source: text("source", { enum: FEEDBACK_SOURCES }).notNull().default("manual"),
  customer: text("customer"),
  segment: text("segment"),
  text: text("text").notNull(),
  sentiment: text("sentiment", { enum: ["positive", "neutral", "negative"] }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedbackThemes = pgTable("feedback_themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  size: integer("size").notNull().default(0),
  sentiment: text("sentiment", { enum: ["positive", "neutral", "negative", "mixed"] }),
  specId: uuid("spec_id").references(() => specs.id), // set when a Spec is created from the theme
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedbackItemThemes = pgTable(
  "feedback_item_themes",
  {
    themeId: uuid("theme_id").notNull().references(() => feedbackThemes.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.itemId] })],
);

// Ingest API keys — org-scoped bearer tokens for the POST /api/ingest/feedback
// webhook. Generated once (shown to admin, never retrievable again), encrypted
// at rest using the same AES-GCM pattern as providerKeys.
export const ingestKeys = pgTable("ingest_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  keyEncrypted: text("key_encrypted").notNull(),
  label: text("label").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ingest dedup mappings — tracks which external IDs have already been ingested
// so n8n or other tools can POST idempotently without creating duplicate items.
export const ingestMappings = pgTable(
  "ingest_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    externalId: text("external_id").notNull(),
    feedbackItemId: uuid("feedback_item_id")
      .notNull()
      .references(() => feedbackItems.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ingest_mappings_org_ext_src").on(t.orgId, t.externalId, t.source)],
);

// Market signals (#1). Track competitors and the moves around them. v1 is
// manual + paste/upload (no web access — preserves "nothing leaves your box");
// AI summarizes a pasted article into a typed, severity-scored signal.
export const SIGNAL_TYPES = ["launch", "pricing", "positioning", "funding", "hiring", "other"] as const;
export const SIGNAL_SEVERITY = ["low", "medium", "high"] as const;

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  url: text("url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const marketSignals = pgTable("market_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  competitorId: uuid("competitor_id").references(() => competitors.id, { onDelete: "set null" }),
  type: text("type", { enum: SIGNAL_TYPES }).notNull().default("other"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  soWhat: text("so_what"), // AI's "why it matters" for us
  url: text("url"),
  severity: text("severity", { enum: SIGNAL_SEVERITY }).notNull().default("medium"),
  specId: uuid("spec_id").references(() => specs.id), // optional: signal → Spec response
  occurredAt: timestamp("occurred_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// AI Chat (#16). Persistent multi-turn chat with workspace context + tools.
// A message is one row; its turn is an ordered `parts` array (AI-SDK shape).
export const THREAD_SCOPES = ["workspace", "spec"] as const;
export const CHAT_ROLES = ["user", "assistant", "tool", "system"] as const;

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown; confirmed?: boolean }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown };

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  scope: text("scope", { enum: THREAD_SCOPES }).notNull().default("workspace"),
  specId: uuid("spec_id").references(() => specs.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New chat"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  role: text("role", { enum: CHAT_ROLES }).notNull(),
  parts: jsonb("parts").$type<ChatPart[]>().notNull(),
  model: text("model"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// CLI device-code auth (#19). Unauthenticated CLI starts a flow; the signed-in
// browser confirms the user_code; the CLI polls for the promoted session token.
export const deviceTokens = pgTable("device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceCode: text("device_code").notNull().unique(),
  userCode: text("user_code").notNull(),
  sessionToken: text("session_token"), // null until confirmed in the browser
  orgId: uuid("org_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Routines / automation (#20). Event- or schedule-triggered rules. Conditions
// and actions are typed jsonb arrays (no separate tables — keeps the evaluator
// simple). auto-disable after repeated failure; run history for observability.
export const ROUTINE_TRIGGERS = ["event", "schedule"] as const;
export const ROUTINE_SCHEDULES = ["hourly", "daily", "weekly"] as const;

export type RoutineAction =
  | { type: "log"; message: string }
  | { type: "create_spec"; title: string }
  | { type: "notify"; target: string; message: string }
  // Additive (24-PLATFORM-SHARING §4 Phase 2). The runActions switch grows two
  // arms; existing routines are untouched.
  | { type: "run_skill"; skillSlug: string; params?: Record<string, unknown> }
  | { type: "run_agent"; agentSlug: string; input?: string }
  // Gap 1: feedback ingestion observability marker (actual pull happens at n8n).
  | { type: "sync_feedback"; source: string }
  // Gap 4: opportunity ranking refresh.
  | { type: "refresh_opportunities" }
  // Gap 5: post-launch evaluation scheduling + execution.
  | { type: "schedule_evaluation"; specId: string; connectionId?: string; delayDays: number }
  | { type: "run_evaluation"; specId: string; connectionId?: string };

export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  triggerType: text("trigger_type", { enum: ROUTINE_TRIGGERS }).notNull(),
  eventKind: text("event_kind"), // when triggerType = "event"
  schedule: text("schedule", { enum: ROUTINE_SCHEDULES }), // when triggerType = "schedule"
  conditionField: text("condition_field"), // optional dotted path on the event, e.g. "detail.verdict"
  conditionEquals: text("condition_equals"),
  actions: jsonb("actions").$type<RoutineAction[]>().notNull().default([]),
  failureCount: integer("failure_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  // Sharing + versioning (24-PLATFORM-SHARING §2/§4). slug = stable file key;
  // git is the VCS, sourceHash the conflict primitive, revision the audit counter.
  // Defaults keep every existing routine published & valid after db:push.
  slug: text("slug").notNull().default(""), // backfilled from name on first push
  published: boolean("published").notNull().default(true), // existing rows = already published
  sourceHash: text("source_hash").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  importedFrom: text("imported_from"), // source_org from a pack, or null
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Skills + Agents (24-PLATFORM-SHARING). Portable as .burrow/ files; the DB
// row is a cache of the published file. A skill = a parameterized prompt + a
// tool allowlist; an agent = a model-pinned persona with a skill set + a
// permission ceiling. Both reuse the nullable teamId scoping pattern (#14).
export const AGENT_WRITE_SCOPES = ["none", "specs", "tasks", "all"] as const;
export const AGENT_MODEL_FALLBACKS = ["default", "strict"] as const;

export type SkillParam = {
  name: string;
  type: "text" | "number" | "boolean";
  required?: boolean;
  default?: unknown;
};

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  teamId: uuid("team_id").references(() => teams.id), // null = org-wide
  slug: text("slug").notNull(), // unique per (orgId)
  name: text("name").notNull(),
  description: text("description"),
  body: text("body").notNull(), // the prompt template ({{param}} interpolation)
  params: jsonb("params").$type<SkillParam[]>().notNull().default([]),
  toolAllowlist: jsonb("tool_allowlist").$type<string[]>().notNull().default([]),
  published: boolean("published").notNull().default(false),
  sourceHash: text("source_hash").notNull(),
  revision: integer("revision").notNull().default(1),
  importedFrom: text("imported_from"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  teamId: uuid("team_id").references(() => teams.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  model: text("model"), // pinned model id; null = org default (agent-model-selection)
  modelFallback: text("model_fallback", { enum: AGENT_MODEL_FALLBACKS }).notNull().default("default"),
  skillSlugs: jsonb("skill_slugs").$type<string[]>().notNull().default([]),
  toolAllowlist: jsonb("tool_allowlist").$type<string[]>().notNull().default([]), // permission ceiling
  writeScope: text("write_scope", { enum: AGENT_WRITE_SCOPES }).notNull().default("none"),
  published: boolean("published").notNull().default(false),
  sourceHash: text("source_hash").notNull(),
  revision: integer("revision").notNull().default(1),
  importedFrom: text("imported_from"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const routineRuns = pgTable("routine_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  routineId: uuid("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Activity events — the spine of the AI-native surface. Humans AND coding
// agents both write here, so agent work (today invisible: it happens over the
// MCP bridge) becomes a visible feed. actorType distinguishes who acted;
// actorName is the agent's MCP client name ("claude-code") or a person's name.
export const EVENT_KINDS = [
  "spec_created",
  "spec_status_changed",
  "breakdown_generated",
  "task_status_changed",
  "task_picked_up",
  "signoff_recorded",
  "review_requested",
  "tasks_pushed",
  "team_created",
  "team_member_added",
  "team_member_removed",
  "spec_team_changed",
] as const;

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  specId: uuid("spec_id").references(() => specs.id),
  taskId: uuid("task_id"),
  actorType: text("actor_type", { enum: ["human", "agent", "system"] }).notNull(),
  actorName: text("actor_name").notNull(),
  kind: text("kind", { enum: EVENT_KINDS }).notNull(),
  summary: text("summary").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Gap 5: post-launch evaluation results (append-only, mirrors signoffs pattern).
// Each row is one evaluation report generated against a shipped spec — either
// by the routines engine (scheduled) or manually via the Evaluate launch button.
export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  specId: uuid("spec_id").notNull().references(() => specs.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
  report: text("report").notNull(),
  triggeredBy: text("triggered_by").references(() => user.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});
