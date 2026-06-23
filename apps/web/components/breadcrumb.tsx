import Link from "next/link";
import styles from "./breadcrumb.module.css";

// A thin orientation line for detail pages (UX review #14): "Specs › SPEC-12".
// Deep links land somewhere specific — the breadcrumb says where without making
// the user hunt the nav. Last crumb is the current page (no link).
export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.bar} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className={styles.crumb}>
              {c.href && !last ? (
                <Link href={c.href} className={styles.link}>
                  {c.label}
                </Link>
              ) : (
                <span className={last ? styles.current : styles.text} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {!last && <span className={styles.sep} aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
