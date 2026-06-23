"use client";

import { useEffect, useState } from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Select } from "../../components/select";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { useToast } from "../../components/toast";
import styles from "./goals.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type KRStatus = "on_track" | "at_risk" | "off_track" | "achieved";
type GoalStatus = "active" | "paused" | "achieved" | "cancelled";

type KeyResult = {
  id: string;
  title: string;
  metricUnit: string | null;
  target: number | null;
  current: number;
  baseline: number;
  status: KRStatus;
  confidence: "high" | "medium" | "low";
};

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  teamId: string | null;
  teamName?: string | null;
  startPeriod: string | null;
  endPeriod: string | null;
  keyResults: KeyResult[];
  linkCount: number;
};

type Team = { id: string; name: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "achieved", label: "Achieved" },
  { value: "cancelled", label: "Cancelled" },
];

const KR_STATUS_LABELS: Record<KRStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  achieved: "Achieved",
};

const CONFIDENCE_OPTIONS = [
  { value: "high", label: "High confidence" },
  { value: "medium", label: "Medium confidence" },
  { value: "low", label: "Low confidence" },
];

// ── KR progress bar ───────────────────────────────────────────────────────────

function KRProgressBar({
  current,
  target,
  baseline,
  status,
}: {
  current: number;
  target: number | null;
  baseline: number;
  status: KRStatus;
}) {
  if (target === null || target === baseline) {
    return <span className={styles.krNoTarget}>No target set</span>;
  }
  const range = target - baseline;
  const progress = current - baseline;
  const pct = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));

  const fillClass =
    status === "achieved" || status === "on_track"
      ? styles.krFillSuccess
      : status === "at_risk"
        ? styles.krFillWarning
        : styles.krFillDanger;

  return (
    <div className={styles.krProgressWrap}>
      <span
        className={styles.krProgressBar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${current} of ${target}${target !== null ? ` ${""} ` : ""}`}
      >
        <span
          className={`${styles.krProgressFill} ${fillClass}`}
          style={{ "--kr-pct": `${pct}%` } as React.CSSProperties}
        />
      </span>
      <span className={styles.krProgressLabel}>
        {current}{target !== null ? `/${target}` : ""}
      </span>
    </div>
  );
}

// ── KR status dot ─────────────────────────────────────────────────────────────

function KRStatusDot({ status }: { status: KRStatus }) {
  const cls =
    status === "on_track" || status === "achieved"
      ? styles.krDotSuccess
      : status === "at_risk"
        ? styles.krDotWarning
        : styles.krDotDanger;
  return (
    <span
      className={`${styles.krDot} ${cls}`}
      title={KR_STATUS_LABELS[status]}
      aria-label={KR_STATUS_LABELS[status]}
    />
  );
}

// ── KR row with inline update ─────────────────────────────────────────────────

function KRRow({
  kr,
  goalId,
  onUpdated,
}: {
  kr: KeyResult;
  goalId: string;
  onUpdated: (updated: KeyResult) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(String(kr.current));
  const [statusVal, setStatusVal] = useState<string>(kr.status);
  const [confidenceVal, setConfidenceVal] = useState<string>(kr.confidence);
  const [busy, setBusy] = useState(false);

  const krStatusOptions = Object.entries(KR_STATUS_LABELS).map(([v, l]) => ({
    value: v,
    label: l,
  }));

  async function saveUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, string | number> = {
        current: Number(currentVal),
        status: statusVal,
        confidence: confidenceVal,
      };
      // API route: PATCH /api/key-results/:id (per spec — server handles this)
      await api(`/api/key-results/${kr.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onUpdated({
        ...kr,
        current: Number(currentVal),
        status: statusVal as KRStatus,
        confidence: confidenceVal as KeyResult["confidence"],
      });
      setEditing(false);
      toast("Progress updated.", "success");
    } catch {
      toast("Update failed — try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.krRow}>
      <div className={styles.krHeader}>
        <KRStatusDot status={kr.status} />
        <span className={styles.krTitle}>{kr.title}</span>
        {kr.metricUnit && (
          <span className={styles.krUnit}>{kr.metricUnit}</span>
        )}
        <span className={`${styles.krStatusLabel} ${styles[`krStatus_${kr.status}`]}`}>
          {KR_STATUS_LABELS[kr.status]}
        </span>
        <button
          className={styles.krEditBtn}
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Cancel update" : "Update progress"}
        >
          {editing ? "Cancel" : "Update"}
        </button>
      </div>

      <KRProgressBar
        current={kr.current}
        target={kr.target}
        baseline={kr.baseline}
        status={kr.status}
      />

      {editing && (
        <form className={styles.krUpdateForm} onSubmit={saveUpdate}>
          <div className={styles.krUpdateFields}>
            <div className={styles.krUpdateField}>
              <label className={styles.krUpdateLabel} htmlFor={`kr-current-${kr.id}`}>
                Current
              </label>
              <Input
                id={`kr-current-${kr.id}`}
                type="number"
                value={currentVal}
                onChange={(e) => setCurrentVal(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.krUpdateField}>
              <label className={styles.krUpdateLabel}>Status</label>
              <Select
                value={statusVal}
                onValueChange={setStatusVal}
                options={krStatusOptions}
                ariaLabel="KR status"
              />
            </div>
            <div className={styles.krUpdateField}>
              <label className={styles.krUpdateLabel}>Confidence</label>
              <Select
                value={confidenceVal}
                onValueChange={setConfidenceVal}
                options={CONFIDENCE_OPTIONS}
                ariaLabel="KR confidence"
              />
            </div>
          </div>
          <div className={styles.krUpdateActions}>
            <Button type="submit" variant="primary" busy={busy}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  isAdmin,
  onDelete,
  onStatusChange,
  onKRUpdated,
  onAddKR,
}: {
  goal: Goal;
  isAdmin: boolean;
  onDelete: (goal: Goal) => void;
  onStatusChange: (id: string, status: GoalStatus) => void;
  onKRUpdated: (goalId: string, updated: KeyResult) => void;
  onAddKR: (goal: Goal) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Worst KR status drives the aggregate progress color
  const worstStatus = (): KRStatus => {
    const krs = goal.keyResults;
    if (krs.some((k) => k.status === "off_track")) return "off_track";
    if (krs.some((k) => k.status === "at_risk")) return "at_risk";
    if (krs.every((k) => k.status === "achieved")) return "achieved";
    return "on_track";
  };

  // Aggregate current/target for the roll-up bar
  const totalTarget = goal.keyResults.reduce(
    (sum, k) => sum + (k.target ?? 0),
    0
  );
  const totalCurrent = goal.keyResults.reduce((sum, k) => sum + k.current, 0);

  const statusOptions = GOAL_STATUS_OPTIONS.filter((o) => o.value !== goal.status);

  return (
    <div className={`${styles.goalCard} ${goal.status === "cancelled" || goal.status === "achieved" ? styles.goalCardMuted : ""}`}>
      {/* Card header */}
      <div className={styles.goalCardTop}>
        <div className={styles.goalCardTitleRow}>
          <span className={`${styles.goalStatusDot} ${styles[`goalDot_${goal.status}`]}`} aria-hidden="true" />
          <h2 className={styles.goalTitle}>{goal.title}</h2>
        </div>
        <div className={styles.goalMeta}>
          <span className={`${styles.goalStatusChip} ${styles[`goalStatusChip_${goal.status}`]}`}>
            {goal.status}
          </span>
          {goal.teamName && <span className={styles.chip}>{goal.teamName}</span>}
          {goal.endPeriod && (
            <span className={styles.chip}>{goal.endPeriod}</span>
          )}
          {goal.linkCount > 0 && (
            <span className={styles.chip} title="Linked entities">
              {goal.linkCount} linked
            </span>
          )}
        </div>
      </div>

      {goal.description && (
        <p className={styles.goalDesc}>{goal.description}</p>
      )}

      {/* Roll-up progress bar */}
      {goal.keyResults.length > 0 && totalTarget > 0 && (
        <div className={styles.rollupBar}>
          <span
            className={styles.rollupBarTrack}
            role="progressbar"
            aria-label="Aggregate goal progress"
            aria-valuenow={Math.min(100, Math.round((totalCurrent / totalTarget) * 100))}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={`${styles.rollupBarFill} ${
                worstStatus() === "achieved" || worstStatus() === "on_track"
                  ? styles.rollupFillSuccess
                  : worstStatus() === "at_risk"
                    ? styles.rollupFillWarning
                    : styles.rollupFillDanger
              }`}
              style={{
                "--rollup-pct": `${Math.min(100, Math.round((totalCurrent / totalTarget) * 100))}%`,
              } as React.CSSProperties}
            />
          </span>
          <span className={styles.rollupLabel}>
            {goal.keyResults.length} KR{goal.keyResults.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Expand/collapse KRs */}
      <div className={styles.goalFooter}>
        <button
          className={styles.expandToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Hide key results"
            : `${goal.keyResults.length === 0 ? "No" : goal.keyResults.length} key result${goal.keyResults.length === 1 ? "" : "s"}`}
        </button>

        {isAdmin && (
          <div className={styles.goalActions}>
            {statusOptions.map((o) => (
              <button
                key={o.value}
                className={styles.statusBtn}
                onClick={() => onStatusChange(goal.id, o.value as GoalStatus)}
              >
                {o.label}
              </button>
            ))}
            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(goal)}
              aria-label="Delete goal"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* KR list */}
      {expanded && (
        <div className={styles.krList}>
          {goal.keyResults.length === 0 ? (
            <p className={styles.krEmpty}>
              No key results yet. Add one to track what success looks like.
            </p>
          ) : (
            goal.keyResults.map((kr) => (
              <KRRow
                key={kr.id}
                kr={kr}
                goalId={goal.id}
                onUpdated={(updated) => onKRUpdated(goal.id, updated)}
              />
            ))
          )}
          {isAdmin && goal.keyResults.length < 5 && (
            <Button
              variant="ghost"
              onClick={() => onAddKR(goal)}
              className={styles.addKRBtn}
            >
              + Add key result
            </Button>
          )}
          {isAdmin && goal.keyResults.length >= 5 && (
            <p className={styles.krMaxNote}>Maximum 5 key results per goal.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const toast = useToast();

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myRole, setMyRole] = useState("member");
  const [teamFilter, setTeamFilter] = useState("__all__");

  // Create goal dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeam, setNewTeam] = useState("__none__");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Add KR dialog
  const [krGoal, setKrGoal] = useState<Goal | null>(null);
  const [krTitle, setKrTitle] = useState("");
  const [krUnit, setKrUnit] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [krCurrent, setKrCurrent] = useState("0");
  const [krBusy, setKrBusy] = useState(false);
  const [krError, setKrError] = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const isAdmin = myRole === "admin";

  function loadGoals() {
    api<Goal[]>("/api/goals")
      .then(setGoals)
      .catch(() => setGoals([]));
  }

  useEffect(() => {
    loadGoals();
    api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => {});
    api<{ myRole: string }>("/api/me")
      .then((d) => setMyRole(d.myRole))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateBusy(true);
    try {
      const body: Record<string, string> = { title: newTitle.trim() };
      if (newDesc.trim()) body.description = newDesc.trim();
      if (newTeam !== "__none__") body.teamId = newTeam;
      if (newStart.trim()) body.startPeriod = newStart.trim();
      if (newEnd.trim()) body.endPeriod = newEnd.trim();
      await api("/api/goals", { method: "POST", body: JSON.stringify(body) });
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewTeam("__none__");
      setNewStart("");
      setNewEnd("");
      loadGoals();
      toast("Goal created.", "success");
    } catch {
      setCreateError("Create failed — try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function changeStatus(id: string, status: GoalStatus) {
    try {
      await api(`/api/goals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setGoals((prev) =>
        prev ? prev.map((g) => (g.id === id ? { ...g, status } : g)) : prev
      );
      toast(`Goal marked ${status}.`, "default");
    } catch {
      toast("Status update failed.", "danger");
    }
  }

  async function deleteGoal() {
    if (!deleteTarget) return;
    try {
      await api(`/api/goals/${deleteTarget.id}`, { method: "DELETE" });
      setGoals((prev) => prev?.filter((g) => g.id !== deleteTarget.id) ?? prev);
      toast("Goal deleted.", "default");
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteTarget(null);
    }
  }

  function handleKRUpdated(goalId: string, updated: KeyResult) {
    setGoals((prev) =>
      prev
        ? prev.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  keyResults: g.keyResults.map((k) =>
                    k.id === updated.id ? updated : k
                  ),
                }
              : g
          )
        : prev
    );
  }

  function openAddKR(goal: Goal) {
    setKrGoal(goal);
    setKrTitle("");
    setKrUnit("");
    setKrTarget("");
    setKrCurrent("0");
    setKrError(null);
  }

  async function submitAddKR(e: React.FormEvent) {
    e.preventDefault();
    if (!krGoal) return;
    setKrError(null);
    setKrBusy(true);
    try {
      const body: Record<string, string | number> = { title: krTitle.trim() };
      if (krUnit.trim()) body.metricUnit = krUnit.trim();
      if (krTarget.trim()) body.target = Number(krTarget);
      if (krCurrent.trim()) body.current = Number(krCurrent);
      await api(`/api/goals/${krGoal.id}/key-results`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setKrGoal(null);
      loadGoals();
      toast("Key result added.", "success");
    } catch {
      setKrError("Failed to add key result — check all fields and try again.");
    } finally {
      setKrBusy(false);
    }
  }

  const teamOptions = [
    { value: "__all__", label: "All teams" },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  const newTeamOptions = [
    { value: "__none__", label: "No team" },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  const filtered = (goals ?? []).filter(
    (g) => teamFilter === "__all__" || g.teamId === teamFilter
  );

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Goals</h1>
          <div className={styles.headerActions}>
            {teams.length > 0 && (
              <Select
                value={teamFilter}
                onValueChange={setTeamFilter}
                options={teamOptions}
                ariaLabel="Filter by team"
              />
            )}
            {isAdmin && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                New goal
              </Button>
            )}
          </div>
        </div>

        {goals === null ? (
          <div className={styles.goalList}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.skeletonCard}>
                <Skeleton height={18} width="55%" />
                <Skeleton height={13} width="80%" />
                <Skeleton height={8} />
                <Skeleton height={13} width="40%" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message="No goals yet. Set objectives your Specs and initiatives ladder up to."
            action={
              isAdmin ? (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  New goal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={styles.goalList}>
            {filtered.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                isAdmin={isAdmin}
                onDelete={setDeleteTarget}
                onStatusChange={changeStatus}
                onKRUpdated={handleKRUpdated}
                onAddKR={openAddKR}
              />
            ))}
          </div>
        )}

        {/* ── Create goal dialog ──────────────────────────────── */}
        <RDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content className={styles.dialogContent} aria-describedby={undefined}>
              <RDialog.Title className={styles.dialogTitle}>New goal</RDialog.Title>
              <form onSubmit={submitCreateGoal} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="goal-title">
                    Objective
                  </label>
                  <Input
                    id="goal-title"
                    placeholder="e.g. Grow active users in Q3"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="goal-desc">
                    Description <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="goal-desc"
                    placeholder="Supporting context or rationale"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="goal-start">
                      Start period <span className={styles.optional}>(optional)</span>
                    </label>
                    <Input
                      id="goal-start"
                      placeholder="e.g. 2026-Q3"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="goal-end">
                      End period <span className={styles.optional}>(optional)</span>
                    </label>
                    <Input
                      id="goal-end"
                      placeholder="e.g. 2026-Q3"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                    />
                  </div>
                </div>
                {teams.length > 0 && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Team <span className={styles.optional}>(optional)</span>
                    </label>
                    <Select
                      value={newTeam}
                      onValueChange={setNewTeam}
                      options={newTeamOptions}
                      ariaLabel="Select team"
                    />
                  </div>
                )}
                {createError && <p className={styles.dialogError}>{createError}</p>}
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={createBusy}>
                    Create
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Add key result dialog ────────────────────────────── */}
        <RDialog.Root open={krGoal !== null} onOpenChange={(open) => !open && setKrGoal(null)}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content className={styles.dialogContent} aria-describedby={undefined}>
              <RDialog.Title className={styles.dialogTitle}>
                Add key result
              </RDialog.Title>
              <form onSubmit={submitAddKR} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="kr-title">
                    Key result
                  </label>
                  <Input
                    id="kr-title"
                    placeholder="e.g. Increase weekly active users"
                    value={krTitle}
                    onChange={(e) => setKrTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="kr-unit">
                      Unit <span className={styles.optional}>(optional)</span>
                    </label>
                    <Input
                      id="kr-unit"
                      placeholder="e.g. users, %, NPS"
                      value={krUnit}
                      onChange={(e) => setKrUnit(e.target.value)}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="kr-target">
                      Target <span className={styles.optional}>(optional)</span>
                    </label>
                    <Input
                      id="kr-target"
                      type="number"
                      placeholder="e.g. 10000"
                      value={krTarget}
                      onChange={(e) => setKrTarget(e.target.value)}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="kr-current">
                      Current
                    </label>
                    <Input
                      id="kr-current"
                      type="number"
                      placeholder="0"
                      value={krCurrent}
                      onChange={(e) => setKrCurrent(e.target.value)}
                    />
                  </div>
                </div>
                {krError && <p className={styles.dialogError}>{krError}</p>}
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={krBusy}>
                    Add
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Delete confirm ────────────────────────────────────── */}
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.title ?? ""}"?`}
          body="This will delete the goal and all its key results. Linked specs are unaffected."
          confirmLabel="Delete"
          danger
          onConfirm={deleteGoal}
        />
      </PageShell>
    </>
  );
}
