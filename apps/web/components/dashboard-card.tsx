import styles from "./dashboard-card.module.css";

// Home-only card surface (11-DESIGN §5). Surface + border, radius-lg, 24px pad,
// title text-md/600 + optional count, shadow-sm on hover only.
export function DashboardCard({
  title,
  count,
  children,
  tour,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  tour?: string;
}) {
  return (
    <section className={styles.card} data-tour={tour}>
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={styles.count}>{count}</span>
        )}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
