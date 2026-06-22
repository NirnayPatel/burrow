"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  // Add form state
  const [addText, setAddText] = useState("");
  const [addSource, setAddSource] = useState("manual");
  const [addCustomer, setAddCustomer] = useState("");
  const [addSegment, setAddSegment] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null);

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
      .then((me) => setRole(me.role))
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
      </PageShell>
    </>
  );
}
