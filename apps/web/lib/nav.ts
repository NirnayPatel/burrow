// The single source of truth for the app's navigation, grouped by intent
// (UX review #2 — Notion-style IA). The sidebar renders these groups; the
// command palette flattens them into "Go to …" commands. Keep them in sync by
// importing from here, never re-listing routes.

export type NavItem = { href: string; label: string; tour: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Home", tour: "nav-dashboard" },
      { href: "/chat", label: "Chat", tour: "nav-chat" },
      { href: "/specs", label: "Specs", tour: "nav-specs" },
      { href: "/roadmap", label: "Roadmap", tour: "nav-roadmap" },
      { href: "/goals", label: "Goals", tour: "nav-goals" },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/feedback", label: "Feedback", tour: "nav-feedback" },
      { href: "/market", label: "Market", tour: "nav-market" },
      { href: "/context", label: "Context", tour: "nav-context" },
    ],
  },
  {
    label: "Org",
    items: [
      { href: "/teams", label: "Teams", tour: "nav-teams" },
      { href: "/connections", label: "Connections", tour: "nav-connections" },
      { href: "/automations", label: "Automations", tour: "nav-automations" },
      { href: "/library", label: "Library", tour: "nav-library" },
      { href: "/settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];
