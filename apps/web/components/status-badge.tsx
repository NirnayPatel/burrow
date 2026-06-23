import styles from "./status-badge.module.css";
import type { Spec } from "../lib/api";

// Internal state names never reach a user's eyes raw (05-DESIGN §6).
export const STATUS_LABEL: Record<Spec["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  in_progress: "In progress",
  done: "Done",
  archived: "Archived",
};

export const STATUSES = [
  "draft",
  "in_review",
  "approved",
  "in_progress",
  "done",
  "archived",
] as const;

// Display-only — status changes go through the Select, never the badge.
export function StatusBadge({ status }: { status: Spec["status"] }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
