"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { AiSurface } from "../../../components/ai-surface";
import { InsightChip } from "../../../components/insight-chip";
import styles from "./spec.module.css";

type Insights = {
  summary: string;
  gaps: string[];
  openQuestions: number;
} | null;

// "State of this Spec" — the AI orientation card pinned at the top of read
// mode (UX review #6). Reuses the same GET /api/specs/:id/insights endpoint the
// Assistant + Sign-off panels read, so reviewers see one consistent summary.
// Degrades to nothing when the endpoint returns null (no provider key) — never
// an error, never a spinner that sticks around.
export function StateOfSpec({ specId }: { specId: string }) {
  const [insights, setInsights] = useState<Insights>(null);

  useEffect(() => {
    let live = true;
    api<{ insights: Insights }>(`/api/specs/${specId}/insights`)
      .then((r) => live && setInsights(r.insights))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [specId]);

  if (!insights) return null;

  return (
    <AiSurface className={styles.stateOfSpec}>
      <div className={styles.stateOfSpecLabel}>State of this Spec</div>
      <div className={styles.stateOfSpecSummary}>{insights.summary}</div>
      {insights.openQuestions > 0 && (
        <div className={styles.stateOfSpecMeta}>
          {insights.openQuestions} open question
          {insights.openQuestions === 1 ? "" : "s"}
        </div>
      )}
      {insights.gaps.length > 0 && (
        <div className={styles.chipRow}>
          {/* Gaps land as calm offers, not alarms (amber, never red). */}
          {insights.gaps.map((gap, i) => (
            <InsightChip key={i} variant="attention" dismissible={false}>
              {gap}
            </InsightChip>
          ))}
        </div>
      )}
    </AiSurface>
  );
}
