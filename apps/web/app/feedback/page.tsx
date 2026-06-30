"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { SuggestionChip } from "../../components/suggestion-chip";
import { ThinkingIndicator } from "../../components/thinking-indicator";
import { useToast } from "../../components/toast";
import styles from "./feedback.module.css";

// ─── types ────────────────────────────────────────────────────────────────────

type IngestKey = {
  id: string;
  label: string;
  createdAt: string;
};

type Sentiment = "positive" | "neutral" | "negative" | "mixed";

type FeedbackItem = {
  id: string;
  source: string;
  customer: string | null;
  segment: string | null;
  text: string;
  sentiment: Sentiment;
  createdAt: string;
};

type FeedbackTheme = {
  id: string;
  label: string;
  summary: string;
  size: number;
  sentiment: Sentiment;
  specId: string | null;
  createdAt: string;
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "interview", label: "Interview" },
  { value: "review", label: "Review" },
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "upload", label: "Upload" },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function SentimentDot({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span
      className={`${styles.sentimentDot} ${styles[`sentiment_${sentiment}`]}`}
      title={sentiment}
      aria-label={`Sentiment: ${sentiment}`}
    />
  );
}

function SizePill({ size }: { size: number }) {
  return (
    <span className={styles.sizePill}>
      {size} item{size === 1 ? "" : "s"}
    </span>
  );
}

function SourceChip({ source }: { source: string }) {
  return <span className={styles.sourceChip}>{source}</span>;
}

