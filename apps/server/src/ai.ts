import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject, streamText, generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { providerKeys, ydocs } from "@burrow/core";
import { contextBlock } from "./context.js";

// Role-adaptive framing (13-CONTEXT-SPEC §7). The acting user's role_type
// prepends a one-line directive so the same Spec yields role-appropriate output.
export const ROLE_DIRECTIVE: Record<string, string> = {
  pm: "The reader is a product manager — frame in outcomes, scope, and user value.",
  eng: "The reader is an engineer — be precise about implementation, interfaces, and edge cases.",
  design: "The reader is a designer — emphasize flows, states, and interaction detail.",
  data: "The reader is a data/analytics person — emphasize metrics, events, and validation.",
  leadership: "The reader is a leader — lead with the decision, the why, and the risk.",
  other: "",
};
const roleLine = (roleType?: string) =>
  roleType && ROLE_DIRECTIVE[roleType] ? ROLE_DIRECTIVE[roleType] + "\n\n" : "";
import { db } from "./db.js";
import { decryptSecret } from "./crypto.js";

// Org BYO keys only — there is no app-level fallback key, by design.
export async function resolveModel(orgId: string): Promise<LanguageModel> {
  const keys = await db
    .select()
    .from(providerKeys)
    .where(eq(providerKeys.orgId, orgId));
  // MVP preference order; per-org default model config comes with the vault UI v2
  const anthropic = keys.find((k) => k.provider === "anthropic");
  if (anthropic) {
    return createAnthropic({ apiKey: decryptSecret(anthropic.keyEncrypted) })(
      "claude-sonnet-4-6",
    );
  }
  const openai = keys.find((k) => k.provider === "openai");
  if (openai) {
    return createOpenAI({ apiKey: decryptSecret(openai.keyEncrypted) })("gpt-5.2");
  }
  const ollama = keys.find((k) => k.provider === "ollama");
  if (ollama) {
    // key field holds the base URL for local providers
    return createOpenAI({
      baseURL: `${decryptSecret(ollama.keyEncrypted).replace(/\/$/, "")}/v1`,
      apiKey: "ollama",
    })("llama3.3");
  }
  throw new NoProviderKeyError();
}

export class NoProviderKeyError extends Error {
  constructor() {
    super("no provider key configured for this org");
  }
}

// Spec prose lives in the Yjs doc; decode the persisted state and flatten the
// BlockNote XML fragment to plain text for the prompt.
export async function specText(ydocId: string): Promise<string> {
  const [row] = await db.select().from(ydocs).where(eq(ydocs.name, `spec:${ydocId}`));
  if (!row) return "";
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(row.state));
  const xml = doc.getXmlFragment("document-store").toString();
  return xml
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export const taskSchema = z.object({
  title: z.string().describe("Short imperative task title"),
  description: z.string().describe("What to build and why, 1-3 sentences"),
  details: z
    .string()
    .describe("Implementation guidance an engineer or coding agent can act on"),
  acceptanceCriteria: z
    .array(z.string())
    .min(1)
    .describe("Verifiable conditions for done"),
  priority: z.number().int().min(0).max(3).describe("0=critical, 3=nice to have"),
  dependsOn: z
    .array(z.number().int())
    .describe("Indices of earlier tasks in this list this task depends on"),
});

export async function streamBreakdown(orgId: string, ydocId: string, roleType?: string) {
  const model = await resolveModel(orgId);
  const text = await specText(ydocId);
  if (text.length < 40) {
    throw new Error("spec is too short to break down — write the spec first");
  }
  // Retrieved org Context (or full-concat fallback when no embedding key).
  const ctx = await contextBlock(orgId, text);

  // streamObject reports provider failures via onError, not by throwing from
  // the element iterator — collect them so the route can surface a real error
  // instead of a silent empty breakdown.
  const errors: unknown[] = [];
  const stream = streamObject({
    model,
    output: "array",
    schema: taskSchema,
    onError({ error }) {
      errors.push(error);
    },
    prompt: `You are a senior product engineer breaking a spec into agent-ready tasks.
${roleLine(roleType)}Rules:
- 4-12 tasks, dependency-ordered (foundations first).
- Each task independently completable by a coding agent in one session.
- dependsOn refers to zero-based indices of EARLIER tasks in your output.
- Acceptance criteria are verifiable, not vague.
- Match the spec's actual scope — do not invent requirements.${ctx}

Spec:
${text}`,
  });
  return { stream, errors };
}

