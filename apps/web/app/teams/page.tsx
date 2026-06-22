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
import { Avatar } from "../../components/avatar";
import { presenceColor } from "../../lib/presence";
import styles from "./teams.module.css";

type Team = {
  id: string;
  name: string;
  leadUserId: string | null;
  leadName?: string | null;
  memberCount: number;
  createdAt: string;
};

type OrgMember = { id: string; name: string; email: string };

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [myRole, setMyRole] = useState<string>("member");
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Create team dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLead, setNewLead] = useState<string>("__none__");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isAdmin = myRole === "admin";

  function loadTeams() {
    api<Team[]>("/api/teams")
      .then(setTeams)
      .catch(() => router.push("/signin"));
  }

  useEffect(() => {
    loadTeams();
    api<{ members: OrgMember[]; myRole: string }>("/api/org")
      .then((d) => {
        setMyRole(d.myRole);
        setOrgMembers(d.members);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setNewName("");
    setNewLead("__none__");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateBusy(true);
    try {
      const body: Record<string, string> = { name: newName.trim() };
      if (newLead !== "__none__") body.leadUserId = newLead;
      await api("/api/teams", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreateOpen(false);
      loadTeams();
    } catch {
      setCreateError("Create failed — try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  const leadOptions = [
    { value: "__none__", label: "No lead" },
    ...orgMembers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <>
      <AppNav />
      <PageShell width="base">
        <div className={styles.header}>
          <h1 className={styles.heading}>Teams</h1>
          {isAdmin && (
            <Button variant="primary" onClick={openCreate}>
              New team
            </Button>
          )}
        </div>

        {teams === null ? (
          <div className={styles.grid}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard}>
                <Skeleton height={18} width={120} />
                <Skeleton height={13} width="60%" />
                <Skeleton height={13} width="40%" />
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 2v6m-3-3h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message="No teams yet. Group people and work into squads."
            action={
              isAdmin ? (
                <Button variant="primary" onClick={openCreate}>
                  New team
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={styles.grid}>
            {teams.map((t) => (
              <div key={t.id} className={styles.card}>
                <h2 className={styles.cardName}>{t.name}</h2>
                <div className={styles.cardMeta}>
                  <div className={styles.cardLead}>
                    {t.leadName ? (
                      <>
                        <Avatar name={t.leadName} color={presenceColor(t.leadName)} />
                        <span className={styles.cardLeadName}>{t.leadName}</span>
                      </>
                    ) : (
                      <span className={styles.cardLeadName}>No lead</span>
                    )}
                  </div>
                  <span className={styles.chip}>
                    {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={styles.cardActions}>
                  <Link href={`/teams/${t.id}`} className={styles.manageLink}>
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Create team dialog ── */}
        <RDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby={undefined}
            >
              <RDialog.Title className={styles.dialogTitle}>
                New team
              </RDialog.Title>
              <form onSubmit={submitCreate} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="team-name">
                    Team name
                  </label>
                  <Input
                    id="team-name"
                    placeholder="e.g. Platform, Growth, Core"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                {orgMembers.length > 0 && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Lead <span className={styles.optional}>(optional)</span>
                    </label>
                    <Select
                      value={newLead}
                      onValueChange={setNewLead}
                      options={leadOptions}
                      ariaLabel="Team lead"
                    />
                  </div>
                )}
                {createError && (
                  <p className={styles.dialogError}>{createError}</p>
                )}
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={createBusy}>
                    Create
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>
      </PageShell>
    </>
  );
}
