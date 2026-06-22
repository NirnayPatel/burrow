"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import styles from "./home.module.css";

type Me = { user: { name: string; email: string } | null };

export default function Home() {
  const router = useRouter();
  // Signed-in users land on Home (/dashboard); guests see the marketing page.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api<Me>("/api/me")
      .then(async (me) => {
        if (!me.user) {
          setChecked(true);
          return;
        }
        // Gate: check onboarding status before sending to dashboard.
        try {
          const ob = await api<{ onboarded: boolean; roleType: string }>("/api/onboarding");
          router.replace(ob.onboarded ? "/dashboard" : "/onboarding");
        } catch {
          // If onboarding check fails, fall through to dashboard.
          router.replace("/dashboard");
        }
      })
      .catch(() => setChecked(true));
  }, [router]);

  if (!checked) return null;

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Open source · Self-hosted</p>
        <h1 className={styles.title}>Multiplayer specs,<br />AI breakdowns, your keys.</h1>
        <p className={styles.tagline}>
          Burrow turns a product idea into a structured Spec your whole team
          edits live — then generates a task Breakdown in seconds using the AI
          provider you already pay for.
        </p>
        <div className={styles.ctas}>
          <Link href="/signin" className={styles.primaryCta}>
            Get started
          </Link>
          <Link href="/specs" className={styles.secondaryCta}>
            Open Specs
          </Link>
        </div>
      </div>

      <ul className={styles.pillars} aria-label="Key features">
        <li className={styles.pillar}>
          <span className={styles.pillarIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 4h14v13H3zM3 8h14M7 4v13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <strong className={styles.pillarLabel}>Multiplayer editor</strong>
          <span className={styles.pillarDesc}>
            Real-time presence — open one Spec in two windows and watch cursors
            move.
          </span>
        </li>
        <li className={styles.pillar}>
          <span className={styles.pillarIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <strong className={styles.pillarLabel}>AI Breakdown</strong>
          <span className={styles.pillarDesc}>
            One click turns your Spec into a prioritized task list using your
            own Anthropic, OpenAI, or Ollama key.
          </span>
        </li>
        <li className={styles.pillar}>
          <span className={styles.pillarIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 10h12M10 4v12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <strong className={styles.pillarLabel}>Your infrastructure</strong>
          <span className={styles.pillarDesc}>
            Keys are AES-256-GCM encrypted at rest. No data leaves your server.
          </span>
        </li>
      </ul>
    </main>
  );
}