// Editor AI assist — streams plain text/markdown for the slash-command and
// empty-Spec starter. Modes map to the in-editor AI group (draft/expand/
// critique/acceptance). BYO key, same provider resolution as Breakdown.
const ASSIST_SYSTEM: Record<string, string> = {
  draft:
    "You draft a crisp product Spec section from a one-line prompt. Lead with the goal, then constraints. Plain prose, no preamble, no headings unless natural.",
  expand:
    "You expand the given Spec section with specifics — concrete behavior, edge cases, constraints. Match the existing voice. No preamble.",
  critique:
    "You critique the Spec so far as a sharp PM: what's ambiguous, missing, or risky. 3-5 bullet points, specific, no hedging.",
  acceptance:
    "You write verifiable acceptance criteria for the feature described. Output a short bullet list, each criterion testable.",
};

export async function streamAssist(
  orgId: string,
  mode: string,
  prompt: string,
  specContext: string,
  roleType?: string,
) {
  const model = await resolveModel(orgId);
  const ctx = await contextBlock(orgId, `${prompt}\n${specContext}`);
  return streamText({
    model,
    system: roleLine(roleType) + (ASSIST_SYSTEM[mode] ?? ASSIST_SYSTEM.draft),
    prompt: `${specContext ? `Current Spec:\n${specContext}\n\n` : ""}${ctx ? ctx + "\n\n" : ""}Request: ${prompt}`,
  });
}

const insightSchema = z.object({
  summary: z.string().describe("One-sentence summary of what this Spec proposes"),
  gaps: z
    .array(z.string())
    .describe("Specific missing pieces or risks, phrased as offers not alarms (e.g. 'No success metric defined'). 0-4 items."),
  openQuestions: z.number().int().describe("Count of unresolved questions in the Spec"),
});

export type SpecInsights = z.infer<typeof insightSchema>;

// AI summary + gaps for the Sign-off tab, spec list, and Dashboard. Cheap,
// cacheable per spec version. Returns null if no key (caller degrades quietly).
export async function generateInsights(
  orgId: string,
  ydocId: string,
): Promise<SpecInsights | null> {
  const text = await specText(ydocId);
  if (text.length < 40) return null;
  let model: LanguageModel;
  try {
    model = await resolveModel(orgId);
  } catch {
    return null;
  }
  const ctx = await contextBlock(orgId, text);
  const { object } = await generateObject({
    model,
    schema: insightSchema,
    prompt: `Analyze this product Spec against the org's context. Summary in one sentence; list concrete gaps/risks as neutral offers (not alarms); count open questions.${ctx}\n\nSpec:\n${text}`,
  });
  return object;
}

// ── Surface insights ───────────────────────────────────────────────────────
// Burrow is AI-native: the same Context Graph that grounds a Spec should ground
// every surface where a human or agent makes a call. This generalizes the
// spec-page insight pattern to any surface (the roadmap, the spec backlog, …).
// The caller assembles a compact text picture of what's on screen; we analyze
// it against the org's retrieved context and return a few calm, dismissible
// offers. Returns null on no key or thin input — never an error path.
const surfaceInsightSchema = z.object({
  insights: z
    .array(
      z.object({
        text: z.string().describe("One concrete, specific offer — under ~18 words, neutral, not an alarm"),
        variant: z
          .enum(["neutral", "attention"])
          .describe("attention = worth a look (renders amber, never red); neutral = informational"),
      }),
    )
    .describe("0-3 insights. Fewer, sharper beats a long list. Omit anything generic."),
});

export type SurfaceInsights = z.infer<typeof surfaceInsightSchema>;

const SURFACE_LENS: Record<string, string> = {
  roadmap:
    "You are looking at a product roadmap (initiatives grouped into now/next/later). Surface balance, coverage, and risk: a horizon that's overloaded or empty, an initiative with no Spec or no goal behind it, a customer/market signal the roadmap doesn't answer, a goal with no initiative.",
  backlog:
    "You are looking at the Spec backlog (the list of Specs and their statuses). Surface what's worth a PM's attention before they create or pick up work: duplicate/overlapping Specs, a high-signal customer theme with no Spec, Specs stuck in review, gaps between the backlog and the org's stated goals.",
};

