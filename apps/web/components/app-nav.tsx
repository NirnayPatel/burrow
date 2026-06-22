"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { api, authClient } from "../lib/api";
import { NAV_GROUPS } from "../lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "./avatar";
import { presenceColor } from "../lib/presence";
import { startTour } from "./tour";
import { CommandPalette } from "./command-palette";
import { Shortcuts } from "./shortcuts";
import { openPalette } from "../lib/command-bus";
import styles from "./app-nav.module.css";

type Me = { user: { name: string; email: string } | null; role: string };

// The app's primary navigation: a grouped left sidebar (UX review #2, Notion-
// style IA — Work / Insight / Org instead of a flat 12-link bar). Rendered per
// page (as before) but it lays out as a fixed rail; it offsets page content by
// toggling a body class, so no page needs to change how it calls <AppNav />.
// It also mounts the global command palette (#1) and keyboard shortcuts (#4),
// so ⌘K, `/`, and `?` work everywhere the nav is present.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => {});
  }, []);

  // Offset content for the fixed rail. Scoped to authed pages — sign-in /
  // onboarding / marketing don't render AppNav, so they never get the class.
  useEffect(() => {
    document.body.classList.add("app-has-sidebar");
    return () => document.body.classList.remove("app-has-sidebar");
  }, []);

  const name = me?.user?.name ?? "";

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.top}>
          <Link href="/dashboard" className={styles.brand}>
            Burrow
          </Link>

          {/* Global search / command entry (#1, #3). Click or ⌘K. */}
          <button className={styles.search} onClick={() => openPalette()} aria-label="Search or run a command">
            <span className={styles.searchIcon} aria-hidden="true">⌕</span>
            <span className={styles.searchLabel}>Search…</span>
            <span className={styles.searchKbd} aria-hidden="true">⌘K</span>
          </button>
        </div>

        <nav className={styles.groups}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.items.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  data-tour={l.tour}
                  className={`${styles.link} ${pathname.startsWith(l.href) ? styles.active : ""}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <ThemeToggle />
          {name && (
            <Menu.Root>
              <Menu.Trigger className={styles.account} aria-label="Account menu">
                <Avatar name={name} color={presenceColor(name)} />
                <span className={styles.accountName}>{name}</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className={styles.menu} align="start" side="top" sideOffset={6}>
                  <div className={styles.menuHeader}>
                    <div className={styles.menuName}>{name}</div>
                    <div className={styles.menuEmail}>{me?.user?.email}</div>
                  </div>
                  <Menu.Separator className={styles.sep} />
                  <Menu.Item asChild>
                    <Link href="/settings" className={styles.item}>
                      Settings
                    </Link>
                  </Menu.Item>
                  <Menu.Item
                    className={styles.item}
                    onSelect={() => {
                      setTimeout(() => startTour(), 50);
                    }}
                  >
                    Take a tour
                  </Menu.Item>
                  <Menu.Item
                    className={styles.item}
                    onSelect={() => authClient.signOut().then(() => router.push("/signin"))}
                  >
                    Sign out
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          )}
        </div>
      </aside>

      {/* Global operability layer — present wherever the nav is. */}
      <CommandPalette />
      <Shortcuts />
    </>
  );
}
