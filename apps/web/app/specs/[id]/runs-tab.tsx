"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { AgentRunCard, type AgentRun } from "../../../components/agent-run-card";
import { EmptyState } from "../../../components/empty-state";
import styles from "./spec.module.css";

// Raw spec activity event (server shape from GET /api/specs/:id/activity).
type Event = {
  id: string;
  actorType: "human" | "agent" | "system";
  actorName: string;
  kind: string;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

// Map an agent event's kind to a run state (11-DESIGN §3c-i):
// task_picked_up → working; task_status_changed to "done" → done; else waiting.
function toState(e: Event): AgentRun["state"] {
  if (e.kind === "task_picked_up") return "working";
  if (e.kind === "task_status_changed") {
    const status = (e.detail?.status ?? e.detail?.to) as string | undefined;
    if (status === "done") return "done";
    if (status === "in_progress") return "working";
  }
  return "waiting";
}

function toRun(e: Event): AgentRun {
  const taskDisplayId = (e.detail?.taskDisplayId ?? e.detail?.displayId) as
    | string
    | undefined;
  const taskTitle = (e.detail?.taskTitle ?? e.detail?.title) as
    | string
    | undefined;
  return {
    agentName: e.actorName,
    taskDisplayId,
    taskTitle,
    summary: e.summary,
    state: toState(e),
    at: e.createdAt,
  };
}

// Group by agent, keep each agent's latest action — one run card per agent
// showing where it is right now. Polls so a working agent ticks live.
export function RunsTab({ specId }: { specId: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const load = useCallback(() => {
    api<Event[]>(`/api/specs/${specId}/activity`)
      .then((events) => {
        const agentEvents = events.filter((e) => e.actorType === "agent");
        const latestByAgent = new Map<string, Event>();
        // events arrive newest-first; first seen per agent is the latest.
        for (const e of agentEvents) {
          if (!latestByAgent.has(e.actorName)) latestByAgent.set(e.actorName, e);
        }
        setRuns([...latestByAgent.values()].map(toRun));
      })
      .catch(() => {});
  }, [specId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="4.5"
              y="4.5"
              width="15"
              height="15"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M9 12h6M12 9v6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        }
        message="No agent runs yet — connect a coding agent over MCP and it shows up here."
      />
    );
  }

  return (
    <div className={styles.runList}>
      {runs.map((run) => (
        <AgentRunCard key={run.agentName} run={run} />
      ))}
    </div>
  );
}
