"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api, API_URL, type Spec } from "../../../lib/api";
import { Button } from "../../../components/button";
import { Input } from "../../../components/input";
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
    </section>
  );
}
