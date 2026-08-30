"use client";

import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { CmsMode } from "@/server/cms/config";

import styles from "./CmsLoginForm.module.css";

export function CmsLoginForm({ mode }: Readonly<{ mode: CmsMode }>) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(payload: { demo?: boolean; email?: string; password?: string }) {
    setStatus("working");
    setMessage("");

    try {
      const response = await fetch("/api/cms/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "Sign in was not successful.");
        return;
      }

      router.replace("/cms");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("The CMS could not be reached. Please try again.");
    }
  }

  function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    void submit({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
  }

  if (mode === "disabled") {
    return (
      <div className={styles.disabledState}>
        <LockKeyhole aria-hidden="true" />
        <h2>CMS setup required</h2>
        <p>
          Persistence is safely disabled. Configure MongoDB and provision an
          administrator before this workspace can accept real data.
        </p>
        <Link href="/">Return to the website</Link>
      </div>
    );
  }

  if (mode === "mock") {
    return (
      <div className={styles.demoState}>
        <span className={styles.demoIcon}><ShieldCheck aria-hidden="true" /></span>
        <span className={styles.kicker}>Local development</span>
        <h2>Open the mock workspace</h2>
        <p>
          Explore the complete interface with fictional appointments. No customer
          information is stored and changes reset when the server restarts.
        </p>
        <button disabled={status === "working"} onClick={() => void submit({ demo: true })} type="button">
          {status === "working" ? "Opening workspace..." : "Open local demo"}
          <ArrowRight aria-hidden="true" />
        </button>
        {message ? <p className={styles.error} role="alert">{message}</p> : null}
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleCredentials}>
      <span className={styles.kicker}>Secure access</span>
      <h2>Sign in to the CMS</h2>
      <p>Use the administrator or staff account provided for Siriranee.</p>

      <label>
        Email address
        <input autoComplete="username" name="email" required type="email" />
      </label>
      <label>
        Password
        <input autoComplete="current-password" minLength={12} name="password" required type="password" />
      </label>

      <button disabled={status === "working"} type="submit">
        {status === "working" ? "Signing in..." : "Sign in"}
        <ArrowRight aria-hidden="true" />
      </button>
      {message ? <p className={styles.error} role="alert">{message}</p> : null}
    </form>
  );
}
