import styles from "./task-card.module.css";

// animateIn applies the one sanctioned entrance animation (fade-rise) —
// only for tasks streaming in live from the model, never for tasks loaded
// from the API or anything another user caused (05-DESIGN §4).
export function TaskCard({
  title,
  displayId,
  priority,
  description,
  acceptanceCriteria,
  animateIn = false,
}: {
  title: string;
  displayId: string;
  priority: number;
  description?: string | null;
  acceptanceCriteria?: string[] | null;
  animateIn?: boolean;
}) {
  return (
    <li className={`${styles.card} ${animateIn ? styles.enter : ""}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.displayId}>{displayId}</span>
        <span className={styles.priority}>P{priority}</span>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {acceptanceCriteria && acceptanceCriteria.length > 0 && (
        <ul className={styles.criteria}>
          {acceptanceCriteria.map((a, i) => (
            <li key={i} className={styles.criterion}>
              {a}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
