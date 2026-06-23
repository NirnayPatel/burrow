import styles from "./Loop.module.css";

const steps = [
  {
    number: "01",
    label: "Write",
    heading: "Write the spec, together.",
    body: "A real-time editor with live cursors and presence, built on BlockNote and Yjs. The PM writes the intent, engineers add the constraints — same document, same moment. A / slash menu and in-editor AI drafting are right there when you need them.",
  },
  {
    number: "02",
    label: "Break down",
    heading: "Break it down with AI.",
    body: "One click streams a breakdown — tasks with acceptance criteria — from your spec plus your Context Graph. Don't like it? Undo and regenerate. Runs on your own API key, never ours.",
  },
  {
    number: "03",
    label: "Ship",
    heading: "Let your agent ship it.",
    body: "Your coding agent connects over MCP, calls get_next_task with full spec context, and pushes status back as it works. Claude Code, Cursor, anything MCP-capable — and it shows up in the activity feed as a teammate.",
  },
  {
    number: "04",
    label: "Sign off",
    heading: "Sign off, on the record.",
    body: "Teammates mark each spec Approved or Flagged. Sign-offs are append-only and pinned to the exact spec version they were cast against — a clean decision log, not a buried PR comment.",
  },
];

export function Loop() {
  return (
    <section id="loop" className={styles.section}>
      {/* Secondary anchor target for the hero "See how it works" CTA */}
      <span id="how" className={styles.anchor} aria-hidden="true" />
      <div className={`${styles.inner} container`}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>How it works</span>
          <h2 className={styles.title}>
            Write &rarr; break down &rarr; ship &rarr;{" "}
            <span className={styles.accent}>sign off.</span>
          </h2>
          <p className={styles.intro}>
            Most tools own one slice of this and hand off the rest — so context
            leaks at every seam. Burrow runs the whole loop on one surface: a spec
            becomes an AI breakdown, an agent does the work, your team signs off.
            The same context — your company knowledge, the spec, the decisions —
            is carried forward at every step, for both humans and agents.
          </p>
        </div>

        <ol className={styles.steps} role="list">
          {steps.map((step) => (
            <li key={step.number} className={styles.step}>
              <div className={styles.stepMeta}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {step.number}
                </span>
                <span className={styles.stepLabel}>{step.label}</span>
              </div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepHeading}>{step.heading}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className={styles.closing}>
          Then it runs again — faster each time, because the context compounds
          instead of evaporating. Plan, work, and decisions never leave the room.
        </p>
      </div>
    </section>
  );
}

