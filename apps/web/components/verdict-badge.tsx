import styles from "./verdict-badge.module.css";

export type Verdict = "approved" | "flagged" | "cleared";

// Flagged is amber, never red — a flag means "needs discussion", not failure
// (05-DESIGN §3). Cleared is neutral: a withdrawn verdict, not an event with
// a temperature.
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`${styles.badge} ${styles[verdict]}`}>
      {verdict === "approved" && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 6.5 5 9l4.5-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {verdict === "flagged" && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M3 10.5V1.5m0 .5h6L7.5 4 9 6H3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {verdict === "cleared" && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 6h7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {verdict}
    </span>
  );
}
