import { createHash } from "node:crypto";
import { MCP_TOOL_NAMES } from "./mcp.js";

// Versioning + sharing helpers (24-PLATFORM-SHARING). Git is the VCS; the DB row
// is a cache of the published file. These helpers compute the conflict primitive
// (sourceHash) and enforce the security boundary (tool-allowlist clamping).

const TOOLSET = new Set<string>(MCP_TOOL_NAMES);

// A slug is the stable, human file key: lowercase, hyphenated, filename-safe.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

// Server-computed content hash. Deterministic over the meaningful fields only
// (never over revision/updatedAt/hash itself) so re-pushing identical content is
// a no-op. The CLI stores whatever hash the server returns and sends it back on
// the next push — the server compares to detect a conflicting concurrent edit.
export function contentHash(fields: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(fields)).digest("hex");
}

// Stable JSON: keys sorted, so field order never changes the hash.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

// Clamp a tool allowlist to tools that actually exist on the MCP bridge. An
// imported/pushed definition can never reference a tool the server doesn't have
// (24-PLATFORM-SHARING §3). Returns the kept tools and any dropped ones so the
// caller can warn — fault-tolerant by design, never a hard failure.
export function clampAllowlist(allowlist: unknown): { kept: string[]; dropped: string[] } {
  const list = Array.isArray(allowlist) ? allowlist.filter((t): t is string => typeof t === "string") : [];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const t of list) (TOOLSET.has(t) ? kept : dropped).push(t);
  return { kept, dropped };
}

// Raised by an upsert when the caller's baseHash no longer matches the stored
// row — a concurrent edit. The route maps it to HTTP 409.
export class ConflictError extends Error {
  constructor(
    public readonly serverHash: string,
    public readonly serverRevision: number,
  ) {
    super("source_hash mismatch — pull the latest revision before pushing");
    this.name = "ConflictError";
  }
}
