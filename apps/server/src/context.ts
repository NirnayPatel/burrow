import { createHash } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { eq, and, desc } from "drizzle-orm";
import {
  providerKeys,
  contextDocs,
  contextChunks,
  graphIndexState,
  specs,
  breakdowns,
  tasks,
  signoffs,
} from "@burrow/core";
import { db } from "./db.js";
import { decryptSecret } from "./crypto.js";

type GraphEntity = "context_doc" | "spec" | "breakdown" | "signoff";

// Retrieval layer for Context (13-CONTEXT-SPEC §3). Embeddings are stored as a
// float[] and scored with app-side cosine, so this runs on vanilla Postgres /
// embedded-postgres — no pgvector required. pgvector is a later drop-in behind
// this same interface.

export type Retrieved = {
  text: string;
  docTitle: string;
  score: number;
  entityType?: string;
  entityId?: string;
};

const ENTITY_LABEL: Record<string, string> = {
  context_doc: "Context",
  spec: "Spec",
  breakdown: "Breakdown",
  signoff: "Sign-off",
};

type Embedder = { model: ReturnType<ReturnType<typeof createOpenAI>["embedding"]>; name: string };

// Embeddings need an embedding-capable provider. Anthropic has none, so we look
// for openai (cloud) or ollama (local, openai-compatible). null → no embeddings,
// callers degrade to full-context concat.
async function resolveEmbedder(orgId: string): Promise<Embedder | null> {
  const keys = await db.select().from(providerKeys).where(eq(providerKeys.orgId, orgId));
  const openai = keys.find((k) => k.provider === "openai");
  if (openai) {
    const p = createOpenAI({ apiKey: decryptSecret(openai.keyEncrypted) });
    return { model: p.embedding("text-embedding-3-small"), name: "text-embedding-3-small" };
  }
  const ollama = keys.find((k) => k.provider === "ollama");
  if (ollama) {
    const base = decryptSecret(ollama.keyEncrypted).replace(/\/$/, "");
    const p = createOpenAI({ baseURL: `${base}/v1`, apiKey: "ollama" });
    return { model: p.embedding("nomic-embed-text"), name: "nomic-embed-text" };
  }
  return null;
}

export async function embedTexts(
  orgId: string,
  texts: string[],
): Promise<{ vectors: number[][]; model: string } | null> {
  if (texts.length === 0) return { vectors: [], model: "none" };
  const e = await resolveEmbedder(orgId);
  if (!e) return null;
  const { embeddings } = await embedMany({ model: e.model, values: texts });
  return { vectors: embeddings, model: e.name };
}

// ~800 tokens ≈ 2400 chars; pack paragraphs with a small overlap.
function chunkText(text: string, target = 2400, overlap = 300): string[] {
  const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf + "\n\n" + p).length > target) {
      chunks.push(buf);
      buf = buf.slice(-overlap) + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : text ? [text] : [];
}

// Generic entity indexer (Context Graph #17). Chunks + embeds any entity's text
// into the unified store, keyed by (entityType, entityId). Idempotent via a
// content hash in graph_index_state — unchanged text is skipped.
export async function indexEntity(
  orgId: string,
  entityType: GraphEntity,
  entityId: string,
  text: string,
  docId?: string,
): Promise<"indexed" | "skipped" | "no_key"> {
  const hash = createHash("sha256").update(text).digest("hex");
  const [state] = await db
    .select()
    .from(graphIndexState)
    .where(
      and(
        eq(graphIndexState.orgId, orgId),
        eq(graphIndexState.entityType, entityType),
        eq(graphIndexState.entityId, entityId),
      ),
    );
  if (state && state.hash === hash) return "skipped";

  const chunks = chunkText(text);
  const res = await embedTexts(orgId, chunks);
  // Replace this entity's chunks
  await db
    .delete(contextChunks)
    .where(and(eq(contextChunks.entityType, entityType), eq(contextChunks.entityId, entityId)));
  if (!res) return "no_key";
  for (let i = 0; i < chunks.length; i++) {
    await db.insert(contextChunks).values({
      docId: docId ?? null,
      orgId,
      entityType,
      entityId,
      ord: i,
      text: chunks[i],
      embedding: res.vectors[i],
      model: res.model,
    });
  }
  await db
    .insert(graphIndexState)
    .values({ orgId, entityType, entityId, hash, model: res.model })
    .onConflictDoUpdate({
      target: [graphIndexState.orgId, graphIndexState.entityType, graphIndexState.entityId],
      set: { hash, model: res.model, indexedAt: new Date() },
    });
  return "indexed";
}

export async function reembedDoc(orgId: string, docId: string): Promise<void> {
  const [doc] = await db.select().from(contextDocs).where(eq(contextDocs.id, docId));
  if (!doc) return;
  const result = await indexEntity(orgId, "context_doc", docId, doc.bodyText, docId);
  await db
    .update(contextDocs)
    .set({ embedded: result === "indexed", updatedAt: new Date() })
    .where(eq(contextDocs.id, docId));
}

