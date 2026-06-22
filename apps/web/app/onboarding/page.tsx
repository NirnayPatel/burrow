"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { api, API_URL } from "../../lib/api";
import styles from "./onboarding.module.css";

// Role types mirror the server enum exactly.
type RoleType = "pm" | "eng" | "design" | "data" | "leadership" | "other";

const ROLES: { value: RoleType; label: string; desc: string }[] = [
  { value: "pm", label: "Product", desc: "Outcomes, scope, and user value" },
  { value: "eng", label: "Engineering", desc: "Implementation and interfaces" },
  { value: "design", label: "Design", desc: "Flows, states, and interaction" },
  { value: "data", label: "Data / Analytics", desc: "Metrics, events, and validation" },
  { value: "leadership", label: "Leadership", desc: "Decisions, trade-offs, and risk" },
  { value: "other", label: "Other", desc: "I'll configure later" },
];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);
  const [contextText, setContextText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- step helpers ---

  async function handleRoleSelect(role: RoleType) {
    setSelectedRole(role);
    // Fire the role endpoint immediately on selection, best-effort.
    api("/api/onboarding/role", {
      method: "POST",
      body: JSON.stringify({ roleType: role }),
    }).catch(() => {/* non-blocking */});
    setStep(2);
  }

  async function handleFileUpload(file: File) {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain", "text/x-markdown"];
    const extOk = /\.(pdf|docx|md|txt)$/i.test(file.name);
    if (!extOk && !allowed.includes(file.type)) {
      alert("Only PDF, DOCX, MD, and TXT files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File must be under 10 MB.");
      return;
    }
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/context/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      setFileName(file.name);
    } catch {
      alert("Upload failed. You can skip and add context later.");
    } finally {
      setUploadBusy(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }

  async function finishWizard(skip = false) {
    setBusy(true);
    try {
      // Build context docs from the textarea only (file upload already created its own doc).
      const contextDocs =
        !skip && contextText.trim()
          ? [{ title: "Company & Product", kind: "company", bodyText: contextText.trim() }]
          : [];

      await api("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          ...(selectedRole ? { roleType: selectedRole } : {}),
          ...(contextDocs.length ? { contextDocs } : {}),
        }),
      });
    } catch {
      // Best-effort — if complete fails, still navigate to dashboard.
    } finally {
      setBusy(false);
      router.push("/dashboard");
    }
  }

  // --- render ---

  return (
    <PageShell width="narrow">
      <div className={styles.header}>
        <p className={styles.brand}>Burrow</p>
      </div>

      {step === 1 && (
        <section className={styles.section} aria-label="Step 1: Your role">
          <h1 className={styles.heading}>What's your role?</h1>
          <p className={styles.sub}>
            Burrow tailors AI output based on how you think about products.
          </p>

          <div className={styles.roleGrid}>
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={[
                  styles.roleCard,
                  selectedRole === r.value ? styles.roleCardSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleRoleSelect(r.value)}
              >
                <span className={styles.roleLabel}>{r.label}</span>
                <span className={styles.roleDesc}>{r.desc}</span>
              </button>
            ))}
          </div>

          <div className={styles.skipRow}>
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedRole(null);
                setStep(2);
              }}
            >
              Skip
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={styles.section} aria-label="Step 2: Company and product context">
          <h1 className={styles.heading}>Your company & product</h1>
          <p className={styles.sub}>
            A paragraph here seeds every AI response with the right context.
            Totally optional — you can always add more in Context.
          </p>

          <textarea
            className={styles.textarea}
            placeholder="Paste a paragraph about your company and product — what it does, who it's for, and what matters most right now."
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            rows={5}
          />

          <div
            className={[styles.dropZone, dragOver ? styles.dropZoneActive : ""]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop a file or click to upload"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.txt"
              className={styles.fileInputHidden}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = "";
              }}
            />
            {uploadBusy ? (
              <span className={styles.dropZoneLabel}>Uploading…</span>
            ) : fileName ? (
              <span className={styles.dropZoneSuccess}>{fileName} uploaded</span>
            ) : (
              <>
                <span className={styles.dropZoneLabel}>Drop a file here, or click to browse</span>
                <span className={styles.dropZoneHint}>PDF, DOCX, MD, TXT — up to 10 MB</span>
              </>
            )}
          </div>

          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => setStep(3)}
              disabled={uploadBusy}
            >
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setContextText("");
                setFileName(null);
                setStep(3);
              }}
            >
              Skip
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className={styles.section} aria-label="Step 3: Setup complete">
          <div className={styles.checkmark} aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10 16.5l4 4 8-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className={styles.heading}>You're set</h1>
          <p className={styles.sub}>
            Context is live. Add more anytime in Context.
            Add an AI key in Settings to start generating.
          </p>

          <div className={styles.actions}>
            <Button
              variant="primary"
              busy={busy}
              onClick={() => finishWizard(false)}
            >
              Go to Home
            </Button>
          </div>
        </section>
      )}
    </PageShell>
  );
}
