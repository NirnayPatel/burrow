import { specs } from "@burrow/core";
import { db } from "./db.js";

// D3 first-run: a fresh org lands on a non-empty Specs list with one Spec ready
// to open — demonstrating the flow and the multiplayer hook ("open it in two
// windows") in minute one. We intentionally do NOT pre-populate the editor
// body: BlockNote's collaborative editor hydrates the Yjs doc itself on first
// open, and pre-seeding raw XML races that init unreliably. The Spec opens as a
// clean, editable document — the same path a normal `New spec` takes (no ydocs
// row until the first edit persists one).
export async function seedFirstSpec(orgId: string, userId: string): Promise<void> {
  await db.insert(specs).values({
    orgId,
    title: "Your first Spec",
    displayId: "SPEC-1",
    ydocId: crypto.randomUUID(),
    createdBy: userId,
  });
}
