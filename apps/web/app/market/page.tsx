"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AiSurface } from "../../components/ai-surface";
import { ThinkingIndicator } from "../../components/thinking-indicator";
import { useToast } from "../../components/toast";
import type { Spec } from "../../lib/api";
import styles from "./market.module.css";

// ─── types ─────────────────────────────────────────────────────────────────

type Competitor = {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  createdAt: string;
};

type SignalType = "launch" | "pricing" | "positioning" | "funding" | "hiring" | "other";
type Severity = "low" | "medium" | "high";

type MarketSignal = {
  id: string;
  competitorId: string | null;
  type: SignalType;
  title: string;
  summary: string;
  soWhat: string | null;
  url: string | null;
  severity: Severity;
  specId: string | null;
  occurredAt: string | null;
  createdAt: string;
};

// ─── constants ─────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "launch", label: "Launch" },
  { value: "pricing", label: "Pricing" },
  { value: "positioning", label: "Positioning" },
  { value: "funding", label: "Funding" },
  { value: "hiring", label: "Hiring" },
  { value: "other", label: "Other" },
] as const;

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const NO_COMPETITOR = "__none__";

// ─── helpers ────────────────────────────────────────────────────────────────

function TypeChip({ type }: { type: SignalType }) {
  return <span className={`${styles.typeChip} ${styles[`type_${type}`]}`}>{type}</span>;
}

function SeverityBar({ severity }: { severity: Severity }) {
  return (
    <span
      className={`${styles.severityBar} ${styles[`severity_${severity}`]}`}
      aria-label={`Severity: ${severity}`}
      title={`Severity: ${severity}`}
    />
  );
}

// ─── competitor cards zone ──────────────────────────────────────────────────

