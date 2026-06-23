import { Button } from "../components/Button";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <p className={`${styles.eyebrow} ${styles.reveal}`} style={{ "--d": "0ms" } as React.CSSProperties}>
          The agentic product workspace
        </p>

        <h1 className={`${styles.headline} ${styles.reveal}`} style={{ "--d": "60ms" } as React.CSSProperties}>
          One surface for the whole product org.{" "}
          <span className={styles.accent}>Specs to shipped.</span>
        </h1>

        <p className={`${styles.subhead} ${styles.reveal}`} style={{ "--d": "120ms" } as React.CSSProperties}>
          Context, specs, roadmap, goals, customer feedback, market signals, and
          decisions — written together in real time and grounded in one Context
          Graph. Then any coding agent ships the work over MCP. Open source,
          self-hosted, on your own keys.
        </p>

        <div className={`${styles.ctas} ${styles.reveal}`} style={{ "--d": "180ms" } as React.CSSProperties}>
          <Button variant="primary" href="/demo/">
            Try the live demo
          </Button>
          <Button variant="secondary" href="https://github.com/NirnayPatel/burrow" external>
            Get started
          </Button>
        </div>

        {/* Product UI mock — Spec with live presence + streaming AI breakdown */}
        <div
          className={`${styles.visual} ${styles.reveal}`}
          style={{ "--d": "260ms" } as React.CSSProperties}
          aria-hidden="true"
        >
          <div className={styles.visualInner}>
            {/* Spec editor panel */}
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                  <span className={styles.specId}>SPEC-12</span>
                  <span className={styles.specName}>Onboarding redesign</span>
                </div>
                <div className={styles.presence}>
                  <span className={styles.avatar} data-color="1" title="Maya">M</span>
                  <span className={styles.avatar} data-color="2" title="Raj">R</span>
                </div>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.docBlock}>
                  <p className={styles.docH1}>Onboarding redesign</p>
                  <p className={styles.docText}>
                    Reduce time-to-value for new users by simplifying the first-run
                    flow to three steps.
                  </p>
                  <p className={styles.docText}>
                    <strong>Goal:</strong> &ge;60% of signups complete onboarding
                    within 10 minutes.
                  </p>
                  <span className={styles.cursor} data-color="2">Raj</span>
                </div>
              </div>
            </div>

            {/* Breakdown streaming panel */}
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                  <span className={styles.panelLabel}>AI Breakdown</span>
                  <span className={styles.streamBadge}>streaming</span>
                </div>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.taskCard}>
                  <span className={styles.taskId}>TASK-1</span>
                  <p className={styles.taskTitle}>Audit current onboarding flow</p>
                  <p className={styles.taskAC}>AC: Document each step, drop-off point, and time on task.</p>
                </div>
                <div className={styles.taskCard}>
                  <span className={styles.taskId}>TASK-2</span>
                  <p className={styles.taskTitle}>Design three-step flow</p>
                  <p className={styles.taskAC}>AC: Figma frames for each step, reviewed by Maya.</p>
                </div>
                <div className={`${styles.taskCard} ${styles.taskStreaming}`}>
                  <span className={styles.taskId}>TASK-3</span>
                  <p className={styles.taskTitle}>
                    Implement new flow in Next.js<span className={styles.cursor2} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
