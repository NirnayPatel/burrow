/**
 * Dev database: embedded PostgreSQL 17, no Docker required.
 * Data persists in <repo>/.data/pg. Run via `pnpm dev:db` at the repo root.
 */
import EmbeddedPostgres from "embedded-postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dataDir = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../../.data/pg",
);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "burrow",
  password: "burrow",
  port: Number(process.env.DEV_PG_PORT ?? 5433),
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // already initialised — fine, data dir persists across runs
}
await pg.start();
try {
  await pg.createDatabase("burrow");
} catch {
  // already exists — persistent data dir
}
console.log("dev postgres ready: postgres://burrow:burrow@localhost:5433/burrow");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
