"use client";

import { useState } from "react";
import styles from "./insight-chip.module.css";

// Quiet offer, not an alarm. Neutral = informational; attention = amber (like a
// Flag, never red — 11-DESIGN §P5). Dismissible.
export function InsightChip({
  children,
  variant = "neutral",
  dismissible = true,
}: {
  children: React.ReactNode;
  variant?: "neutral" | "attention";
  dismissible?: boolean;
}) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <span className={`${styles.chip} ${styles[variant]}`}>
      <span className={styles.icon} aria-hidden="true">
        {variant === "attention" ? "⚑" : "✦"}
      </span>
      <span className={styles.text}>{children}</span>
      {dismissible && (
        <button className={styles.dismiss} onClick={() => setGone(true)} aria-label="Dismiss">
          ×
        </button>
      )}
    </span>
  );
}
