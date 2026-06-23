import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ydocs } from "@burrow/core";
import { db } from "./db.js";

// A sign-off is cast against a specific version of the spec prose. We hash the
// persisted Yjs state so the timeline can group verdicts by doc version and
// show "approved an older version" when the doc has changed since.
export async function currentSpecVersion(ydocId: string): Promise<string> {
  const [row] = await db
    .select({ state: ydocs.state })
    .from(ydocs)
    .where(eq(ydocs.name, `spec:${ydocId}`));
  if (!row) return "v0-empty";
  return createHash("sha256").update(row.state).digest("hex").slice(0, 12);
}
