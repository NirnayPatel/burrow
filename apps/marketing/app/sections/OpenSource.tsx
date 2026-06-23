import { Button } from "../components/Button";
import styles from "./OpenSource.module.css";

const pillars = [
  {
    heading: "Open license, published with the repo.",
    body: "The license ships with the first commit. Permissively licensed — we're finalizing the exact terms before public launch.",
  },
  {
    heading: "No-rug-pull pledge.",
    body: "A public governance doc in the repo's first week. The license can't be quietly swapped out from under you.",
  },
  {
    heading: "The .burrow/ format is published and versioned.",
    body: "Build agents and tools against a stable, open format. No closed binary, no proprietary protocol.",
  },
  {
    heading: "Everything in the product plan is open, forever.",
    body: "Monetization, if it ever comes, is hosting convenience and enterprise compliance — never core capability.",
  },
];

export function OpenSource() {
  return (
    <section id="open-source" className={styles.section}>
      <div className={`${styles.inner} container`}>
        {/* Self-host + BYO keys lead */}
        <div id="self-host" className={styles.selfHost}>
          <div className={styles.shText}>
            <span className={styles.eyebrow}>Self-host · your keys</span>
            <h2 className={styles.title}>
              Your data. Your infrastructure.{" "}
              <span className={styles.accent}>No telemetry.</span>
            </h2>
            <p className={styles.sub}>
              The web app, realtime server, and database run on infrastructure you
              control. Burrow hosts no models and runs no inference — every AI
              feature uses your org&apos;s own provider key. No data transits our
              servers, because we run no servers in your path. No telemetry, no
              install pings, no hosted models. <code className={styles.code}>docker
              compose up</code> is the intended experience.
            </p>
            <ul className={styles.bullets} role="list">
              <li className={styles.bullet}>
                <span className={styles.bulletDot} aria-hidden="true" />
                Bring keys from Anthropic, OpenAI, Google, OpenRouter, or Ollama
              </li>
              <li className={styles.bullet}>
                <span className={styles.bulletDot} aria-hidden="true" />
                Keys encrypted at rest, never transmitted to us
              </li>
              <li className={styles.bullet}>
                <span className={styles.bulletDot} aria-hidden="true" />
                Ollama path = inference that never leaves the building
              </li>
            </ul>
          </div>
          <pre className={styles.codeBlock}>{`git clone https://github.com/burrow-hq/burrow
cd burrow

# add your .env (API key + one secret)
cp .env.example .env

docker compose up`}</pre>
        </div>

        {/* Governance */}
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Governance</span>
          <h2 className={styles.title}>Open from the first commit</h2>
          <p className={styles.sub}>
            Burrow is open source, and the openness is structural — not a
            marketing word.
          </p>
        </div>

        <div className={styles.pillars}>
          {pillars.map((p) => (
            <div key={p.heading} className={styles.pillar}>
              <h3 className={styles.pillarHeading}>{p.heading}</h3>
              <p className={styles.pillarBody}>{p.body}</p>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" href="#">
            Read the governance doc
          </Button>
          <Button variant="primary" href="#" external>
            Star on GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}

