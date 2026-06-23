import styles from "./Comparison.module.css";

const rows = [
  {
    dimension: "Run it on your own infrastructure",
    hosted: "No",
    burrow: "Yes — docker compose up",
  },
  {
    dimension: "Your own API keys",
    hosted: "No — runs on their servers",
    burrow: "Yes — Anthropic, OpenAI, Google, OpenRouter, Ollama",
  },
  {
    dimension: "Telemetry",
    hosted: "Yes",
    burrow: "None",
  },
  {
    dimension: "Price",
    hosted: "Per creator, per month",
    burrow: "Free, unlimited creators",
  },
  {
    dimension: "Agent bridge",
    hosted: "Closed, unpublished format",
    burrow: "MCP-native, published .burrow/ spec",
  },
  {
    dimension: "Governance",
    hosted: "Commercial, closed",
    burrow: "Open source, no-rug-pull pledge",
  },
];

export function Comparison() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        {/* vs hosted tools */}
        <div className={styles.block}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>How it compares</span>
            <h2 className={styles.title}>
              The craft of a hosted tool. The{" "}
              <span className={styles.accent}>ownership</span> of a local file.
            </h2>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thDim} scope="col"></th>
                  <th className={styles.th} scope="col">Hosted AI planning tools</th>
                  <th className={`${styles.th} ${styles.thBurrow}`} scope="col">Burrow</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.dimension} className={styles.row}>
                    <td className={styles.tdDim}>{row.dimension}</td>
                    <td className={styles.tdHosted}>{row.hosted}</td>
                    <td className={`${styles.td} ${styles.tdBurrow}`}>{row.burrow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.caption}>
            You don&apos;t have to choose between a tool that looks good and a tool
            you actually own. Burrow is both.
          </p>
        </div>

        {/* vs markdown */}
        <div className={`${styles.block} ${styles.blockAlt}`}>
          <div className={styles.headingAlt}>
            <h2 className={styles.titleAlt}>
              Already planning in markdown? Burrow starts right where you are.
            </h2>
            <p className={styles.subAlt}>
              Flat specs in the repo are free and fully yours. So is Burrow. The
              difference is everything files can&apos;t do: edit the spec together
              live, break it down with AI on your own key, and hand your agent real
              context with a decision trail behind it. You keep the ownership and
              gain the loop.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

