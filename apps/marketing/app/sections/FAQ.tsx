"use client";

import { useState } from "react";
import styles from "./FAQ.module.css";

const faqs = [
  {
    q: "Is Burrow really free?",
    a: "Yes. Self-hosted, unlimited creators, forever. No seat tax, no per-creator pricing, no core capability behind a paywall. Managed hosting and an enterprise compliance pack are on the roadmap as the only paid options — convenience and compliance, never core features.",
  },
  {
    q: "Do you see my specs or my data?",
    a: "No. Burrow runs on your infrastructure. We host no models, run no inference, and collect no telemetry. There's no path for your data to reach us, because we have no servers in it.",
  },
  {
    q: "Which AI providers work?",
    a: "Anthropic, OpenAI, Google, OpenRouter, and Ollama. You add your org's own key in Settings; it's encrypted at rest and used for every AI feature. Ollama keeps inference fully on-prem.",
  },
  {
    q: "Which coding agents does the bridge support?",
    a: "Any MCP-capable agent — Claude Code, Cursor, and others. Your agent pulls the next task with full Spec context, can read your org's insights and skills, and pushes status back over a Streamable HTTP MCP endpoint (bearer-token auth today; OAuth 2.1 on the roadmap).",
  },
  {
    q: "Is Burrow just specs, or a full workspace?",
    a: "A full workspace. Specs are the heart, but Burrow also gives you a roadmap, goals/OKRs, customer feedback, competitive signals, teams, a Context Graph, and a library of shareable skills and agents — with AI insights woven through all of it, and a ⌘K command palette to move fast.",
  },
  {
    q: "How is this different from writing specs in markdown?",
    a: "Markdown files can't do real-time co-editing, AI breakdowns grounded in your context, or sign-offs pinned to a version — let alone a roadmap, goals, and an agent bridge. Burrow adds all of that while keeping the same ownership: your data stays on your infrastructure.",
  },
  {
    q: "Does it integrate with Jira, Confluence, and Slack?",
    a: "These integrations are in progress. They connect over MCP using your org's own credentials — pushing tasks to Jira issues, linking specs to Confluence pages (Cloud and Data Center), and notifying in Slack. On the roadmap.",
  },
  {
    q: "What does setup actually take?",
    a: "docker compose up. You bring an API key and a few minutes. The target is a cold start to two people co-editing a spec in under 10 minutes.",
  },
  {
    q: "What's the license, and can it change on me?",
    a: "Open source, published with the repo, plus a no-rug-pull pledge and a public governance doc in the first week. The license can't be quietly swapped. We're finalizing the exact license terms before public launch.",
  },
  {
    q: 'Will there ever be telemetry or a "phone home"?',
    a: "No. Zero telemetry and zero install pings are a design commitment, not a default we'll flip later.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.item} ${open ? styles.open : ""}`}>
      <button
        className={styles.question}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className={styles.icon} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className={styles.answer}>
          <p>{a}</p>
        </div>
      )}
    </div>
  );
}

export function FAQ() {
  return (
    <section className={styles.section}>
      <div className={`${styles.inner} container`}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Questions</span>
          <h2 className={styles.title}>Frequently asked.</h2>
        </div>

        <div className={styles.list}>
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

