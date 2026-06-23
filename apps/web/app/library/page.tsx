"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { AgentAvatar } from "../../components/agent-avatar";
import { useToast } from "../../components/toast";
import styles from "./library.module.css";

// ─── types ───────────────────────────────────────────────────────────────────

type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  params: string[] | null;
  toolAllowlist: string[] | null;
  published: boolean;
  importedFrom: string | null;
};

type Agent = {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  model: string | null;
  skillSlugs: string[] | null;
  toolAllowlist: string[] | null;
  writeScope: string | null;
  published: boolean;
  importedFrom: string | null;
};

type Entity = "skills" | "agents";

// ─── helpers ─────────────────────────────────────────────────────────────────

function list(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

// ─── shared pieces ───────────────────────────────────────────────────────────

// Neutral monochrome taxonomy chips — the label carries the meaning, not a hue.
// Lifecycle palette is reserved for lifecycle state (05-DESIGN §3).
function Chip({ children }: { children: React.ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.chipRow}>
      <span className={styles.chipRowLabel}>{label}</span>
      <div className={styles.chips}>
        {items.map((it) => (
          <Chip key={it}>{it}</Chip>
        ))}
      </div>
    </div>
  );
}

// Published = active (accent). Draft = quiet/muted. Mirrors the automations
// enable toggle: admin gets a real toggle, members see a read-only state pill.
function PublishControl({
  published,
  isAdmin,
  busy,
  onToggle,
}: {
  published: boolean;
  isAdmin: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (!isAdmin) {
    return (
      <span
        className={`${styles.statePill} ${
          published ? styles.statePublished : styles.stateDraft
        }`}
      >
        <span className={styles.stateDot} aria-hidden="true" />
        {published ? "Published" : "Draft"}
      </span>
    );
  }
  return (
    <label
      className={styles.publishControl}
      aria-label={published ? "Move to draft" : "Publish"}
    >
      <span
        className={`${styles.stateLabel} ${
          published ? styles.stateLabelOn : styles.stateLabelOff
        }`}
      >
        {published ? "Published" : "Draft"}
      </span>
      <span className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.toggleInput}
          checked={published}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={styles.toggleTrack} />
      </span>
    </label>
  );
}

// ─── skill card ──────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  isAdmin,
  busy,
  onToggle,
}: {
  skill: Skill;
  isAdmin: boolean;
  busy: boolean;
  onToggle: (slug: string, next: boolean) => void;
}) {
  return (
    <article
      className={`${styles.card} ${!skill.published ? styles.cardDraft : ""}`}
    >
      <div className={styles.cardTop}>
        <div className={styles.cardMeta}>
          <span className={styles.cardName}>{skill.name}</span>
          <span className={styles.cardSlug}>{skill.slug}</span>
        </div>
        <PublishControl
          published={skill.published}
          isAdmin={isAdmin}
          busy={busy}
          onToggle={(next) => onToggle(skill.slug, next)}
        />
      </div>

      {skill.description && (
        <p className={styles.cardDescription}>{skill.description}</p>
      )}

      <ChipRow label="Params" items={list(skill.params)} />
      <ChipRow label="Tools" items={list(skill.toolAllowlist)} />

      {skill.importedFrom && (
        <p className={styles.provenance}>Imported from {skill.importedFrom}</p>
      )}
    </article>
  );
}

// ─── agent card ──────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  isAdmin,
  busy,
  onToggle,
}: {
  agent: Agent;
  isAdmin: boolean;
  busy: boolean;
  onToggle: (slug: string, next: boolean) => void;
}) {
  return (
    <article
      className={`${styles.card} ${!agent.published ? styles.cardDraft : ""}`}
    >
      <div className={styles.cardTop}>
        <div className={styles.agentMeta}>
          <AgentAvatar name={agent.name} idle={!agent.published} />
          <div className={styles.cardMeta}>
            <span className={styles.cardName}>{agent.name}</span>
            <span className={styles.cardSlug}>
              {agent.role ?? agent.slug}
            </span>
          </div>
        </div>
        <PublishControl
          published={agent.published}
          isAdmin={isAdmin}
          busy={busy}
          onToggle={(next) => onToggle(agent.slug, next)}
        />
      </div>

      <div className={styles.specRow}>
        <span className={styles.specLabel}>Model</span>
        <span className={styles.specValue}>{agent.model ?? "Org default"}</span>
      </div>
      {agent.writeScope && (
        <div className={styles.specRow}>
          <span className={styles.specLabel}>Write scope</span>
          <span className={styles.specValue}>{agent.writeScope}</span>
        </div>
      )}

      <ChipRow label="Skills" items={list(agent.skillSlugs)} />
      <ChipRow label="Tools" items={list(agent.toolAllowlist)} />

      {agent.importedFrom && (
        <p className={styles.provenance}>Imported from {agent.importedFrom}</p>
      )}
    </article>
  );
}

