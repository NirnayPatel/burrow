# Spike 0 notes — BlockNote + Hocuspocus + Postgres (2026-06-12)

**Verdict: PASS on both gating claims.** Stack committed: BlockNote + Yjs + Hocuspocus v3.2 + Postgres persistence.

## What was verified (headless, `apps/collab/src/spike-verify.ts`)

| Claim | Result | Evidence |
|---|---|---|
| Two clients converge on one doc | PASS | Both clients see identical 2-entry array after concurrent writes |
| Doc survives collab-server restart | PASS | Fresh client reloads full content from Postgres after kill/restart |
| Persistence shape | OK | `Database` extension stores the encoded Yjs state per doc (104 bytes for the test doc); store() is debounced (~2s default) |
| Schema v0 | OK | `drizzle-kit push` creates all 13 tables incl. `ydocs` |
| Web build | OK | `next build` clean; editor route 425 kB first-load JS |

## Gotchas found (encode these in milestone 1)

1. **Hocuspocus provider does NOT auto-connect when you pass an explicit `websocketProvider`** — you must call `attach()`. Passing `url` directly makes the provider manage its own socket. The web client already does the latter; keep it that way.
2. **pnpm blocks postinstall scripts by default** — `embedded-postgres` needs its `hydrate-symlinks` postinstall (dylib symlinks) or initdb aborts. Fixed via `onlyBuiltDependencies` in `pnpm-workspace.yaml`. Same applies to any future native dep.
3. `embedded-postgres@18.x` betas ship broken darwin-arm64 dylibs; pinned `17.5.0-beta.15` (PostgreSQL 17.5). Used on :5433 for spike/CI; Docker compose remains the real dev/self-host path.
4. Hocuspocus `store()` debounce means "typed then killed within ~2s" can lose the tail — fine for spike; milestone 1 should configure debounce + `onStoreDocument` flush on graceful shutdown.

## Still open (measure during milestone 1, before data model freeze)

- Update-log growth + snapshot/compaction strategy under sustained editing (current extension stores full state each flush — fine at spec sizes, measure at 100+ KB docs).
- `onAuthenticate` hook wiring to API-server sessions (collab is currently unauthenticated — spike only).
- Browser-level QA of live cursors with 2+ real sessions (headless verified transport + persistence; do a 2-window dogfood when auth lands).
