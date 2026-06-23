import styles from "./Logo.module.css";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Show just the mark, no wordmark */
  markOnly?: boolean;
}

export function Logo({ size = "md", markOnly = false }: LogoProps) {
  return (
    <span className={`${styles.lockup} ${styles[size]}`} aria-label="Burrow">
      {/* Option A — Den arch (recommended per 07-BRAND.md §2.2) */}
      <svg
        className={styles.mark}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        {/* ground baseline */}
        <rect x="18" y="96" width="84" height="6" rx="3" className={styles.markOuter} />
        {/* outer arch: the burrow mouth */}
        <path
          d="M24 96 V60 a36 36 0 0 1 72 0 V96"
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={styles.markOuter}
        />
        {/* inner arch: the tunnel, in Burrow green */}
        <path
          d="M46 96 V62 a14 14 0 0 1 28 0 V96"
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={styles.markInner}
        />
      </svg>
      {!markOnly && (
        <span className={styles.wordmark}>burrow</span>
      )}
    </span>
  );
}

