import { AgentAvatar } from "./agent-avatar";
import { relativeTime } from "../lib/relative-time";
import styles from "./agent-run-card.module.css";

// Makes invisible MCP work visible (11-DESIGN §3c). A run = an agent that
// picked up a task; the 3-step micro-progress shows where it is.
export type AgentRun = {
  agentName: string;
  taskDisplayId?: string;
  taskTitle?: string;
  summary: string;
  state: "working" | "done" | "failed" | "waiting";
  at: string;
};

const STEP_BY_STATE: Record<AgentRun["state"], number> = {
  waiting: 0,
  working: 1,
  done: 2,
  failed: 1,
};
const STEPS = ["pulled context", "running", "pushed"];

export function AgentRunCard({ run }: { run: AgentRun }) {
  const active = STEP_BY_STATE[run.state];
  return (
    <div className={`${styles.card} ${styles[run.state]}`}>
      <div className={styles.head}>
        <AgentAvatar name={run.agentName} working={run.state === "working"} />
        <span className={styles.name}>{run.agentName}</span>
        <span className={styles.state} data-state={run.state}>
          {run.state === "working" ? "working" : run.state}
        </span>
        <time className={styles.time}>{relativeTime(run.at)}</time>
      </div>
      <div className={styles.task}>
        {run.taskDisplayId && <span className={styles.taskId}>{run.taskDisplayId}</span>}{" "}
        {run.taskTitle ?? run.summary}
      </div>
      <div className={styles.steps} aria-hidden="true">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`${styles.step} ${i <= active ? styles.stepOn : ""} ${
              i === active && run.state === "working" ? styles.stepPulse : ""
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
