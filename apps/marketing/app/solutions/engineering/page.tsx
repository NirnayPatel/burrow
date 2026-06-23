import type { Metadata } from "next";
import { PersonaPage } from "../PersonaPage";
import { ENGINEERING } from "../personas";

export const metadata: Metadata = {
  title: "Burrow for Engineering Teams — Specs your agents can actually build from",
  description:
    "Any MCP agent pulls the full, dependency-aware spec over Burrow's bridge — not a snippet — and pushes status back. Works with Claude Code, Cursor, and your own keys and infrastructure.",
};

export default function EngineeringPage() {
  return <PersonaPage content={ENGINEERING} />;
}

