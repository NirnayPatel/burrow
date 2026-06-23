import type { Metadata } from "next";
import { PersonaPage } from "../PersonaPage";
import { PRODUCT_MANAGERS } from "../personas";

export const metadata: Metadata = {
  title: "Burrow for Product Managers — From scattered context to shipped strategy",
  description:
    "Keep context, specs, roadmap, feedback, and decisions in one surface. Burrow grounds every AI action in how your team actually works — and turns approved specs into agent-ready tasks.",
};

export default function ProductManagersPage() {
  return <PersonaPage content={PRODUCT_MANAGERS} />;
}