export async function generateSurfaceInsights(
  orgId: string,
  surface: keyof typeof SURFACE_LENS | string,
  payloadText: string,
): Promise<SurfaceInsights | null> {
  if (!payloadText || payloadText.trim().length < 20) return null;
  let model: LanguageModel;
  try {
    model = await resolveModel(orgId);
  } catch {
    return null; // no BYO key — degrade silently
  }
  const lens = SURFACE_LENS[surface] ?? SURFACE_LENS.roadmap;
  const ctx = await contextBlock(orgId, payloadText);
  try {
    const { object } = await generateObject({
      model,
      schema: surfaceInsightSchema,
      prompt: `${lens}\n\nGround every insight in the org's context below — cite the signal, goal, or doc that motivates it. Offer at most 3; return an empty list rather than reaching for something generic. Phrase as neutral offers a smart colleague would make, never alarms.${ctx}\n\nWhat's on screen:\n${payloadText}`,
    });
    return object;
  } catch {
    return null;
  }
}

// Customer feedback clustering (#2). LLM groups items into themes over the raw
// text — works with any BYO chat key, no embeddings required. Returns null if
// no key. itemIndices are zero-based into the input array.
const clusterSchema = z.object({
  themes: z.array(
    z.object({
      label: z.string().describe("Short theme name, e.g. 'Slow exports'"),
      summary: z.string().describe("One sentence: what this theme is about"),
      sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
      itemIndices: z.array(z.number().int()).describe("Indices of items in this theme"),
    }),
  ),
  itemSentiments: z
    .array(z.enum(["positive", "neutral", "negative"]))
    .describe("Sentiment per input item, same order/length as input"),
});

export type FeedbackClusters = z.infer<typeof clusterSchema>;

// Summarize a pasted competitor/market article into a typed, severity-scored
// signal with a "so what for us" (#1). BYO key; null = no key.
const signalSchema = z.object({
  title: z.string().describe("Short headline for the signal"),
  summary: z.string().describe("2-3 sentence neutral summary of what happened"),
  type: z.enum(["launch", "pricing", "positioning", "funding", "hiring", "other"]),
  severity: z.enum(["low", "medium", "high"]).describe("How much this should concern us"),
  soWhat: z.string().describe("One line: why this matters for our product/roadmap"),
});
export type MarketSignalDraft = z.infer<typeof signalSchema>;

export async function summarizeSignal(
  orgId: string,
  rawText: string,
  competitorName?: string,
): Promise<MarketSignalDraft | null> {
  let model: LanguageModel;
  try {
    model = await resolveModel(orgId);
  } catch {
    return null;
  }
  const ctx = await contextBlock(orgId, rawText);
  const { object } = await generateObject({
    model,
    schema: signalSchema,
    prompt: `Read this market/competitor item${
      competitorName ? ` about ${competitorName}` : ""
    } and turn it into a structured signal: a title, a neutral 2-3 sentence summary, its type and severity, and a one-line "so what for us" grounded in our context.${ctx}\n\nItem:\n${rawText}`,
  });
  return object;
}

export async function clusterFeedback(
  orgId: string,
  items: string[],
): Promise<FeedbackClusters | null> {
  if (items.length === 0) return { themes: [], itemSentiments: [] };
  let model: LanguageModel;
  try {
    model = await resolveModel(orgId);
  } catch {
    return null;
  }
  const { object } = await generateObject({
    model,
    schema: clusterSchema,
    prompt: `Cluster these customer feedback items into 2-8 themes. Each theme gets a label, a one-sentence summary, and a sentiment. Also return a sentiment for every item (same order). Dedupe near-identical feedback into the same theme.\n\nItems:\n${items
      .map((t, i) => `[${i}] ${t}`)
      .join("\n")}`,
  });
  return object;
}

// Gap 5: Post-launch evaluation. Streams a structured verdict report by
// comparing the spec's goals against real analytics data (from PostHog MCP or
// any other tool that can provide a string payload). Grounded in Context Graph.
// Prompt structure: Summary verdict → Success metrics check → Unexpected signals → Recommendations.

