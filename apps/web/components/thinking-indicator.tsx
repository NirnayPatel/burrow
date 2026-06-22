import styles from "./thinking-indicator.module.css";

// Three accent dots pulsing at the thinking cadence. Replaced by content as it
// streams; never outlives real work (11-DESIGN §5). Reduced-motion → label.
export function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <span className={styles.wrap} role="status" aria-label={label}>
      <span className={styles.fallback}>{label}…</span>
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}
