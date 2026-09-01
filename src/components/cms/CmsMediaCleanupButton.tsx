"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import styles from "./CmsMediaCleanupButton.module.css";

type CleanupResult = {
  readonly processed: number;
  readonly removed: number;
  readonly pendingFinalSweep: number;
  readonly skipped: number;
  readonly failed: number;
  readonly remainingMayExist: boolean;
};

function isCleanupResult(value: unknown): value is CleanupResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<CleanupResult>;
  return (
    Number.isInteger(result.processed) &&
    Number.isInteger(result.removed) &&
    Number.isInteger(result.pendingFinalSweep) &&
    Number.isInteger(result.skipped) &&
    Number.isInteger(result.failed) &&
    typeof result.remainingMayExist === "boolean"
  );
}

export function CmsMediaCleanupButton() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function runCleanup() {
    if (running) return;
    setRunning(true);
    setError(false);
    setMessage("Checking expired staged uploads…");

    try {
      const response = await fetch("/api/cms/media-upload/cleanup", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok || !isCleanupResult(body)) {
        const detail =
          body && typeof body === "object" && "error" in body
            ? String(body.error)
            : "Expired image cleanup could not be completed.";
        throw new Error(detail);
      }

      setMessage(
        body.processed === 0
          ? "No expired staged uploads need cleanup."
          : `Checked ${body.processed}; removed ${body.removed}, protected ${body.skipped}, failed ${body.failed}.${body.pendingFinalSweep ? ` ${body.pendingFinalSweep} will receive a final safety sweep after its upload signature expires.` : ""}${body.remainingMayExist ? " Run again to check the next batch." : ""}`,
      );
    } catch (cleanupError) {
      setError(true);
      setMessage(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Expired image cleanup could not be completed.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={styles.cleanup}>
      <button disabled={running} onClick={() => void runCleanup()} type="button">
        <RefreshCw aria-hidden="true" />
        {running ? "Checking…" : "Clean expired uploads"}
      </button>
      {message ? (
        <p aria-live="polite" className={error ? styles.error : ""} role={error ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
