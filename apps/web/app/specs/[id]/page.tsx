"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import type { BlockNoteEditor } from "@blocknote/core";
import { api, type Spec } from "../../../lib/api";
import { SpecEditor } from "./spec-editor";
import { BreakdownPanel } from "./breakdown-panel";
import { SignoffPanel } from "./signoff-panel";
import { RunsTab } from "./runs-tab";
import { AssistantTab } from "./assistant-tab";
import { StateOfSpec } from "./state-of-spec";
import { InitiativePicker } from "./initiative-picker";
import type { SpecSlashActions } from "./ai-slash-menu";
import { appendMarkdown } from "./editor-bridge";
import { PageShell } from "../../../components/page-shell";
import { Breadcrumb } from "../../../components/breadcrumb";
import { AppNav } from "../../../components/app-nav";
import { Input } from "../../../components/input";
import { Select } from "../../../components/select";
import { StatusBadge, STATUSES, STATUS_LABEL } from "../../../components/status-badge";
import { PresenceStack, type Collaborator } from "../../../components/presence-stack";
import { AgentAvatar } from "../../../components/agent-avatar";
import { relativeTime } from "../../../lib/relative-time";
import { useToast } from "../../../components/toast";
import styles from "./spec.module.css";

type Team = { id: string; name: string };

type SpecAgent = { name: string; lastSummary: string; at: string };

// An agent counts as "working" if it acted on the spec within this window —
// drives the blue ring on its square avatar (11-DESIGN §3c-i).
const AGENT_WORKING_MS = 5 * 60_000;
const AGENT_POLL_MS = 15_000;

