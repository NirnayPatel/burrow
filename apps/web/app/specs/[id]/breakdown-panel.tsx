"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, API_URL } from "../../../lib/api";
import { Button } from "../../../components/button";
import { Select } from "../../../components/select";
import { TaskCard } from "../../../components/task-card";
import { EmptyState } from "../../../components/empty-state";
import { useToast } from "../../../components/toast";
import styles from "./spec.module.css";

type Task = {
  id: string;
  displayId: string;
  title: string;
  description: string | null;
  details: string | null;
  status: string;
  priority: number;
  acceptanceCriteria: string[] | null;
};

// Task lifecycle is separate from Spec lifecycle. Internal names never reach a
// user's eyes raw (05-DESIGN §6).
const TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "review",
  "deferred",
  "cancelled",
] as const;

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  review: "Review",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

// Streams tasks over SSE as the model emits them — the live-generation UX is
// part of the product, not a loading spinner.
export function BreakdownPanel({
  specId,
  generateSignal = 0,
}: {
  specId: string;
  // Bumped by page.tsx when the "/breakdown" slash action fires — a change in
  // this counter kicks generation from outside the panel (UX review #5).
  generateSignal?: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generation, setGeneration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Guards the slash-driven generate effect so it fires once per signal bump,
  // never on the initial mount (when signal arrives already >0 from page.tsx).
  const handledSignal = useRef(generateSignal);

  const load = useCallback(() => {
    api<{ breakdown: { generation: number } | null; tasks: Task[] }>(
      `/api/specs/${specId}/breakdown`,
    ).then((r) => {
      setTasks(r.tasks);
      setGeneration(r.breakdown?.generation ?? null);
    });
  }, [specId]);

  useEffect(load, [load]);

  // Kick generation when the slash action bumps the signal. Compares against the
  // last-handled value so it fires exactly once per bump, never on mount, and
  // never while a generation is already in flight.
  useEffect(() => {
    if (generateSignal !== handledSignal.current && !busy) {
      handledSignal.current = generateSignal;
      void generate();
    }
    // generate/busy intentionally omitted — fire only on a fresh signal bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateSignal]);

  async function generate() {
    setBusy(true);
    setError(null);
    setTasks([]);
    const res = await fetch(`${API_URL}/api/specs/${specId}/breakdown`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setError(
        body.error === "no_provider_key"
          ? "No AI provider key configured — add one in Settings."
          : body.error,
      );
      setBusy(false);
      load();
      return;
    }
    // Parse the SSE stream by hand — EventSource can't POST
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const evt of events) {
        const type = /^event: (.+)$/m.exec(evt)?.[1];
        const data = /^data: (.+)$/m.exec(evt)?.[1];
        if (!type || !data) continue;
        if (type === "task") setTasks((prev) => [...prev, JSON.parse(data)]);
        if (type === "error") setError(JSON.parse(data).message);
      }
    }
    setBusy(false);
    load();
  }

  async function undo() {
    const res = await fetch(`${API_URL}/api/specs/${specId}/breakdown/latest`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) setError((await res.json()).error);
    load();
  }

  // In-app task status: PATCH the task and update local state in place so the
  // card reflects the new state without a full reload.
  async function setTaskStatus(taskId: string, status: string) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setTasks(prev); // roll back the optimistic update
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      toast(body.error ?? "Couldn't update task status", "danger");
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          Breakdown
          {generation ? (
            <span className={styles.panelMeta}> · generation {generation}</span>
          ) : null}
        </h3>
        <div className={styles.panelActions}>
          <Button variant="primary" onClick={generate} busy={busy}>
            {busy
              ? "Generating…"
              : tasks.length
                ? "Regenerate"
                : "Generate breakdown"}
          </Button>
          {generation !== null && generation > 1 && !busy && (
            <Button
              variant="secondary"
              onClick={undo}
              title="Restore the previous generation"
            >
              Undo regeneration
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className={styles.error}>
          {error}{" "}
          {error.includes("Settings") && <Link href="/settings">Settings →</Link>}
        </p>
      )}
      {/* aria-live so streamed tasks are announced as they arrive */}
      <div className={styles.taskList} role="list" aria-live="polite">
        {tasks.map((t) => (
          <div key={t.id} className={styles.taskItem} role="listitem">
            <TaskCard
              title={t.title}
              displayId={t.displayId}
              priority={t.priority}
              description={t.description}
              acceptanceCriteria={t.acceptanceCriteria}
              // Only tasks streaming in from the model animate — loads from the
              // API render instantly (05-DESIGN §4)
              animateIn={busy}
            />
            <div className={styles.taskStatus}>
              <Select
                value={t.status}
                onValueChange={(v) => setTaskStatus(t.id, v)}
                ariaLabel={`Status for ${t.displayId}`}
                options={TASK_STATUSES.map((s) => ({
                  value: s,
                  label: TASK_STATUS_LABEL[s],
                }))}
              />
            </div>
          </div>
        ))}
      </div>
      {!busy && tasks.length === 0 && !error && (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4.5 6.5h2m3 0h10m-15 5.5h2m3 0h10m-15 5.5h2m3 0h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          }
          message="Write the spec above, then generate an agent-ready task breakdown."
        />
      )}
    </section>
  );
}