export async function generateEvaluation(
  orgId: string,
  specTitle: string,
  specBody: string,
  analyticsData: string,
) {
  const model = await resolveModel(orgId);
  const ctx = await contextBlock(orgId, `${specTitle} ${specBody}`);

  return streamText({
    model,
    prompt: `You are a senior PM writing a post-launch evaluation for a shipped feature.
Be direct. Lead with the verdict. No hedge words.${ctx}

## Feature being evaluated
**${specTitle}**

${specBody || "(no spec body)"}

## Analytics data
${analyticsData}

---

Write the evaluation in markdown with exactly these sections:
1. **Verdict** — one sentence: did it work?
2. **Success metrics check** — cite specific numbers from the analytics data against the spec's goals. Table format if possible.
3. **Unexpected signals** — what did the data reveal that wasn't in the plan?
4. **Recommendations** — 2-4 specific next actions (PM/Eng/Design owners).`,
  });
}

// Gap 4: Opportunity ranking narratives. Accepts a pre-scored opportunity list
// and returns one-sentence strategic narrative per item, grounded in Context Graph.
// Returns null when no provider key — the route degrades gracefully.

export type OpportunityInput = {
  label: string;
  summary: string;
  score: number;
  sentiment: string;
  size: number;
  hasSpec: boolean;
};

export async function generateOpportunityInsights(
  orgId: string,
  opportunities: OpportunityInput[],
): Promise<string[] | null> {
  let model: LanguageModel;
  try {
    model = await resolveModel(orgId);
  } catch {
    return null;
  }
  const ctx = await contextBlock(
    orgId,
    opportunities.map((o) => `${o.label}: ${o.summary}`).join(". "),
  );
  const listText = opportunities
    .map((o, i) => `[${i}] ${o.label} (score ${o.score}, ${o.sentiment}, ${o.size} items${o.hasSpec ? ", has Spec" : ""})`)
    .join("\n");
  const { object } = await generateObject({
    model,
    schema: z.object({
      narratives: z
        .array(z.string())
        .describe(
          "One strategic sentence per opportunity, in the same order as the input list. Direct, no hedge words, grounded in the org's context.",
        ),
    }),
    prompt: `You are a senior PM. For each opportunity below, write ONE sentence explaining its strategic importance to this org. Use the org context to be specific — cite goals, signals, or gaps. No generic advice.${ctx}\n\nOpportunities:\n${listText}`,
  });
  return object.narratives;
}

// Gap 3: Voice-of-Customer report. Streams a structured markdown artifact from
// clustered themes + representative quotes. Structured:
//   1. Executive Overview (2-3 sentences)
//   2. Ranked Themes (verbatim quotes per theme)
//   3. Gaps (themes with no linked Spec)
//   4. Recommendations (3-5 prioritized action items)
//
// Grounded via contextBlock() so recommendations are aware of existing roadmap.
// Returns a streamText result — caller handles SSE emission.

export type VocThemeInput = {
  label: string;
  summary: string;
  size: number;
  sentiment: string;
  hasSpec: boolean;
  quotes: string[];
};

export async function generateVocReport(
  orgId: string,
  themes: VocThemeInput[],
) {
  const model = await resolveModel(orgId);

  const themeBlocks = themes
    .map(
      (t, i) =>
        `### ${i + 1}. ${t.label} (${t.size} items, ${t.sentiment}${t.hasSpec ? ", has Spec" : ", no Spec yet"})\n` +
        `${t.summary}\n` +
        (t.quotes.length > 0
          ? t.quotes.map((q) => `> "${q}"`).join("\n")
          : ""),
    )
    .join("\n\n");

  const gaps = themes.filter((t) => !t.hasSpec);
  const gapBlock =
    gaps.length > 0
      ? gaps.map((t) => `- **${t.label}**: ${t.summary} (${t.size} items)`).join("\n")
      : "All themes have an associated Spec.";

  const ctx = await contextBlock(orgId, themes.map((t) => t.label + " " + t.summary).join(". "));

  return streamText({
    model,
    prompt: `You are a senior product manager writing a Voice-of-Customer report for the product team.
Generate a concise, opinionated report in markdown.${ctx}

Structure:
1. **Executive Overview** — 2-3 sentences: what do customers want most and what's the single biggest risk?
2. **Ranked Themes** — paste each theme block below, add one sentence of strategic context per theme.
3. **Gaps** — themes without a Spec. For each, explain the cost of inaction.
4. **Recommendations** — 3-5 prioritized action items, each with an owner hint (PM/Eng/Design).

Rules:
- Lead with insight, not methodology.
- Use verbatim customer quotes where provided — they are the evidence.
- Be direct. No hedge words.

---

## Themes (${themes.length} total)

${themeBlocks}

## Themes without a Spec (${gaps.length})

${gapBlock}`,
  });
}
