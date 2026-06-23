import styles from "./avatar.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Presence color is a CSS var token (--presence-1..8). The caller picks it by
// stable hash so it matches the editor cursor color for the same user.
export function Avatar({
  name,
  color,
  idle = false,
  title,
}: {
  name: string;
  color?: string;
  idle?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`${styles.avatar} ${idle ? styles.idle : ""}`}
      style={color ? { ["--ring" as string]: color } : undefined}
      title={title ?? name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
