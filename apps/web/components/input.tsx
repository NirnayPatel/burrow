import styles from "./input.module.css";

// Borderless variant exists for the inline Spec title (05-DESIGN §5) —
// the page supplies its own type scale via className.
export function Input({
  variant = "default",
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "default" | "borderless";
}) {
  return (
    <input
      className={[
        variant === "borderless" ? styles.borderless : styles.input,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
