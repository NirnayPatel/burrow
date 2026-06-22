import { Avatar } from "./avatar";
import { presenceColor } from "../lib/presence";
import styles from "./presence-stack.module.css";

export type Collaborator = { name: string; idle?: boolean };

// Overlapping avatars for who's in the doc. Self first, max 5 shown, overflow
// as a "+n" pill (05-DESIGN §5). Colors come from the shared presence hash.
export function PresenceStack({ people }: { people: Collaborator[] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 5);
  const extra = people.length - shown.length;
  return (
    <div className={styles.stack} aria-label={`${people.length} editing`}>
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} className={styles.slot}>
          <Avatar name={p.name} color={presenceColor(p.name)} idle={p.idle} />
        </span>
      ))}
      {extra > 0 && <span className={styles.overflow}>+{extra}</span>}
    </div>
  );
}
