"use client";

import { useState } from "react";
import styles from "./suggestion-chip.module.css";

// Like InsightChip but ACTIONABLE: one click does the thing (11-DESIGN §5).
// accent-subtle, spark, a verb action + dismiss.
export function SuggestionChip({
  children,
  actionLabel,
  onAct,
  onDismiss,
}: {
  children: React.ReactNode;
  actionLabel: string;
  onAct: () => void | Promise<void>;
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;

  async function act() {
    setBusy(true);
    try {
      await onAct();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.chip}>
      <span className={styles.spark} aria-hidden="true">
        ✦
      </span>
      <span className={styles.text}>{children}</span>
      <button className={styles.act} onClick={act} disabled={busy}>
        {busy ? "…" : actionLabel}
      </button>
      {onDismiss && (
        <button
          className={styles.dismiss}
          onClick={() => {
            setGone(true);
            onDismiss();
          }}
          aria-label="Dismiss suggestion"
        >
          ×
        </button>
      )}
    </div>
  );
}
