"use client";

import { useEffect, useState } from "react";
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
import { useToast } from "../../components/toast";
import {
  ConnectionCard,
  type Connection,
  type ConnectionTarget,
} from "../../components/connection-card";
import styles from "./connections.module.css";

// Featured targets — shown as primary cards (in order)
const FEATURED_TARGETS: ConnectionTarget[] = [
  "jira",
  "confluence",
  "slack",
  "posthog",
  "custom",
];

const TARGET_OPTIONS = [
  { value: "jira", label: "Jira" },
  { value: "confluence", label: "Confluence" },
  { value: "slack", label: "Slack" },
  { value: "posthog", label: "PostHog (analytics)" },
  { value: "amplitude", label: "Amplitude (analytics)" },
  { value: "custom", label: "Custom MCP server" },
];

type ProbeResult = { tools: string[] };

// Short, human label for an MCP URL — the host (and port if non-default). Used
// to tell apart multiple connections to the same target so two custom servers
// don't read as one card duplicated.
function hostLabel(mcpUrl: string): string {
  try {
    const u = new URL(mcpUrl);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return mcpUrl;
  }
}

export default function ConnectionsPage() {
  const router = useRouter();
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [myRole, setMyRole] = useState<string>("member");

  // Add-connection dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<string>("jira");
  const [mcpUrl, setMcpUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Remove-connection dialog
  const [removeTarget, setRemoveTarget] = useState<Connection | null>(null);

  function loadConnections() {
    api<Connection[]>("/api/connections")
      .then(setConnections)
      .catch(() => router.push("/signin"));
  }

  useEffect(() => {
    loadConnections();
    api<{ org: { name: string }; members: unknown[]; myRole: string }>(
      "/api/org"
    )
      .then((d) => setMyRole(d.myRole))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddDialog(target: ConnectionTarget) {
    setAddTarget(target);
    setMcpUrl("");
    setAuthToken("");
    setWebhookSecret("");
    setProbeResult(null);
    setAddError(null);
    setDialogOpen(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setProbeResult(null);
    setAddBusy(true);
    try {
      const body: Record<string, string> = {
        target: addTarget,
        mcpUrl: mcpUrl.trim(),
      };
      if (authToken.trim()) body.authToken = authToken.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const result = await api<{ id: string; target: string; tools: string[] }>(
        "/api/connections",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      setProbeResult({ tools: result.tools });
      toast(
        `${addTarget} connected — ${result.tools.length} tool${result.tools.length === 1 ? "" : "s"} found.`,
        "success"
      );
      loadConnections();
      // Keep dialog open briefly to show probe result, then close
      setTimeout(() => setDialogOpen(false), 1800);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes("400")
          ? "Server unreachable or missing required tool — check the MCP URL."
          : err instanceof Error && err.message.includes("403")
            ? "Admin access required to add connections."
            : "Connection failed — check the URL and try again.";
      setAddError(msg);
      toast(msg, "danger");
    } finally {
      setAddBusy(false);
    }
  }

  async function testConnection(id: string): Promise<{ tools: string[] } | { error: string }> {
    try {
      const res = await api<{ ok: boolean; tools?: string[]; error?: string }>(
        `/api/connections/${id}/probe`,
        { method: "POST" }
      );
      if (res.ok && res.tools) return { tools: res.tools };
      return { error: res.error ?? "unknown error" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "connection failed" };
    }
  }

  async function removeConnection() {
    if (!removeTarget) return;
    try {
      await api(`/api/connections/${removeTarget.id}`, { method: "DELETE" });
      toast(`${removeTarget.target} connection removed.`, "default");
      loadConnections();
    } catch {
      toast("Remove failed — try again.", "danger");
    } finally {
      setRemoveTarget(null);
    }
  }

  const isAdmin = myRole === "admin";

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.heading}>Connections</h1>
            <p className={styles.subheading}>
              Connections push your Breakdown tasks to where your team already
              works, over MCP. You run the MCP server; Burrow connects to it.
            </p>
          </div>
        </div>

        {connections === null ? (
          <div className={styles.grid}>
            {FEATURED_TARGETS.map((t) => (
              <div key={t} className={styles.skeletonCard}>
                <Skeleton height={18} width={80} />
                <Skeleton height={13} />
                <Skeleton height={13} width="80%" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {connections.length === 0 && !isAdmin ? (
              <EmptyState
                icon={
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                message="No connections yet. Ask an admin to connect Jira, Slack, or a custom MCP server."
              />
            ) : (
              <div className={styles.grid}>
                {FEATURED_TARGETS.map((target) => {
                  const conn = connections.find((c) => c.target === target);
                  // Label the featured card only when this target has siblings
                  // in "Additional connections" — otherwise it's the lone one.
                  const hasSiblings =
                    connections.filter((c) => c.target === target).length > 1;
                  return (
                    <ConnectionCard
                      key={target}
                      target={target}
                      connection={conn}
                      isAdmin={isAdmin}
                      instanceLabel={
                        conn && hasSiblings ? hostLabel(conn.mcpUrl) : undefined
                      }
                      onConnect={() => openAddDialog(target)}
                      onRemove={(id) => {
                        const c = connections.find((x) => x.id === id);
                        if (c) setRemoveTarget(c);
                      }}
                      onTest={conn ? testConnection : undefined}
                    />
                  );
                })}
              </div>
            )}

            {/* Extra connections beyond the featured 4 (custom multiples, etc.) */}
            {connections.filter(
              (c) => !FEATURED_TARGETS.includes(c.target) ||
                connections.filter((x) => x.target === c.target).indexOf(c) > 0
            ).length > 0 && (
              <section className={styles.extraSection}>
                <h2 className={styles.extraHeading}>Additional connections</h2>
                <div className={styles.grid}>
                  {connections
                    .filter(
                      (c) =>
                        !FEATURED_TARGETS.includes(c.target) ||
                        connections.filter((x) => x.target === c.target).indexOf(c) > 0
                    )
                    .map((conn) => (
                      <ConnectionCard
                        key={conn.id}
                        target={conn.target}
                        connection={conn}
                        isAdmin={isAdmin}
                        instanceLabel={hostLabel(conn.mcpUrl)}
                        onRemove={(id) => setRemoveTarget(conn)}
                      />
                    ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Add connection dialog ─────────────────────────── */}
        <RDialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby="add-conn-desc"
            >
              <RDialog.Title className={styles.dialogTitle}>
                Connect{" "}
                {TARGET_OPTIONS.find((o) => o.value === addTarget)?.label ??
                  addTarget}
              </RDialog.Title>
              <RDialog.Description
                id="add-conn-desc"
                className={styles.dialogDesc}
              >
                Enter the URL of the MCP server you run (e.g. mcp-atlassian or
                Slack MCP). Burrow probes it and lists the tools it finds.
              </RDialog.Description>

              <form onSubmit={submitAdd} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="conn-target">
                    Target
                  </label>
                  <Select
                    value={addTarget}
                    onValueChange={setAddTarget}
                    options={TARGET_OPTIONS}
                    ariaLabel="Connection target"
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="conn-url">
                    MCP server URL
                  </label>
                  <Input
                    id="conn-url"
                    placeholder="https://your-mcp-server.example.com"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="conn-token">
                    Auth token{" "}
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="conn-token"
                    type="password"
                    placeholder="Bearer token or API key"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="conn-webhook">
                    Webhook secret{" "}
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input
                    id="conn-webhook"
                    type="password"
                    placeholder="Used to verify incoming webhook payloads"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                </div>

                {addError && (
                  <p className={styles.dialogError}>{addError}</p>
                )}

                {probeResult && (
                  <div className={styles.probeResult}>
                    <span className={styles.probeLabel}>Tools found</span>
                    <ul className={styles.toolList}>
                      {probeResult.tools.map((t) => (
                        <li key={t} className={styles.toolItem}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={addBusy}>
                    Connect
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Remove confirm ─────────────────────────────────── */}
        <ConfirmDialog
          open={removeTarget !== null}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          title={`Disconnect ${removeTarget?.target ?? ""}?`}
          body="Tasks will stop syncing to this service. You can reconnect at any time."
          confirmLabel="Disconnect"
          danger
          onConfirm={removeConnection}
        />
      </PageShell>
    </>
  );
}
