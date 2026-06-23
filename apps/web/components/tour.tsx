"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const SEEN_KEY = "burrow-tour-done";

// A thorough walk-through of the loop: write a Spec → AI Breakdown → Sign off →
// agents ship it. Steps targeting dashboard cards are optional (a brand-new
// org's Home is empty), so the tour adapts to what's on screen.
type Step = {
  target?: string;
  optional?: boolean;
  title: string;
  body: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};

const STEPS: Step[] = [
  {
    title: "Welcome to Burrow ✦",
    body: "A 90-second tour of how a spec becomes shipped work — your team writes it together, AI breaks it down, and your coding agents ship it. You can replay this anytime from your account menu.",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: "Home — your command center",
    body: "Home shows what needs your attention, what your coding agents are doing right now, and what AI suggests you do next.",
    side: "bottom",
    align: "start",
  },
  {
    target: '[data-tour="agents-card"]',
    optional: true,
    title: "Agents at work",
    body: "Coding agents like Claude Code and Cursor connect over MCP, pick up tasks, and their progress shows here live — pulled context, running, pushed.",
    side: "left",
    align: "start",
  },
  {
    target: '[data-tour="activity-card"]',
    optional: true,
    title: "One live activity feed",
    body: "Every move — human or agent — flows into a single timeline, so nothing happens off-screen.",
    side: "left",
    align: "start",
  },
  {
    target: '[data-tour="nav-specs"]',
    title: "Specs — write together, in real time",
    body: "Specs are living documents your team co-edits with live cursors. Open one and a single click turns it into an agent-ready Breakdown — tasks with acceptance criteria. Teammates Sign off to align before work starts.",
    side: "bottom",
    align: "start",
  },
  {
    target: '[data-tour="nav-context"]',
    title: "Context — your company and product knowledge",
    body: "Add docs about your company, product, personas, and ways of working. Burrow retrieves the most relevant pieces into every Breakdown, Sign-off insight, and AI assist — so output reflects how your team actually works.",
    side: "bottom",
    align: "start",
  },
  {
    target: '[data-tour="nav-connections"]',
    title: "Connections — meet your team where they work",
    body: "Push Breakdown tasks to Jira, Confluence, or Slack over MCP. Status flows back automatically.",
    side: "bottom",
    align: "start",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Settings — bring your own AI key",
    body: "Add an Anthropic, OpenAI, Google, or local model key. Burrow hosts no models and never sees your data. Set this up once before generating a Breakdown.",
    side: "bottom",
    align: "end",
  },
  {
    title: "That's the loop ✦",
    body: "Write a Spec → AI Breakdown → Sign off → your agents ship it. Start by adding an AI key in Settings, or create your first Spec. Replay this tour anytime from your account menu.",
  },
];

export function startTour() {
  // Drop steps whose optional target isn't on screen (empty-org Home).
  const steps = STEPS.filter(
    (s) => !s.target || !s.optional || document.querySelector(s.target),
  ).map((s) => ({
    element: s.target,
    popover: {
      title: s.title,
      description: s.body,
      side: s.side,
      align: s.align,
    },
  }));

  const d = driver({
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps,
    onDestroyed: () => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode — tour simply re-offers next time */
      }
    },
  });
  d.drive();
}

// Auto-start once, on first authed landing. Persisted per browser; the account
// menu's "Take a tour" replays it anytime.
export function useTourAutostart(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    const t = setTimeout(startTour, 700); // let the dashboard paint first
    return () => clearTimeout(t);
  }, [ready]);
}
