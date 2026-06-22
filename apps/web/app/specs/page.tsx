"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Spec } from "../../lib/api";
import { InsightBar } from "../../components/insight-bar";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { StatusBadge } from "../../components/status-badge";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { useToast } from "../../components/toast";
import styles from "./specs.module.css";

type Team = { id: string; name: string };

// Formats an ISO timestamp as a human-relative string (today, yesterday, N days ago).
// Keeps it honest: no fake "just now" without a real sub-minute threshold.
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  if (diffD < 30) return `${diffD}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Persist per-org in localStorage — key built after orgId is fetched.
function teamFilterKey(orgId: string) {
  return `burrow:specs:teamId:${orgId}`;
}

export default function SpecListPage() {
  const router = useRouter();
  const toast = useToast();
  const [specs, setSpecs] = useState<Spec[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Spec | null>(null);
  const [busy, setBusy] = useState(false);

  // Keyboard navigation (UX review #7). Roving-tabindex selection over the
  // visible rows. Scoped to the list container's onKeyDown — we never bind a
  // document handler, so the global ⌘K / `/` / `g` layer is untouched.
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Team filter state
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>("__all__");

  // Load teams and org for the filter
  useEffect(() => {
    api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => {});
    api<{ org: { id: string } }>("/api/org")
      .then((d) => {
        const oid = d.org.id;
        setOrgId(oid);
        // Restore persisted filter
        const saved = typeof window !== "undefined"
          ? localStorage.getItem(teamFilterKey(oid))
          : null;
        if (saved) setTeamFilter(saved);
      })
      .catch(() => {});
  }, []);

  const load = (includeArchived: boolean, teamId: string) => {
    const params = new URLSearchParams();
    if (includeArchived) params.set("includeArchived", "1");
    if (teamId !== "__all__") params.set("teamId", teamId);
    const qs = params.toString();
    return api<Spec[]>(`/api/specs${qs ? `?${qs}` : ""}`)
      .then(setSpecs)
      .catch(() => router.push("/signin"));
  };

  useEffect(() => {
    load(showArchived, teamFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, teamFilter]);

  function selectTeam(value: string) {
    setTeamFilter(value);
    if (orgId) {
      localStorage.setItem(teamFilterKey(orgId), value);
    }
  }

  async function createSpec() {
    setBusy(true);
    try {
      const spec = await api<Spec>("/api/specs", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/specs/${spec.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function archiveSpec() {
    if (!archiveTarget) return;
    try {
      await api(`/api/specs/${archiveTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      });
      toast("Spec archived.", "default");
      load(showArchived, teamFilter);
    } catch {
      toast("Archive failed — try again.", "danger");
    } finally {
      setArchiveTarget(null);
    }
  }

  const visibleSpecs = specs?.filter(
    (s) => showArchived || s.status !== "archived"
  );

  const rowCount = visibleSpecs?.length ?? 0;

  // Keep selection in range when the visible set changes (filter/archive toggle).
  useEffect(() => {
    setSelected((i) => (rowCount === 0 ? 0 : Math.min(i, rowCount - 1)));
  }, [rowCount]);

  // Arrow/J/K move the highlight; Enter opens. Bails inside fields so it never
  // fights typing, and only fires while focus is within the list (onKeyDown).
  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
      return;
    }
    if (rowCount === 0) return;
    const move = (next: number) => {
      e.preventDefault();
      const clamped = Math.max(0, Math.min(next, rowCount - 1));
      setSelected(clamped);
      rowRefs.current[clamped]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "j") move(selected + 1);
    else if (e.key === "ArrowUp" || e.key === "k") move(selected - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(rowCount - 1);
    else if (e.key === "Enter") {
      const spec = visibleSpecs?.[selected];
      if (spec) {
        e.preventDefault();
        router.push(`/specs/${spec.id}`);
      }
    }
  }

  const activeTeam = teams.find((t) => t.id === teamFilter);

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Specs</h1>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
            <Button variant="primary" onClick={createSpec} busy={busy}>
              New spec
            </Button>
          </div>
        </div>

        {/* Team filter — only shown when the org has teams */}
        {teams.length > 0 && (
          <div className={styles.teamFilter} role="group" aria-label="Filter by team">
            <button
              className={`${styles.teamFilterBtn} ${teamFilter === "__all__" ? styles.teamFilterActive : ""}`}
              onClick={() => selectTeam("__all__")}
            >
              All teams
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                className={`${styles.teamFilterBtn} ${teamFilter === t.id ? styles.teamFilterActive : ""}`}
                onClick={() => selectTeam(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Backlog insights — overlaps, customer themes with no Spec, goal gaps —
            surfaced before a PM creates or picks up work (item 1). */}
        {specs !== null && visibleSpecs!.length > 0 && <InsightBar surface="backlog" />}

        {specs === null ? (
          <ul className={styles.list} aria-label="Loading specs">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className={styles.skeletonRow}>
                <Skeleton width={52} height={14} />
                <span className={styles.skeletonTitleCol}>
                  <Skeleton height={14} />
                  <Skeleton height={11} width="40%" />
                </span>
                <Skeleton width={72} height={20} radius="var(--radius-full)" />
              </li>
            ))}
          </ul>
        ) : visibleSpecs!.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 3.5h7L19 8.5v12h-12v-17Zm7 0v5h5M9.5 12.5h5m-5 3.5h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message={
              activeTeam
                ? `No Specs in ${activeTeam.name} yet.`
                : "No Specs yet. Write your first one — then open it in two windows."
            }
            action={
              <Button variant="primary" onClick={createSpec} busy={busy}>
                New spec
              </Button>
            }
          />
        ) : (
          <ul
            className={styles.list}
            onKeyDown={onListKeyDown}
            aria-label="Specs"
          >
            {visibleSpecs!.map((s, i) => (
              <li key={s.id} className={styles.rowWrap}>
                <Link
                  href={`/specs/${s.id}`}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={`${styles.row} ${i === selected ? styles.rowSelected : ""}`}
                  tabIndex={i === selected ? 0 : -1}
                  aria-selected={i === selected}
                  onFocus={() => setSelected(i)}
                >
                  <span className={styles.displayId}>{s.displayId}</span>
                  <span className={styles.titleCol}>
                    <span className={styles.title}>{s.title || "Untitled spec"}</span>
                    <span className={styles.updatedAt}>
                      updated {formatRelative(s.updatedAt)}
                    </span>
                  </span>
                  <StatusBadge status={s.status} />
                  {/* Agent-active indicator: in_progress specs may have agents working */}
                  {s.status === "in_progress" && (
                    <span
                      className={styles.agentDot}
                      aria-label="In progress"
                      title="In progress"
                    />
                  )}
                </Link>
                {s.status !== "archived" && (
                  <button
                    className={styles.archiveBtn}
                    aria-label={`Archive ${s.title || s.displayId}`}
                    onClick={() => setArchiveTarget(s)}
                    title="Archive"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                      <path
                        d="M2 3.5h11v2H2zM3 6.5v5.5h9V6.5m-5.5 2h4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={archiveTarget !== null}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
          title="Archive this Spec?"
          body="Archived Specs are hidden by default. You can show them again with the toggle."
          confirmLabel="Archive"
          danger={false}
          onConfirm={archiveSpec}
        />
      </PageShell>
    </>
  );
}
