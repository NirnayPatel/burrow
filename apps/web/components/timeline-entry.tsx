import styles from "./timeline-entry.module.css";
import { VerdictBadge, type Verdict } from "./verdict-badge";

// Append-only by design — no edit or delete affordances, ever (05-DESIGN §5).
export function TimelineEntry({
  userName,
  verdict,
  versionNote,
  timestamp,
  comment,
}: {
  userName: string;
  verdict: Verdict;
  versionNote: string;
  timestamp: string;
  comment?: string | null;
}) {
  return (
    <li className={styles.entry}>
      <span className={`${styles.node} ${styles[verdict]}`} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.line}>
          <strong className={styles.name}>{userName}</strong>
          <VerdictBadge verdict={verdict} />
          <code className={styles.version}>{versionNote}</code>
          <span className={styles.time}>{timestamp}</span>
        </div>
        {comment && <div className={styles.comment}>&ldquo;{comment}&rdquo;</div>}
      </div>
    </li>
  );
}
