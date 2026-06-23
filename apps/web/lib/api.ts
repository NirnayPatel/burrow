import { createAuthClient } from "better-auth/react";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
export const COLLAB_URL =
  process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:8788";

export const authClient = createAuthClient({ baseURL: API_URL });

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export type Spec = {
  id: string;
  displayId: string;
  title: string;
  status: "draft" | "in_review" | "approved" | "in_progress" | "done" | "archived";
  ydocId: string;
  updatedAt: string;
  teamId?: string | null;
};
