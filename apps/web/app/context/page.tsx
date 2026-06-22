"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Select } from "../../components/select";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { ConfirmDialog } from "../../components/dialog";
import { useToast } from "../../components/toast";
import styles from "./context.module.css";

// ─── types ────────────────────────────────────────────────────────────────────

const CONTEXT_KINDS = [
  "company",
  "product",
  "personas",
  "strategy",
  "ways_of_working",
  "other",
] as const;

type ContextKind = (typeof CONTEXT_KINDS)[number];

const KIND_LABELS: Record<ContextKind, string> = {
  company: "Company",
  product: "Product",
  personas: "Personas",
  strategy: "Strategy",
  ways_of_working: "Ways of Working",
  other: "Other",
};

const KIND_OPTIONS = CONTEXT_KINDS.map((k) => ({
  value: k,
  label: KIND_LABELS[k],
}));

type ContextDoc = {
  id: string;
  title: string;
  kind: ContextKind;
  source: "text" | "file";
  fileName: string | null;
  embedded: boolean;
  updatedAt: string;
};

type ContextDocFull = ContextDoc & { bodyText: string };

type EditState = {
  id: string | null;
  title: string;
  kind: ContextKind;
  bodyText: string;
};

const EMPTY_EDIT: EditState = {
  id: null,
  title: "",
  kind: "company",
  bodyText: "",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function KindChip({ kind }: { kind: ContextKind }) {
  return (
    <span className={`${styles.kindChip} ${styles[`kind_${kind}`]}`}>
      {KIND_LABELS[kind]}
    </span>
  );
}

function EmbeddedCue({ embedded }: { embedded: boolean }) {
  return (
    <span className={embedded ? styles.embeddedYes : styles.embeddedNo}>
      {embedded ? "Embedded ✓" : "Not embedded"}
    </span>
  );
}

// Upload uses fetch directly (multipart — can't use the api() helper which
// forces content-type: application/json).
async function uploadFile(file: File): Promise<ContextDoc> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/context/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Upload failed (${res.status})`);
  }
  return res.json() as Promise<ContextDoc>;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ContextPage() {
  const router = useRouter();
  const toast = useToast();

  const [docs, setDocs] = useState<ContextDoc[] | null>(null);
  const [role, setRole] = useState<string>("member");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContextDoc | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  // "text" | "upload" — which create mode is open
  const [createMode, setCreateMode] = useState<"text" | "upload" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api<ContextDoc[]>("/api/context")
      .then(setDocs)
      .catch(() => router.push("/signin"));

  useEffect(() => {
    load();
    api<{ role: string }>("/api/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = role === "admin";

  // ── open a new text-doc form ─────────────────────────────────────────────

  function openCreateText() {
    setEdit({ ...EMPTY_EDIT });
    setCreateMode("text");
  }

  // ── open edit for an existing doc ────────────────────────────────────────

  async function openEdit(doc: ContextDoc) {
    setLoadingEdit(true);
    try {
      const full = await api<ContextDocFull>(`/api/context/${doc.id}`);
      setEdit({ id: full.id, title: full.title, kind: full.kind, bodyText: full.bodyText });
      setCreateMode("text");
    } catch {
      toast("Could not load doc — try again.", "danger");
    } finally {
      setLoadingEdit(false);
    }
  }

  // ── save (create or patch) ───────────────────────────────────────────────

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setSaveBusy(true);
    try {
      if (edit.id) {
        await api(`/api/context/${edit.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: edit.title, kind: edit.kind, bodyText: edit.bodyText }),
        });
        toast("Context doc updated.", "success");
      } else {
        await api("/api/context", {
          method: "POST",
          body: JSON.stringify({ title: edit.title, kind: edit.kind, bodyText: edit.bodyText }),
        });
        toast("Context doc created — embedding queued.", "success");
      }
      setEdit(null);
      setCreateMode(null);
      load();
    } catch {
      toast("Save failed — try again.", "danger");
    } finally {
      setSaveBusy(false);
    }
  }

  // ── file upload ─────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    try {
      await uploadFile(file);
      toast(`"${file.name}" uploaded — text extracted, embedding queued.`, "success");
      load();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Upload failed — try again.",
        "danger",
      );
    } finally {
      setUploadBusy(false);
      // Reset so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
      setCreateMode(null);
    }
  }

  // ── delete ───────────────────────────────────────────────────────────────

  async function deleteDoc() {
    if (!deleteTarget) return;
    try {
      await api(`/api/context/${deleteTarget.id}`, { method: "DELETE" });
      toast("Context doc deleted.", "default");
      load();
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

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.heading}>Context</h1>
            <p className={styles.subtext}>
              Your company and product knowledge. Burrow retrieves it into every
              Breakdown, Sign-off insight, and AI assist.
            </p>
          </div>
          {isAdmin && !edit && createMode === null && (
            <div className={styles.headerActions}>
              <Button variant="secondary" onClick={() => setCreateMode("upload")} busy={uploadBusy}>
                Upload file
              </Button>
              <Button variant="primary" onClick={openCreateText}>
                New doc
              </Button>
            </div>
          )}
        </div>

        {/* Hidden file input — triggered by "Upload file" button or upload panel */}
        {isAdmin && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.md,.txt"
            className={styles.fileInputHidden}
            onChange={handleFileChange}
            aria-label="Upload context file"
          />
        )}

        {/* Upload drop panel */}
        {createMode === "upload" && isAdmin && (
          <div className={styles.uploadPanel}>
            <div className={styles.uploadInner}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={styles.uploadIcon}>
                <path
                  d="M12 16V8m0 0-3 3m3-3 3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className={styles.uploadHint}>
                PDF, DOCX, Markdown, or plain text — up to 10 MB
              </p>
              <div className={styles.uploadActions}>
                <Button
                  variant="primary"
                  busy={uploadBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setCreateMode(null)}
                  type="button"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit / create text-doc form */}
        {edit && createMode === "text" && (
          <form onSubmit={saveDoc} className={styles.editForm}>
            <div className={styles.editRow}>
              <Input
                className={styles.titleInput}
                placeholder="Doc title"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                required
              />
              <Select
                value={edit.kind}
                onValueChange={(v) => setEdit({ ...edit, kind: v as ContextKind })}
                options={KIND_OPTIONS}
                ariaLabel="Kind"
              />
            </div>
            <textarea
              className={styles.bodyArea}
              placeholder="Paste or write your context here…"
              value={edit.bodyText}
              onChange={(e) => setEdit({ ...edit, bodyText: e.target.value })}
              rows={12}
              required
            />
            <div className={styles.editActions}>
              <Button
                variant="secondary"
                onClick={() => { setEdit(null); setCreateMode(null); }}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" busy={saveBusy}>
                {edit.id ? "Save changes" : "Create doc"}
              </Button>
            </div>
          </form>
        )}

        {/* Doc list — only when no form is open */}
        {createMode === null && (
          <>
            {docs === null || loadingEdit ? (
              <ul className={styles.docList} aria-label="Loading context docs">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className={styles.docSkeletonRow}>
                    <Skeleton height={17} width="40%" />
                    <Skeleton height={13} width="70%" />
                    <Skeleton height={12} width={80} />
                  </li>
                ))}
              </ul>
            ) : docs.length === 0 ? (
              <EmptyState
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 5v4m0 4h.01"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                message="No context yet. Add your company and product context so AI plans the way your team works."
                action={
                  isAdmin ? (
                    <div className={styles.emptyActions}>
                      <Button variant="secondary" onClick={() => setCreateMode("upload")}>
                        Upload file
                      </Button>
                      <Button variant="primary" onClick={openCreateText}>
                        New doc
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            ) : (
              <ul className={styles.docList}>
                {docs.map((doc) => (
                  <li key={doc.id} className={styles.docRow}>
                    <div className={styles.docMain}>
                      <div className={styles.docTitleRow}>
                        <span className={styles.docTitle}>{doc.title}</span>
                        <KindChip kind={doc.kind} />
                      </div>
                      <div className={styles.docSubRow}>
                        {doc.source === "file" && doc.fileName ? (
                          <span className={styles.docSource}>
                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={styles.sourceIcon}>
                              <path
                                d="M2 1h6l2 2v8H2V1z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinejoin="round"
                              />
                              <path d="M7 1v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                            </svg>
                            {doc.fileName}
                          </span>
                        ) : (
                          <span className={styles.docSource}>Text</span>
                        )}
                        <EmbeddedCue embedded={doc.embedded} />
                      </div>
                    </div>
                    <div className={styles.docMeta}>
                      <span className={styles.docDate}>
                        {new Date(doc.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {isAdmin && (
                        <div className={styles.docActions}>
                          <Button
                            variant="ghost"
                            onClick={() => openEdit(doc)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.title ?? ""}"?`}
          body="This context doc will no longer be retrieved into Breakdowns and AI assists."
          confirmLabel="Delete doc"
          danger
          onConfirm={deleteDoc}
        />
      </PageShell>
    </>
  );
}
