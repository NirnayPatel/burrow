"use client";

import { useState } from "react";
import Link from "next/link";
import { AiSurface } from "../../../components/ai-surface";
import { ThinkingIndicator } from "../../../components/thinking-indicator";
import { Button } from "../../../components/button";
import { streamAssist } from "./assist";
import styles from "./spec.module.css";

// The empty-editor invitation (11-DESIGN §3b-ii): consumes the dead whitespace
// with intelligence and teaches "/" for AI. Streams a drafted Spec straight
// into the doc via onInsert, then vanishes once content exists.
export function AiStarter({
  specId,
  onInsert,
}: {
  specId: string;
  onInsert: (markdown: string) => void | Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);

  async function draft() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNoKey(false);
    let acc = "";
    const result = await streamAssist(specId, "draft", prompt, (chunk) => {
      acc += chunk;
    });
    if (!result.ok) {
      setNoKey(result.noKey);
      setError(
        result.noKey
          ? "No AI provider key configured yet."
          : result.message,
      );
      setBusy(false);
      return;
    }
    await onInsert(acc);
    setBusy(false);
    setPrompt("");
  }

  return (
    <div className={styles.starter}>
      <AiSurface
        action={
          <Button variant="primary" onClick={draft} busy={busy}>
            {busy ? "Drafting…" : "Draft"}
          </Button>
        }
      >
        <div className={styles.starterHead}>Start with AI</div>
        <p className={styles.starterCopy}>
          Describe the feature in a sentence and we&rsquo;ll draft a Spec you can
          edit. Or start writing — press &ldquo;/&rdquo; for AI any time.
        </p>
        <input
          className={styles.starterInput}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft()}
          placeholder="e.g. A billing rework that lets teams switch plans mid-cycle"
          aria-label="Describe the feature to draft"
          disabled={busy}
        />
        {busy && <ThinkingIndicator label="Drafting" />}
        {error && (
          <p className={styles.starterError}>
            {error}{" "}
            {noKey && <Link href="/settings">Add one in Settings →</Link>}
          </p>
        )}
      </AiSurface>
    </div>
  );
}
