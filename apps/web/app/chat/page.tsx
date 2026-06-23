"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, API_URL } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { Button } from "../../components/button";
import { AiSurface } from "../../components/ai-surface";
import { ThinkingIndicator } from "../../components/thinking-indicator";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import styles from "./chat.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

type ChatThread = {
  id: string;
  scope: string;
  specId: string | null;
  title: string;
  updatedAt: string;
};

type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown };

type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system";
  parts: ChatPart[];
  createdAt: string;
};

// A pending assistant turn being streamed — accumulates delta tokens live.
type StreamingTurn = {
  text: string;
  // Mutating tool proposals waiting for confirm / dismiss
  proposals: ToolProposal[];
};

type ToolProposal = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  // State: pending → confirmed | dismissed
  state: "pending" | "confirmed" | "dismissed";
  // Result returned after confirm (e.g. { specId, displayId } for create_spec)
  result?: Record<string, unknown>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Human-readable label for a tool name.
function toolLabel(toolName: string): string {
  switch (toolName) {
    case "search_context": return "Searched context";
    case "read_spec": return "Read spec";
    case "list_specs": return "Listed specs";
    case "generate_breakdown": return "Generate breakdown";
    case "create_spec": return "Create spec";
    default: return toolName.replace(/_/g, " ");
  }
}

// Whether a tool is a mutating one (requires confirm).
function isMutating(toolName: string) {
  return toolName === "generate_breakdown" || toolName === "create_spec";
}

