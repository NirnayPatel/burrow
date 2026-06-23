"use client";

// A tiny window-event bus so anything (the sidebar search button, a keyboard
// shortcut, an "Ask AI" entry) can open the command palette without threading a
// React context through the whole tree. The palette mounts once and listens.

export const PALETTE_EVENT = "burrow:palette";

export type PaletteOpenDetail = { query?: string };

export function openPalette(detail: PaletteOpenDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail }));
}
