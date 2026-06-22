import { API_URL } from "../../../lib/api";

export type AssistMode = "draft" | "expand" | "critique" | "acceptance";

export type AssistResult =
  | { ok: true }
  | { ok: false; noKey: boolean; message: string };

// Streams POST /api/specs/:id/assist by hand — EventSource can't POST, same
// pattern as breakdown-panel. `onDelta` fires per chunk so callers can append
// to an AI surface (or the editor) as text arrives.
export async function streamAssist(
  specId: string,
  mode: AssistMode,
  prompt: string,
  onDelta: (chunk: string) => void,
): Promise<AssistResult> {
  const res = await fetch(`${API_URL}/api/specs/${specId}/assist`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return {
      ok: false,
      noKey: body.error === "no_provider_key",
      message: body.error ?? `HTTP ${res.status}`,
    };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const evt of events) {
      const type = /^event: (.+)$/m.exec(evt)?.[1];
      const data = /^data: (.+)$/m.exec(evt)?.[1];
      if (!type || !data) continue;
      // `delta` carries a JSON-encoded string chunk; `error` an {message}.
      if (type === "delta") onDelta(JSON.parse(data));
      if (type === "error") streamError = JSON.parse(data).message;
    }
  }

  if (streamError) return { ok: false, noKey: false, message: streamError };
  return { ok: true };
}
