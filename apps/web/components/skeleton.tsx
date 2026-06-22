import styles from "./skeleton.module.css";

// Loading placeholder — replaces "Loading…" strings (D3). Width/height via
// props so callers shape it to the content it stands in for, no layout shift.
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--radius-sm)",
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
