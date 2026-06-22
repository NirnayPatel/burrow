// Single source of truth for collaborator colors: a stable hash of identity
// mapped to a --presence-1..8 token. The editor cursor and the avatar stack
// both call this so the same user is the same color in both places.
export function presenceColor(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = (hash * 31 + identity.charCodeAt(i)) | 0;
  }
  return `var(--presence-${(Math.abs(hash) % 8) + 1})`;
}
