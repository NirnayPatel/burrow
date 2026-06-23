import type { Metadata } from "next";
import { PersonaPage } from "../PersonaPage";
import { PRODUCT_OPS } from "../personas";

export const metadata: Metadata = {
  title: "Burrow for Product Ops — One system of record for how product gets built",
  description:
    "Standardize specs, breakdowns, and sign-offs across squads, publish your best process to a shared Library, and get a live activity feed across every team — no more status pings.",
};

export default function ProductOpsPage() {
  return <PersonaPage content={PRODUCT_OPS} />;
}

