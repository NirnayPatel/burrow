"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { api, type Spec } from "../lib/api";
import { PALETTE_EVENT, type PaletteOpenDetail } from "../lib/command-bus";
import { NAV_GROUPS } from "../lib/nav";
import { openPalette } from "../lib/command-bus";
import styles from "./command-palette.module.css";

// Cmd-K command palette (UX review #1). One keystroke to every primary verb and
// every entity. Three kinds of item: actions (verbs), navigation (routes), and
// live search results (entities, from /api/search). Pure keyboard: ↑/↓ moves,
// Enter runs, Esc closes. Opened by ⌘K, by `/`, or by the sidebar search button
// (all via the command bus). Radix Dialog handles focus-trap + scrim.

type Item = {
  id: string;
  label: string;
  sublabel?: string;
  kind: "action" | "nav" | "result";
  run: () => void;
};

type SearchResult = { type: string; id: string; label: string; sublabel: string; href: string };

const TYPE_GLYPH: Record<string, string> = {
  spec: "▭",
  initiative: "◇",
  goal: "◎",
  team: "◐",
  feedback: "✎",
  market: "↗",
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open on bus event (⌘K / `/` / sidebar button). Reset query each open.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<PaletteOpenDetail>).detail ?? {};
      setQuery(detail.query ?? "");
      setActive(0);
      setOpen(true);
    }
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(PALETTE_EVENT, onOpen);
  }, []);

  // Debounced live search. Empty query → no results (palette shows actions+nav).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(t);
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function newSpec() {
    setOpen(false);
    try {
      const spec = await api<Spec>("/api/specs", { method: "POST", body: JSON.stringify({ title: "Untitled spec" }) });
      router.push(`/specs/${spec.id}`);
    } catch {
      router.push("/specs");
    }
  }

  // Static commands: the primary verbs + every route. Filtered by query as a
  // plain substring when no entity results dominate.
  const staticItems = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "act-new-spec", label: "New spec", sublabel: "Create", kind: "action", run: newSpec },
      { id: "act-ask-ai", label: "Ask AI", sublabel: "Open chat", kind: "action", run: () => go("/chat") },
    ];
    const nav: Item[] = NAV_GROUPS.flatMap((g) =>
      g.items.map((l) => ({
        id: `nav-${l.href}`,
        label: `Go to ${l.label}`,
        sublabel: g.label,
        kind: "nav" as const,
        run: () => go(l.href),
      })),
    );
    return [...actions, ...nav];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const filteredStatic = q
    ? staticItems.filter((it) => it.label.toLowerCase().includes(q) || (it.sublabel ?? "").toLowerCase().includes(q))
    : staticItems;
  const resultItems: Item[] = results.map((r) => ({
    id: `res-${r.type}-${r.id}`,
    label: r.label,
    sublabel: r.sublabel,
    kind: "result",
    run: () => go(r.href),
  }));

  // Entities first when searching (that's what `/` is for); else actions+nav.
  const items = q ? [...resultItems, ...filteredStatic] : filteredStatic;
  const clampedActive = Math.min(active, Math.max(0, items.length - 1));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[clampedActive]?.run();
    }
  }

  // Keep the active row in view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${clampedActive}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedActive]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.panel}
          aria-label="Command palette"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className={styles.srOnly}>Command palette</Dialog.Title>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search specs, roadmap, people — or jump to…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            aria-label="Search or run a command"
          />
          <div className={styles.list} ref={listRef} role="listbox">
            {items.length === 0 ? (
              <div className={styles.empty}>No matches. Try a spec name or a page.</div>
            ) : (
              items.map((it, i) => (
                <button
                  key={it.id}
                  data-idx={i}
                  role="option"
                  aria-selected={i === clampedActive}
                  className={`${styles.row} ${i === clampedActive ? styles.rowActive : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => it.run()}
                >
                  <span className={styles.glyph} aria-hidden="true">
                    {it.kind === "result" ? TYPE_GLYPH[it.id.split("-")[1]] ?? "•" : it.kind === "action" ? "✦" : "→"}
                  </span>
                  <span className={styles.rowLabel}>{it.label}</span>
                  {it.sublabel && <span className={styles.rowSub}>{it.sublabel}</span>}
                </button>
              ))
            )}
          </div>
          <div className={styles.footer}>
            <span><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> move</span>
            <span><kbd className={styles.kbd}>↵</kbd> open</span>
            <span><kbd className={styles.kbd}>esc</kbd> close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Re-export so the sidebar can import the opener from one place.
export { openPalette };
