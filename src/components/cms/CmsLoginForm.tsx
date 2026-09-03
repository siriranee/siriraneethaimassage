"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  CMS_PASSWORD_HTML_PATTERN,
  CMS_PASSWORD_MAX_LENGTH,
  CMS_PASSWORD_MIN_LENGTH,
  CMS_USERNAME_HTML_PATTERN,
  CMS_USERNAME_MAX_LENGTH,
  CMS_USERNAME_MIN_LENGTH,
  isValidCmsUsername,
  normalizeCmsUsername,
} from "@/domain/cms/account-policy";
import type { CmsMode } from "@/server/cms/config";

import styles from "./CmsLoginForm.module.css";

const rememberedUsernameKey = "siriranee.cms.rememberedUsername";

function updateRememberedUsername(username: string, remember: boolean) {
  try {
    if (remember) {
      window.localStorage.setItem(
        rememberedUsernameKey,
        normalizeCmsUsername(username),
      );
    } else {
      window.localStorage.removeItem(rememberedUsernameKey);
    }
  } catch {
    // Sign-in still works when browser storage is unavailable.
  }
}

export function CmsLoginForm({ mode }: Readonly<{ mode: CmsMode }>) {
  const router = useRouter();
  const usernameId = useId();
  const usernameHintId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const errorId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const hasError = status === "error" && Boolean(message);

  useEffect(() => {
    try {
      const rememberedUsername = window.localStorage.getItem(
        rememberedUsernameKey,
      );
      if (!rememberedUsername || !isValidCmsUsername(rememberedUsername)) return;

      if (usernameRef.current) usernameRef.current.value = rememberedUsername;
      if (rememberRef.current) rememberRef.current.checked = true;
    } catch {
      // Leave both controls empty when browser storage is unavailable.
    }
  }, []);

  async function submit(
    payload: { demo?: boolean; username?: string; password?: string },
    rememberUsername = false,
  ) {
    setStatus("working");
    setMessage("");

    try {
      const response = await fetch("/api/cms/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setStatus("error");
        setMessage(
          response.status === 429
            ? "Too many sign-in attempts. Please wait before trying again."
            : "Username or password is incorrect.",
        );
        return;
      }

      if (payload.username) {
        updateRememberedUsername(payload.username, rememberUsername);
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
      username: String(data.get("username") ?? ""),
      password: String(data.get("password") ?? ""),
    }, data.get("rememberUsername") === "on");
  }

  function clearError() {
    if (status !== "error") return;
    setStatus("idle");
    setMessage("");
  }

  if (mode === "disabled") {
    return (
      <div className={styles.disabledState}>
        <LockKeyhole aria-hidden="true" />
        <h1>CMS setup required</h1>
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
        <h1>Open the mock workspace</h1>
        <p>
          Explore the complete interface with fictional appointments. No customer
          information is stored and changes reset when the server restarts.
        </p>
        <button disabled={status === "working"} onClick={() => void submit({ demo: true })} type="button">
          {status === "working" ? "Opening workspace..." : "Open local demo"}
          <ArrowRight aria-hidden="true" />
        </button>
        <div className={styles.messageArea}>
          {message ? <p className={styles.error} role="alert">{message}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <form
      aria-busy={status === "working"}
      className={styles.form}
      onChange={clearError}
      onSubmit={handleCredentials}
    >
      <span className={styles.kicker}>Siriranee CMS</span>
      <h1>Welcome back</h1>
      <p>Sign in to manage Siriranee Thai Massage.</p>

      <div className={styles.field}>
        <label htmlFor={usernameId}>Username</label>
        <input
          aria-describedby={`${usernameHintId}${hasError ? ` ${errorId}` : ""}`}
          aria-invalid={hasError || undefined}
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          autoFocus
          disabled={status === "working"}
          id={usernameId}
          maxLength={CMS_USERNAME_MAX_LENGTH}
          minLength={CMS_USERNAME_MIN_LENGTH}
          name="username"
          pattern={CMS_USERNAME_HTML_PATTERN}
          ref={usernameRef}
          required
          spellCheck={false}
          title={`${CMS_USERNAME_MIN_LENGTH}–${CMS_USERNAME_MAX_LENGTH} characters using letters and numbers only.`}
          type="text"
        />
        <p className={styles.fieldHint} id={usernameHintId}>
          {CMS_USERNAME_MIN_LENGTH}–{CMS_USERNAME_MAX_LENGTH} characters.
          Letters and numbers only.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor={passwordId}>Password</label>
        <div className={styles.passwordControl}>
          <input
            aria-describedby={`${passwordHintId}${hasError ? ` ${errorId}` : ""}`}
            aria-invalid={hasError || undefined}
            autoComplete="current-password"
            disabled={status === "working"}
            id={passwordId}
            maxLength={CMS_PASSWORD_MAX_LENGTH}
            minLength={CMS_PASSWORD_MIN_LENGTH}
            name="password"
            pattern={CMS_PASSWORD_HTML_PATTERN}
            required
            title={`${CMS_PASSWORD_MIN_LENGTH}–${CMS_PASSWORD_MAX_LENGTH} characters using letters and numbers only.`}
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className={styles.passwordToggle}
            disabled={status === "working"}
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
        <p className={styles.fieldHint} id={passwordHintId}>
          {CMS_PASSWORD_MIN_LENGTH}–{CMS_PASSWORD_MAX_LENGTH} characters.
          Letters and numbers only.
        </p>
      </div>

      <label className={styles.rememberControl}>
        <input name="rememberUsername" ref={rememberRef} type="checkbox" />
        <span>Remember username</span>
      </label>

      <button className={styles.submitButton} disabled={status === "working"} type="submit">
        {status === "working" ? "Signing in..." : "Sign in"}
        <ArrowRight aria-hidden="true" />
      </button>
      <div className={styles.messageArea}>
        {message ? <p className={styles.error} id={errorId} role="alert">{message}</p> : null}
      </div>
    </form>
  );
}
