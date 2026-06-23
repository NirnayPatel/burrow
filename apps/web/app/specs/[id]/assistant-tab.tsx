"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { AiSurface } from "../../../components/ai-surface";
import { ThinkingIndicator } from "../../../components/thinking-indicator";
import { InsightChip } from "../../../components/insight-chip";
import { Button } from "../../../components/button";
import { Input } from "../../../components/input";
import { streamAssist, type AssistMode } from "./assist";
import styles from "./spec.module.css";

type Insights = {
  summary: string;
  gaps: string[];
  openQuestions: number;
} | null;

const MODES: { mode: AssistMode; label: string }[] = [
  { mode: "draft", label: "Draft" },
  { mode: "expand", label: "Expand" },
  { mode: "critique", label: "Critique" },
  { mode: "acceptance", label: "Acceptance" },
];

// The Assistant tab (11-DESIGN §3b-iii + §3d): AI summary + gaps from /insights
// up top (degrades silently when null), then an ask-AI surface that streams a
// chosen mode and offers "Insert into Spec".
export function AssistantTab({
  specId,
  onInsight,
  onInsert,
  focusSignal = 0,
}: {
  specId: string;
  // Reports how many gaps the AI surfaced so the tab header can show a count.
  onInsight?: (count: number) => void;
  onInsert: (markdown: string) => void | Promise<void>;
  // Bumped by page.tsx when the Assistant tab is opened — focuses the Ask AI
  // input so the author can type immediately (UX review #13).
  focusSignal?: number;
}) {
  const [insights, setInsights] = useState<Insights>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [inserted, setInserted] = useState(false);
  const askRowRef = useRef<HTMLDivElement>(null);

  // Focus the Ask AI input when the Assistant tab is opened (UX review #13).
  // Skips the initial render (signal 0) so we never steal focus on load; never
  // fires while a request is streaming. Input doesn't forward a ref, so we
  // reach its underlying <input> through the row container.
  useEffect(() => {
    if (focusSignal > 0 && !busy) {
      askRowRef.current?.querySelector("input")?.focus();
    }
    // Fire only on a fresh focus signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  useEffect(() => {
    api<{ insights: Insights }>(`/api/specs/${specId}/insights`)
      .then((r) => {
        setInsights(r.insights);
        onInsight?.(r.insights?.gaps.length ?? 0);
      })
      .catch(() => {});
    // onInsight intentionally omitted — a fresh closure each render shouldn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  async function ask(mode: AssistMode) {
    if (busy) return;
    if (mode === "draft" && !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setNoKey(false);
    setInserted(false);
    setAnswer("");
    let acc = "";
    const result = await streamAssist(specId, mode, prompt, (chunk) => {
      acc += chunk;
      setAnswer(acc);
    });
    if (!result.ok) {
      setNoKey(result.noKey);
      setError(result.noKey ? "No AI provider key configured yet." : result.message);
    }
    setBusy(false);
  }

  async function insert() {
    await onInsert(answer);
    setInserted(true);
  }

  return (
    <div className={styles.assistant}>
      {/* Passive intelligence: AI summary + gaps. Silent when no key. */}
      {insights && (
        <AiSurface className={styles.assistantSummary}>
          <div>{insights.summary}</div>
          {insights.openQuestions > 0 && (
            <div className={styles.assistantMeta}>
              {insights.openQuestions} open question
              {insights.openQuestions === 1 ? "" : "s"}
            </div>
          )}
          {insights.gaps.length > 0 && (
            <div className={styles.chipRow}>
              {insights.gaps.map((gap, i) => (
                <InsightChip key={i} variant="attention">
                  {gap}
                </InsightChip>
              ))}
            </div>
          )}
        </AiSurface>
      )}

      {/* Ask AI */}
      <div className={styles.askRow} ref={askRowRef}>
        <Input
          placeholder="Ask AI to draft, or pick an action below"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask("draft")}
          aria-label="Ask AI about this spec"
          disabled={busy}
        />
        <div className={styles.askActions}>
          {/* Four peer actions, not a CTA + also-rans. Each fires immediately
              and none is "selected", so they carry equal weight. The default
              draft path lives in the input above (Enter), per its placeholder. */}
          {MODES.map(({ mode, label }) => (
            <Button
              key={mode}
              variant="secondary"
              onClick={() => ask(mode)}
              disabled={busy}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {busy && answer === "" && <ThinkingIndicator label="Thinking" />}

      {answer && (
        <AiSurface
          action={
            !busy ? (
              <Button variant="ghost" onClick={insert} disabled={inserted}>
                {inserted ? "Inserted ✓" : "Insert into Spec"}
              </Button>
            ) : undefined
          }
        >
          {answer}
        </AiSurface>
      )}

      {error && (
        <p className={styles.error}>
          {error}{" "}
          {noKey && <Link href="/settings">Add one in Settings →</Link>}
        </p>
      )}

      {!insights && !answer && !busy && !error && (
        <p className={styles.assistantHint}>
          Ask AI to draft a section, expand what you have, critique the Spec, or
          generate acceptance criteria. Answers stream here and can be inserted
          into the doc.
        </p>
      )}
    </div>
  );
}
