"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api, API_URL, type Spec } from "../../../lib/api";
import { Button } from "../../../components/button";
import { Input } from "../../../components/input";
import { Select } from "../../../components/select";
import { TimelineEntry } from "../../../components/timeline-entry";
import { AiSurface } from "../../../components/ai-surface";
import { SuggestionChip } from "../../../components/suggestion-chip";
import { useToast } from "../../../components/toast";
import styles from "./spec.module.css";

type Entry = {
  id: string;
  verdict: "approved" | "flagged" | "cleared";
  comment: string | null;
  specVersion: string;
  createdAt: string;
  userName: string;
};

type AnalyticsConnection = {
  id: string;
  target: string;
  mcpUrl: string;
};

type EvaluationRow = {
  id: string;
  report: string;
  generatedAt: string;
  connectionId: string | null;
};

export function SignoffPanel({
  specId,
  status,
  onRequestReview,
}: {
  specId: string;
  status: Spec["status"];
  onRequestReview: () => void | Promise<void>;
}) {
  const [timeline, setTimeline] = useState<Entry[]>([]);
  const [counts, setCounts] = useState({ approved: 0, flagged: 0 });
  const [currentVersion, setCurrentVersion] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<string[]>([]);
  const toast = useToast();

  // Evaluate launch (Gap 5)
  const [analyticsConns, setAnalyticsConns] = useState<AnalyticsConnection[]>([]);
  const [selectedConn, setSelectedConn] = useState("");
  const [evalText, setEvalText] = useState("");
  const [evalStreaming, setEvalStreaming] = useState(false);
  const [evalDone, setEvalDone] = useState(false);
  const [pastEvals, setPastEvals] = useState<EvaluationRow[]>([]);

  // One-line AI orientation + a suggested-reviewers offer so reviewers get
  // context in five seconds (11-DESIGN §3d). Both degrade silently.
  useEffect(() => {
    api<{ insights: { summary: string } | null }>(
      `/api/specs/${specId}/insights`,
    )
      .then((r) => setSummary(r.insights?.summary ?? null))
      .catch(() => {});
    api<{ members: { name: string }[] }>("/api/org")
      .then((r) => setReviewers(r.members.map((m) => m.name).slice(0, 2)))
      .catch(() => {});
    api<AnalyticsConnection[]>("/api/connections")
      .then((conns) => {
        const analytics = conns.filter((c) => c.target === "posthog" || c.target === "amplitude");
        setAnalyticsConns(analytics);
        if (analytics.length > 0) setSelectedConn(analytics[0].id);
      })
      .catch(() => {});
    api<EvaluationRow[]>(`/api/specs/${specId}/evaluations`)
      .then(setPastEvals)
      .catch(() => {});
  }, [specId]);

  const load = useCallback(() => {
    api<{ timeline: Entry[]; counts: typeof counts; currentVersion: string }>(
      `/api/specs/${specId}/timeline`,
    ).then((r) => {
      setTimeline(r.timeline);
      setCounts(r.counts);
      setCurrentVersion(r.currentVersion);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  useEffect(load, [load]);

  async function cast(verdict: "approved" | "flagged" | "cleared") {
    setError(null);
    const res = await fetch(`${API_URL}/api/specs/${specId}/signoffs`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict, comment: comment || undefined }),
    });
    if (!res.ok) {
      // Keep inline validation visible (e.g. flag requires a comment) and also
      // surface a toast so the failure reads in the flow.
      const message = (await res.json()).error;
      setError(message);
      toast(message, "danger");
      return;
    }
    setComment("");
    toast("Sign-off recorded", "success");
    load();
  }

  async function startEvaluation() {
    setEvalText("");
    setEvalDone(false);
    setEvalStreaming(true);
    try {
      const res = await fetch(`${API_URL}/api/specs/${specId}/evaluate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: selectedConn || undefined }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast(data.error === "no_provider_key"
          ? "Add an AI provider key in Settings to generate evaluations."
          : (data.error ?? "Evaluation failed — try again."), "danger");
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
              const payload = JSON.parse(line.slice(5).trim()) as string;
              if (typeof payload === "string") setEvalText((p) => p + payload);
            } catch { /* skip */ }
          }
        }
      }
      setEvalDone(true);
      // Reload past evaluations to include the new one.
      api<EvaluationRow[]>(`/api/specs/${specId}/evaluations`)
        .then(setPastEvals)
        .catch(() => {});
    } catch {
      toast("Evaluation failed — try again.", "danger");
    } finally {
      setEvalStreaming(false);
    }
  }

  async function requestReview() {
    setError(null);
    try {
      await onRequestReview();
      toast("Review requested", "success");
    } catch {
      toast("Couldn't request review", "danger");
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          Sign-off{" "}
          <span className={styles.panelMeta}>
            {counts.approved} approved · {counts.flagged} flagged
          </span>
        </h3>
        {status !== "in_review" && (
          <Button
            variant="ghost"
            onClick={requestReview}
            title="Move this Spec into review"
          >
            Request review
          </Button>
        )}
      </div>

      {summary && (
        <AiSurface className={styles.signoffSummary}>{summary}</AiSurface>
      )}

      {reviewers.length > 0 && status === "in_review" && (
        <div className={styles.chipRow}>
          <SuggestionChip
            actionLabel="Add reviewer"
            onAct={() =>
              setComment(`Requesting review from ${reviewers.join(", ")}`)
            }
          >
            Suggested reviewers: {reviewers.join(", ")}
          </SuggestionChip>
        </div>
      )}

      <div className={styles.signoffForm}>
        <Input
          placeholder="Comment (required to flag)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-label="Sign-off comment"
          className={styles.commentInput}
        />
        <div className={styles.signoffActions}>
          <Button variant="secondary" onClick={() => cast("approved")}>
            Sign off
          </Button>
          <Button variant="secondary" onClick={() => cast("flagged")}>
            Flag for discussion
          </Button>
          <Button
            variant="ghost"
            onClick={() => cast("cleared")}
            title="Withdraw your standing verdict"
          >
            Clear my verdict
          </Button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.timeline}>
        {timeline.map((e, i) => {
          // Divider row when the version changes as we scan down the list, so
          // entries group by the Spec version they were cast against (05 §5).
          const showDivider =
            i === 0 || timeline[i - 1].specVersion !== e.specVersion;
          const isCurrent = e.specVersion === currentVersion;
          return (
            <Fragment key={e.id}>
              {showDivider && (
                <li className={styles.versionDivider} aria-hidden="true">
                  <span className={styles.versionLabel}>
                    {isCurrent ? "Current version" : `Version ${e.specVersion}`}
                  </span>
                </li>
              )}
              <TimelineEntry
                userName={e.userName}
                verdict={e.verdict}
                versionNote={isCurrent ? "this version" : `older ${e.specVersion}`}
                timestamp={new Date(e.createdAt).toLocaleString()}
                comment={e.comment}
              />
            </Fragment>
          );
        })}
        {timeline.length === 0 && (
          <li className={styles.timelineEmpty}>
            No sign-offs yet. Approvals and flags are an append-only record —
            changed minds add entries, nothing is ever erased.
          </li>
        )}
      </ul>

      {/* Evaluate launch — visible once spec has at least one approval */}
      {counts.approved > 0 && (
        <div className={styles.evalSection}>
          <div className={styles.evalHeader}>
            <h4 className={styles.evalTitle}>Evaluate launch</h4>
            <p className={styles.evalSubtext}>
              Generate a post-launch evaluation by comparing this spec against analytics data.
            </p>
          </div>

          <div className={styles.evalControls}>
            {analyticsConns.length > 0 ? (
              <Select
                value={selectedConn}
                onValueChange={setSelectedConn}
                options={analyticsConns.map((c) => {
                  let host = c.mcpUrl;
                  try { host = new URL(c.mcpUrl).hostname; } catch { /* use raw url */ }
                  return { value: c.id, label: `${c.target} (${host})` };
                })}
                ariaLabel="Analytics connection"
              />
            ) : (
              <p className={styles.evalNoConn}>
                Connect PostHog in{" "}
                <a href="/connections" className={styles.evalConnLink}>
                  Settings → Connections
                </a>{" "}
                to pull live analytics data.
              </p>
            )}
            <Button
              variant="primary"
              onClick={startEvaluation}
              busy={evalStreaming}
            >
              Generate evaluation
            </Button>
          </div>

          {(evalText || evalStreaming) && (
            <pre className={styles.evalPre}>
              {evalText}
              {evalStreaming && <span className={styles.evalCursor}>▋</span>}
            </pre>
          )}

          {evalDone && evalText && (
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(evalText);
                toast("Evaluation copied.", "success");
              }}
            >
              Copy evaluation
            </Button>
          )}

          {pastEvals.length > 0 && (
            <details className={styles.pastEvals}>
              <summary className={styles.pastEvalsSummary}>
                {pastEvals.length} past evaluation{pastEvals.length === 1 ? "" : "s"}
              </summary>
              <ul className={styles.pastEvalList}>
                {pastEvals.map((ev) => (
                  <li key={ev.id} className={styles.pastEvalItem}>
                    <span className={styles.pastEvalDate}>
                      {new Date(ev.generatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <pre className={styles.pastEvalPre}>{ev.report}</pre>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
