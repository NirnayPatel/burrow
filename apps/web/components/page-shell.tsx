import styles from "./page-shell.module.css";

// Content max-widths per 05-DESIGN §4: 360 sign-in, 720 lists/settings,
// 860 spec page.
export function PageShell({
  width = "base",
  children,
}: {
  width?: "narrow" | "base" | "wide";
  children: React.ReactNode;
}) {
  return <main className={`${styles.shell} ${styles[width]}`}>{children}</main>;
}