// Index the whole workspace into the Graph: Context docs, Spec prose, Breakdown
// task text, and Sign-off comments. Skips unchanged entities (hash). Returns a
// count summary. Hook this off the events feed for "live" indexing later.
export async function reindexWorkspace(orgId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = { context_doc: 0, spec: 0, breakdown: 0, signoff: 0 };
  const { specText } = await import("./ai.js");

  const docs = await db.select().from(contextDocs).where(eq(contextDocs.orgId, orgId));
  for (const d of docs) if ((await indexEntity(orgId, "context_doc", d.id, d.bodyText, d.id)) === "indexed") counts.context_doc++;

  const specRows = await db.select().from(specs).where(eq(specs.orgId, orgId));
  for (const s of specRows) {
    const prose = await specText(s.ydocId);
    if (prose.length >= 20 && (await indexEntity(orgId, "spec", s.id, `${s.title}\n${prose}`)) === "indexed") counts.spec++;
    const [bk] = await db.select().from(breakdowns).where(eq(breakdowns.specId, s.id)).orderBy(desc(breakdowns.generation)).limit(1);
    if (bk) {
      const taskRows = await db.select().from(tasks).where(eq(tasks.breakdownId, bk.id));
      const bkText = taskRows.map((t) => `${t.displayId} ${t.title}: ${t.description ?? ""}`).join("\n");
      if (bkText.length >= 20 && (await indexEntity(orgId, "breakdown", bk.id, bkText)) === "indexed") counts.breakdown++;
    }
  }

  const soRows = await db.select().from(signoffs); // signoffs link to org via spec
  const orgSpecIds = new Set(specRows.map((s) => s.id));
  for (const so of soRows) {
    if (!so.comment || !orgSpecIds.has(so.specId)) continue;
    if ((await indexEntity(orgId, "signoff", so.id, so.comment)) === "indexed") counts.signoff++;
  }
  return counts;
}

// --- Live, per-entity indexing (hooked off the events log + collab store) ---
// Each is best-effort: indexEntity is a no-op without an embedding key, and
// callers wrap these so an index failure never breaks the triggering action.

export async function indexSpec(orgId: string, specId: string): Promise<void> {
  const [spec] = await db.select().from(specs).where(eq(specs.id, specId));
  if (!spec || spec.orgId !== orgId) return;
  const { specText } = await import("./ai.js");
  const prose = await specText(spec.ydocId);
  if (prose.length < 20) return;
  await indexEntity(orgId, "spec", spec.id, `${spec.title}\n${prose}`);
}

export async function indexBreakdownById(orgId: string, breakdownId: string): Promise<void> {
  const taskRows = await db.select().from(tasks).where(eq(tasks.breakdownId, breakdownId));
  if (!taskRows.length) return;
  const text = taskRows.map((t) => `${t.displayId} ${t.title}: ${t.description ?? ""}`).join("\n");
  await indexEntity(orgId, "breakdown", breakdownId, text);
}

export async function indexLatestBreakdownForSpec(orgId: string, specId: string): Promise<void> {
  const [bk] = await db
    .select()
    .from(breakdowns)
    .where(eq(breakdowns.specId, specId))
    .orderBy(desc(breakdowns.generation))
    .limit(1);
  if (bk) await indexBreakdownById(orgId, bk.id);
}

export async function indexSignoffById(orgId: string, signoffId: string): Promise<void> {
  const [so] = await db.select().from(signoffs).where(eq(signoffs.id, signoffId));
  if (!so || !so.comment) return;
  await indexEntity(orgId, "signoff", so.id, so.comment);
}

// Collab server calls this (via the internal reindex endpoint) when a Spec's
// prose is persisted — the highest-value "live" signal, since edits don't emit
// an activity event.
export async function reindexSpecByYdoc(ydocId: string): Promise<boolean> {
  const [spec] = await db.select().from(specs).where(eq(specs.ydocId, ydocId));
  if (!spec) return false;
  await indexSpec(spec.orgId, spec.id);
  return true;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// null = org has no embedding-capable key (caller degrades to full concat).
export async function retrieveContext(
  orgId: string,
  query: string,
  k = 6,
): Promise<Retrieved[] | null> {
  const e = await embedTexts(orgId, [query]);
  if (!e) return null;
  const qv = e.vectors[0];
  const chunks = await db.select().from(contextChunks).where(eq(contextChunks.orgId, orgId));
  if (chunks.length === 0) return [];
  const docs = await db.select().from(contextDocs).where(eq(contextDocs.orgId, orgId));
  const titleById = new Map(docs.map((d) => [d.id, d.title]));
  const scored = chunks
    .filter((c) => c.embedding)
    .map((c) => ({
      text: c.text,
      // Citation label: a Context doc keeps its title; other entities get a
      // type label so the source is legible in prompts/answers.
      docTitle:
        c.entityType === "context_doc"
          ? titleById.get(c.docId ?? "") ?? "Context"
          : ENTITY_LABEL[c.entityType] ?? c.entityType,
      entityType: c.entityType,
      entityId: c.entityId,
      score: cosine(qv, c.embedding as number[]),
    }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// The injection helper AI features call. Retrieves top-k; if the org has no
// embedding key, degrades to concatenating all Context docs (today's behavior).
export async function contextBlock(orgId: string, query: string): Promise<string> {
  const hits = await retrieveContext(orgId, query, 6);
  if (hits === null) {
    const docs = await db.select().from(contextDocs).where(eq(contextDocs.orgId, orgId));
    if (!docs.length) return "";
    return (
      "\n\nOrg context:\n" + docs.map((d) => `## ${d.title}\n${d.bodyText}`).join("\n\n")
    );
  }
  if (!hits.length) return "";
  return (
    "\n\nRelevant org context:\n" +
    hits.map((h) => `## ${h.docTitle}\n${h.text}`).join("\n\n")
  );
}
