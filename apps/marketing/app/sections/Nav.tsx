import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import styles from "./Nav.module.css";

// Public GitHub repo for the app (the marketing site lives elsewhere).
const GITHUB_URL = "https://github.com/NirnayPatel/burrow";

const PERSONAS = [
  { href: "/solutions/product-managers", title: "Product Managers", note: "From scattered context to shipped strategy" },
  { href: "/solutions/engineering", title: "Engineering Teams", note: "Specs your agents can actually build from" },
  { href: "/solutions/product-ops", title: "Product Ops", note: "One system of record across every team" },
  { href: "/solutions/leaders", title: "Product Leaders", note: "See the whole org without status meetings" },
];

export function Nav() {
  return (
    <header className={styles.header}>
      <nav className={`${styles.nav} container`} aria-label="Main navigation">
        <a href="/" className={styles.logoLink} aria-label="Burrow home">
          <Logo size="md" />
        </a>

        <ul className={styles.links} role="list">
          <li>
            <a href="/#loop" className={styles.link}>Product</a>
          </li>
          <li className={styles.dropdown}>
            <a href="/solutions" className={`${styles.link} ${styles.dropdownTrigger}`} aria-haspopup="true">
              Solutions
              <span className={styles.caret} aria-hidden="true">▾</span>
            </a>
            <div className={styles.menu} role="menu">
              <span className={styles.menuLabel}>By role</span>
              {PERSONAS.map((p) => (
                <a key={p.href} href={p.href} className={styles.menuItem} role="menuitem">
                  <span className={styles.menuItemTitle}>{p.title}</span>
                  <span className={styles.menuItemNote}>{p.note}</span>
                </a>
              ))}
            </div>
          </li>
          <li>
            <a href="/#open-source" className={styles.link}>Open source</a>
          </li>
        </ul>

        <div className={styles.actions}>
          <Button variant="secondary" size="sm" href="/demo/">
            Live demo
          </Button>
          <Button variant="secondary" size="sm" href={GITHUB_URL} external>
            GitHub
          </Button>
          <Button variant="primary" size="sm" href="https://github.com/NirnayPatel/burrow">
            Get started
          </Button>
        </div>
      </nav>
    </header>
  );
}
