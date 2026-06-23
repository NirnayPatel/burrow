import styles from "./Integrations.module.css";

const integrations = [
  {
    name: "Jira",
    description: "Push breakdown tasks to issues and link specs — Cloud and Data Center.",
  },
  {
    name: "Confluence",
    description: "Link and publish specs to pages — Cloud and Data Center.",
  },
  {
    name: "Slack",
    description: "Notify on sign-off requests and status changes.",
  },
];

export function Integrations() {
  return (
    <section id="integrations" className={styles.section}>
      <div className={`${styles.inner} container`}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Connectivity</span>
          <h2 className={styles.title}>
            Works with the tools you{" "}
            <span className={styles.accent}>already run.</span>
          </h2>
          <p className={styles.sub}>
            Burrow connects to your stack over MCP, using your org&apos;s own
            credentials — so integrations ride the open ecosystem instead of
            bespoke connectors you have to maintain.
          </p>
        </div>

        <ul className={styles.list} role="list">
          {integrations.map((item) => (
            <li key={item.name} className={styles.item}>
              <div className={styles.itemTop}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.badge}>In progress</span>
              </div>
              <div className={styles.itemDesc}>{item.description}</div>
            </li>
          ))}
        </ul>

        <p className={styles.note}>
          Jira, Confluence, and Slack are in progress — over MCP, with your own
          credentials. No bespoke connector to maintain.
        </p>
      </div>
    </section>
  );
}