// Summarise a tool-result part for the inline chip.
function resultSummary(toolName: string, result: unknown): string {
  if (!result) return "";
  const r = result as Record<string, unknown>;
  if (toolName === "search_context") {
    const count = Array.isArray(result) ? result.length : (r.count ?? "");
    return count ? `· ${count} passages` : "";
  }
  if (toolName === "read_spec" && r.title) return `· ${r.title}`;
  if (toolName === "list_specs" && Array.isArray(result)) return `· ${result.length} specs`;
  return "";
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Inline chip for a completed read-tool call (non-mutating tool result).
function ToolResultChip({
  toolName,
  result,
}: {
  toolName: string;
  result: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = resultSummary(toolName, result);
  return (
    <div className={styles.toolChip}>
      <span className={styles.toolChipLabel}>
        <span className={styles.toolChipIcon} aria-hidden="true">⋯</span>
        {toolLabel(toolName)}{summary}
      </span>
      {Boolean(result) && (
        <button
          className={styles.toolChipToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "hide" : "detail"}
        </button>
      )}
      {expanded && (
        <pre className={styles.toolChipDetail}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Confirm card for a mutating tool proposal.
function ConfirmCard({
  proposal,
  threadId,
  onConfirm,
  onDismiss,
}: {
  proposal: ToolProposal;
  threadId: string;
  onConfirm: (toolCallId: string, result: Record<string, unknown>) => void;
  onDismiss: (toolCallId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const args = proposal.args;

  // Build human-readable description of what would happen.
  let description = "";
  if (proposal.toolName === "create_spec") {
    description = `Create spec: "${args.title as string}"?`;
  } else if (proposal.toolName === "generate_breakdown") {
    description = `Generate a breakdown for spec ${args.specId as string}?`;
  } else {
    description = `Run: ${toolLabel(proposal.toolName)}?`;
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      const data = await api<{ ok: boolean; result: Record<string, unknown> }>(
        `/api/chat/threads/${threadId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ toolCallId: proposal.toolCallId }),
        },
      );
      onConfirm(proposal.toolCallId, data.result);
      toast("Done.", "success");
    } catch {
      toast("Action failed — try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  if (proposal.state === "dismissed") {
    return (
      <div className={styles.confirmCard}>
        <span className={styles.confirmDismissed}>{description} — dismissed</span>
      </div>
    );
  }

  if (proposal.state === "confirmed" && proposal.result) {
    const r = proposal.result;
    // create_spec result carries specId + displayId for a direct link.
    const specLink =
      proposal.toolName === "create_spec" && r.specId ? (
        <Link href={`/specs/${r.specId}`} className={styles.confirmSpecLink}>
          {(r.displayId as string) ?? "View spec"} →
        </Link>
      ) : null;
    return (
      <div className={styles.confirmCard}>
        <span className={styles.confirmDone}>
          {toolLabel(proposal.toolName)} complete.{" "}
          {specLink}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.confirmCard}>
      <p className={styles.confirmDesc}>{description}</p>
      <div className={styles.confirmActions}>
        <Button
          variant="secondary"
          onClick={() => onDismiss(proposal.toolCallId)}
          disabled={busy}
        >
          Dismiss
        </Button>
        <Button variant="primary" onClick={handleConfirm} busy={busy}>
          {proposal.toolName === "create_spec" ? "Create" : "Run"}
        </Button>
      </div>
    </div>
  );
}

// A single assistant message from history (already persisted).
function AssistantBubble({
  parts,
  threadId,
}: {
  parts: ChatPart[];
  threadId: string;
}) {
  const textPart = parts.find((p) => p.type === "text") as
    | { type: "text"; text: string }
    | undefined;

  const toolResultParts = parts.filter(
    (p) => p.type === "tool-result",
  ) as { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }[];

  const toolCallParts = parts.filter(
    (p) => p.type === "tool-call",
  ) as { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }[];

  // Pending tool-call parts (no matching tool-result) become confirm cards.
  const pendingCalls = toolCallParts.filter(
    (tc) => !toolResultParts.some((tr) => tr.toolCallId === tc.toolCallId),
  );

  return (
    <AiSurface>
      {toolResultParts
        .filter((tr) => !isMutating(tr.toolName))
        .map((tr) => (
          <ToolResultChip key={tr.toolCallId} toolName={tr.toolName} result={tr.result} />
        ))}
      {textPart?.text && <div className={styles.assistantText}>{textPart.text}</div>}
      {toolResultParts
        .filter((tr) => isMutating(tr.toolName))
        .map((tr) => (
          <div key={tr.toolCallId} className={styles.confirmCard}>
            <span className={styles.confirmDone}>
              {toolLabel(tr.toolName)} complete.{" "}
              {tr.toolName === "create_spec" &&
              (tr.result as Record<string, unknown>)?.specId ? (
                <Link
                  href={`/specs/${(tr.result as Record<string, unknown>).specId as string}`}
                  className={styles.confirmSpecLink}
                >
                  {(tr.result as Record<string, unknown>).displayId as string} →
                </Link>
              ) : null}
            </span>
          </div>
        ))}
      {pendingCalls.map((tc) => (
        <div key={tc.toolCallId} className={styles.confirmCard}>
          <span className={styles.confirmDismissed}>
            {toolLabel(tc.toolName)} — not completed
          </span>
        </div>
      ))}
    </AiSurface>
  );
}

// ── ThreadRail ────────────────────────────────────────────────────────────────

function ThreadRail({
  threads,
  activeId,
  loading,
  onSelect,
  onCreate,
  onDelete,
}: {
  threads: ChatThread[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className={styles.rail}>
      <div className={styles.railHeader}>
        <Button variant="primary" onClick={onCreate} className={styles.newChatBtn}>
          New chat
        </Button>
      </div>
      <nav className={styles.threadList} aria-label="Chat threads">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.threadSkeletonRow}>
              <Skeleton height={13} />
              <Skeleton height={11} width="50%" />
            </div>
          ))
        ) : threads.length === 0 ? (
          <p className={styles.railEmpty}>No chats yet.</p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              className={`${styles.threadRow} ${activeId === t.id ? styles.threadRowActive : ""}`}
            >
              <button
                className={styles.threadBtn}
                onClick={() => onSelect(t.id)}
                aria-current={activeId === t.id ? "page" : undefined}
              >
                <span className={styles.threadTitle}>{t.title || "New chat"}</span>
                <span className={styles.threadTime}>{formatRelative(t.updatedAt)}</span>
              </button>
              <button
                className={styles.deleteBtn}
                aria-label={`Delete "${t.title || "New chat"}"`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

// ── ChatView ─────────────────────────────────────────────────────────────────

function ChatView({
  threadId,
  onTitleUpdate,
}: {
  threadId: string;
  onTitleUpdate: (id: string, title: string) => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  // While streaming, this holds the in-progress assistant turn.
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  // 422 = no provider key
  const [noKey, setNoKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load the thread's messages.
  const loadThread = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ thread: ChatThread; messages: ChatMessage[] }>(
        `/api/chat/threads/${threadId}`,
      );
      setMessages(data.messages);
      // Reset no-key banner if they may have since added a key.
      setNoKey(false);
    } catch {
      // swallow — thread may just not exist yet
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Auto-scroll to bottom whenever new content arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // SSE stream parser — mirrors breakdown-panel.tsx exactly.
  async function send() {
    const userText = text.trim();
    if (!userText || streaming) return;
    setText("");

    // Optimistically append the user message.
    const userMsg: ChatMessage = {
      role: "user",
      parts: [{ type: "text", text: userText }],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming({ text: "", proposals: [] });

    const res = await fetch(`${API_URL}/api/chat/threads/${threadId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: userText }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.status === 422 && body.error === "no_provider_key") {
        setNoKey(true);
      } else {
        toast(body.error ?? "Failed to send message.", "danger");
      }
      setStreaming(null);
      // Roll back optimistic user message if the request itself failed.
      setMessages((prev) => prev.slice(0, -1));
      setText(userText);
      return;
    }

    // Manual SSE parse (EventSource can't POST).
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalText = "";
    const finalProposals: ToolProposal[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";

      for (const evt of events) {
        const type = /^event: (.+)$/m.exec(evt)?.[1];
        const data = /^data: (.+)$/m.exec(evt)?.[1];
        if (!type || !data) continue;

        if (type === "delta") {
          // Token is a JSON-encoded string.
          const token: string = JSON.parse(data);
          finalText += token;
          setStreaming((prev) =>
            prev ? { ...prev, text: prev.text + token } : { text: token, proposals: [] },
          );
        }

        if (type === "tool-proposal") {
          const proposal: ToolProposal = {
            ...JSON.parse(data),
            state: "pending",
          };
          if (isMutating(proposal.toolName)) {
            finalProposals.push(proposal);
            setStreaming((prev) =>
              prev
                ? { ...prev, proposals: [...prev.proposals, proposal] }
                : { text: finalText, proposals: [proposal] },
            );
          }
          // Read tools (non-mutating tool proposals) are silently handled
          // server-side; their results appear as tool-result parts in the
          // final persisted message.
        }

        if (type === "done") {
          // Re-fetch the thread to get the fully-persisted assistant message
          // (with tool-result parts). This keeps the UI consistent with server truth.
          await loadThread();
          setStreaming(null);
          // Also update thread title in the rail (server may have generated one).
          try {
            const tdata = await api<{ thread: ChatThread; messages: ChatMessage[] }>(
              `/api/chat/threads/${threadId}`,
            );
            if (tdata.thread.title && tdata.thread.title !== "New chat") {
              onTitleUpdate(threadId, tdata.thread.title);
            }
          } catch {
            // ignore
          }
          return;
        }

        if (type === "error") {
          const err = JSON.parse(data);
          toast(err.message ?? "Stream error.", "danger");
          setStreaming(null);
          await loadThread();
          return;
        }
      }
    }

    // If we reach here (stream ended without "done" event), still settle.
    await loadThread();
    setStreaming(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Confirm / dismiss handlers for in-progress streaming proposals.
  function handleConfirm(toolCallId: string, result: Record<string, unknown>) {
    setStreaming((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposals: prev.proposals.map((p) =>
          p.toolCallId === toolCallId ? { ...p, state: "confirmed", result } : p,
        ),
      };
    });
  }

  function handleDismiss(toolCallId: string) {
    setStreaming((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposals: prev.proposals.map((p) =>
          p.toolCallId === toolCallId ? { ...p, state: "dismissed" } : p,
        ),
      };
    });
  }

  const busy = streaming !== null;

  return (
    <div className={styles.chatView}>
      {/* Message list */}
      <div className={styles.messages} aria-live="polite" aria-label="Chat messages">
        {loading ? (
          <div className={styles.loadingMessages}>
            <Skeleton height={60} />
            <Skeleton height={40} width="70%" />
            <Skeleton height={80} />
          </div>
        ) : messages.length === 0 && !streaming ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3C6.48 3 2 6.92 2 11.75c0 2.5 1.19 4.74 3.1 6.3L4 21l3.47-1.54A10.7 10.7 0 0 0 12 20.5c5.52 0 10-3.92 10-8.75S17.52 3 12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message="Ask anything about your specs, context, and roadmap."
          />
        ) : (
          <>
            {messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m, i) => {
                if (m.role === "user") {
                  const textPart = m.parts.find((p) => p.type === "text") as
                    | { type: "text"; text: string }
                    | undefined;
                  return (
                    <div key={i} className={styles.userTurn}>
                      <p className={styles.userText}>{textPart?.text}</p>
                    </div>
                  );
                }
                // assistant
                return (
                  <div key={i} className={styles.assistantTurn}>
                    <AssistantBubble parts={m.parts} threadId={threadId} />
                  </div>
                );
              })}

            {/* Live streaming assistant turn */}
            {streaming && (
              <div className={styles.assistantTurn}>
                <AiSurface>
                  {streaming.text ? (
                    <div className={styles.assistantText}>{streaming.text}</div>
                  ) : (
                    <ThinkingIndicator />
                  )}
                  {streaming.proposals.map((p) => (
                    <ConfirmCard
                      key={p.toolCallId}
                      proposal={p}
                      threadId={threadId}
                      onConfirm={handleConfirm}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </AiSurface>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* No-key banner */}
      {noKey && (
        <div className={styles.noKeyBanner} role="alert">
          Add an AI provider key in{" "}
          <Link href="/settings" className={styles.noKeyLink}>Settings</Link>{" "}
          to chat.
        </div>
      )}

      {/* Composer */}
      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          placeholder={noKey ? "Add a provider key to start chatting." : "Ask anything…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy || noKey}
          rows={1}
          aria-label="Message"
        />
        <Button
          variant="primary"
          onClick={send}
          disabled={!text.trim() || noKey}
          busy={busy}
          aria-label="Send"
        >
          Send
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const toast = useToast();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const data = await api<ChatThread[]>("/api/chat/threads?scope=workspace");
      setThreads(data);
    } catch {
      router.push("/signin");
    } finally {
      setThreadsLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createThread() {
    setCreating(true);
    try {
      const t = await api<ChatThread>("/api/chat/threads", {
        method: "POST",
        body: JSON.stringify({ scope: "workspace" }),
      });
      setThreads((prev) => [t, ...prev]);
      setActiveId(t.id);
    } catch {
      toast("Couldn't create a new chat.", "danger");
    } finally {
      setCreating(false);
    }
  }

  async function deleteThread(id: string) {
    try {
      await api(`/api/chat/threads/${id}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeId === id) setActiveId(null);
    } catch {
      toast("Couldn't delete that chat.", "danger");
    }
  }

  // When the server generates a title after the first turn, update the rail.
  function handleTitleUpdate(id: string, title: string) {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t)),
    );
  }

  return (
    <>
      <AppNav />
      <div className={styles.layout}>
        <ThreadRail
          threads={threads}
          activeId={activeId}
          loading={threadsLoading}
          onSelect={setActiveId}
          onCreate={createThread}
          onDelete={deleteThread}
        />
        <div className={styles.main}>
          {activeId ? (
            <ChatView
              key={activeId}
              threadId={activeId}
              onTitleUpdate={handleTitleUpdate}
            />
          ) : (
            <div className={styles.noThread}>
              <EmptyState
                icon={
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 3C6.48 3 2 6.92 2 11.75c0 2.5 1.19 4.74 3.1 6.3L4 21l3.47-1.54A10.7 10.7 0 0 0 12 20.5c5.52 0 10-3.92 10-8.75S17.52 3 12 3Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                message="Ask anything about your specs, context, and roadmap."
                action={
                  <Button variant="primary" onClick={createThread} busy={creating}>
                    New chat
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
