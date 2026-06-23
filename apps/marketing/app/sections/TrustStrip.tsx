import styles from "./TrustStrip.module.css";

const items = [
  "Open source",
  "Self-host",
  "Your keys",
  "No telemetry",
  "No hosted models",
];

export function TrustStrip() {
  return (
    <section className={styles.section} aria-label="Product principles">
      <div className={`${styles.inner} container`}>
        <ul className={styles.list} role="list">
          {items.map((item) => (
            <li key={item} className={styles.item}>
              <span className={styles.dot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