function CompetitorCard({
  competitor,
  isAdmin,
  onDelete,
}: {
  competitor: Competitor;
  isAdmin: boolean;
  onDelete: (c: Competitor) => void;
}) {
  return (
    <div className={styles.competitorCard}>
      <div className={styles.competitorCardTop}>
        <span className={styles.competitorName}>{competitor.name}</span>
        {isAdmin && (
          <button
            className={styles.iconBtn}
            onClick={() => onDelete(competitor)}
            aria-label={`Delete ${competitor.name}`}
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
      {competitor.url && (
        <a
          href={competitor.url}
          className={styles.competitorUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {competitor.url.replace(/^https?:\/\//, "")}
        </a>
      )}
      {competitor.notes && (
        <p className={styles.competitorNotes}>{competitor.notes}</p>
      )}
    </div>
  );
}

// ─── signal card ────────────────────────────────────────────────────────────

function SignalCard({
  signal,
  competitors,
  specs,
  isAdmin,
  onDelete,
  onLinkSpec,
}: {
  signal: MarketSignal;
  competitors: Competitor[];
  specs: Spec[];
  isAdmin: boolean;
  onDelete: (s: MarketSignal) => void;
  onLinkSpec: (signalId: string, specId: string | null) => Promise<void>;
}) {
  const competitor = competitors.find((c) => c.id === signal.competitorId);
  const linkedSpec = specs.find((s) => s.id === signal.specId);
  const specOptions = [
    { value: NO_COMPETITOR, label: "No spec" },
    ...specs.map((s) => ({ value: s.id, label: `${s.displayId} — ${s.title}` })),
  ];

  const dateStr = relativeTime(signal.occurredAt ?? signal.createdAt);

  return (
    <article className={styles.signalCard}>
      <div className={styles.signalCardHeader}>
        <div className={styles.signalCardMeta}>
          <SeverityBar severity={signal.severity} />
          <TypeChip type={signal.type} />
          {competitor && (
            <span className={styles.competitorTag}>{competitor.name}</span>
          )}
          <span className={styles.signalDate}>{dateStr}</span>
        </div>
        {isAdmin && (
          <button
            className={styles.iconBtn}
            onClick={() => onDelete(signal)}
            aria-label={`Delete signal: ${signal.title}`}
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

      <h3 className={styles.signalTitle}>{signal.title}</h3>
      <p className={styles.signalSummary}>{signal.summary}</p>

      {signal.soWhat && (
        <AiSurface className={styles.soWhatSurface}>
          {signal.soWhat}
        </AiSurface>
      )}

      <div className={styles.signalCardFooter}>
        {signal.url && (
          <a
            href={signal.url}
            className={styles.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source →
          </a>
        )}

        {/* Spec link */}
        <div className={styles.specLinkArea}>
          {linkedSpec ? (
            <span className={styles.specLinked}>
              <Link href={`/specs/${linkedSpec.id}`} className={styles.specRef}>
                → {linkedSpec.displayId}
              </Link>
              {isAdmin && (
                <button
                  className={styles.unlinkBtn}
                  onClick={() => onLinkSpec(signal.id, null)}
                  aria-label="Unlink spec"
                >
                  ×
                </button>
              )}
            </span>
          ) : (
            isAdmin && specs.length > 0 && (
              <div className={styles.specSelectWrap}>
                <Select
                  value={NO_COMPETITOR}
                  onValueChange={(v) =>
                    onLinkSpec(signal.id, v === NO_COMPETITOR ? null : v)
                  }
                  options={specOptions}
                  ariaLabel="Link to Spec"
                />
              </div>
            )
          )}
        </div>
      </div>
    </article>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

type AddMode = "ai" | "manual";

export default function MarketPage() {
  const router = useRouter();
  const toast = useToast();

  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [signals, setSignals] = useState<MarketSignal[] | null>(null);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [role, setRole] = useState<string>("member");

  // Add competitor form
  const [compName, setCompName] = useState("");
  const [compUrl, setCompUrl] = useState("");
  const [compNotes, setCompNotes] = useState("");
  const [compBusy, setCompBusy] = useState(false);
  const [showCompForm, setShowCompForm] = useState(false);

  // Delete competitor
  const [deleteCompTarget, setDeleteCompTarget] = useState<Competitor | null>(null);

  // Delete signal
  const [deleteSigTarget, setDeleteSigTarget] = useState<MarketSignal | null>(null);

  // Add signal form
  const [addMode, setAddMode] = useState<AddMode>("ai");
  const [noProviderKey, setNoProviderKey] = useState(false);

  // AI mode fields
  const [rawText, setRawText] = useState("");
  const [aiCompetitorId, setAiCompetitorId] = useState(NO_COMPETITOR);
  const [aiBusy, setAiBusy] = useState(false);

  // Manual mode fields
  const [manualTitle, setManualTitle] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualType, setManualType] = useState<string>("launch");
  const [manualSeverity, setManualSeverity] = useState<string>("medium");
  const [manualCompetitorId, setManualCompetitorId] = useState(NO_COMPETITOR);
  const [manualUrl, setManualUrl] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // ── loaders ───────────────────────────────────────────────────────────────

  function loadCompetitors() {
    api<Competitor[]>("/api/competitors")
      .then(setCompetitors)
      .catch(() => router.push("/signin"));
  }

  function loadSignals() {
    api<MarketSignal[]>("/api/market-signals")
      .then((data) =>
        setSignals(
          [...data].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        )
      )
      .catch(() => {});
  }

  useEffect(() => {
    loadCompetitors();
    loadSignals();
    api<{ role: string }>("/api/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
    api<Spec[]>("/api/specs")
      .then(setSpecs)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = role === "admin";

  // Competitor options for selects (with a "none" sentinel)
  const competitorOptions = [
    { value: NO_COMPETITOR, label: "No specific competitor" },
    ...(competitors ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  // ── add competitor ─────────────────────────────────────────────────────────

  async function submitAddCompetitor(e: React.FormEvent) {
    e.preventDefault();
    if (!compName.trim()) return;
    setCompBusy(true);
    try {
      const body: Record<string, string> = { name: compName.trim() };
      if (compUrl.trim()) body.url = compUrl.trim();
      if (compNotes.trim()) body.notes = compNotes.trim();
      await api("/api/competitors", { method: "POST", body: JSON.stringify(body) });
      toast("Competitor added.", "success");
      setCompName("");
      setCompUrl("");
      setCompNotes("");
      setShowCompForm(false);
      loadCompetitors();
    } catch {
      toast("Could not add competitor — try again.", "danger");
    } finally {
      setCompBusy(false);
    }
  }

  async function deleteCompetitor() {
    if (!deleteCompTarget) return;
    try {
      await api(`/api/competitors/${deleteCompTarget.id}`, { method: "DELETE" });
      toast("Competitor removed.", "default");
      loadCompetitors();
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteCompTarget(null);
    }
  }

  // ── add signal (AI mode) ────────────────────────────────────────────────────

  async function submitAiSignal(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setAiBusy(true);
    setNoProviderKey(false);
    try {
      const body: Record<string, string> = { rawText: rawText.trim() };
      if (aiCompetitorId !== NO_COMPETITOR) body.competitorId = aiCompetitorId;
      await api("/api/market-signals", { method: "POST", body: JSON.stringify(body) });
      toast("Signal added.", "success");
      setRawText("");
      setAiCompetitorId(NO_COMPETITOR);
      loadSignals();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("422") || msg.toLowerCase().includes("no_provider_key")) {
        setNoProviderKey(true);
      } else {
        toast("Could not add signal — try again.", "danger");
      }
    } finally {
      setAiBusy(false);
    }
  }

  // ── add signal (manual mode) ────────────────────────────────────────────────

  async function submitManualSignal(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim() || !manualSummary.trim()) return;
    setManualBusy(true);
    try {
      const body: Record<string, string> = {
        title: manualTitle.trim(),
        summary: manualSummary.trim(),
        type: manualType,
        severity: manualSeverity,
      };
      if (manualCompetitorId !== NO_COMPETITOR) body.competitorId = manualCompetitorId;
      if (manualUrl.trim()) body.url = manualUrl.trim();
      await api("/api/market-signals", { method: "POST", body: JSON.stringify(body) });
      toast("Signal added.", "success");
      setManualTitle("");
      setManualSummary("");
      setManualType("launch");
      setManualSeverity("medium");
      setManualCompetitorId(NO_COMPETITOR);
      setManualUrl("");
      loadSignals();
    } catch {
      toast("Could not add signal — try again.", "danger");
    } finally {
      setManualBusy(false);
    }
  }

  // ── delete signal ──────────────────────────────────────────────────────────

  async function deleteSignal() {
    if (!deleteSigTarget) return;
    try {
      await api(`/api/market-signals/${deleteSigTarget.id}`, { method: "DELETE" });
      toast("Signal removed.", "default");
      loadSignals();
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteSigTarget(null);
    }
  }

  // ── link spec ──────────────────────────────────────────────────────────────

  async function linkSpec(signalId: string, specId: string | null) {
    try {
      await api(`/api/market-signals/${signalId}/spec`, {
        method: "PATCH",
        body: JSON.stringify({ specId }),
      });
      toast(specId ? "Spec linked." : "Spec unlinked.", "success");
      loadSignals();
    } catch {
      toast("Could not update link — try again.", "danger");
    }
  }

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <>
      <AppNav />
      <PageShell width="base">

        {/* ── COMPETITORS zone ──────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderText}>
              <h1 className={styles.pageHeading}>Market</h1>
              <p className={styles.sectionSubtext}>
                Track competitors and the signals around them. Each signal can link to a Spec so market moves drive what you build.
              </p>
            </div>
            {isAdmin && (
              <Button
                variant="secondary"
                onClick={() => setShowCompForm((v) => !v)}
              >
                {showCompForm ? "Cancel" : "Add competitor"}
              </Button>
            )}
          </div>

          {/* Add competitor form — admin only */}
          {isAdmin && showCompForm && (
            <form onSubmit={submitAddCompetitor} className={styles.addForm}>
              <div className={styles.addRow}>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="comp-name">
                    Name
                  </label>
                  <Input
                    id="comp-name"
                    placeholder="Acme Inc"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="comp-url">
                    URL <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="comp-url"
                    placeholder="https://acme.com"
                    value={compUrl}
                    onChange={(e) => setCompUrl(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.addField}>
                <label className={styles.addLabel} htmlFor="comp-notes">
                  Notes <span className={styles.optional}>(optional)</span>
                </label>
                <Input
                  id="comp-notes"
                  placeholder="Main competitor in SMB; strong on pricing"
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                />
              </div>
              <div className={styles.addActions}>
                <Button type="submit" variant="primary" busy={compBusy}>
                  Add competitor
                </Button>
              </div>
            </form>
          )}

          {/* Competitor cards */}
          {competitors === null ? (
            <div className={styles.competitorGrid}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.competitorSkeletonCard}>
                  <Skeleton height={16} width="50%" />
                  <Skeleton height={12} width="70%" />
                </div>
              ))}
            </div>
          ) : competitors.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              message={
                isAdmin
                  ? "No competitors tracked yet. Add one above."
                  : "No competitors tracked yet."
              }
            />
          ) : (
            <div className={styles.competitorGrid}>
              {competitors.map((c) => (
                <CompetitorCard
                  key={c.id}
                  competitor={c}
                  isAdmin={isAdmin}
                  onDelete={setDeleteCompTarget}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── SIGNAL FEED ───────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionHeading}>Signal feed</h2>
              <p className={styles.sectionSubtext}>
                Competitor moves worth tracking — launches, pricing changes, positioning shifts.
              </p>
            </div>
          </div>

          {/* ── Add signal form ────────────────────────────────────────── */}
          <div className={styles.addSignalPanel}>
            <div className={styles.modeTabs} role="tablist">
              <button
                role="tab"
                aria-selected={addMode === "ai"}
                className={`${styles.modeTab} ${addMode === "ai" ? styles.modeTabActive : ""}`}
                onClick={() => { setAddMode("ai"); setNoProviderKey(false); }}
              >
                AI from article
              </button>
              <button
                role="tab"
                aria-selected={addMode === "manual"}
                className={`${styles.modeTab} ${addMode === "manual" ? styles.modeTabActive : ""}`}
                onClick={() => setAddMode("manual")}
              >
                Manual
              </button>
            </div>

            {/* AI mode */}
            {addMode === "ai" && (
              <form onSubmit={submitAiSignal} className={styles.signalForm}>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="sig-rawtext">
                    Paste article or changelog
                  </label>
                  <textarea
                    id="sig-rawtext"
                    className={styles.addTextarea}
                    placeholder="Paste text from a blog post, pricing page, press release, or changelog. AI will summarize it into a signal with a 'so what for us' insight."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={5}
                    required
                  />
                </div>
                <div className={styles.addRow}>
                  <div className={styles.addField}>
                    <label className={styles.addLabel}>
                      Competitor <span className={styles.optional}>(optional)</span>
                    </label>
                    <Select
                      value={aiCompetitorId}
                      onValueChange={setAiCompetitorId}
                      options={competitorOptions}
                      ariaLabel="Link to competitor"
                    />
                  </div>
                </div>

                {noProviderKey && (
                  <div className={styles.noKeyBanner}>
                    Add an AI provider key in{" "}
                    <Link href="/settings" className={styles.bannerLink}>
                      Settings
                    </Link>{" "}
                    to summarize articles with AI.
                  </div>
                )}

                <div className={styles.addActions}>
                  {aiBusy ? (
                    <ThinkingIndicator label="Summarizing" />
                  ) : (
                    <Button type="submit" variant="primary">
                      Summarize with AI
                    </Button>
                  )}
                </div>
              </form>
            )}

            {/* Manual mode */}
            {addMode === "manual" && (
              <form onSubmit={submitManualSignal} className={styles.signalForm}>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="sig-title">
                    Title
                  </label>
                  <Input
                    id="sig-title"
                    placeholder="Acme launched a free tier"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="sig-summary">
                    Summary
                  </label>
                  <textarea
                    id="sig-summary"
                    className={styles.addTextarea}
                    placeholder="What happened and why it matters."
                    value={manualSummary}
                    onChange={(e) => setManualSummary(e.target.value)}
                    rows={3}
                    required
                  />
                </div>
                <div className={styles.addRow}>
                  <div className={styles.addField}>
                    <label className={styles.addLabel}>Type</label>
                    <Select
                      value={manualType}
                      onValueChange={setManualType}
                      options={TYPE_OPTIONS}
                      ariaLabel="Signal type"
                    />
                  </div>
                  <div className={styles.addField}>
                    <label className={styles.addLabel}>Severity</label>
                    <Select
                      value={manualSeverity}
                      onValueChange={setManualSeverity}
                      options={SEVERITY_OPTIONS}
                      ariaLabel="Signal severity"
                    />
                  </div>
                  <div className={styles.addField}>
                    <label className={styles.addLabel}>
                      Competitor <span className={styles.optional}>(optional)</span>
                    </label>
                    <Select
                      value={manualCompetitorId}
                      onValueChange={setManualCompetitorId}
                      options={competitorOptions}
                      ariaLabel="Link to competitor"
                    />
                  </div>
                </div>
                <div className={styles.addField}>
                  <label className={styles.addLabel} htmlFor="sig-url">
                    Source URL <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="sig-url"
                    placeholder="https://acme.com/blog/free-tier"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                  />
                </div>
                <div className={styles.addActions}>
                  <Button type="submit" variant="primary" busy={manualBusy}>
                    Add signal
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Signal list */}
          {signals === null ? (
            <div className={styles.signalList}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.signalSkeletonCard}>
                  <div className={styles.skeletonRow}>
                    <Skeleton height={20} width={60} />
                    <Skeleton height={20} width={80} />
                  </div>
                  <Skeleton height={17} width="55%" />
                  <Skeleton height={13} />
                  <Skeleton height={13} width="80%" />
                </div>
              ))}
            </div>
          ) : signals.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              message="No signals yet. Paste an article above to add your first one."
            />
          ) : (
            <div className={styles.signalList}>
              {signals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  competitors={competitors ?? []}
                  specs={specs}
                  isAdmin={isAdmin}
                  onDelete={setDeleteSigTarget}
                  onLinkSpec={linkSpec}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Confirm dialogs ───────────────────────────────────────── */}
        <ConfirmDialog
          open={deleteCompTarget !== null}
          onOpenChange={(open) => !open && setDeleteCompTarget(null)}
          title="Remove competitor?"
          body="Signals linked to this competitor will remain but the competitor tag will be cleared."
          confirmLabel="Remove"
          danger
          onConfirm={deleteCompetitor}
        />

        <ConfirmDialog
          open={deleteSigTarget !== null}
          onOpenChange={(open) => !open && setDeleteSigTarget(null)}
          title="Delete signal?"
          body="This signal will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={deleteSignal}
        />
      </PageShell>
    </>
  );
}