export default function SpecPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [spec, setSpec] = useState<Spec | null>(null);
  const [auth, setAuth] = useState<{ token: string; name: string } | null>(null);
  const [people, setPeople] = useState<Collaborator[]>([]);
  const [agents, setAgents] = useState<SpecAgent[]>([]);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const [assistantCount, setAssistantCount] = useState(0);
  const [teams, setTeams] = useState<Team[]>([]);
  // Default = Edit (current behavior unchanged). Reviewers flip to Read for a
  // calm, document-like read view. Toggling never remounts SpecEditor, so the
  // multiplayer doc stays bound across the switch.
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const reading = mode === "read";

  // Controlled intelligence tab so slash actions can switch it (#5) and so we
  // can fire the Assistant focus signal on open (#13).
  const [tab, setTab] = useState<string | null>(null);
  // Bumped to kick breakdown generation from the "/breakdown" slash action (#5).
  const [breakdownSignal, setBreakdownSignal] = useState(0);
  // Bumped to focus the Assistant "Ask AI" input when its tab opens (#13).
  const [assistantFocus, setAssistantFocus] = useState(0);
  // Initiative picker for the "/link initiative" slash action (#5).
  const [pickerOpen, setPickerOpen] = useState(false);
  // Header recede on scroll (#8): true once the user scrolls into the doc.
  const [scrolled, setScrolled] = useState(false);

  // Auto-focus the title on a freshly-created (still "Untitled") spec (#13).
  const titleRef = useRef<HTMLDivElement>(null);
  const titleFocused = useRef(false);

  useEffect(() => {
    Promise.all([
      api<Spec>(`/api/specs/${id}`),
      api<{ token: string }>("/api/collab-token"),
      api<{ user: { name: string } }>("/api/me"),
    ])
      .then(([s, t, me]) => {
        setSpec(s);
        setAuth({ token: t.token, name: me.user?.name ?? "anonymous" });
      })
      .catch(() => router.push("/signin"));
    // Load org teams for the team picker — non-blocking
    api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => {});
  }, [id, router]);

  // Poll for agents working this spec so they appear next to human presence.
  useEffect(() => {
    let live = true;
    const load = () =>
      api<{ agents: SpecAgent[] }>(`/api/specs/${id}/agents`)
        .then((r) => live && setAgents(r.agents))
        .catch(() => {});
    load();
    const t = setInterval(load, AGENT_POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id]);

  // Header recede on scroll (#8): once the user scrolls past a small threshold,
  // the secondary chrome (lifecycle row, presence) shrinks so the doc owns the
  // viewport — Notion-style. rAF-throttled so the listener stays cheap; a
  // hysteresis gap (recede at 48, restore at 24) avoids flicker at the edge.
  // The CSS transition is gated on prefers-reduced-motion — this only flips the
  // class, so reduced-motion users jump straight to the end state.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 24 : y > 48));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-focus the title input on a fresh, still-"Untitled" spec (#13). Runs
  // once: never steals focus on later loads, in read mode, or while the user is
  // already typing elsewhere (an active element guard). Input doesn't forward a
  // ref, so we reach its underlying <input> through the title row container.
  useEffect(() => {
    if (titleFocused.current || !spec || reading) return;
    if (spec.title !== "Untitled") return;
    const active = document.activeElement;
    if (active && active.tagName === "INPUT") return;
    titleRef.current?.querySelector("input")?.focus();
    titleFocused.current = true;
  }, [spec, reading]);

  // Stable identity so SpecEditor's effect doesn't re-subscribe on every render.
  const handlePeople = useCallback((next: Collaborator[]) => setPeople(next), []);
  const handleEditor = useCallback((ed: BlockNoteEditor | null) => setEditor(ed), []);

  // Insert AI output from the Assistant tab into the live doc.
  const insertIntoSpec = useCallback(
    async (markdown: string) => {
      if (editor) await appendMarkdown(editor, markdown);
    },
    [editor],
  );

  // Spec-object slash actions (#5). Breakdown + request-review hand off to the
  // panel flows already wired below; link initiative opens the picker. None of
  // these touch the editor's collab binding — they only call page state setters.
  const specActions: SpecSlashActions = {
    onBreakdown: () => {
      setTab("breakdown");
      setBreakdownSignal((n) => n + 1);
    },
    onRequestReview: () => {
      setTab("signoff");
      void patch({ status: "in_review" });
      toast("Review requested.", "success");
    },
    onLinkInitiative: () => setPickerOpen(true),
  };

  // Switching the intelligence tab; opening Assistant bumps its focus signal so
  // the Ask AI input grabs focus (#13).
  function handleTabChange(next: string) {
    setTab(next);
    if (next === "assistant") setAssistantFocus((n) => n + 1);
  }

  async function patch(fields: Partial<Pick<Spec, "title" | "status">>) {
    const updated = await api<Spec>(`/api/specs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    setSpec(updated);
  }

  // Optimistic team assignment — PATCH /api/specs/:id/team, update local state
  async function assignTeam(teamId: string | null) {
    if (!spec) return;
    const prev = spec.teamId;
    // Optimistic update
    setSpec({ ...spec, teamId });
    try {
      const updated = await api<Spec>(`/api/specs/${id}/team`, {
        method: "PATCH",
        body: JSON.stringify({ teamId }),
      });
      setSpec(updated);
      const teamName = teams.find((t) => t.id === teamId)?.name;
      toast(
        teamId ? `Assigned to ${teamName ?? "team"}.` : "Removed from team.",
        "success"
      );
    } catch {
      // Roll back optimistic update
      setSpec({ ...spec, teamId: prev });
      toast("Team update failed — try again.", "danger");
    }
  }

  if (!spec || !auth)
    return (
      <>
        <AppNav />
        <PageShell width="wide">
          <p className={styles.loading}>Loading…</p>
        </PageShell>
      </>
    );

  // A fresh spec opens on Assistant (AI is here to help you write); a spec
  // that's underway opens on Breakdown (11-DESIGN §3d).
  const defaultTab =
    spec.status === "approved" ||
    spec.status === "in_progress" ||
    spec.status === "done"
      ? "breakdown"
      : "assistant";
  // Controlled tab value falls back to the status-derived default until a slash
  // action or a click sets it explicitly.
  const activeTab = tab ?? defaultTab;

  return (
    <>
      <AppNav />
      <PageShell width="wide">
        <Breadcrumb
          items={[{ label: "Specs", href: "/specs" }, { label: spec.displayId }]}
        />
        {/* Header recedes once the user scrolls into the doc (#8) so the doc
            owns the viewport. The class only shrinks secondary chrome; the
            Edit/Read toggle and presence stay live. */}
        <header
          className={`${styles.specHeader} ${scrolled ? styles.specHeaderReceded : ""}`}
        >
          <div className={styles.titleRow} ref={titleRef}>
            <span className={styles.displayId}>{spec.displayId}</span>
            {reading ? (
              // Read mode: title as static text — edit chrome hidden.
              <h1 className={styles.titleStatic}>{spec.title}</h1>
            ) : (
              <Input
                variant="borderless"
                className={styles.titleInput}
                defaultValue={spec.title}
                aria-label="Spec title"
                onBlur={(e) =>
                  e.target.value !== spec.title &&
                  patch({ title: e.target.value })
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.target as HTMLInputElement).blur()
                }
              />
            )}
            {/* Quiet Read/Edit toggle — a calm segmented control. Default Edit. */}
            <div
              className={styles.modeToggle}
              role="group"
              aria-label="Reading mode"
            >
              <button
                type="button"
                className={styles.modeOption}
                data-active={!reading}
                aria-pressed={!reading}
                onClick={() => setMode("edit")}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.modeOption}
                data-active={reading}
                aria-pressed={reading}
                onClick={() => setMode("read")}
              >
                Read
              </button>
            </div>
            <div className={styles.presenceRow}>
              <PresenceStack people={people} />
              {agents.length > 0 && (
                <div className={styles.agentStack}>
                  {agents.slice(0, 4).map((a) => {
                    const working =
                      Date.now() - new Date(a.at).getTime() < AGENT_WORKING_MS;
                    return (
                      <AgentAvatar
                        key={a.name}
                        name={a.name}
                        working={working}
                        idle={!working}
                        title={`${a.name} · ${a.lastSummary} · ${relativeTime(a.at)}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className={styles.lifecycleRow}>
            <StatusBadge status={spec.status} />
            {/* Status Select + team picker are author chrome — hidden in read
                mode, where the StatusBadge above carries the state read-only. */}
            {!reading && (
              <>
                <Select
                  value={spec.status}
                  onValueChange={(v) => patch({ status: v as Spec["status"] })}
                  ariaLabel="Change lifecycle state"
                  options={STATUSES.map((s) => ({
                    value: s,
                    label: STATUS_LABEL[s],
                  }))}
                />
                {teams.length > 0 && (
                  <Select
                    value={spec.teamId ?? "__none__"}
                    onValueChange={(v) =>
                      assignTeam(v === "__none__" ? null : v)
                    }
                    ariaLabel="Assign to team"
                    options={[
                      { value: "__none__", label: "No team" },
                      ...teams.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                )}
              </>
            )}
          </div>
        </header>

        <div className={`${styles.body} ${reading ? styles.bodyReading : ""}`}>
          <div className={styles.hero}>
            {/* Read mode pins the AI "State of this Spec" card above the doc.
                Same SpecEditor instance either way — only `editable` flips, so
                the live multiplayer binding survives the toggle. */}
            {reading && <StateOfSpec specId={spec.id} />}
            <SpecEditor
              docName={`spec:${spec.ydocId}`}
              token={auth.token}
              userName={auth.name}
              specId={spec.id}
              editable={!reading}
              onPeopleChange={handlePeople}
              onEditorReady={handleEditor}
              specActions={specActions}
            />
          </div>
          {/* The intelligence tabs are author chrome — the doc owns the
              viewport in read mode. The header's Read/Edit toggle is the way
              back to editing. */}
          {!reading && (
          <aside className={styles.side}>
            <Tabs.Root
              value={activeTab}
              onValueChange={handleTabChange}
              className={styles.tabs}
            >
              <Tabs.List className={styles.tabList} aria-label="Intelligence panel">
                <Tabs.Trigger value="breakdown" className={styles.tab}>
                  Breakdown
                </Tabs.Trigger>
                <Tabs.Trigger value="signoff" className={styles.tab}>
                  Sign-off
                </Tabs.Trigger>
                <Tabs.Trigger value="runs" className={styles.tab}>
                  Runs
                  {agents.length > 0 && (
                    <span className={styles.tabSpark} aria-hidden="true">
                      ✦{agents.length}
                    </span>
                  )}
                </Tabs.Trigger>
                <Tabs.Trigger value="assistant" className={styles.tab}>
                  Assistant
                  {assistantCount > 0 && (
                    <span className={styles.tabSpark} aria-hidden="true">
                      ✦{assistantCount}
                    </span>
                  )}
                </Tabs.Trigger>
              </Tabs.List>

              {/* forceMount keeps the panel mounted so a "/breakdown" slash
                  action can kick generation even when the tab isn't open;
                  Radix sets `hidden` when inactive. */}
              <Tabs.Content
                value="breakdown"
                className={styles.tabPanel}
                forceMount
              >
                <BreakdownPanel specId={spec.id} generateSignal={breakdownSignal} />
              </Tabs.Content>
              <Tabs.Content value="signoff" className={styles.tabPanel}>
                <SignoffPanel
                  specId={spec.id}
                  status={spec.status}
                  onRequestReview={() => patch({ status: "in_review" })}
                />
              </Tabs.Content>
              <Tabs.Content value="runs" className={styles.tabPanel}>
                <RunsTab specId={spec.id} />
              </Tabs.Content>
              <Tabs.Content value="assistant" className={styles.tabPanel}>
                <AssistantTab
                  specId={spec.id}
                  onInsight={setAssistantCount}
                  onInsert={insertIntoSpec}
                  focusSignal={assistantFocus}
                />
              </Tabs.Content>
            </Tabs.Root>
          </aside>
          )}
        </div>
        <InitiativePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          specId={spec.id}
          onLinked={(title) => toast(`Linked to ${title}.`, "success")}
          onError={(message) => toast(message, "danger")}
        />
      </PageShell>
    </>
  );
}
