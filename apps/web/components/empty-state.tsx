import styles from "./empty-state.module.css";

// One icon, one sentence, one action — never a paragraph (05-DESIGN §5).
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon?: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className={styles.message}>{message}</p>
      {action}
    </div>
  );
}