// ─── loading + empty ─────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className={styles.list}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonCard}>
          <Skeleton height={16} width="40%" />
          <Skeleton height={13} width="60%" />
          <Skeleton height={13} width="30%" />
        </div>
      ))}
    </div>
  );
}

const SKILL_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const AGENT_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="4"
      y="6"
      width="16"
      height="14"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M9 11h.01M15 11h.01M9 15h6M12 6V3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// ─── page ────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter();
  const toast = useToast();

  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [role, setRole] = useState<string>("member");
  // slug currently mid-flight — disables its toggle so it can't double-fire.
  const [pending, setPending] = useState<string | null>(null);

  const loadSkills = useCallback(() => {
    api<Skill[]>("/api/skills")
      .then(setSkills)
      .catch(() => router.push("/signin"));
  }, [router]);

  const loadAgents = useCallback(() => {
    api<Agent[]>("/api/agents")
      .then(setAgents)
      .catch(() => router.push("/signin"));
  }, [router]);

  useEffect(() => {
    loadSkills();
    loadAgents();
    api<{ role: string }>("/api/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
  }, [loadSkills, loadAgents]);

  const isAdmin = role === "admin";

  // Optimistic flip; revert + toast on failure.
  async function toggleSkill(slug: string, next: boolean) {
    setSkills((prev) =>
      prev
        ? prev.map((s) => (s.slug === slug ? { ...s, published: next } : s))
        : prev
    );
    setPending(`skill:${slug}`);
    try {
      await api(`/api/skills/${slug}/published`, {
        method: "PATCH",
        body: JSON.stringify({ published: next }),
      });
      toast(next ? "Skill published." : "Skill moved to draft.", "default");
    } catch {
      setSkills((prev) =>
        prev
          ? prev.map((s) =>
              s.slug === slug ? { ...s, published: !next } : s
            )
          : prev
      );
      toast("Could not update skill — try again.", "danger");
    } finally {
      setPending(null);
    }
  }

  async function toggleAgent(slug: string, next: boolean) {
    setAgents((prev) =>
      prev
        ? prev.map((a) => (a.slug === slug ? { ...a, published: next } : a))
        : prev
    );
    setPending(`agent:${slug}`);
    try {
      await api(`/api/agents/${slug}/published`, {
        method: "PATCH",
        body: JSON.stringify({ published: next }),
      });
      toast(next ? "Agent published." : "Agent moved to draft.", "default");
    } catch {
      setAgents((prev) =>
        prev
          ? prev.map((a) =>
              a.slug === slug ? { ...a, published: !next } : a
            )
          : prev
      );
      toast("Could not update agent — try again.", "danger");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Library</h1>
        </div>

        {/* ── Skills ───────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.subheading}>Skills</h2>
          {skills === null ? (
            <SkeletonList />
          ) : skills.length === 0 ? (
            <EmptyState
              icon={SKILL_ICON}
              message="No skills yet — author one with `burrow skill push`, or import a pack."
            />
          ) : (
            <div className={styles.list}>
              {skills.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  isAdmin={isAdmin}
                  busy={pending === `skill:${s.slug}`}
                  onToggle={toggleSkill}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Agents ───────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.subheading}>Agents</h2>
          {agents === null ? (
            <SkeletonList />
          ) : agents.length === 0 ? (
            <EmptyState
              icon={AGENT_ICON}
              message="No agents yet — define one with `burrow agent push`, or import a pack."
            />
          ) : (
            <div className={styles.list}>
              {agents.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isAdmin={isAdmin}
                  busy={pending === `agent:${a.slug}`}
                  onToggle={toggleAgent}
                />
              ))}
            </div>
          )}
        </section>
      </PageShell>
    </>
  );
}
