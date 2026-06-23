"use client";

import { useEffect, useRef } from "react";
import { Nav } from "../sections/Nav";
import { Footer } from "../sections/Footer";
import { Button } from "../components/Button";
import styles from "./persona.module.css";

/* ──────────────────────────────────────────────────────────────────────────
 * PersonaPage — one props-driven layout for all four role pages.
 * Sections: Nav → hero → problem → value-prop grid → forest band →
 * outcomes strip → cross-links → final CTA → Footer.
 * Fade-up reveals use IntersectionObserver and self-disable under
 * prefers-reduced-motion (handled in CSS — the class only adds a transition).
 * ──────────────────────────────────────────────────────────────────────── */

export interface ValueProp {
  feature: string;
  title: string;
  body: string;
}

export interface Outcome {
  stat: string;
  label: string;
}

export interface CrossLink {
  href: string;
  persona: string;
  headline: string;
}

export interface PersonaContent {
  /* hero */
  persona: string; // "Product Managers"
  eyebrow: string; // "For Product Managers"
  headline: string;
  headlineAccent: string; // trailing accent fragment of the headline
  subhead: string;
  /* problem today */
  problemTitle: string;
  problemBody: string;
  /* value props */
  valueLabel: string;
  valueTitle: string;
  valueProps: ValueProp[];
  /* forest band — persona-fit statement */
  fitLabel: string;
  fitStatement: string;
  fitSupport: string;
  /* outcomes */
  outcomesTitle: string;
  outcomes: Outcome[];
  /* accuracy note (optional, amber-never-red) */
  honestNote?: string;
  /* cross-links to the other three personas */
  crossLinks: CrossLink[];
  /* final CTA */
  ctaTitle: string;
  ctaSub: string;
}

/* Reveal wrapper — adds .isVisible once the element scrolls into view. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Honor reduced motion: reveal immediately, never observe.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.classList.add(styles.isVisible);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add(styles.isVisible);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${className ?? ""}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export function PersonaPage({ content }: { content: PersonaContent }) {
  return (
    <>
      <Nav />
      <main>
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={`${styles.heroInner} container`}>
            <Reveal>
              <p className={styles.eyebrow}>{content.eyebrow}</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className={styles.headline}>
                {content.headline}{" "}
                <span className={styles.accent}>{content.headlineAccent}</span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.subhead}>{content.subhead}</p>
            </Reveal>
            <Reveal delay={180}>
              <div className={styles.ctas}>
                <Button variant="primary" href="https://github.com/NirnayPatel/burrow">
                  Get started
                </Button>
                <Button variant="secondary" href="/#features">
                  See the product
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── The problem today ─────────────────────────────────── */}
        <section className={`${styles.band} ${styles.bandSunken}`}>
          <div className="container">
            <Reveal>
              <div className={styles.problem}>
                <span className={styles.label}>The problem today</span>
                <h2 className={styles.problemTitle}>{content.problemTitle}</h2>
                <p className={styles.problemBody}>{content.problemBody}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Value-prop grid ───────────────────────────────────── */}
        <section className={styles.band}>
          <div className="container">
            <Reveal>
              <div className={styles.sectionHeader}>
                <span className={styles.label}>{content.valueLabel}</span>
                <h2 className={styles.sectionTitle}>{content.valueTitle}</h2>
              </div>
            </Reveal>
            <div className={styles.propGrid}>
              {content.valueProps.map((p, i) => (
                <Reveal key={p.title} delay={(i % 3) * 60}>
                  <article className={styles.propCard}>
                    <span className={styles.propFeature}>{p.feature}</span>
                    <h3 className={styles.propTitle}>{p.title}</h3>
                    <p className={styles.propBody}>{p.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            {content.honestNote ? (
              <Reveal>
                <p className={styles.honestNote}>
                  <span className={styles.honestTag}>Honest about today:</span>{" "}
                  {content.honestNote}
                </p>
              </Reveal>
            ) : null}
          </div>
        </section>

        {/* ── Forest band — persona-fit statement ───────────────── */}
        <section className={styles.forest}>
          <div className={`${styles.forestInner} container`}>
            <Reveal>
              <span className={styles.forestLabel}>{content.fitLabel}</span>
            </Reveal>
            <Reveal delay={60}>
              <p className={styles.forestStatement}>{content.fitStatement}</p>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.forestSupport}>{content.fitSupport}</p>
            </Reveal>
          </div>
        </section>

        {/* ── Outcomes strip ────────────────────────────────────── */}
        <section className={`${styles.band} ${styles.bandSunken}`}>
          <div className="container">
            <Reveal>
              <div className={styles.sectionHeader}>
                <span className={styles.label}>What changes</span>
                <h2 className={styles.sectionTitle}>{content.outcomesTitle}</h2>
              </div>
            </Reveal>
            <div className={styles.outcomeGrid}>
              {content.outcomes.map((o, i) => (
                <Reveal key={o.label} delay={(i % 3) * 60}>
                  <div className={styles.outcomeCard}>
                    <span className={styles.outcomeStat}>{o.stat}</span>
                    <span className={styles.outcomeLabel}>{o.label}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Cross-links to other personas ─────────────────────── */}
        <section className={styles.band}>
          <div className="container">
            <Reveal>
              <div className={styles.sectionHeader}>
                <span className={styles.label}>Built for the whole org</span>
                <h2 className={styles.sectionTitle}>
                  Burrow fits your teammates too.
                </h2>
              </div>
            </Reveal>
            <div className={styles.crossGrid}>
              {content.crossLinks.map((c, i) => (
                <Reveal key={c.href} delay={(i % 3) * 60}>
                  <a href={c.href} className={styles.crossCard}>
                    <span className={styles.crossPersona}>{c.persona}</span>
                    <span className={styles.crossHeadline}>{c.headline}</span>
                    <span className={styles.crossArrow} aria-hidden="true">
                      →
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────── */}
        <section className={styles.cta}>
          <div className={`${styles.ctaInner} container`}>
            <Reveal>
              <h2 className={styles.ctaTitle}>{content.ctaTitle}</h2>
            </Reveal>
            <Reveal delay={60}>
              <p className={styles.ctaSub}>{content.ctaSub}</p>
            </Reveal>
            <Reveal delay={120}>
              <div className={styles.ctas}>
                <Button variant="primary" href="https://github.com/NirnayPatel/burrow">
                  Get started
                </Button>
                <Button variant="secondary" href="/solutions">
                  All solutions
                </Button>
              </div>
            </Reveal>
            <Reveal delay={160}>
              <p className={styles.ctaNote}>
                Open source. Self-hostable. Your keys, your data, no seat tax.
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

