"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as RDialog from "@radix-ui/react-dialog";
import { api } from "../../lib/api";
import { relativeTime } from "../../lib/relative-time";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Select } from "../../components/select";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { InsightChip } from "../../components/insight-chip";
import { useToast } from "../../components/toast";
import styles from "./automations.module.css";

// ─── types ───────────────────────────────────────────────────────────────────

type TriggerType = "event" | "schedule";
type RunStatus = "ok" | "error";
type SchedulePreset = "hourly" | "daily" | "weekly";

type RoutineAction =
  | { type: "log"; message: string }
  | { type: "create_spec"; title: string }
  | { type: "notify"; target: string; message: string };

type Routine = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  eventKind: string | null;
  schedule: SchedulePreset | null;
  conditionField: string | null;
  conditionEquals: string | null;
  actions: RoutineAction[];
  failureCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

type RoutineRun = {
  id: string;
  status: RunStatus;
  message: string | null;
  createdAt: string;
};

// ─── constants ───────────────────────────────────────────────────────────────

const EVENT_KIND_OPTIONS = [
  { value: "spec_created", label: "Spec created" },
  { value: "breakdown_generated", label: "Breakdown generated" },
  { value: "task_status_changed", label: "Task status changed" },
  { value: "task_picked_up", label: "Task picked up" },
  { value: "signoff_recorded", label: "Sign-off recorded" },
  { value: "review_requested", label: "Review requested" },
  { value: "tasks_pushed", label: "Tasks pushed" },
  { value: "team_created", label: "Team created" },
  { value: "spec_team_changed", label: "Spec team changed" },
] as const;

const SCHEDULE_OPTIONS = [
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
] as const;

const ACTION_TYPE_OPTIONS = [
  { value: "log", label: "Log a message" },
  { value: "create_spec", label: "Create a Spec" },
  { value: "notify", label: "Notify a target" },
] as const;

const TRIGGER_TYPE_OPTIONS = [
  { value: "event", label: "When an event happens" },
  { value: "schedule", label: "On a schedule" },
] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function triggerSummary(r: Routine): string {
  if (r.triggerType === "schedule") {
    const label = SCHEDULE_OPTIONS.find((o) => o.value === r.schedule)?.label;
    return label ?? "On a schedule";
  }
  const label = EVENT_KIND_OPTIONS.find((o) => o.value === r.eventKind)?.label;
  return label ? `When: ${label}` : "On an event";
}

function autoDisabled(r: Routine): boolean {
  return !r.enabled && r.failureCount > 0;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: RunStatus }) {
  return (
    <span
      className={`${styles.statusDot} ${status === "ok" ? styles.dotOk : styles.dotError}`}
      aria-label={status === "ok" ? "Success" : "Error"}
    />
  );
}

function ActionChip({ action }: { action: RoutineAction }) {
  const label =
    action.type === "log"
      ? "Log"
      : action.type === "create_spec"
        ? "Create Spec"
        : "Notify";
  return <span className={styles.actionChip}>{label}</span>;
}

