import styles from "./ai-surface.module.css";

// The one visually-distinct-but-on-palette AI surface: faint accent tint, a
// spark glyph, a 2px accent left border. Never a chat bubble (11-DESIGN §P3).
export function AiSurface({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.surface} ${className ?? ""}`}>
      <span className={styles.spark} aria-hidden="true">
        ✦
      </span>
      <div className={styles.body}>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
