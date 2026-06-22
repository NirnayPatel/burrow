import { presenceColor } from "../lib/presence";
import styles from "./agent-avatar.module.css";

// Agents are teammates rendered like teammates, but SQUARE (humans are round)
// with a mono label — 11-DESIGN §P4. Blue ring when actively working.
export function AgentAvatar({
  name,
  working = false,
  idle = false,
  title,
}: {
  name: string;
  working?: boolean;
  idle?: boolean;
  title?: string;
}) {
  const initials = name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "AI";
  return (
    <span
      className={`${styles.avatar} ${working ? styles.working : ""} ${idle ? styles.idle : ""}`}
      style={{ ["--ring" as string]: presenceColor(name) }}
      title={title ?? name}
      aria-label={`agent ${name}`}
    >
      {initials}
    </span>
  );
}
