import styles from "./OneSurface.module.css";

// Positioning section: the shared agentic surface. Framed as "six tools vs one
// surface" so it reads as a category claim, not another feature list.
const SCATTERED = [
  "Company & product context in a wiki",
  "Specs in a doc tool",
  "Roadmap & goals in a planning app",
  "Customer feedback in a spreadsheet",
  "Competitor & market notes somewhere else",
  "Decisions lost in chat threads",
  "Tickets the agents can't really read",
];

const UNIFIED = [
  { label: "Context", note: "Company & product knowledge, grounding every AI action" },
  { label: "Specs", note: "Written and decided together, in real time" },
  { label: "Roadmap & goals", note: "Now / Next / Later, tied to OKRs" },
  { label: "Feedback", note: "Customer signals, clustered into themes" },
  { label: "Market", note: "Competitors and signals, with a “so what for us”" },
  { label: "Decision logs", note: "Append-only sign-offs, pinned to versions" },
  { label: "Agent bridge", note: "Agents pull the work and ship it over MCP" },
];

export function OneSurface() {
  return (
    <section id="one-surface" className={styles.section}>
      <div className="container">
        <div className={styles.header}>
          <span className={styles.eyebrow}>One shared surface</span>
          <h2 className={styles.title}>
            Your product org runs on six tools. Burrow is{" "}
            <span className={styles.accent}>one.</span>
          </h2>
          <p className={styles.sub}>
            Context, specs, decisions, roadmap, competitor and market insight, and
            customer feedback — baked into a single agentic surface. Product,
            design, and engineering work in the same place, and so do their agents.
            No more stitching tools together or losing the thread between them.
          </p>
        </div>

        <div className={styles.contrast}>
          {/* Today */}
          <div className={`${styles.panel} ${styles.before}`}>
            <span className={styles.panelLabel}>Today</span>
            <ul className={styles.scatterList} role="list">
              {SCATTERED.map((s) => (
                <li key={s} className={styles.scatterItem}>{s}</li>
              ))}
            </ul>
            <p className={styles.panelFoot}>Context lost at every hand-off.</p>
          </div>

          {/* With Burrow */}
          <div className={`${styles.panel} ${styles.after}`}>
            <span className={styles.panelLabelAccent}>With Burrow</span>
            <ul className={styles.unifiedList} role="list">
              {UNIFIED.map((u) => (
                <li key={u.label} className={styles.unifiedItem}>
                  <span className={styles.unifiedDot} aria-hidden="true" />
                  <span>
                    <strong className={styles.unifiedLabel}>{u.label}</strong>
                    <span className={styles.unifiedNote}>{u.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.panelFootAccent}>One source of truth — humans and agents.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

