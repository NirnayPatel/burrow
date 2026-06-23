import styles from "./Triad.module.css";

const pillars = [
  {
    label: "Context",
    heading: "Why the AI gets it right.",
    body: "Give Burrow your company, product, persona, and ways-of-working docs once. They're embedded into a Context Graph that grounds every AI surface — breakdowns, insights, in-editor drafting, even what your agents see over MCP. The AI works from how your team actually operates, not a generic template.",
  },
  {
    label: "Specs",
    heading: "What it works from.",
    body: "The spec is the unit of truth. Real-time, multiplayer, versioned — and the full context an agent pulls over MCP, not a pasted snippet. Sign-offs pin decisions to the exact version, so there's always a clear record of what was agreed and when.",
  },
  {
    label: "Skills",
    heading: "How it acts like you.",
    body: "Skills, agents, and routines — packaged as version-controlled .burrow/ files — teach the AI your team's moves. An agent calls list_skills and acts the way your org would. Reuse them across teams, fork them, review them in a PR.",
  },
];

export function Triad() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>Grounded by design</span>
          <h2 className={styles.title}>
            Context, specs, skills &mdash; so the AI{" "}
            <span className={styles.accent}>stays grounded.</span>
          </h2>
        </div>
        <div className={styles.grid}>
          {pillars.map((p) => (
            <article key={p.label} className={styles.card}>
              <span className={styles.cardLabel}>{p.label}</span>
              <h3 className={styles.cardHeading}>{p.heading}</h3>
              <p className={styles.cardBody}>{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

