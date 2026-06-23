import styles from "./ForestBand.module.css";

export function ForestBand() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <span className={styles.eyebrow}>One source of truth</span>
        <h2 className={styles.headline}>
          Humans and agents, working from the{" "}
          <span className={styles.accent}>same context.</span>
        </h2>
        <p className={styles.body}>
          Most tools make you choose: a polished surface you don&apos;t own, or
          plain files your agents can&apos;t reason about. Burrow refuses the
          trade. The plan, the work, the decisions, and the agents all live on
          one surface — open source, on your infrastructure, on your keys.
        </p>
        <div className={styles.ctas}>
          <a className={styles.ctaPrimary} href="https://github.com/NirnayPatel/burrow">
            Get started
          </a>
          <a className={styles.ctaSecondary} href="#how">
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

