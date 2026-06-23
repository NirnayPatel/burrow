"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { api, type Spec } from "../lib/api";
import { openPalette } from "../lib/command-bus";
import styles from "./shortcuts.module.css";

// Linear-grade keyboard mechanics (UX review #4). A single global handler plus a
// `?` cheat sheet. Mounted once next to the nav, so shortcuts work app-wide.
// Crucial guard: never hijack a key the user is typing into a field or the Spec
// editor — we bail whenever focus is in an input/textarea/contenteditable.

const SHEET = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["/"], label: "Search" },
  { keys: ["C"], label: "New spec" },
  { keys: ["G", "then", "H"], label: "Go to Home" },
  { keys: ["G", "then", "S"], label: "Go to Specs" },
  { keys: ["G", "then", "R"], label: "Go to Roadmap" },
  { keys: ["G", "then", "G"], label: "Go to Goals" },
  { keys: ["G", "then", "F"], label: "Go to Feedback" },
  { keys: ["G", "then", "M"], label: "Go to Market" },
  { keys: ["G", "then", "T"], label: "Go to Teams" },
  { keys: ["?"], label: "This cheat sheet" },
  { keys: ["Esc"], label: "Close / dismiss" },
];

// `g` then <key> → route. Linear's two-stroke jump.
const GO_TO: Record<string, string> = {
  h: "/dashboard",
  s: "/specs",
  r: "/roadmap",
  g: "/goals",
  f: "/feedback",
  m: "/market",
  t: "/teams",
  c: "/context",
};

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function Shortcuts() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let goArmed = false;
    let goTimer: ReturnType<typeof setTimeout> | undefined;

    async function newSpec() {
      try {
        const spec = await api<Spec>("/api/specs", { method: "POST", body: JSON.stringify({ title: "Untitled spec" }) });
        router.push(`/specs/${spec.id}`);
      } catch {
        router.push("/specs");
      }
    }

    function onKey(e: KeyboardEvent) {
      // ⌘K / Ctrl-K opens the palette even while typing (it's the universal
      // escape hatch). Everything else bails inside text fields.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping()) return;

      // Second stroke of a `g _` jump.
      if (goArmed) {
        goArmed = false;
        clearTimeout(goTimer);
        const dest = GO_TO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        goArmed = true;
        goTimer = setTimeout(() => (goArmed = false), 1200); // arm window
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        openPalette();
      } else if (e.key === "c") {
        e.preventDefault();
        newSpec();
      } else if (e.key === "?") {
        e.preventDefault();
        setSheetOpen((v) => !v);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(goTimer);
    };
  }, [router]);

  return (
    <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.sheet} aria-label="Keyboard shortcuts">
          <Dialog.Title className={styles.title}>Keyboard shortcuts</Dialog.Title>
          <ul className={styles.list}>
            {SHEET.map((s) => (
              <li key={s.label} className={styles.item}>
                <span className={styles.label}>{s.label}</span>
                <span className={styles.keys}>
                  {s.keys.map((k, i) =>
                    k === "then" ? (
                      <span key={i} className={styles.then}>then</span>
                    ) : (
                      <kbd key={i} className={styles.kbd}>{k}</kbd>
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
