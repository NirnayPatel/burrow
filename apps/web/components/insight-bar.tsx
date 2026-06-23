"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { InsightChip } from "./insight-chip";
import { ThinkingIndicator } from "./thinking-indicator";
import styles from "./insight-bar.module.css";

// A calm strip of Context-Graph insights for any surface (roadmap, backlog).
// Burrow is AI-native: the signals that should inform a decision are present
// where the decision is made, not buried in a separate panel. Fetches lazily,
// shows a quiet thinking cue while the model works, and renders NOTHING when
// there's no key or nothing worth saying — it never nags or holds empty space.
type SurfaceInsight = { text: string; variant: "neutral" | "attention" };

export function InsightBar({ surface, label = "Insights" }: { surface: string; label?: string }) {
  const [state, setState] = useState<"loading" | "done">("loading");
  const [insights, setInsights] = useState<SurfaceInsight[]>([]);

  useEffect(() => {
    let live = true;
    api<{ insights: { insights: SurfaceInsight[] } | null }>(`/api/insights/${surface}`)
      .then((d) => {
        if (!live) return;
        setInsights(d.insights?.insights ?? []);
        setState("done");
      })
      .catch(() => {
        if (live) setState("done"); // degrade silently — insights are a bonus
      });
    return () => {
      live = false;
    };
  }, [surface]);

  // Quiet while loading; gone entirely if there's nothing to offer.
  if (state === "loading") {
    return (
      <div className={styles.bar} aria-busy="true">
        <ThinkingIndicator label={`Reading your ${surface}`} />
      </div>
    );
  }
  if (insights.length === 0) return null;

  return (
    <div className={styles.bar} role="region" aria-label={label}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <div className={styles.chips}>
        {insights.map((ins, i) => (
          <InsightChip key={i} variant={ins.variant}>
            {ins.text}
          </InsightChip>
        ))}
      </div>
    </div>
  );
}
