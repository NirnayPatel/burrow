import type { Metadata } from "next";
import { Nav } from "../sections/Nav";
import { Footer } from "../sections/Footer";
import { Button } from "../components/Button";
import { PERSONA_INDEX } from "./personas";
import styles from "./hub.module.css";

export const metadata: Metadata = {
  title: "Solutions — Burrow by role",
  description:
    "One workspace, catered to your role. Product managers, engineering teams, product ops, and product leaders each get Burrow's real features in their own language — over MCP, on your own infrastructure.",
};

export default function SolutionsPage() {
  return (
    <>
      <Nav />
      <main>
        {/* ── Hub hero ───────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={`${styles.heroInner} container`}>
            <p className={styles.eyebrow}>Solutions by role</p>
            <h1 className={styles.headline}>
              One workspace.{" "}
              <span className={styles.accent}>Catered to your role.</span>
            </h1>
            <p className={styles.subhead}>
              Burrow is the shared, AI-native surface for the whole product org.
              The features are the same; what matters changes by who you are.
              Pick your role and see Burrow in your language.
            </p>
            <div className={styles.ctas}>
              <Button variant="primary" href="https://github.com/NirnayPatel/burrow">
                Get started
              </Button>
              <Button variant="secondary" href="/#features">
                See the product
              </Button>
            </div>
          </div>
        </section>

        {/* ── Role cards ─────────────────────────────────────────── */}
        <section className={`${styles.band} ${styles.bandSunken}`}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <span className={styles.label}>Choose your role</span>
              <h2 className={styles.sectionTitle}>
                Four roles. One source of truth.
              </h2>
            </div>
            <div className={styles.grid}>
              {PERSONA_INDEX.map((p, i) => (
                <a
                  key={p.slug}
                  href={`/solutions/${p.slug}`}
                  className={styles.card}
                >
                  <span className={styles.cardNum}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.cardPersona}>{p.persona}</span>
                  <h3 className={styles.cardHeadline}>{p.headline}</h3>
                  <p className={styles.cardTagline}>{p.tagline}</p>
                  <span className={styles.cardCta} aria-hidden="true">
                    Explore →
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Unifier band ───────────────────────────────────────── */}
        <section className={styles.forest}>
          <div className={`${styles.forestInner} container`}>
            <span className={styles.forestLabel}>One surface, not four tools</span>
            <p className={styles.forestStatement}>
              The context a PM brings is the context an agent reads.
            </p>
            <p className={styles.forestSupport}>
              These aren&apos;t four products bolted together. Product,
              engineering, ops, and leadership work in one surface with one
              source of truth — and the agents read from the exact same place,
              on infrastructure you control.
            </p>
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────── */}
        <section className={styles.cta}>
          <div className={`${styles.ctaInner} container`}>
            <h2 className={styles.ctaTitle}>Put the whole org on one surface.</h2>
            <p className={styles.ctaSub}>
              <code className={styles.code}>docker compose up</code>, bring your
              own key, and have every role working from the same context and the
              same decisions — in under 10 minutes.
            </p>
            <div className={styles.ctas}>
              <Button variant="primary" href="https://github.com/NirnayPatel/burrow">
                Get started
              </Button>
              <Button variant="secondary" href="/#features">
                See the product
              </Button>
            </div>
            <p className={styles.ctaNote}>
              Open source. Self-hostable. Your keys, your data, no seat tax.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

