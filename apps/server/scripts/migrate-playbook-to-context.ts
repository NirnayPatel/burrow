/**
 * One-time data migration: playbook_docs → context_docs. Idempotent (skips docs
 * already migrated by title+org). Run after db:push adds the Context tables.
 *   tsx scripts/migrate-playbook-to-context.ts
 */
import { eq, and } from "drizzle-orm";
import { playbookDocs, contextDocs } from "@burrow/core";
import { db } from "../src/db.js";

async function main() {
  const old = await db.select().from(playbookDocs);
  let migrated = 0;
  for (const p of old) {
    const existing = await db
      .select()
      .from(contextDocs)
      .where(and(eq(contextDocs.orgId, p.orgId), eq(contextDocs.title, p.title)));
    if (existing.length) continue;
    await db.insert(contextDocs).values({
      orgId: p.orgId,
      title: p.title,
      kind: "other",
      source: "text",
      bodyText: p.markdown,
      embedded: false,
    });
    migrated += 1;
  }
  console.log(`Migrated ${migrated} of ${old.length} playbook docs to Context.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