function RunsPanel({ routineId }: { routineId: string }) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);

  useEffect(() => {
    api<RoutineRun[]>(`/api/routines/${routineId}/runs`)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [routineId]);

  if (runs === null) {
    return (
      <div className={styles.runsPanel}>
        <Skeleton height={13} />
        <Skeleton height={13} width="70%" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className={styles.runsPanel}>
        <p className={styles.runsEmpty}>No runs yet.</p>
      </div>
    );
  }

  return (
    <ul className={styles.runsList}>
      {runs.map((run) => (
        <li key={run.id} className={styles.runRow}>
          <StatusDot status={run.status} />
          <span className={styles.runMessage}>{run.message ?? (run.status === "ok" ? "Completed" : "Failed")}</span>
          <span className={styles.runTime}>{relativeTime(run.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── action builder ───────────────────────────────────────────────────────────

type ActionDraft =
  | { type: "log"; message: string }
  | { type: "create_spec"; title: string }
  | { type: "notify"; target: string; message: string };

function ActionBuilder({
  actions,
  onChange,
}: {
  actions: ActionDraft[];
  onChange: (actions: ActionDraft[]) => void;
}) {
  function addAction() {
    onChange([...actions, { type: "log", message: "" }]);
  }

  function removeAction(i: number) {
    onChange(actions.filter((_, idx) => idx !== i));
  }

  function updateType(i: number, type: string) {
    const updated = actions.map((a, idx) => {
      if (idx !== i) return a;
      if (type === "log") return { type: "log" as const, message: "" };
      if (type === "create_spec") return { type: "create_spec" as const, title: "" };
      return { type: "notify" as const, target: "", message: "" };
    });
    onChange(updated);
  }

  function updateField(
    i: number,
    field: string,
    value: string
  ) {
    const updated = actions.map((a, idx) => {
      if (idx !== i) return a;
      return { ...a, [field]: value } as ActionDraft;
    });
    onChange(updated);
  }

  return (
    <div className={styles.actionBuilder}>
      {actions.map((action, i) => (
        <div key={i} className={styles.actionRow}>
          <div className={styles.actionRowTop}>
            <Select
              value={action.type}
              onValueChange={(v) => updateType(i, v)}
              options={ACTION_TYPE_OPTIONS}
              ariaLabel="Action type"
            />
            <button
              type="button"
              className={styles.removeAction}
              onClick={() => removeAction(i)}
              aria-label="Remove action"
            >
              ×
            </button>
          </div>
          {action.type === "log" && (
            <Input
              placeholder="Message to log"
              value={action.message}
              onChange={(e) => updateField(i, "message", e.target.value)}
              required
            />
          )}
          {action.type === "create_spec" && (
            <Input
              placeholder="Spec title"
              value={action.title}
              onChange={(e) => updateField(i, "title", e.target.value)}
              required
            />
          )}
          {action.type === "notify" && (
            <>
              <Input
                placeholder="Target (e.g. #slack-channel or email)"
                value={action.target}
                onChange={(e) => updateField(i, "target", e.target.value)}
                required
              />
              <Input
                placeholder="Message"
                value={action.message}
                onChange={(e) => updateField(i, "message", e.target.value)}
                required
              />
            </>
          )}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={addAction}>
        + Add action
      </Button>
    </div>
  );
}

// ─── new automation dialog ────────────────────────────────────────────────────

function NewAutomationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<string>("event");
  const [eventKind, setEventKind] = useState("spec_created");
  const [schedule, setSchedule] = useState("daily");
  const [conditionField, setConditionField] = useState("");
  const [conditionEquals, setConditionEquals] = useState("");
  const [actions, setActions] = useState<ActionDraft[]>([
    { type: "log", message: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setTriggerType("event");
    setEventKind("spec_created");
    setSchedule("daily");
    setConditionField("");
    setConditionEquals("");
    setActions([{ type: "log", message: "" }]);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        triggerType,
        actions,
      };
      if (triggerType === "event") {
        body.eventKind = eventKind;
      } else {
        body.schedule = schedule;
      }
      if (conditionField.trim()) body.conditionField = conditionField.trim();
      if (conditionEquals.trim()) body.conditionEquals = conditionEquals.trim();

      await api("/api/routines", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast("Automation created and active.", "success");
      onCreated();
      onOpenChange(false);
      reset();
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes("403")
          ? "Admin access required."
          : "Could not create automation — try again.";
      setError(msg);
      toast(msg, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RDialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <RDialog.Portal>
        <RDialog.Overlay className={styles.overlay} />
        <RDialog.Content
          className={styles.dialogContent}
          aria-describedby="new-auto-desc"
        >
          <RDialog.Title className={styles.dialogTitle}>
            New automation
          </RDialog.Title>
          <RDialog.Description
            id="new-auto-desc"
            className={styles.dialogDesc}
          >
            Define a trigger, an optional condition, and one or more actions.
          </RDialog.Description>

          <form onSubmit={submit} className={styles.dialogForm}>
            {/* Name */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="auto-name">
                Name
              </label>
              <Input
                id="auto-name"
                placeholder="e.g. Notify on spec created"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Trigger type */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Trigger</label>
              <Select
                value={triggerType}
                onValueChange={setTriggerType}
                options={TRIGGER_TYPE_OPTIONS}
                ariaLabel="Trigger type"
              />
            </div>

            {/* Event kind or schedule */}
            {triggerType === "event" ? (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Event</label>
                <Select
                  value={eventKind}
                  onValueChange={setEventKind}
                  options={EVENT_KIND_OPTIONS}
                  ariaLabel="Event kind"
                />
              </div>
            ) : (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Frequency</label>
                <Select
                  value={schedule}
                  onValueChange={setSchedule}
                  options={SCHEDULE_OPTIONS}
                  ariaLabel="Schedule"
                />
              </div>
            )}

            {/* Condition (optional) */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Condition{" "}
                <span className={styles.optional}>(optional)</span>
              </label>
              <div className={styles.conditionRow}>
                <Input
                  placeholder="field (e.g. spec.status)"
                  value={conditionField}
                  onChange={(e) => setConditionField(e.target.value)}
                />
                <span className={styles.conditionEq}>equals</span>
                <Input
                  placeholder="value (e.g. approved)"
                  value={conditionEquals}
                  onChange={(e) => setConditionEquals(e.target.value)}
                />
              </div>
            </div>

            {/* Actions builder */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Actions</label>
              <ActionBuilder actions={actions} onChange={setActions} />
            </div>

            {error && <p className={styles.dialogError}>{error}</p>}

            <div className={styles.dialogActions}>
              <RDialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </RDialog.Close>
              <Button type="submit" variant="primary" busy={busy}>
                Create automation
              </Button>
            </div>
          </form>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// ─── routine card ─────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  isAdmin,
  onToggle,
  onDelete,
}: {
  routine: Routine;
  isAdmin: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (r: Routine) => void;
}) {
  const [runsOpen, setRunsOpen] = useState(false);

  const isAutoDisabled = autoDisabled(routine);

  return (
    <article className={`${styles.card} ${!routine.enabled ? styles.cardDisabled : ""}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardMeta}>
          <span className={styles.cardName}>{routine.name}</span>
          <span className={styles.cardTrigger}>{triggerSummary(routine)}</span>
        </div>
        <div className={styles.cardControls}>
          {/* Enabled toggle — admin only */}
          {isAdmin && (
            <label className={styles.toggle} aria-label={routine.enabled ? "Disable" : "Enable"}>
              <input
                type="checkbox"
                className={styles.toggleInput}
                checked={routine.enabled}
                onChange={(e) => onToggle(routine.id, e.target.checked)}
              />
              <span className={styles.toggleTrack} />
            </label>
          )}
          {isAdmin && (
            <button
              className={styles.iconBtn}
              onClick={() => onDelete(routine)}
              aria-label={`Delete ${routine.name}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M11 3L3 11M3 3l8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Actions chips */}
      <div className={styles.cardActions}>
        {routine.actions.map((a, i) => (
          <ActionChip key={i} action={a} />
        ))}
      </div>

      {/* Failure cue */}
      {routine.failureCount > 0 && !isAutoDisabled && (
        <div className={styles.failureNote}>
          <InsightChip variant="attention" dismissible={false}>
            {routine.failureCount} failure{routine.failureCount !== 1 ? "s" : ""} — check run history
          </InsightChip>
        </div>
      )}
      {isAutoDisabled && (
        <div className={styles.failureNote}>
          <InsightChip variant="attention" dismissible={false}>
            Auto-disabled after failures — re-enable to retry
          </InsightChip>
        </div>
      )}

      {/* Last run + runs expander */}
      <div className={styles.cardFooter}>
        {routine.lastRunAt && (
          <span className={styles.lastRun}>
            Last run {relativeTime(routine.lastRunAt)}
          </span>
        )}
        <button
          type="button"
          className={styles.runsToggle}
          onClick={() => setRunsOpen((v) => !v)}
          aria-expanded={runsOpen}
        >
          {runsOpen ? "Hide runs" : "Runs"}
        </button>
      </div>

      {runsOpen && <RunsPanel routineId={routine.id} />}
    </article>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const router = useRouter();
  const toast = useToast();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [role, setRole] = useState<string>("member");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Routine | null>(null);

  const loadRoutines = useCallback(() => {
    api<Routine[]>("/api/routines")
      .then(setRoutines)
      .catch(() => router.push("/signin"));
  }, [router]);

  useEffect(() => {
    loadRoutines();
    api<{ role: string }>("/api/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
  }, [loadRoutines]);

  const isAdmin = role === "admin";

  async function toggleEnabled(id: string, enabled: boolean) {
    try {
      await api(`/api/routines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      toast(enabled ? "Automation enabled." : "Automation disabled.", "default");
      loadRoutines();
    } catch {
      toast("Could not update automation — try again.", "danger");
    }
  }

  async function deleteRoutine() {
    if (!deleteTarget) return;
    try {
      await api(`/api/routines/${deleteTarget.id}`, { method: "DELETE" });
      toast("Automation deleted.", "default");
      loadRoutines();
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.heading}>Automations</h1>
            <p className={styles.subheading}>
              Rules that run when something happens or on a schedule.
            </p>
          </div>
          {isAdmin && (
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              New automation
            </Button>
          )}
        </div>

        {routines === null ? (
          <div className={styles.skeletonList}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonCard}>
                <Skeleton height={16} width="40%" />
                <Skeleton height={13} width="60%" />
                <Skeleton height={13} width="30%" />
              </div>
            ))}
          </div>
        ) : routines.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
            message="No automations yet. Make Burrow act on its own — notify, create a Spec, run on a schedule."
            action={
              isAdmin ? (
                <Button variant="primary" onClick={() => setDialogOpen(true)}>
                  New automation
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={styles.list}>
            {routines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                isAdmin={isAdmin}
                onToggle={toggleEnabled}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        <NewAutomationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={loadRoutines}
        />

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.name ?? ""}"?`}
          body="This automation and all its run history will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={deleteRoutine}
        />
      </PageShell>
    </>
  );
}
