import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import pg from "pg";

// Yjs WebSocket server with Postgres persistence.
// Auth: clients pass the Burrow session token (fetched from /api/collab-token);
// we validate it against the session table Better Auth maintains.

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://burrow:burrow@localhost:5433/burrow",
});

// Debounced re-index nudge to the API server (live Context Graph on prose
// edits). Coalesces a burst of stores per doc into one call after a quiet gap.
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const INTERNAL_SECRET = process.env.BURROW_INTERNAL_SECRET ?? "dev-internal-secret";
const reindexTimers = new Map<string, NodeJS.Timeout>();
function scheduleReindex(ydocId: string): void {
  clearTimeout(reindexTimers.get(ydocId));
  reindexTimers.set(
    ydocId,
    setTimeout(() => {
      reindexTimers.delete(ydocId);
      fetch(`${API_URL}/internal/reindex-spec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-burrow-internal": INTERNAL_SECRET },
        body: JSON.stringify({ ydocId }),
      }).catch((e) => console.error("[collab] reindex nudge failed:", e));
    }, 5000),
  );
}

const server = new Server({
  port: Number(process.env.COLLAB_PORT ?? 8788),
  // Flush pending store() debounces on shutdown so a graceful stop never
  // loses the last keystrokes (spike note #4)
  unloadImmediately: true,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const res = await pool.query<{ state: Buffer }>(
          "SELECT state FROM ydocs WHERE name = $1",
          [documentName],
        );
        return res.rows[0]?.state ?? null;
      },
      store: async ({ documentName, state }) => {
        await pool.query(
          `INSERT INTO ydocs (name, state, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (name) DO UPDATE SET state = $2, updated_at = now()`,
          [documentName, state],
        );
        // Keep the Context Graph live: nudge the API to re-index this Spec's
        // prose. Debounced per doc so a burst of edits coalesces into one.
        if (documentName.startsWith("spec:")) {
          scheduleReindex(documentName.slice("spec:".length));
        }
      },
    }),
  ],
  onAuthenticate: async ({ token, documentName }) => {
    if (process.env.COLLAB_ALLOW_ANON === "1") return {}; // spike/dev escape hatch
    const res = await pool.query<{ user_id: string; org_id: string }>(
      `SELECT s.user_id, uo.org_id
         FROM session s
         JOIN user_orgs uo ON uo.user_id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()
        LIMIT 1`,
      [token],
    );
    const row = res.rows[0];
    if (!row) throw new Error("invalid or expired token");
    // Doc-level authorization: spec docs must belong to the caller's org
    if (documentName.startsWith("spec:")) {
      const ydocId = documentName.slice("spec:".length);
      const spec = await pool.query(
        "SELECT 1 FROM specs WHERE ydoc_id = $1 AND org_id = $2",
        [ydocId, row.org_id],
      );
      if (spec.rowCount === 0) throw new Error("doc not in caller's org");
    }
    return { userId: row.user_id, orgId: row.org_id };
  },
});

server.listen();
console.log(`collab: hocuspocus listening on :${process.env.COLLAB_PORT ?? 8788}`);
