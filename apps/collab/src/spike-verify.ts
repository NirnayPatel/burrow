/**
 * Spike verification (milestone 0): proves the two claims that gate the data model.
 *   1. Two clients converge on one doc through Hocuspocus (multiplayer).
 *   2. The doc survives a collab-server restart (Postgres persistence).
 * Run: postgres up + collab server up, then `pnpm tsx src/spike-verify.ts verify 1`,
 * restart the collab server, then `pnpm tsx src/spike-verify.ts verify 2`.
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import WebSocket from "ws";

const url = process.env.COLLAB_URL ?? "ws://localhost:8788";
const docName = `spike:${process.argv[2] ?? "verify"}`;
const phase = process.argv[3] ?? "1";

function connect(label: string): Promise<{ provider: HocuspocusProvider; doc: Y.Doc }> {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    // Pass url (not an explicit websocketProvider) so the provider manages and
    // auto-attaches its own socket — explicit sockets require manual attach().
    const provider = new HocuspocusProvider({
      url,
      name: docName,
      document: doc,
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      onSynced: () => resolve({ provider, doc }),
    } as ConstructorParameters<typeof HocuspocusProvider>[0]);
    setTimeout(() => reject(new Error(`${label}: no sync within 10s`)), 10_000);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (phase === "1") {
  const a = await connect("clientA");
  const b = await connect("clientB");

  a.doc.getArray("spike").push([`from-A @ ${new Date().toISOString()}`]);
  b.doc.getArray("spike").push([`from-B @ ${new Date().toISOString()}`]);
  await sleep(1500);

  const seenByA = a.doc.getArray("spike").toArray();
  const seenByB = b.doc.getArray("spike").toArray();
  const converged =
    seenByA.length >= 2 && JSON.stringify(seenByA) === JSON.stringify(seenByB);

  console.log(`multiplayer convergence: ${converged ? "PASS" : "FAIL"}`);
  console.log(`  clientA sees: ${JSON.stringify(seenByA)}`);
  console.log(`  clientB sees: ${JSON.stringify(seenByB)}`);
  // Hocuspocus debounces store() — wait before declaring the doc persisted
  await sleep(4000);
  a.provider.destroy();
  b.provider.destroy();
  console.log("phase 1 done. Restart the collab server, then run phase 2.");
  process.exit(converged ? 0 : 1);
} else {
  const c = await connect("clientC");
  await sleep(500);
  const items = c.doc.getArray("spike").toArray();
  const persisted = items.length >= 2;
  console.log(`persistence across restart: ${persisted ? "PASS" : "FAIL"}`);
  console.log(`  reloaded doc contains: ${JSON.stringify(items)}`);
  c.provider.destroy();
  process.exit(persisted ? 0 : 1);
}
