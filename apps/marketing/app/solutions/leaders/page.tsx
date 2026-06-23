import type { Metadata } from "next";
import { PersonaPage } from "../PersonaPage";
import { LEADERS } from "../personas";

export const metadata: Metadata = {
  title: "Burrow for Product Leaders — See the whole org without another status meeting",
  description:
    "Roll up roadmap and OKRs across teams, keep decisions on the record, and run AI on your own context and infrastructure. Open-source, self-hostable, no hosted models, no per-seat tax.",
};

export default function LeadersPage() {
  return <PersonaPage content={LEADERS} />;
}

