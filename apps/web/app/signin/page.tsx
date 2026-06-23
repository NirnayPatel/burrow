"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, api } from "../../lib/api";
import { PageShell } from "../../components/page-shell";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import styles from "./signin.module.css";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "failed");
      return;
    }
    // Gate: new orgs (onboarded_at null) go through the wizard first.
    try {
      const ob = await api<{ onboarded: boolean; roleType: string }>("/api/onboarding");
      router.push(ob.onboarded ? "/dashboard" : "/onboarding");
    } catch {
      // If the check fails, fall through to dashboard so auth still works.
      router.push("/dashboard");
    }
  }

  return (
    <PageShell width="narrow">
      <div className={styles.lockup}>
        <p className={styles.brand}>Burrow</p>
        <h1 className={styles.heading}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className={styles.sub}>
          {mode === "signup"
            ? "Self-hosted, your keys — up in minutes."
            : "Sign in to your workspace."}
        </p>
      </div>

      <form onSubmit={submit} className={styles.form}>
        {mode === "signup" && (
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          placeholder="Password (8+ chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <Button type="submit" variant="primary" busy={busy}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
        {error && <p className={styles.error}>{error}</p>}
      </form>

      <div className={styles.switchWrap}>
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create account"}
        </Button>
      </div>
    </PageShell>
  );
}
