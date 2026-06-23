"use client";

import { useEffect, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

// Applies the theme by setting (or clearing) data-theme. "system" clears the
// attribute so tokens.css falls back to prefers-color-scheme. Persisted to
// localStorage; the no-FOUC script in layout.tsx reads the same key pre-paint.
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  localStorage.setItem("burrow-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme((localStorage.getItem("burrow-theme") as Theme) ?? "system");
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
  }

  return (
    <button
      className={styles.toggle}
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to change)`}
      aria-label={`Theme: ${LABEL[theme]}`}
    >
      {theme === "dark" ? "◐" : theme === "light" ? "○" : "◑"} {LABEL[theme]}
    </button>
  );
}
