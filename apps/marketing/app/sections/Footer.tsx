import { Logo } from "../components/Logo";
import styles from "./Footer.module.css";

const GITHUB_URL = "https://github.com/NirnayPatel/burrow";

// Only links that actually resolve — on-page anchors, the persona pages, and the
// public GitHub repo. No placeholder pages.
const columns = [
  {
    heading: "Product",
    links: [
      { label: "Live demo", href: "/demo/" },
      { label: "How it works", href: "/#loop" },
      { label: "Features", href: "/#features" },
      { label: "Self-host", href: "/#self-host" },
      { label: "Open source", href: "/#open-source" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Product Managers", href: "/solutions/product-managers" },
      { label: "Engineering Teams", href: "/solutions/engineering" },
      { label: "Product Ops", href: "/solutions/product-ops" },
      { label: "Product Leaders", href: "/solutions/leaders" },
    ],
  },
  {
    heading: "Open source",
    links: [{ label: "GitHub", href: GITHUB_URL, external: true }],
  },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.inner} container`}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <a href="/" className={styles.logoLink} aria-label="Burrow home">
              <Logo size="sm" />
            </a>
            <p className={styles.tagline}>Where specs become shipped work.</p>
          </div>

          <div className={styles.columns}>
            {columns.map((col) => (
              <div key={col.heading} className={styles.column}>
                <p className={styles.colHeading}>{col.heading}</p>
                <ul className={styles.colLinks} role="list">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className={styles.colLink}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>
            &copy; Burrow &middot; Open source &middot; No telemetry, ever.
          </p>
          <p className={styles.builtBy}>
            Built by{" "}
            <a
              href="https://nirnaypatel.com"
              className={styles.builtByLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Nirnay Patel
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
