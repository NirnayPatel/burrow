import { streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { specs, breakdowns, tasks } from "@burrow/core";
import { db } from "./db.js";
import { resolveModel, specText, ROLE_DIRECTIVE } from "./ai.js";
import { retrieveContext } from "./context.js";

// AI Chat (#16): a bounded server-side tool loop. Read tools execute freely;
// mutating tools (create_spec, generate_breakdown) carry NO execute, so the
// model only *proposes* them — the route surfaces a confirm card and the
// /confirm endpoint runs them. Org scope is closed over, so the model can
// never reach another org's data.

export const MUTATING_TOOLS = ["create_spec", "generate_breakdown"] as const;

export function buildReadTools(orgId: string) {
  return {
    search_context: tool({
      description: "Search the org's Context (company/product knowledge) for relevant passages.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => (await retrieveContext(orgId, query, 6)) ?? [],
    }),
    list_specs: tool({
      description: "List the org's Specs with id, displayId, title, status.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select({ id: specs.id, displayId: specs.displayId, title: specs.title, status: specs.status })
          .from(specs)
          .where(eq(specs.orgId, orgId))
          .orderBy(desc(specs.updatedAt))
          .limit(50);
        return rows;
      },
    }),
    read_spec: tool({
      description: "Read one Spec's full prose and its latest Breakdown tasks.",
      inputSchema: z.object({ specId: z.string() }),
      execute: async ({ specId }) => {
        const [spec] = await db
          .select()
          .from(specs)
          .where(and(eq(specs.id, specId), eq(specs.orgId, orgId)));
        if (!spec) return { error: "not found" };
        const [bk] = await db
          .select()
          .from(breakdowns)
          .where(eq(breakdowns.specId, spec.id))
          .orderBy(desc(breakdowns.generation))
          .limit(1);
        const taskRows = bk ? await db.select().from(tasks).where(eq(tasks.breakdownId, bk.id)) : [];
        return { title: spec.title, status: spec.status, prose: await specText(spec.ydocId), tasks: taskRows };
      },
    }),
    // Proposed-only (no execute): the model emits a tool-call the user confirms.
    create_spec: tool({
      description: "Propose creating a new Spec from a title (and optional starter prose). Requires user confirmation.",
      inputSchema: z.object({ title: z.string(), prose: z.string().optional() }),
    }),
    generate_breakdown: tool({
      description: "Propose generating an AI Breakdown for a Spec. Requires user confirmation.",
      inputSchema: z.object({ specId: z.string() }),
    }),
  };
}

function chatSystem(roleType: string | undefined, scope: string, anchor: string, ctx: string): string {
  return [
    "You are Burrow's assistant. You help product teams turn ideas into shipped work.",
    roleType ? ROLE_DIRECTIVE[roleType] ?? "" : "",
    "Use the read tools to ground answers in the org's actual Specs and Context. Be concise and specific; sentence case; no hedging.",
    "To create a Spec or generate a Breakdown, call the matching tool — it will be confirmed by the user before running.",
    scope === "spec" ? `\nYou are anchored to this Spec:\n${anchor}` : "",
    ctx,
  ]
    .filter(Boolean)
    .join("\n");
}

export type ChatTurnOpts = {
  orgId: string;
  roleType?: string;
  thread: { scope: "workspace" | "spec"; specId: string | null };
  history: ModelMessage[];
  userText: string;
};

export async function streamChatTurn(opts: ChatTurnOpts) {
  const model = await resolveModel(opts.orgId);
  let anchor = "";
  if (opts.thread.scope === "spec" && opts.thread.specId) {
    const [spec] = await db.select().from(specs).where(eq(specs.id, opts.thread.specId));
    if (spec) anchor = `${spec.displayId} · ${spec.title}\n${(await specText(spec.ydocId)).slice(0, 1500)}`;
  }
  const ctxHits = await retrieveContext(opts.orgId, opts.userText, 5);
  const ctx = ctxHits && ctxHits.length
    ? "\n\nRelevant org context:\n" + ctxHits.map((h) => `## ${h.docTitle}\n${h.text}`).join("\n\n")
    : "";

  return streamText({
    model,
    system: chatSystem(opts.roleType, opts.thread.scope, anchor, ctx),
    tools: buildReadTools(opts.orgId),
    stopWhen: ({ steps }) => steps.length >= 5,
    messages: [...opts.history, { role: "user", content: opts.userText }],
  });
}