function ThemeCard({
  theme,
  isAdmin,
  onCreateSpec,
}: {
  theme: FeedbackTheme;
  isAdmin: boolean;
  onCreateSpec: (themeId: string) => Promise<void>;
}) {
  return (
    <div className={styles.themeCard}>
      <div className={styles.themeCardHeader}>
        <div className={styles.themeCardTitle}>
          <SentimentDot sentiment={theme.sentiment} />
          <span className={styles.themeLabel}>{theme.label}</span>
          <SizePill size={theme.size} />
        </div>
      </div>
      <p className={styles.themeSummary}>{theme.summary}</p>
      <div className={styles.themeCardFooter}>
        {theme.specId ? (
          <Link href={`/specs/${theme.specId}`} className={styles.viewSpecLink}>
            View Spec →
          </Link>
        ) : isAdmin ? (
          <SuggestionChip
            actionLabel="Create Spec"
            onAct={() => onCreateSpec(theme.id)}
          >
            Turn this theme into a Spec
          </SuggestionChip>
        ) : null}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [themes, setThemes] = useState<FeedbackTheme[] | null>(null);
  const [role, setRole] = useState<string>("member");

  // Cluster state
  const [clustering, setClustering] = useState(false);
  const [noProviderKey, setNoProviderKey] = useState(false);

  // VoC report streaming state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportStreaming, setReportStreaming] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  // Add form state
  const [addText, setAddText] = useState("");
  const [addSource, setAddSource] = useState("manual");
  const [addCustomer, setAddCustomer] = useState("");
  const [addSegment, setAddSegment] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null);

  // Ingest key management (admin only)
  const [ingestKeys, setIngestKeys] = useState<IngestKey[] | null>(null);
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<IngestKey | null>(null);

  function loadIngestKeys() {
    api<IngestKey[]>("/api/ingest-keys")
      .then(setIngestKeys)
      .catch(() => setIngestKeys([]));
  }

  function loadItems() {
    api<FeedbackItem[]>("/api/feedback")
      .then((data) =>
        // newest first
        setItems([...data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ))
      )
      .catch(() => router.push("/signin"));
  }

  function loadThemes() {
    api<FeedbackTheme[]>("/api/feedback/themes")
      .then(setThemes)
      .catch(() => {});
  }

  useEffect(() => {
    loadItems();
    loadThemes();
    api<{ role: string }>("/api/me")
      .then((me) => {
        setRole(me.role);
        if (me.role === "admin") loadIngestKeys();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = role === "admin";

  // ── cluster ─────────────────────────────────────────────────────────────

  async function cluster() {
    setClustering(true);
    setNoProviderKey(false);
    try {
      await api("/api/feedback/cluster", { method: "POST" });
      toast("Feedback clustered into themes.", "success");
      loadThemes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("422") || msg.toLowerCase().includes("no_provider_key")) {
        setNoProviderKey(true);
      } else if (msg.includes("400")) {
        toast("Add some feedback before clustering.", "default");
      } else {
        toast("Clustering failed — try again.", "danger");
      }
    } finally {
      setClustering(false);
    }
  }

  // ── create-spec from theme ───────────────────────────────────────────────

  async function createSpec(themeId: string) {
    try {
      const spec = await api<{ id: string }>(`/api/feedback/themes/${themeId}/create-spec`, {
        method: "POST",
      });
      toast("Spec created from theme.", "success");
      loadThemes();
      router.push(`/specs/${spec.id}`);
    } catch {
      toast("Could not create Spec — try again.", "danger");
    }
  }

  // ── add feedback ────────────────────────────────────────────────────────

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addText.trim()) return;
    setAddBusy(true);
    try {
      // Split on blank lines into separate items; POST bulk endpoint handles it
      const lines = addText.trim();
      const body: Record<string, unknown> = {
        items: lines.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        source: addSource,
      };
      if (addCustomer.trim()) body.customer = addCustomer.trim();
      if (addSegment.trim()) body.segment = addSegment.trim();
      await api("/api/feedback", { method: "POST", body: JSON.stringify(body) });
      toast("Feedback added.", "success");
      setAddText("");
      setAddCustomer("");
      setAddSegment("");
      loadItems();
    } catch {
      toast("Add failed — try again.", "danger");
    } finally {
      setAddBusy(false);
    }
  }

  // ── delete item ──────────────────────────────────────────────────────────

  async function deleteItem() {
    if (!deleteTarget) return;
    try {
      await api(`/api/feedback/${deleteTarget.id}`, { method: "DELETE" });
      toast("Feedback item deleted.", "default");
      loadItems();
    } catch {
      toast("Delete failed — try again.", "danger");
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── VoC report ──────────────────────────────────────────────────────────

  async function generateReport() {
    setReportText("");
    setReportDone(false);
    setReportStreaming(true);
    setReportOpen(true);
    try {
      const res = await fetch("/api/feedback/report", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        if (data.error === "no_provider_key") {
          setNoProviderKey(true);
        } else {
          toast(data.error ?? "Report failed — try again.", "danger");
        }
        setReportOpen(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            try {
              const payload = JSON.parse(line.slice(5).trim()) as string | { message?: string };
              if (typeof payload === "string") {
                setReportText((prev) => prev + payload);
              }
            } catch { /* non-JSON SSE line (event:) — skip */ }
          }
          if (line === "event:done" || line.startsWith("event: done")) {
            setReportDone(true);
          }
        }
      }
      setReportDone(true);
    } catch {
      toast("Report generation failed — try again.", "danger");
      setReportOpen(false);
    } finally {
      setReportStreaming(false);
    }
  }

  // ── ingest key CRUD ─────────────────────────────────────────────────────

  async function createIngestKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyLabel.trim()) return;
    setKeyBusy(true);
    try {
      const result = await api<{ id: string; rawKey: string }>("/api/ingest-keys", {
        method: "POST",
        body: JSON.stringify({ label: keyLabel.trim() }),
      });
      setRawKey(result.rawKey);
      setAddKeyOpen(false);
      setKeyLabel("");
      loadIngestKeys();
    } catch {
      toast("Failed to create key — try again.", "danger");
    } finally {
      setKeyBusy(false);
    }
  }

  async function revokeIngestKey() {
    if (!revokeTarget) return;
    try {
      await api(`/api/ingest-keys/${revokeTarget.id}`, { method: "DELETE" });
      toast(`Key "${revokeTarget.label}" revoked.`, "default");
      loadIngestKeys();
    } catch {
      toast("Revoke failed — try again.", "danger");
    } finally {
      setRevokeTarget(null);
    }
  }

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Feedback</h1>
        </div>

        {/* ── THEMES zone ──────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionHeading}>Themes</h2>
              <p className={styles.sectionSubtext}>
                AI groups feedback into themes so you can see what matters most.
              </p>
            </div>
            {isAdmin && (
              <div className={styles.sectionActions}>
                {clustering ? (
                  <ThinkingIndicator label="Clustering" />
                ) : (
                  <Button variant="secondary" onClick={cluster}>
                    Re-cluster with AI
                  </Button>
                )}
                {themes !== null && themes.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={generateReport}
                    busy={reportStreaming}
                  >
                    Generate VoC Report
                  </Button>
                )}
              </div>
            )}
          </div>

          {noProviderKey && (
            <div className={styles.noKeyBanner}>
              Add an AI provider key in{" "}
              <Link href="/settings" className={styles.bannerLink}>
                Settings
              </Link>{" "}
              to cluster feedback into themes.
            </div>
          )}

          {themes === null ? (
            <div className={styles.themeGrid}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.themeSkeletonCard}>
                  <Skeleton height={17} width="60%" />
                  <Skeleton height={13} />
                  <Skeleton height={13} width="80%" />
                </div>
              ))}
            </div>
          ) : themes.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              message="Add feedback below, then cluster it into themes."
            />
          ) : (
            <div className={styles.themeGrid}>
              {themes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isAdmin={isAdmin}
                  onCreateSpec={createSpec}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── ITEMS zone ───────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderText}>
              <h2 className={styles.sectionHeading}>Feedback items</h2>
              <p className={styles.sectionSubtext}>
                Raw feedback from customers. Paste multiple items separated by
                blank lines.
              </p>
            </div>
          </div>

          {/* Add feedback form — visible to all roles */}
          <form onSubmit={submitAdd} className={styles.addForm}>
            <textarea
              className={styles.addTextarea}
              placeholder={
                "Paste feedback here. Separate multiple items with a blank line.\n\nE.g.:\nThe export is too slow.\n\nWe need SSO support.\n\nDashboard is confusing."
              }
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              rows={6}
              required
            />
            <div className={styles.addMeta}>
              <div className={styles.addField}>
                <label className={styles.addLabel} htmlFor="fb-source">
                  Source
                </label>
                <Select
                  value={addSource}
                  onValueChange={setAddSource}
                  options={SOURCE_OPTIONS}
                  ariaLabel="Feedback source"
                />
              </div>
              <div className={styles.addField}>
                <label className={styles.addLabel} htmlFor="fb-customer">
                  Customer{" "}
                  <span className={styles.optional}>(optional)</span>
                </label>
                <Input
                  id="fb-customer"
                  placeholder="Acme Corp"
                  value={addCustomer}
                  onChange={(e) => setAddCustomer(e.target.value)}
                />
              </div>
              <div className={styles.addField}>
                <label className={styles.addLabel} htmlFor="fb-segment">
                  Segment{" "}
                  <span className={styles.optional}>(optional)</span>
                </label>
                <Input
                  id="fb-segment"
                  placeholder="Enterprise"
                  value={addSegment}
                  onChange={(e) => setAddSegment(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.addActions}>
              <Button type="submit" variant="primary" busy={addBusy}>
                Add feedback
              </Button>
            </div>
          </form>

          {/* Items list */}
          {items === null ? (
            <ul className={styles.itemList} aria-label="Loading feedback">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className={styles.itemSkeletonRow}>
                  <Skeleton height={14} />
                  <Skeleton height={14} width="75%" />
                  <Skeleton height={12} width={80} />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              message="No feedback yet. Use the form above to add your first item."
            />
          ) : (
            <ul className={styles.itemList}>
              {items.map((item) => (
                <li key={item.id} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <SentimentDot sentiment={item.sentiment} />
                    <div className={styles.itemBody}>
                      <p className={styles.itemText}>{item.text}</p>
                      <div className={styles.itemMeta}>
                        <SourceChip source={item.source} />
                        {item.customer && (
                          <span className={styles.itemMetaText}>
                            {item.customer}
                          </span>
                        )}
                        {item.segment && (
                          <span className={styles.itemMetaText}>
                            {item.segment}
                          </span>
                        )}
                        <span className={styles.itemDate}>
                          {new Date(item.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="danger"
                      onClick={() => setDeleteTarget(item)}
                      aria-label="Delete feedback item"
                    >
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete feedback item?"
          body="This item will be removed from all themes."
          confirmLabel="Delete"
          danger
          onConfirm={deleteItem}
        />

        {/* ── VoC Report modal ─────────────────────────────────────── */}
        <RDialog.Root open={reportOpen} onOpenChange={(open) => { if (!reportStreaming) setReportOpen(open); }}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.reportDialogContent}
              aria-describedby="voc-report-desc"
            >
              <div className={styles.reportDialogHeader}>
                <RDialog.Title className={styles.dialogTitle}>
                  Voice-of-Customer Report
                </RDialog.Title>
                {reportStreaming && <ThinkingIndicator label="Generating" />}
              </div>
              <RDialog.Description id="voc-report-desc" className={styles.dialogDesc}>
                AI-generated report from your clustered feedback themes.
              </RDialog.Description>
              <pre className={styles.reportPre}>
                {reportText}
                {reportStreaming && <span className={styles.reportCursor}>▋</span>}
              </pre>
              <div className={styles.dialogActions}>
                {reportDone && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(reportText);
                      toast("Report copied to clipboard.", "success");
                    }}
                  >
                    Copy
                  </Button>
                )}
                <RDialog.Close asChild>
                  <Button variant="primary" onClick={() => !reportStreaming && setReportOpen(false)}>
                    {reportStreaming ? "Generating…" : "Close"}
                  </Button>
                </RDialog.Close>
              </div>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── DATA SOURCES zone (admin only) ───────────────────────── */}
        {isAdmin && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderText}>
                <h2 className={styles.sectionHeading}>Data sources</h2>
                <p className={styles.sectionSubtext}>
                  Ingest keys let external tools (n8n, Zapier, custom scripts)
                  push feedback to Burrow. Each key is shown once on creation.
                </p>
              </div>
              <div className={styles.sectionActions}>
                <Button variant="secondary" onClick={() => setAddKeyOpen(true)}>
                  Add data source
                </Button>
              </div>
            </div>

            {/* n8n setup card */}
            <div className={styles.ingestSetupCard}>
              <div className={styles.ingestSetupTitle}>
                Endpoint for n8n / Zapier / custom scripts
              </div>
              <code className={styles.ingestEndpoint}>
                POST /api/ingest/feedback
              </code>
              <p className={styles.ingestSetupDesc}>
                Send <code>x-burrow-ingest-key: &lt;key&gt;</code> and a JSON
                body: <code>{"{"} items: [{"{"}source, text, externalId{"}"}]{" }"}
                </code>. See{" "}
                <Link href="/docs/integrations" className={styles.bannerLink}>
                  docs/integrations.md
                </Link>{" "}
                for n8n workflow examples.
              </p>
            </div>

            {/* Key list */}
            {ingestKeys === null ? (
              <ul className={styles.keyList}>
                {[1, 2].map((i) => (
                  <li key={i} className={styles.keySkeletonRow}>
                    <Skeleton height={14} width={120} />
                    <Skeleton height={12} width={80} />
                  </li>
                ))}
              </ul>
            ) : ingestKeys.length === 0 ? (
              <p className={styles.emptyKeys}>No data sources yet.</p>
            ) : (
              <ul className={styles.keyList}>
                {ingestKeys.map((k) => (
                  <li key={k.id} className={styles.keyRow}>
                    <div className={styles.keyInfo}>
                      <span className={styles.keyLabel}>{k.label}</span>
                      <span className={styles.keyDate}>
                        Created{" "}
                        {new Date(k.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => setRevokeTarget(k)}
                      aria-label={`Revoke key ${k.label}`}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Add ingest key dialog ─────────────────────────────────── */}
        <RDialog.Root open={addKeyOpen} onOpenChange={setAddKeyOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby="add-key-desc"
            >
              <RDialog.Title className={styles.dialogTitle}>
                Add data source
              </RDialog.Title>
              <RDialog.Description id="add-key-desc" className={styles.dialogDesc}>
                Give this key a label (e.g. "n8n production" or "Zapier"). The
                raw key is shown once — copy it immediately.
              </RDialog.Description>
              <form onSubmit={createIngestKey} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="key-label">
                    Label
                  </label>
                  <Input
                    id="key-label"
                    placeholder="n8n production"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={keyBusy}>
                    Create key
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Raw key reveal dialog (shown ONCE on creation) ─────────── */}
        <RDialog.Root open={rawKey !== null} onOpenChange={(open) => !open && setRawKey(null)}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby="raw-key-desc"
            >
              <RDialog.Title className={styles.dialogTitle}>
                Copy your key now
              </RDialog.Title>
              <RDialog.Description id="raw-key-desc" className={styles.dialogDesc}>
                This key will not be shown again. Copy it and store it securely.
              </RDialog.Description>
              <div className={styles.rawKeyWrapper}>
                <Input
                  id="raw-key-value"
                  value={rawKey ?? ""}
                  readOnly
                  autoFocus
                  className={styles.rawKeyInput}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (rawKey) {
                      navigator.clipboard.writeText(rawKey);
                      toast("Key copied to clipboard.", "success");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
              <div className={styles.dialogActions}>
                <RDialog.Close asChild>
                  <Button variant="primary">Done</Button>
                </RDialog.Close>
              </div>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Revoke confirm ───────────────────────────────────────────── */}
        <ConfirmDialog
          open={revokeTarget !== null}
          onOpenChange={(open) => !open && setRevokeTarget(null)}
          title={`Revoke "${revokeTarget?.label}"?`}
          body="Any workflows using this key will stop ingesting. You can create a new key at any time."
          confirmLabel="Revoke"
          danger
          onConfirm={revokeIngestKey}
        />
      </PageShell>
    </>
  );
}
