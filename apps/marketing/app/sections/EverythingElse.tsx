import styles from "./EverythingElse.module.css";

const items: { title: string; body: string }[] = [
  {
    title: "Multi-team",
    body: "Teams own both people and work — see a team's specs, initiatives, and members in one place. The whole org, structured the way it really runs.",
  },
  {
    title: "Decision logs",
    body: "Append-only sign-offs pinned to the exact spec version they were cast against. A clean, auditable decision trail — nothing quietly edited or deleted.",
  },
  {
    title: "⌘K command palette",
    body: "Jump to any spec, surface, or action without leaving the keyboard. The fast path through the whole workspace.",
  },
  {
    title: "Global search",
    body: "Search across specs, feedback, market signals, and decisions — one box over the entire surface, not six tools.",
  },
  {
    title: "Reviewer reading mode",
    body: "A calm, focused view for sign-off — read the spec the way it's meant to be reviewed, then approve or flag in place.",
  },
  {
    title: "Versioning",
    body: "Every spec is versioned. Sign-offs, insights, and the agent's context all reference the version they belong to.",
  },
  {
    title: "BYO keys",
    body: "Anthropic, OpenAI, Google, OpenRouter, or Ollama for fully on-prem. Add a key once; it's encrypted at rest and never leaves your server.",
  },
  {
    title: "Keyboard-first",
    body: "Single-key shortcuts across the app, a Home dashboard of what needs you, and a workspace chat grounded in your specs.",
  },
];

export function EverythingElse() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>And everything else</span>
          <h2 className={styles.title}>The details that make it operable.</h2>
          <p className={styles.sub}>
            The breadth around the loop — built to move fast and leave a record.
          </p>
        </div>
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.title} className={styles.card}>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardBody}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

