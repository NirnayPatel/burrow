import { Button } from "../components/Button";
import styles from "./FinalCTA.module.css";

export function FinalCTA() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <span className={styles.eyebrow}>Get started</span>
        <h2 className={styles.title}>
          Run the loop on your own{" "}
          <span className={styles.accent}>infrastructure.</span>
        </h2>
        <p className={styles.sub}>
          <code className={styles.code}>docker compose up</code>, bring your own
          key, and have two people co-editing a spec in under 10 minutes.
        </p>

        <div className={styles.ctas}>
          <Button variant="primary" href="/demo/">
            Try the live demo
          </Button>
          <Button variant="secondary" href="https://github.com/NirnayPatel/burrow" external>
            Star on GitHub
          </Button>
        </div>

        <p className={styles.note}>
          Open source. Self-hostable. Your keys, your data, no seat tax.
        </p>
      </div>
    </section>
  );
}
