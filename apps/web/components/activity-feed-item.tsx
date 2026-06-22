import { Avatar } from "./avatar";
import { AgentAvatar } from "./agent-avatar";
import { presenceColor } from "../lib/presence";
import { relativeTime } from "../lib/relative-time";
import styles from "./activity-feed-item.module.css";

export type ActivityEvent = {
  id: string;
  actorType: "human" | "agent" | "system";
  actorName: string;
  summary: string;
  createdAt: string;
};

// One unified row: round human / square agent / spark AI, verb phrase, time.
// The single clearest "this product is alive" element (11-DESIGN §3a).
export function ActivityFeedItem({ event }: { event: ActivityEvent }) {
  return (
    <li className={styles.item}>
      <span className={styles.actor}>
        {event.actorType === "agent" ? (
          <AgentAvatar name={event.actorName} />
        ) : event.actorType === "system" ? (
          <span className={styles.spark} aria-hidden="true">
            ✦
          </span>
        ) : (
          <Avatar name={event.actorName} color={presenceColor(event.actorName)} />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{event.actorName}</span> {event.summary}
      </span>
      <time className={styles.time}>{relativeTime(event.createdAt)}</time>
    </li>
  );
}
