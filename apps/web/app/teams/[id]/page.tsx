"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import * as RDialog from "@radix-ui/react-dialog";
import { api, type Spec } from "../../../lib/api";
import { AppNav } from "../../../components/app-nav";
import { PageShell } from "../../../components/page-shell";
import { Button } from "../../../components/button";
import { Input } from "../../../components/input";
import { Select } from "../../../components/select";
import { EmptyState } from "../../../components/empty-state";
import { Skeleton } from "../../../components/skeleton";
import { ConfirmDialog } from "../../../components/dialog";
import { StatusBadge } from "../../../components/status-badge";
import { Avatar } from "../../../components/avatar";
import { presenceColor } from "../../../lib/presence";
import { useToast } from "../../../components/toast";
import styles from "./team-detail.module.css";

type Team = {
  id: string;
  name: string;
  leadUserId: string | null;
  memberCount: number;
  createdAt: string;
};

type TeamMember = {
  userId: string;
  name: string;
  email: string;
  roleInTeam: "lead" | "member";
  addedAt: string;
};

type OrgMember = { id: string; name: string; email: string };

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "lead", label: "Lead" },
];

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [specs, setSpecs] = useState<Spec[] | null>(null);
  const [myRole, setMyRole] = useState<string>("member");
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // Add member dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addUserId, setAddUserId] = useState<string>("");
  const [addRole, setAddRole] = useState<string>("member");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Change lead dialog
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadUserId, setLeadUserId] = useState<string>("__none__");
  const [leadBusy, setLeadBusy] = useState(false);

  // Delete / remove confirms
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const isAdmin = myRole === "admin";

  function loadTeam() {
    api<Team>(`/api/teams/${id}`).then(setTeam).catch(() => router.push("/teams"));
  }

  function loadMembers() {
    api<TeamMember[]>(`/api/teams/${id}/members`).then(setMembers).catch(() => {});
  }

  function loadSpecs() {
    api<Spec[]>(`/api/specs?teamId=${id}`).then(setSpecs).catch(() => {});
  }

  useEffect(() => {
    loadTeam();
    loadMembers();
    loadSpecs();
    api<{ members: OrgMember[]; myRole: string }>("/api/org")
      .then((d) => {
        setMyRole(d.myRole);
        setOrgMembers(d.members);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Rename ──
  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    setRenameBusy(true);
    try {
      const updated = await api<Team>(`/api/teams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameName.trim() }),
      });
      setTeam(updated);
      setRenaming(false);
      toast("Team renamed.", "success");
    } catch {
      toast("Rename failed — try again.", "danger");
    } finally {
      setRenameBusy(false);
    }
  }

  // ── Change lead ──
  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadBusy(true);
    try {
      const updated = await api<Team>(`/api/teams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          leadUserId: leadUserId === "__none__" ? null : leadUserId,
        }),
      });
      setTeam(updated);
      loadMembers();
      setLeadOpen(false);
      toast("Team lead updated.", "success");
    } catch {
      toast("Update failed — try again.", "danger");
    } finally {
      setLeadBusy(false);
    }
  }

  // ── Add member ──
  function openAddMember() {
    // Default to first org member not already in the team
    const existingIds = new Set(members?.map((m) => m.userId) ?? []);
    const first = orgMembers.find((m) => !existingIds.has(m.id));
    setAddUserId(first?.id ?? orgMembers[0]?.id ?? "");
    setAddRole("member");
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddBusy(true);
    try {
      await api(`/api/teams/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: addUserId, roleInTeam: addRole }),
      });
      loadMembers();
      loadTeam();
      setAddOpen(false);
      toast("Member added.", "success");
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes("409")
          ? "This person is already on the team."
          : "Add failed — try again.";
      setAddError(msg);
    } finally {
      setAddBusy(false);
    }
  }

  // ── Remove member ──
  async function removeMember() {
    if (!removeTarget) return;
    try {
      await api(`/api/teams/${id}/members/${removeTarget.userId}`, {
        method: "DELETE",
      });
      loadMembers();
      loadTeam();
      toast(`${removeTarget.name} removed.`, "default");
    } catch {
      toast("Remove failed — try again.", "danger");
    } finally {
      setRemoveTarget(null);
    }
  }

  // ── Delete team ──
  async function deleteTeam() {
    try {
      await api(`/api/teams/${id}`, { method: "DELETE" });
      toast("Team deleted.", "default");
      router.push("/teams");
    } catch {
      toast("Delete failed — try again.", "danger");
    }
  }

  const memberOptions = orgMembers.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }));
  const leadOptions = [
    { value: "__none__", label: "No lead" },
    ...(members ?? []).map((m) => ({ value: m.userId, label: m.name })),
  ];

  const currentLead = members?.find((m) => m.userId === team?.leadUserId);

  if (!team) {
    return (
      <>
        <AppNav />
        <PageShell width="base">
          <Skeleton height={24} width={180} />
        </PageShell>
      </>
    );
  }

  return (
    <>
      <AppNav />
      <PageShell width="base">
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headingRow}>
            {renaming ? (
              <form onSubmit={submitRename} className={styles.renameForm}>
                <Input
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  aria-label="New team name"
                  required
                />
                <Button type="submit" variant="primary" busy={renameBusy}>
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <h1 className={styles.heading}>{team.name}</h1>
            )}
            {currentLead && (
              <div className={styles.leadRow}>
                <Avatar
                  name={currentLead.name}
                  color={presenceColor(currentLead.name)}
                />
                <span>{currentLead.name} · lead</span>
              </div>
            )}
          </div>
          {isAdmin && (
            <div className={styles.headerActions}>
              {!renaming && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRenameName(team.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </Button>
              )}
              {members && members.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLeadUserId(team.leadUserId ?? "__none__");
                    setLeadOpen(true);
                  }}
                >
                  Change lead
                </Button>
              )}
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <Tabs.Root defaultValue="members">
          <Tabs.List className={styles.tabList} aria-label="Team sections">
            <Tabs.Trigger value="members" className={styles.tab}>
              Members
            </Tabs.Trigger>
            <Tabs.Trigger value="specs" className={styles.tab}>
              Specs
            </Tabs.Trigger>
          </Tabs.List>

          {/* Members tab */}
          <Tabs.Content value="members">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {members?.length ?? 0} member{members?.length === 1 ? "" : "s"}
              </h2>
              {isAdmin && (
                <Button variant="primary" onClick={openAddMember}>
                  Add member
                </Button>
              )}
            </div>

            {members === null ? (
              <ul className={styles.memberList} aria-label="Loading members">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className={styles.skeletonRow}>
                    <Skeleton width={120} height={14} />
                    <Skeleton width={180} height={12} />
                  </li>
                ))}
              </ul>
            ) : members.length === 0 ? (
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
                message="No members yet. Add people to get started."
                action={
                  isAdmin ? (
                    <Button variant="primary" onClick={openAddMember}>
                      Add member
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className={styles.memberList}>
                {members.map((m) => (
                  <li key={m.userId} className={styles.memberRow}>
                    <Avatar name={m.name} color={presenceColor(m.name)} />
                    <span className={styles.memberName}>{m.name}</span>
                    <span className={styles.memberEmail}>{m.email}</span>
                    <span
                      className={`${styles.roleBadge} ${
                        m.roleInTeam === "lead" ? styles.roleLead : styles.roleMember
                      }`}
                    >
                      {m.roleInTeam}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="danger"
                        onClick={() => setRemoveTarget(m)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tabs.Content>

          {/* Specs tab */}
          <Tabs.Content value="specs">
            {specs === null ? (
              <ul className={styles.specList} aria-label="Loading specs">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className={styles.skeletonRow}>
                    <Skeleton width={52} height={14} />
                    <Skeleton height={14} />
                  </li>
                ))}
              </ul>
            ) : specs.length === 0 ? (
              <EmptyState
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M7 3.5h7L19 8.5v12h-12v-17Zm7 0v5h5M9.5 12.5h5m-5 3.5h5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                message="No specs assigned to this team yet. Assign a spec to this team from the spec page."
              />
            ) : (
              <ul className={styles.specList}>
                {specs.map((s) => (
                  <li key={s.id}>
                    <Link href={`/specs/${s.id}`} className={styles.specRow}>
                      <span className={styles.specDisplayId}>{s.displayId}</span>
                      <span className={styles.specTitle}>
                        {s.title || "Untitled spec"}
                      </span>
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tabs.Content>
        </Tabs.Root>

        {/* ── Add member dialog ── */}
        <RDialog.Root open={addOpen} onOpenChange={setAddOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby={undefined}
            >
              <RDialog.Title className={styles.dialogTitle}>
                Add member
              </RDialog.Title>
              <form onSubmit={submitAddMember} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Member</label>
                  {memberOptions.length === 0 ? (
                    <p className={styles.dialogError}>
                      All org members are already on this team.
                    </p>
                  ) : (
                    <Select
                      value={addUserId}
                      onValueChange={setAddUserId}
                      options={memberOptions}
                      ariaLabel="Org member to add"
                    />
                  )}
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Role in team</label>
                  <Select
                    value={addRole}
                    onValueChange={setAddRole}
                    options={ROLE_OPTIONS}
                    ariaLabel="Role in team"
                  />
                </div>
                {addError && (
                  <p className={styles.dialogError}>{addError}</p>
                )}
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button
                    type="submit"
                    variant="primary"
                    busy={addBusy}
                    disabled={memberOptions.length === 0}
                  >
                    Add
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Change lead dialog ── */}
        <RDialog.Root open={leadOpen} onOpenChange={setLeadOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className={styles.overlay} />
            <RDialog.Content
              className={styles.dialogContent}
              aria-describedby={undefined}
            >
              <RDialog.Title className={styles.dialogTitle}>
                Change team lead
              </RDialog.Title>
              <form onSubmit={submitLead} className={styles.dialogForm}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Lead</label>
                  <Select
                    value={leadUserId}
                    onValueChange={setLeadUserId}
                    options={leadOptions}
                    ariaLabel="Team lead"
                  />
                </div>
                <div className={styles.dialogActions}>
                  <RDialog.Close asChild>
                    <Button variant="secondary">Cancel</Button>
                  </RDialog.Close>
                  <Button type="submit" variant="primary" busy={leadBusy}>
                    Save
                  </Button>
                </div>
              </form>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        {/* ── Delete team confirm ── */}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete "${team.name}"?`}
          body="This removes the team but keeps all its Specs (they'll become org-wide)."
          confirmLabel="Delete team"
          danger
          onConfirm={deleteTeam}
        />

        {/* ── Remove member confirm ── */}
        <ConfirmDialog
          open={removeTarget !== null}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          title={`Remove ${removeTarget?.name ?? ""} from team?`}
          body="They'll lose team membership but keep org access and their existing specs."
          confirmLabel="Remove"
          danger
          onConfirm={removeMember}
        />
      </PageShell>
    </>
  );
}
