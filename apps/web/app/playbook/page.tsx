// Redirect legacy /playbook links to /context (spec §10 — one-release keep-alive).
import { redirect } from "next/navigation";

export default function PlaybookRedirect() {
  redirect("/context");
}
