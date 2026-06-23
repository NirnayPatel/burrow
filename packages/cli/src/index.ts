#!/usr/bin/env node
import { Command } from "commander";
import yaml from "js-yaml";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";

// The burrow CLI (#19): materializes the org's Specs, Breakdowns, and Context
// into a local ./.burrow/ tree of markdown with a PUBLISHED frontmatter spec —
// the read path coding agents consume (MCP is the write path). No telemetry.

const FRONTMATTER_VERSION = "1";
const CRED_PATH = join(homedir(), ".burrow", "credentials.json");

type Cred = { serverUrl: string; token: string; orgId?: string };

function loadCred(): Cred | null {
  if (!existsSync(CRED_PATH)) return null;
  return JSON.parse(readFileSync(CRED_PATH, "utf8"));
}
function saveCred(cred: Cred): void {
  mkdirSync(join(homedir(), ".burrow"), { recursive: true });
  writeFileSync(CRED_PATH, JSON.stringify(cred, null, 2), { mode: 0o600 });
}

async function api<T>(cred: Cred, path: string): Promise<T> {
  const res = await fetch(`${cred.serverUrl}${path}`, {
    headers: { authorization: `Bearer ${cred.token}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// Write-path fetch (PUT/PATCH/DELETE). Unlike `api`, this hands back the parsed
// body even on a non-2xx so callers can act on the structured 409 conflict
// payload ({ error, serverHash, serverRevision }) and the 403 admin-gate — the
// two failures the sharing flow must surface clearly rather than swallow.
async function apiWrite<T>(
  cred: Cred,
  method: "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${cred.serverUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cred.token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

function frontmatter(obj: Record<string, unknown>, body: string): string {
  return `---\n${yaml.dump(obj).trim()}\n---\n\n${body}\n`;
}

// Inverse of `frontmatter`: split a `.burrow/` file into its YAML frontmatter
// and markdown body. The body is what follows the closing `---`; we trim a
// single trailing newline since `frontmatter` always appends one.
function parseFile(raw: string): { fm: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw.trim() };
  const fm = (yaml.load(m[1]) as Record<string, unknown>) ?? {};
  return { fm, body: m[2].replace(/^\n+/, "").replace(/\n+$/, "") };
}

const program = new Command();
program.name("burrow").description("Burrow CLI — sync Specs, Breakdowns, and Context to .burrow/").version("0.1.0");

// ---------- auth ----------
const auth = program.command("auth").description("Authenticate with a Burrow server");

auth
  .command("login")
  .option("--token <token>", "session token (headless / CI)")
  .option("--server <url>", "Burrow server URL", "http://localhost:8787")
  .description("Log in (device-code flow, or --token for headless)")
  .action(async (opts: { token?: string; server: string }) => {
    if (opts.token) {
      saveCred({ serverUrl: opts.server, token: opts.token });
      console.log("Saved credential. You're logged in.");
      return;
    }
    // device-code flow
    const start = await (await fetch(`${opts.server}/api/cli/device`, { method: "POST" })).json();
    console.log(`\nOpen this URL in your browser to authorize:\n  ${start.verificationUri}\n`);
    console.log(`Code: ${start.userCode}\nWaiting for authorization…`);
    const deadline = Date.now() + start.expiresIn * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, start.interval * 1000));
      const res = await fetch(`${opts.server}/api/cli/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: start.deviceCode }),
      });
      if (res.status === 202) continue;
      if (!res.ok) {
        console.error("Authorization failed or expired.");
        process.exit(1);
      }
      const { token, orgId } = await res.json();
      saveCred({ serverUrl: opts.server, token, orgId });
      console.log("Authorized. You're logged in.");
      return;
    }
    console.error("Timed out waiting for authorization.");
    process.exit(1);
  });

auth
  .command("status")
  .description("Show current identity")
  .action(async () => {
    const cred = loadCred();
    if (!cred) return console.log("Not logged in. Run: burrow auth login");
    const me = await api<{ user?: { name: string; email: string }; orgId: string }>(cred, "/api/me");
    console.log(`Server: ${cred.serverUrl}\nUser:   ${me.user?.email ?? "?"}\nOrg:    ${me.orgId}`);
  });

