"use client";

// ConnectionCard — shows a single integration target (Jira, Confluence, Slack,
// or Custom MCP). Connected state uses the same dot pattern as StatusBadge.
// Admin can remove via the onRemove callback; non-admins see read-only state.
import styles from "./connection-card.module.css";

export type ConnectionTarget = "jira" | "confluence" | "slack" | "custom";

export type Connection = {
  id: string;
  target: ConnectionTarget;
  mcpUrl: string;
  hasAuth: boolean;
  createdAt: string;
};

const TARGET_META: Record<
  ConnectionTarget,
  { label: string; description: string }
> = {
  jira: {
    label: "Jira",
    description: "Push Breakdown tasks to Jira issues via mcp-atlassian.",
  },
  confluence: {
    label: "Confluence",
    description: "Sync Spec context and Playbook docs via mcp-atlassian.",
  },
  slack: {
    label: "Slack",
    description:
      "Notify your team on sign-off requests and status changes via Slack MCP.",
  },
  custom: {
    label: "Custom MCP",
    description: "Connect any MCP-compatible server to extend task routing.",
  },
};

export function ConnectionCard({
  target,
  connection,
  isAdmin,
  onConnect,
  onRemove,
  instanceLabel,
}: {
  target: ConnectionTarget;
  connection?: Connection; // undefined = not yet connected
  isAdmin: boolean;
  onConnect?: () => void;
  onRemove?: (id: string) => void;
  // Set when the org has >1 connection to this same target (e.g. two custom
  // MCP servers). Without it, identical "Custom MCP" cards read as a dupe bug.
  instanceLabel?: string;
}) {
  const meta = TARGET_META[target];
  const connected = !!connection;

  return (
    <div className={`${styles.card} ${connected ? styles.connected : styles.disconnected}`}>
      <div className={styles.header}>
        <span className={styles.label}>
          {meta.label}
          {instanceLabel && <span className={styles.instanceLabel}> · {instanceLabel}</span>}
        </span>
        <span
          className={`${styles.dot} ${connected ? styles.dotConnected : styles.dotDisconnected}`}
          aria-label={connected ? "Connected" : "Not connected"}
          role="img"
        />
      </div>

      <p className={styles.description}>{meta.description}</p>

      {connected && connection && (
        <div className={styles.meta}>
          <span className={styles.metaUrl}>{connection.mcpUrl}</span>
          {connection.hasAuth && (
            <span className={styles.authBadge}>auth configured</span>
          )}
        </div>
      )}

      {isAdmin && (
        <div className={styles.actions}>
          {connected && connection ? (
            <button
              className={styles.removeBtn}
              onClick={() => onRemove?.(connection.id)}
              aria-label={`Remove ${meta.label} connection`}
            >
              Disconnect
            </button>
          ) : (
            <button
              className={styles.connectBtn}
              onClick={onConnect}
              aria-label={`Connect ${meta.label}`}
            >
              Connect
            </button>
          )}
        </div>
      )}

      {!isAdmin && !connected && (
        <p className={styles.readOnlyNote}>Ask an admin to connect this.</p>
      )}
    </div>
  );
}
