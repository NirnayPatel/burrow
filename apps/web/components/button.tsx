import styles from "./button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Busy buttons stay the width of their label (05-DESIGN §5) — the spinner
// renders inline and the button disables itself so handlers can't double-fire.
export function Button({
  variant = "secondary",
  busy = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