// ---------- sync ----------
type Spec = { id: string; displayId: string; title: string; status: string; teamId: string | null };
type Task = { displayId: string; title: string; status: string; description: string | null; acceptanceCriteria: string[] | null };

async function syncOnce(cred: Cred, root: string): Promise<{ specs: number; context: number; shared: number }> {
  const specsDir = join(root, ".burrow", "specs");
  const ctxDir = join(root, ".burrow", "context");
  mkdirSync(specsDir, { recursive: true });
  mkdirSync(ctxDir, { recursive: true });

  const state: Record<string, string> = {};
  const specs = await api<Spec[]>(cred, "/api/specs");
  for (const s of specs) {
    const detail = await api<Spec & { /* extra */ }>(cred, `/api/specs/${s.id}`);
    const bk = await api<{ tasks: Task[] }>(cred, `/api/specs/${s.id}/breakdown`).catch(() => ({ tasks: [] }));
    const tasksMd = bk.tasks.length
      ? "\n\n## Breakdown\n\n" +
        bk.tasks
          .map(
            (t) =>
              `- [${t.status === "done" ? "x" : " "}] **${t.displayId}** ${t.title}` +
              (t.acceptanceCriteria?.length ? "\n  - " + t.acceptanceCriteria.join("\n  - ") : ""),
          )
          .join("\n")
      : "";
    const fm = {
      burrow_version: FRONTMATTER_VERSION,
      display_id: s.displayId,
      spec_id: s.id,
      title: s.title,
      status: s.status,
      team_id: s.teamId ?? null,
      generated_at: new Date().toISOString(),
    };
    const file = join(specsDir, `${s.displayId}.md`);
    writeToFileWithConflict(file, frontmatter(fm, `# ${s.title}${tasksMd}`), state);
  }

  const ctx = await api<{ id: string; title: string; kind: string }[]>(cred, "/api/context");
  for (const d of ctx) {
    const full = await api<{ title: string; kind: string; bodyText: string }>(cred, `/api/context/${d.id}`);
    const file = join(ctxDir, `${slug(d.title)}.md`);
    writeToFileWithConflict(file, frontmatter({ burrow_version: FRONTMATTER_VERSION, kind: full.kind, title: full.title }, full.bodyText), state);
  }

  writeFileSync(join(root, ".burrow", ".state.json"), JSON.stringify(state, null, 2));

  // Also populate the authored subtrees (skills/agents/routines) so a fresh
  // clone is fully usable. This is the read side only — authoring still goes
  // through explicit `burrow <kind> push`. Don't fail the whole sync if a kind's
  // endpoint is unavailable (e.g. older server).
  let shared = 0;
  for (const cfg of Object.values(KINDS)) {
    shared += await pullKind(cred, root, cfg).catch(() => 0);
  }

  ensureGitignore(root);
  return { specs: specs.length, context: ctx.length, shared };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

// Conflict handling: if the local file changed since we wrote it, don't clobber.
function writeToFileWithConflict(file: string, content: string, state: Record<string, string>): void {
  const hash = createHash("sha256").update(content).digest("hex");
  if (existsSync(file)) {
    const localHash = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
    // unchanged-vs-remote → skip; locally edited → keep local, warn (v1 default = Keep)
    if (localHash !== hash) {
      const prev = state[file];
      if (prev && prev !== localHash) {
        console.warn(`  ! ${file} was edited locally — keeping your version (use --force to overwrite)`);
        state[file] = localHash;
        return;
      }
    }
  }
  writeFileSync(file, content);
  state[file] = hash;
}

// The gitignore zone split (24-PLATFORM-SHARING §2). `.burrow/` used to be
// ignored wholesale (#19) because everything in it was server-materialized and
// ephemeral. Sharing flips that: skills/, agents/, routines/ are *authored*
// files and MUST be committed, while specs/, context/, goals/ stay ignored.
//
// We manage a `.burrow/.gitignore` so the policy travels inside the tree and is
// self-documenting — ignore the materialized zones, track everything else
// (which is exactly the three authored subtrees). We also migrate any legacy
// bare `.burrow/` line in the repo's root .gitignore, which would otherwise
// shadow the authored subtrees and keep them untracked.
const MATERIALIZED_ZONES = ["specs/", "context/", "goals/"];
const BURROW_GITIGNORE = [
  "# Managed by burrow CLI (24-PLATFORM-SHARING §2).",
  "# Server-materialized zones are ephemeral — ignored.",
  "# skills/, agents/, routines/ are authored files — committed (not listed here).",
  ...MATERIALIZED_ZONES,
  ".state.json",
  "",
].join("\n");

function ensureGitignore(root: string): void {
  // Scoped ignore inside the tree: keep authored subtrees committed.
  writeFileSync(join(root, ".burrow", ".gitignore"), BURROW_GITIGNORE);

  // Migrate a legacy wholesale `.burrow/` ignore so it doesn't shadow the
  // authored subtrees. Replace the bare line with the materialized zones only.
  const gi = join(root, ".gitignore");
  if (existsSync(gi)) {
    const lines = readFileSync(gi, "utf8").split("\n");
    const legacy = lines.findIndex((l) => l.trim() === ".burrow/" || l.trim() === ".burrow");
    if (legacy !== -1) {
      lines.splice(legacy, 1, ...MATERIALIZED_ZONES.map((z) => `.burrow/${z}`));
      writeFileSync(gi, lines.join("\n"));
      console.log("Narrowed .burrow/ in .gitignore — skills/agents/routines are now tracked by git.");
    }
  }
}

program
  .command("sync")
  .option("--watch", "re-sync on a poll interval")
  .option("--force", "re-materialize everything")
  .description("Pull Specs, Breakdowns, and Context into ./.burrow/")
  .action(async (opts: { watch?: boolean; force?: boolean }) => {
    const cred = loadCred();
    if (!cred) return console.error("Not logged in. Run: burrow auth login");
    const root = process.cwd();
    const run = async () => {
      const r = await syncOnce(cred, root);
      console.log(`Synced ${r.specs} specs, ${r.context} context docs, and ${r.shared} skills/agents/routines to .burrow/`);
    };
    await run();
    if (opts.watch) {
      console.log("Watching for changes (Ctrl-C to stop)…");
      setInterval(run, 30_000);
    }
  });

// ---------- shareable: skills · agents · routines (24-PLATFORM-SHARING) ----------
// These three are *authored as files* and pushed up — the inverse of the
// materialized specs/context zones. One generic flow drives all three; only the
// paths, the frontmatter fields, and where the body comes from differ, so each
// kind is a small config and the pull/push/list engine is shared (DRY).

// A server row is a DB record (camelCase). We only read fields the flow needs;
// each kind's `toFile` knows the rest. Common to all three: slug + the conflict
// primitives (sourceHash/revision).
type ShareRow = {
  slug: string;
  name: string;
  sourceHash: string;
  revision: number;
  published: boolean;
  updatedAt?: string;
  updatedBy?: string;
  [k: string]: unknown;
};

// The PUT response can also carry droppedTools (skills/agents) when the server
// clamped a tool_allowlist entry to a tool that doesn't exist on the MCP bridge.
type PushResult = ShareRow & { droppedTools?: string[] };

type KindConfig = {
  kind: string; // singular noun: "skill" | "agent" | "routine"
  dir: string; // subtree under .burrow/
  listPath: string;
  getPath: (slug: string) => string;
  putPath: (slug: string) => string;
  // server row → the file we write: snake_case frontmatter (spec §2) + body.
  toFile: (row: ShareRow) => { fm: Record<string, unknown>; body: string };
  // parsed file → the PUT request body (camelCase server fields). baseHash is
  // added by the engine, not here.
  toPutBody: (fm: Record<string, unknown>, body: string) => Record<string, unknown>;
};

// Frontmatter fields shared by every kind (spec §2 "Common frontmatter
// contract"). The conflict + provenance fields come straight off the row.
function commonFm(kind: string, row: ShareRow): Record<string, unknown> {
  return {
    burrow_version: FRONTMATTER_VERSION,
    burrow_kind: kind,
    id: row.id ?? null,
    slug: row.slug,
    name: row.name,
    published: row.published,
    source_hash: row.sourceHash,
    revision: row.revision,
    ...(row.importedFrom ? { imported_from: row.importedFrom } : {}),
    updated_by: row.updatedBy ?? row.createdBy ?? null,
    updated_at: row.updatedAt ?? null,
  };
}

const KINDS: Record<string, KindConfig> = {
  skill: {
    kind: "skill",
    dir: "skills",
    listPath: "/api/skills",
    getPath: (s) => `/api/skills/${s}`,
    putPath: (s) => `/api/skills/${s}`,
    toFile: (row) => ({
      fm: {
        ...commonFm("skill", row),
        description: row.description ?? null,
        params: row.params ?? [],
        tool_allowlist: row.toolAllowlist ?? [],
      },
      body: String(row.body ?? ""), // body = the prompt template
    }),
    toPutBody: (fm, body) => ({
      name: fm.name,
      description: fm.description ?? null,
      body, // the prompt template lives in the markdown body
      params: fm.params ?? [],
      toolAllowlist: fm.tool_allowlist ?? [],
      published: fm.published ?? false,
      importedFrom: fm.imported_from,
    }),
  },
  agent: {
    kind: "agent",
    dir: "agents",
    listPath: "/api/agents",
    getPath: (s) => `/api/agents/${s}`,
    putPath: (s) => `/api/agents/${s}`,
    toFile: (row) => ({
      fm: {
        ...commonFm("agent", row),
        role: row.role ?? null,
        model: row.model ?? null,
        model_fallback: row.modelFallback ?? "default",
        skills: row.skillSlugs ?? [],
        permissions: {
          tool_allowlist: row.toolAllowlist ?? [],
          write_scope: row.writeScope ?? "none",
        },
      },
      body: String(row.role ?? ""), // body = the human-readable doc (role prose)
    }),
    toPutBody: (fm, body) => {
      const perms = (fm.permissions as Record<string, unknown>) ?? {};
      return {
        name: fm.name,
        // The body is the human doc; `role` (the short persona line) stays in
        // frontmatter. Fall back to the body if no frontmatter role is set.
        role: fm.role ?? body ?? null,
        model: fm.model ?? null,
        modelFallback: fm.model_fallback ?? "default",
        skillSlugs: fm.skills ?? [],
        toolAllowlist: perms.tool_allowlist ?? [],
        writeScope: perms.write_scope ?? "none",
        published: fm.published ?? false,
        importedFrom: fm.imported_from,
      };
    },
  },
  routine: {
    kind: "routine",
    dir: "routines",
    listPath: "/api/routines",
    getPath: (s) => `/api/routines/by-slug/${s}`,
    putPath: (s) => `/api/routines/by-slug/${s}`,
    toFile: (row) => ({
      fm: {
        ...commonFm("routine", row),
        enabled: row.enabled ?? true,
        trigger_type: row.triggerType ?? "event",
        event_kind: row.eventKind ?? null,
        schedule: row.schedule ?? null,
        condition_field: row.conditionField ?? null,
        condition_equals: row.conditionEquals ?? null,
        actions: row.actions ?? [],
      },
      // Routines have no prose — the executable definition is the frontmatter.
      // Body is docs only; default to the name as a heading.
      body: `# ${row.name}`,
    }),
    toPutBody: (fm) => ({
      name: fm.name,
      enabled: fm.enabled ?? true,
      published: fm.published ?? true,
      triggerType: fm.trigger_type ?? "event",
      eventKind: fm.event_kind ?? null,
      schedule: fm.schedule ?? null,
      conditionField: fm.condition_field ?? null,
      conditionEquals: fm.condition_equals ?? null,
      actions: fm.actions ?? [],
      importedFrom: fm.imported_from,
    }),
  },
};

// Write a server row to its `.burrow/<dir>/<slug>.md` file. Returns the path.
function writeShareFile(root: string, cfg: KindConfig, row: ShareRow): string {
  const dir = join(root, ".burrow", cfg.dir);
  mkdirSync(dir, { recursive: true });
  const { fm, body } = cfg.toFile(row);
  const file = join(dir, `${row.slug}.md`);
  writeFileSync(file, frontmatter(fm, body));
  return file;
}

// Pull one or all of a kind into `.burrow/<dir>/`. No-slug = all.
async function pullKind(cred: Cred, root: string, cfg: KindConfig, slug?: string): Promise<number> {
  const rows: ShareRow[] = slug
    ? [await api<ShareRow>(cred, cfg.getPath(slug))]
    : await api<ShareRow[]>(cred, cfg.listPath);
  for (const row of rows) {
    writeShareFile(root, cfg, row);
    console.log(`  ↓ ${cfg.dir}/${row.slug}.md  (rev ${row.revision})`);
  }
  return rows.length;
}

// Push one or all local files of a kind. Honors the source_hash conflict
// contract: send baseHash = the file's current source_hash; on 409, refuse to
// overwrite, print the conflict, and signal the caller to abort nonzero.
async function pushKind(
  cred: Cred,
  root: string,
  cfg: KindConfig,
  slug?: string,
): Promise<{ pushed: number; conflicts: number }> {
  const dir = join(root, ".burrow", cfg.dir);
  const slugs = slug
    ? [slug]
    : existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, ""))
      : [];
  if (slug && !existsSync(join(dir, `${slug}.md`))) {
    console.error(`No local ${cfg.kind} file: .burrow/${cfg.dir}/${slug}.md`);
    return { pushed: 0, conflicts: 0 };
  }

  let pushed = 0;
  let conflicts = 0;
  for (const s of slugs) {
    const file = join(dir, `${s}.md`);
    const { fm, body } = parseFile(readFileSync(file, "utf8"));
    // baseHash = what the file was last pulled/pushed at. Absent on a brand-new
    // local file → the server treats it as a create (revision 1).
    const baseHash = (fm.source_hash as string | undefined) ?? "";
    const reqBody = { ...cfg.toPutBody(fm, body), baseHash };
    const { status, data } = await apiWrite<PushResult & { error?: string; serverHash?: string; serverRevision?: number }>(
      cred,
      "PUT",
      cfg.putPath(s),
      reqBody,
    );

    if (status === 403) {
      console.error(`  ✗ ${cfg.dir}/${s}.md — forbidden: pushing requires an admin token.`);
      conflicts++;
      continue;
    }
    if (status === 409) {
      // The conflict path. Do NOT overwrite the local file. The server moved on
      // since we pulled — the user must pull and reconcile (git is the merge).
      console.error(`  ✗ conflict: ${cfg.dir}/${s}.md — server moved to revision ${data.serverRevision}, pull first.`);
      console.error(`      local source_hash:  ${baseHash.slice(0, 12)}…`);
      console.error(`      server source_hash: ${(data.serverHash ?? "").slice(0, 12)}…`);
      console.error(`      run: burrow ${cfg.kind} pull ${s}   (then re-apply your edits — git diff shows them)`);
      conflicts++;
      continue;
    }
    if (status >= 400) {
      console.error(`  ✗ ${cfg.dir}/${s}.md — ${data.error ?? status}`);
      conflicts++;
      continue;
    }

    // Success: rewrite the local file's frontmatter with the server's
    // authoritative source_hash + revision so the next push has the right base.
    writeShareFile(root, cfg, data);
    if (data.droppedTools?.length) {
      console.warn(`  ⚠ ${s}: dropped unknown tools — ${data.droppedTools.join(", ")}`);
    }
    console.log(`  ↑ ${cfg.dir}/${s}.md  (rev ${data.revision})`);
    pushed++;
  }
  return { pushed, conflicts };
}

