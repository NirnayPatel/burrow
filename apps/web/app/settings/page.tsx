"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Select } from "../../components/select";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { useToast } from "../../components/toast";
import styles from "./settings.module.css";

type KeyRow = { id: string; provider: string; createdAt: string };
type Member = { id: string; name: string; email: string; role: string };
const PROVIDERS = ["anthropic", "openai", "google", "openrouter", "ollama"] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Member",
};

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [provider, setProvider] = useState<string>("anthropic");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("member");
  const [removeTarget, setRemoveTarget] = useState<KeyRow | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const loadKeys = () =>
    api<KeyRow[]>("/api/keys")
      .then(setKeys)
      .catch(() => router.push("/signin"));

  useEffect(() => {
    loadKeys();
    api<{ role: string }>("/api/me").then((me) => setRole(me.role));
    api<{ org: { name: string }; members: Member[]; myRole: string }>("/api/org")
      .then((data) => setMembers(data.members))
      .catch(() => {}); // non-blocking; page still works without org data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAddBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/keys`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Add key failed — check the key and try again.");
        toast("Add key failed — check the key and try again.", "danger");
        return;
      }
      setKey("");
      toast(`${provider} key added.`, "success");
      loadKeys();
    } catch {
      const msg = "Add key failed — check your connection.";
      setError(msg);
      toast(msg, "danger");
    } finally {
      setAddBusy(false);
    }
  }

  async function removeKey() {
    if (!removeTarget) return;
    try {
      await fetch(`${API_URL}/api/keys/${removeTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast(`${removeTarget.provider} key removed.`, "default");
      loadKeys();
    } catch {
      toast("Remove failed — try again.", "danger");
    } finally {
      setRemoveTarget(null);
    }
  }

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Settings</h1>
        </div>

        {/* ── AI Provider Keys ─────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.subheading}>AI provider keys</h2>
          <p className={styles.trust}>
            Your org brings its own keys — Burrow hosts no models and never
            proxies traffic through keys of its own. Keys are AES-256-GCM
            encrypted at rest and never leave this server. For Ollama, paste the
            base URL (e.g. <code>http://localhost:11434</code>) instead of a key.
          </p>

          {keys === null ? (
            <ul className={styles.keyList} aria-label="Loading keys">
              {Array.from({ length: 2 }).map((_, i) => (
                <li key={i} className={styles.keyRow}>
                  <Skeleton width={80} height={14} />
                  <Skeleton width={100} height={12} />
                </li>
              ))}
            </ul>
          ) : keys.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14.5 9.5a5 5 0 1 0-4.9 4l1.4-1.5h2v-2h2l1.5-1.5v1zm6 0-6 6m-2.5-9a1 1 0 0 1 0 .01"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              message="No provider key yet — add one below and the Breakdown generator becomes available."
            />
          ) : (
            <ul className={styles.keyList}>
              {keys.map((k) => (
                <li key={k.id} className={styles.keyRow}>
                  <strong className={styles.keyProvider}>{k.provider}</strong>
                  <span className={styles.keyMeta}>{k.provider} · ready</span>
                  {role === "admin" && (
                    <Button variant="danger" onClick={() => setRemoveTarget(k)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {role === "admin" && (
            <form onSubmit={addKey} className={styles.form}>
              <Select
                value={provider}
                onValueChange={setProvider}
                ariaLabel="AI provider"
                options={PROVIDERS.map((p) => ({ value: p, label: p }))}
              />
              <Input
                className={styles.keyInput}
                placeholder="API key (or base URL for Ollama)"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
              />
              <Button type="submit" variant="primary" busy={addBusy}>
                Add key
              </Button>
            </form>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {/* ── Members ──────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.subheading}>Members</h2>
          {members === null ? (
            <ul className={styles.memberList} aria-label="Loading members">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className={styles.memberRow}>
                  <Skeleton width={120} height={14} />
                  <Skeleton width={180} height={12} />
                  <Skeleton width={56} height={20} radius="var(--radius-full)" />
                </li>
              ))}
            </ul>
          ) : members.length === 0 ? (
            <p className={styles.emptyMembers}>No other members yet.</p>
          ) : (
            <ul className={styles.memberList}>
              {members.map((m) => (
                <li key={m.id} className={styles.memberRow}>
                  <span className={styles.memberName}>{m.name}</span>
                  <span className={styles.memberEmail}>{m.email}</span>
                  <span
                    className={`${styles.roleBadge} ${
                      m.role === "admin" ? styles.roleAdmin : styles.roleMember
                    }`}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ConfirmDialog
          open={removeTarget !== null}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          title={`Remove ${removeTarget?.provider ?? ""} key?`}
          body="Breakdowns will stop generating until a replacement key is added."
          confirmLabel="Remove key"
          danger
          onConfirm={removeKey}
        />
      </PageShell>
    </>
  );
}
