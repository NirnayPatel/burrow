import styles from "./Button.module.css";

interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  href?: string;
  children: React.ReactNode;
  external?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  href = "#",
  children,
  external = false,
}: ButtonProps) {
  const classes = `${styles.btn} ${styles[variant]} ${styles[size]}`;
  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