// list: local files ⨯ remote rows with drift markers (spec conflict contract).
async function listKind(cred: Cred, root: string, cfg: KindConfig): Promise<void> {
  const dir = join(root, ".burrow", cfg.dir);
  const local = new Map<string, { hash: string; revision: number }>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const { fm } = parseFile(readFileSync(join(dir, f), "utf8"));
      local.set(f.replace(/\.md$/, ""), {
        hash: (fm.source_hash as string) ?? "",
        revision: Number(fm.revision ?? 0),
      });
    }
  }
  const remote = new Map<string, ShareRow>();
  for (const r of await api<ShareRow[]>(cred, cfg.listPath)) remote.set(r.slug, r);

  const slugs = [...new Set([...local.keys(), ...remote.keys()])].sort();
  if (!slugs.length) {
    console.log(`No ${cfg.kind}s locally or on the server.`);
    return;
  }
  for (const s of slugs) {
    const l = local.get(s);
    const r = remote.get(s);
    let marker: string;
    if (l && !r) marker = "✎ local-only";
    else if (!l && r) marker = "↓ behind"; // exists remotely, never pulled
    else if (l && r && l.hash === r.sourceHash) marker = "= in sync";
    else if (l && r && r.revision > l.revision) marker = "↓ behind"; // remote ahead
    else marker = "↑ ahead"; // local edited past the pulled hash
    console.log(`  ${marker.padEnd(13)} ${s}`);
  }
}

