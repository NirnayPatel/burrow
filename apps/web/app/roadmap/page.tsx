"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { InsightBar } from "../../components/insight-bar";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Select } from "../../components/select";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { useToast } from "../../components/toast";
import styles from "./roadmap.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

type Horizon = "now" | "next" | "later";

type Initiative = {
  id: string;
  title: string;
  description: string | null;
  horizon: Horizon;
  status: string;
  teamId: string | null;
  teamName?: string | null;
  specCount: number;
  specsDone: number;
};

type InitiativeSpec = {
  id: string;
  displayId: string;
  title: string;
  status: string;
};

type Team = { id: string; name: string };
type OrgSpec = { id: string; displayId: string; title: string };

// ── Constants ────────────────────────────────────────────────────────────────

const HORIZONS: { key: Horizon; label: string; description: string }[] = [
  { key: "now", label: "Now", description: "Actively shipping" },
  { key: "next", label: "Next", description: "Up next in queue" },
  { key: "later", label: "Later", description: "Future consideration" },
];

const HORIZON_OPTIONS = HORIZONS.map((h) => ({ value: h.key, label: h.label }));

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressPill({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className={styles.progressPillEmpty}>No specs</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <span className={styles.progressPill}>
      <span
        className={styles.progressPillBar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${done} of ${total} specs done`}
      >
        <span
          className={styles.progressPillFill}
          style={{ "--progress-pct": `${pct}%` } as React.CSSProperties}
        />
      </span>
      <span className={styles.progressPillLabel}>
        {done}/{total} specs
      </span>
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "active"
      ? styles.dotActive
      : status === "paused"
        ? styles.dotPaused
        : status === "done"
          ? styles.dotDone
          : styles.dotArchived;
  return <span className={`${styles.statusDot} ${cls}`} aria-hidden="true" />;
}

// ── SpecsPanel: expanded card section ─────────────────────────────────────────

function SpecsPanel({
  initiative,
  orgSpecs,
  onClose,
}: {
  initiative: Initiative;
  orgSpecs: OrgSpec[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [specs, setSpecs] = useState<InitiativeSpec[] | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedSpecId, setSelectedSpecId] = useState("__none__");

  useEffect(() => {
    api<InitiativeSpec[]>(`/api/initiatives/${initiative.id}/specs`)
      .then(setSpecs)
      .catch(() => setSpecs([]));
  }, [initiative.id]);

  // Specs not yet assigned to this initiative
  const assignedIds = new Set((specs ?? []).map((s) => s.id));
  const availableSpecs = orgSpecs.filter((s) => !assignedIds.has(s.id));
  const specOptions = [
    { value: "__none__", label: "Select a spec…" },
    ...availableSpecs.map((s) => ({ value: s.id, label: `${s.displayId} — ${s.title}` })),
  ];

  async function assignSpec() {
    if (selectedSpecId === "__none__") return;
    setAssigning(true);
    try {
      await api(`/api/specs/${selectedSpecId}/initiative`, {
        method: "PATCH",
        body: JSON.stringify({ initiativeId: initiative.id }),
      });
      const updated = await api<InitiativeSpec[]>(`/api/initiatives/${initiative.id}/specs`);
      setSpecs(updated);
      setSelectedSpecId("__none__");
      toast("Spec added to initiative.", "success");
    } catch {
      toast("Failed to assign spec — try again.", "danger");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className={styles.specsPanel}>
      <div className={styles.specsPanelHeader}>
        <span className={styles.specsPanelTitle}>Specs in this initiative</span>
        <button className={styles.specsPanelClose} onClick={onClose} aria-label="Close specs panel">
          ×
        </button>
      </div>

      {specs === null ? (
        <div className={styles.specsList}>
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="60%" />
        </div>
      ) : specs.length === 0 ? (
        <p className={styles.specsEmpty}>No specs assigned yet.</p>
      ) : (
        <ul className={styles.specsList} aria-label="Assigned specs">
          {specs.map((s) => (
            <li key={s.id} className={styles.specRow}>
              <span className={styles.specDisplayId}>{s.displayId}</span>
              <span className={styles.specTitle}>{s.title}</span>
              <span className={`${styles.specStatus} ${styles[`specStatus_${s.status}`]}`}>
                {s.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {availableSpecs.length > 0 && (
        <div className={styles.assignRow}>
          <div className={styles.assignSelect}>
            <Select
              value={selectedSpecId}
              onValueChange={setSelectedSpecId}
              options={specOptions}
              ariaLabel="Select spec to assign"
            />
          </div>
          <Button
            variant="secondary"
            busy={assigning}
            onClick={assignSpec}
            disabled={selectedSpecId === "__none__"}
          >
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}

// ── InitiativeCard ─────────────────────────────────────────────────────────────

const InitiativeCard = forwardRef<HTMLDivElement, {
  initiative: Initiative;
  isAdmin: boolean;
  orgSpecs: OrgSpec[];
  teams: Team[];
  selected: boolean;
  tabIndex: number;
  draggable: boolean;
  onFocus: () => void;
  registerToggle: (fn: (() => void) | null) => void;
  onHorizonChange: (id: string, horizon: Horizon) => void;
  onDelete: (initiative: Initiative) => void;
}>(function InitiativeCard(
  {
    initiative,
    isAdmin,
    orgSpecs,
    teams,
    selected,
    tabIndex,
    draggable,
    onFocus,
    registerToggle,
    onHorizonChange,
    onDelete,
  },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  // Tracks the HTML5-DnD lifting state so we can apply a calm "lifted" class
  // (reduced opacity + accent border) only while this card is the drag source.
  const [dragging, setDragging] = useState(false);

  const horizonOpts = HORIZON_OPTIONS.filter((h) => h.value !== initiative.horizon);

  // Expose the expand toggle to the parent so Enter on the selected card opens
  // its specs panel — matching what clicking "View specs" does.
  useEffect(() => {
    registerToggle(() => setExpanded((v) => !v));
    return () => registerToggle(null);
  }, [registerToggle]);

  return (
    <div
      ref={ref}
      className={`${styles.card} ${selected ? styles.cardSelected : ""} ${
        dragging ? styles.cardDragging : ""
      }`}
      tabIndex={tabIndex}
      aria-selected={selected}
      onFocus={onFocus}
      // HTML5 DnD. Only admins can move horizons, so only their cards drag.
      // The drag is purely additive: keyboard selection (roving tabindex) and
      // the Move-to buttons below stay fully functional.
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Payload: the initiative id + its source horizon. The source horizon
        // lets the drop target no-op a same-column drop without a network call.
        e.dataTransfer.setData("application/x-initiative-id", initiative.id);
        e.dataTransfer.setData("application/x-initiative-horizon", initiative.horizon);
        // text/plain fallback so the drag image / other consumers see the id.
        e.dataTransfer.setData("text/plain", initiative.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <StatusDot status={initiative.status} />
          <h3 className={styles.cardTitle}>{initiative.title}</h3>
        </div>
        <div className={styles.cardBadges}>
          {initiative.teamName && (
            <span className={styles.chip}>{initiative.teamName}</span>
          )}
          <span className={`${styles.statusChip} ${styles[`statusChip_${initiative.status}`]}`}>
            {initiative.status}
          </span>
        </div>
      </div>

      {initiative.description && (
        <p className={styles.cardDesc}>{initiative.description}</p>
      )}

      <ProgressPill done={initiative.specsDone} total={initiative.specCount} />

      <div className={styles.cardFooter}>
        <button
          className={styles.specsToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide specs" : "Show specs"}
        >
          {expanded ? "Hide specs" : "View specs"}
        </button>

        {isAdmin && (
          <div className={styles.cardActions}>
            <span className={styles.moveLabel}>Move to:</span>
            {horizonOpts.map((h) => (
              <button
                key={h.value}
                className={styles.moveBtn}
                onClick={() => onHorizonChange(initiative.id, h.value as Horizon)}
                aria-label={`Move to ${h.label}`}
              >
                {h.label}
              </button>
            ))}
            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(initiative)}
              aria-label="Delete initiative"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <SpecsPanel
          initiative={initiative}
          orgSpecs={orgSpecs}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
});

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const toast = useToast();

  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgSpecs, setOrgSpecs] = useState<OrgSpec[]>([]);
  const [myRole, setMyRole] = useState("member");
  const [teamFilter, setTeamFilter] = useState("__all__");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newHorizon, setNewHorizon] = useState<string>("now");
  const [newTeam, setNewTeam] = useState("__none__");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Initiative | null>(null);

  // Keyboard navigation (UX review #7). Selection is scoped per column —
  // arrow/J/K move within the focused Now/Next/Later column. Refs and the
  // expand-toggle registry are keyed by `${horizon}:${index}`. Handlers live on
  // each column's onKeyDown, so the global ⌘K / `/` / `g` layer is never touched.
  const [selected, setSelected] = useState<{ horizon: Horizon; index: number }>({
    horizon: "now",
    index: 0,
  });
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const toggleRefs = useRef<Record<string, (() => void) | null>>({});

  // Drag-to-move (UX review #10). Which column is currently a hovered drop
  // target — drives the calm `.columnDropActive` affordance. Null when nothing
  // is being dragged over a column. Drag is additive to the Move-to buttons,
  // which stay as the keyboard/a11y fallback (HTML5 DnD isn't keyboard-driven).
  const [dropTarget, setDropTarget] = useState<Horizon | null>(null);

  const isAdmin = myRole === "admin";

  function loadInitiatives() {
    api<Initiative[]>("/api/initiatives")
      .then(setInitiatives)
      .catch(() => setInitiatives([]));
  }

  useEffect(() => {
    loadInitiatives();
    api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => {});
    api<OrgSpec[]>("/api/specs")
      .then(setOrgSpecs)
      .catch(() => {});
    api<{ myRole: string }>("/api/me")
      .then((d) => setMyRole(d.myRole))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateBusy(true);
    try {
      const body: Record<string, string> = {
        title: newTitle.trim(),
        horizon: newHorizon,
      };
      if (newDesc.trim()) body.description = newDesc.trim();
      if (newTeam !== "__none__") body.teamId = newTeam;
      await api("/api/initiatives", { method: "POST", body: JSON.stringify(body) });
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewHorizon("now");
      setNewTeam("__none__");
      loadInitiatives();
      toast("Initiative created.", "success");
    } catch {
      setCreateError("Create failed — try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function moveHorizon(id: string, horizon: Horizon) {
    try {
      await api(`/api/initiatives/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ horizon }),
      });
      setInitiatives((prev) =>
        prev ? prev.map((i) => (i.id === id ? { ...i, horizon } : i)) : prev
      );
      toast(`Moved to ${horizon}.`, "default");
    } catch {
      toast("Move failed — try again.", "danger");
    }
  }

  async function deleteInitiative() {
    if (!deleteTarget) return;
    try {
      await api(`/api/initiatives/${deleteTarget.id}`, { method: "DELETE" });
      setInitiatives((prev) => prev?.filter((i) => i.id !== deleteTarget.id) ?? prev);
      toast("Initiative deleted.", "default");
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteTarget(null);
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

  // Filter + group by horizon
  const filtered = (initiatives ?? []).filter(
    (i) => teamFilter === "__all__" || i.teamId === teamFilter
  );
  const byHorizon = (h: Horizon) => filtered.filter((i) => i.horizon === h);

  const totalCount = (initiatives ?? []).length;

  // Arrow/J/K move within a column; Enter opens the selected card's specs panel
  // (same as clicking "View specs"). Bails inside fields and only fires while a
  // card in this column has focus.
  function onColumnKeyDown(e: React.KeyboardEvent<HTMLDivElement>, horizon: Horizon, count: number) {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
      return;
    }
    if (count === 0) return;
    const cur = selected.horizon === horizon ? selected.index : 0;
    const focusAt = (next: number) => {
      e.preventDefault();
      const clamped = Math.max(0, Math.min(next, count - 1));
      setSelected({ horizon, index: clamped });
      cardRefs.current[`${horizon}:${clamped}`]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "j") focusAt(cur + 1);
    else if (e.key === "ArrowUp" || e.key === "k") focusAt(cur - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(count - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      toggleRefs.current[`${horizon}:${cur}`]?.();
    }
  }

  // Drop handler for a column. Reads the initiative id from dataTransfer and
  // reuses the exact same move flow as the buttons (moveHorizon → PATCH +
  // optimistic update + toast). No-ops if dropped on its source column.
  function onColumnDrop(e: React.DragEvent<HTMLDivElement>, horizon: Horizon) {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData("application/x-initiative-id");
    const from = e.dataTransfer.getData("application/x-initiative-horizon");
    if (!id || from === horizon) return;
    moveHorizon(id, horizon);
  }

  return (
    <>
      <AppNav />
      <PageShell width="wide">
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.heading}>Roadmap</h1>
            <p className={styles.subheading}>
              Group Specs into what you&#39;re shipping now, next, and later.
            </p>
          </div>
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
                New initiative
              </Button>
            )}
          </div>
        </div>

        {/* Context-Graph insights for the whole roadmap — present where the
            decision is made (item 1). Renders nothing if no key / nothing to say. */}
        {totalCount > 0 && <InsightBar surface="roadmap" />}

        {initiatives === null ? (
          <div className={styles.board}>
            {HORIZONS.map((h) => (
              <div key={h.key} className={styles.column}>
                <div className={styles.columnHeader}>
                  <span className={styles.columnLabel}>{h.label}</span>
                  <span className={styles.columnDesc}>{h.description}</span>
                </div>
                <div className={styles.columnBody}>
                  {[1, 2].map((i) => (
                    <div key={i} className={styles.skeletonCard}>
                      <Skeleton height={16} width="70%" />
                      <Skeleton height={13} width="90%" />
                      <Skeleton height={8} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message="No initiatives yet. Group Specs into what you're shipping now, next, and later."
            action={
              isAdmin ? (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  New initiative
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={styles.board}>
            {HORIZONS.map((h) => {
              const items = byHorizon(h.key);
              return (
                <div key={h.key} className={styles.column}>
                  <div className={styles.columnHeader}>
                    <span className={styles.columnLabel}>{h.label}</span>
                    <span className={styles.columnCount}>{items.length}</span>
                    <span className={styles.columnDesc}>{h.description}</span>
                  </div>
                  <div
                    className={`${styles.columnBody} ${
                      dropTarget === h.key ? styles.columnDropActive : ""
                    }`}
                    onKeyDown={(e) => onColumnKeyDown(e, h.key, items.length)}
                    onDragOver={(e) => {
                      // preventDefault is required to mark this a valid drop
                      // target; without it onDrop never fires.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropTarget !== h.key) setDropTarget(h.key);
                    }}
                    onDragLeave={(e) => {
                      // Only clear when the pointer actually leaves the column,
                      // not when moving between child cards (relatedTarget still
                      // inside the column body).
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDropTarget((cur) => (cur === h.key ? null : cur));
                      }
                    }}
                    onDrop={(e) => onColumnDrop(e, h.key)}
                  >
                    {items.length === 0 ? (
                      <p className={styles.columnEmpty}>Nothing here yet.</p>
                    ) : (
                      items.map((initiative, idx) => {
                        const isSel =
                          selected.horizon === h.key && selected.index === idx;
                        // Roving tabindex: the selected card is the tab stop;
                        // if selection points at another column, this column's
                        // first card stays tabbable as its entry point.
                        const tabbable =
                          isSel || (selected.horizon !== h.key && idx === 0);
                        return (
                          <InitiativeCard
                            key={initiative.id}
                            ref={(el) => {
                              cardRefs.current[`${h.key}:${idx}`] = el;
                            }}
                            initiative={initiative}
                            isAdmin={isAdmin}
                            orgSpecs={orgSpecs}
                            teams={teams}
                            selected={isSel}
                            tabIndex={tabbable ? 0 : -1}
                            draggable={isAdmin}
                            onFocus={() => setSelected({ horizon: h.key, index: idx })}
                            registerToggle={(fn) => {
                              toggleRefs.current[`${h.key}:${idx}`] = fn;
                            }}
                            onHorizonChange={moveHorizon}
                            onDelete={setDeleteTarget}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Create initiative dialog ──────────────────────────── */}
        <RDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content className={styles.dialogContent} aria-describedby={undefined}>
              <RDialog.Title className={styles.dialogTitle}>New initiative</RDialog.Title>
              <form onSubmit={submitCreate} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="init-title">
                    Title
                  </label>
                  <Input
                    id="init-title"
                    placeholder="e.g. Mobile onboarding revamp"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="init-desc">
                    Description <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="init-desc"
                    placeholder="Brief context for the team"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Horizon</label>
                  <Select
                    value={newHorizon}
                    onValueChange={setNewHorizon}
                    options={HORIZON_OPTIONS}
                    ariaLabel="Select horizon"
                  />
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

        {/* ── Delete confirm ────────────────────────────────────── */}
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.title ?? ""}"?`}
          body="This will remove the initiative. Specs will not be deleted."
          confirmLabel="Delete"
          danger
          onConfirm={deleteInitiative}
        />
      </PageShell>
    </>
  );
}
