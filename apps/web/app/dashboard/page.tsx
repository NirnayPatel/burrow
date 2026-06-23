"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { DashboardCard } from "../../components/dashboard-card";
import { AgentRunCard, type AgentRun } from "../../components/agent-run-card";
import {
  ActivityFeedItem,
  type ActivityEvent,
} from "../../components/activity-feed-item";
import { SuggestionChip } from "../../components/suggestion-chip";
import { Skeleton } from "../../components/skeleton";
import { Button } from "../../components/button";
import { useToast } from "../../components/toast";
import { useTourAutostart } from "../../components/tour";
import styles from "./dashboard.module.css";

type Dashboard = {
  user: string;
  counts: { needsYou: number; agentsWorking: number };
  attention: { specId: string; displayId: string; title: string; reason: string }[];
  agentsAtWork: { name: string; summary: string; at: string }[];
  suggestions: {
    kind: string;
    specId: string;
    displayId: string;
    title: string;
    text: string;
  }[];
  recentActivity: ActivityEvent[];
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function summaryLine(c: { needsYou: number; agentsWorking: number }): string {
  const parts: string[] = [];
  parts.push(`${c.needsYou} ${c.needsYou === 1 ? "Spec needs" : "Specs need"} you`);
  parts.push(
    `${c.agentsWorking} ${c.agentsWorking === 1 ? "agent" : "agents"} working`
  );
  return parts.join(" · ");
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    api<Dashboard>("/api/dashboard")
      .then(setData)
      .catch(() => router.push("/signin"));
  }, [router]);

  // Act-in-place (UX review #9): approve a sign-off straight from the attention
  // row — every attention item is a Spec awaiting your sign-off, so Approve is
  // the one-click verb. (Flagging needs a comment, so that stays a trip to the
  // Spec via the row link.) On success, drop the row + decrement the count.
  async function approve(specId: string) {
    setApproving(specId);
    try {
      await api(`/api/specs/${specId}/signoffs`, {
        method: "POST",
        body: JSON.stringify({ verdict: "approved" }),
      });
      setData((d) =>
        d
          ? {
              ...d,
              attention: d.attention.filter((a) => a.specId !== specId),
              counts: { ...d.counts, needsYou: Math.max(0, d.counts.needsYou - 1) },
            }
          : d,
      );
      toast("Approved.", "success");
    } catch {
      toast("Couldn't approve — try again.", "danger");
    } finally {
      setApproving(null);
    }
  }

  // First login lands here; auto-run the tour once the cards exist on screen.
  useTourAutostart(data !== null);

  async function createSpec() {
    const spec = await api<{ id: string }>("/api/specs", {
      method: "POST",
      body: JSON.stringify({}),
    });
    router.push(`/specs/${spec.id}`);
  }

  if (data === null) {
    return (
      <>
        <AppNav />
        <main className={styles.page}>
          <div className={styles.greet}>
            <Skeleton width={220} height={26} />
            <Skeleton width={260} height={15} />
          </div>
          <div className={styles.grid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard}>
                <Skeleton width={140} height={17} />
                <Skeleton height={48} />
                <Skeleton height={48} />
              </div>
            ))}
          </div>
        </main>
      </>
    );
  }

  const empty =
    data.attention.length === 0 &&
    data.agentsAtWork.length === 0 &&
    data.suggestions.length === 0 &&
    data.recentActivity.length === 0;

  if (empty) {
    return (
      <>
        <AppNav />
        <main className={styles.page}>
          <div className={styles.firstRun}>
            <span className={styles.firstRunSpark} aria-hidden="true">
              ✦
            </span>
            <h1 className={styles.firstRunTitle}>Write your first Spec.</h1>
            <p className={styles.firstRunBody}>
              We&apos;ll break it down, your agents will ship it.
            </p>
            <Button variant="primary" onClick={createSpec}>
              Write a Spec
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppNav />
      <main className={styles.page}>
        <div className={styles.greet}>
          <h1 className={styles.hello}>
            {greeting()}, {(data.user || "").split(" ")[0]}
          </h1>
          <p className={styles.summary}>{summaryLine(data.counts)}</p>
        </div>

        <div className={styles.grid}>
          <DashboardCard
            title="Needs your attention"
            count={data.attention.length}
          >
            {data.attention.length === 0 ? (
              <p className={styles.cardEmpty}>
                Nothing needs you right now — you&apos;re all caught up.
              </p>
            ) : (
              <ul className={styles.attentionList}>
                {data.attention.map((a) => (
                  <li key={a.specId} className={styles.attentionItem}>
                    <Link href={`/specs/${a.specId}`} className={styles.attentionRow}>
                      <span className={styles.attentionHead}>
                        <span className={styles.displayId}>{a.displayId}</span>
                        <span className={styles.attentionTitle}>{a.title}</span>
                      </span>
                      <span className={styles.attentionReason}>{a.reason}</span>
                    </Link>
                    <div className={styles.attentionActions}>
                      <Button
                        variant="secondary"
                        busy={approving === a.specId}
                        onClick={() => approve(a.specId)}
                      >
                        Approve
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Agents at work"
            count={data.agentsAtWork.length}
            tour="agents-card"
          >
            {data.agentsAtWork.length === 0 ? (
              <p className={styles.cardEmpty}>
                No agents working right now — agents pick up tasks over MCP.
              </p>
            ) : (
              data.agentsAtWork.map((agent, i) => {
                const run: AgentRun = {
                  agentName: agent.name,
                  summary: agent.summary,
                  state: "working",
                  at: agent.at,
                };
                return <AgentRunCard key={`${agent.name}-${i}`} run={run} />;
              })
            )}
          </DashboardCard>

          <DashboardCard title="Suggested">
            {data.suggestions.length === 0 ? (
              <p className={styles.cardEmpty}>
                No suggestions yet — they&apos;ll appear as your Specs progress.
              </p>
            ) : (
              data.suggestions.map((s) => (
                <SuggestionChip
                  key={`${s.kind}-${s.specId}`}
                  actionLabel="Open"
                  onAct={() => router.push(`/specs/${s.specId}`)}
                >
                  <span className={styles.suggestionId}>{s.displayId}</span> {s.text}
                </SuggestionChip>
              ))
            )}
          </DashboardCard>

          <DashboardCard title="Recent activity" tour="activity-card">
            {data.recentActivity.length === 0 ? (
              <p className={styles.cardEmpty}>
                Nothing yet — activity from you, your team, and agents shows here.
              </p>
            ) : (
              <ul className={styles.feed}>
                {data.recentActivity.map((event) => (
                  <ActivityFeedItem key={event.id} event={event} />
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>
      </main>
    </>
  );
}