// Resolve the three kinds to a noun-verb command trio each. They share the
// engine above; only the config differs.
for (const cfg of Object.values(KINDS)) {
  const cmd = program.command(cfg.kind).description(`Manage shareable ${cfg.kind}s as version-controlled .burrow/${cfg.dir}/ files`);

  cmd
    .command("pull [slug]")
    .description(`Fetch ${cfg.kind}(s) from the server into .burrow/${cfg.dir}/`)
    .action(async (slug?: string) => {
      const cred = loadCred();
      if (!cred) return console.error("Not logged in. Run: burrow auth login");
      const root = process.cwd();
      const n = await pullKind(cred, root, cfg, slug);
      ensureGitignore(root); // keep the authored subtrees tracked
      console.log(`Pulled ${n} ${cfg.kind}${n === 1 ? "" : "s"}.`);
    });

  cmd
    .command("push [slug]")
    .description(`Push local ${cfg.kind} file(s) to the server (409 → abort, pull first)`)
    .action(async (slug?: string) => {
      const cred = loadCred();
      if (!cred) return console.error("Not logged in. Run: burrow auth login");
      const { pushed, conflicts } = await pushKind(cred, process.cwd(), cfg, slug);
      console.log(`Pushed ${pushed} ${cfg.kind}${pushed === 1 ? "" : "s"}.`);
      if (conflicts > 0) {
        console.error(`${conflicts} file(s) not pushed — resolve and retry.`);
        process.exit(1); // nonzero so CI / scripts halt on an unreconciled conflict
      }
    });

  cmd
    .command("list")
    .description(`List local + remote ${cfg.kind}s with drift markers`)
    .action(async () => {
      const cred = loadCred();
      if (!cred) return console.error("Not logged in. Run: burrow auth login");
      await listKind(cred, process.cwd(), cfg);
    });
}

program
  .command("status")
  .description("Summarize what's synced")
  .action(async () => {
    const cred = loadCred();
    if (!cred) return console.error("Not logged in. Run: burrow auth login");
    const specs = await api<Spec[]>(cred, "/api/specs");
    const byStatus: Record<string, number> = {};
    for (const s of specs) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    console.log(`Specs: ${specs.length}`);
    for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k.replace("_", " ")}: ${v}`);
  });

program.parseAsync();
