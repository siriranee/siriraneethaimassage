"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./PublishContentButton.module.css";

export function RestorePublicationButton({ publicationId, expectedRevision }: Readonly<{ publicationId: string; expectedRevision: number }>) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function restore() {
    setState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/cms/content/publications/${publicationId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision }),
      });
      const result = (await response.json()) as { error?: string; content?: { revision: number } };
      if (!response.ok || !result.content) {
        setState("error");
        setMessage(result.error ?? "The publication could not be restored.");
        return;
      }
      router.push("/cms/content/preview");
      router.refresh();
    } catch {
      setState("error");
      setMessage("The CMS could not be reached. Please try again.");
    }
  }

  return (
    <div className={styles.wrap}>
      {state === "confirm" ? (
        <div className={styles.confirmRow}>
          <button className={styles.secondary} onClick={() => setState("idle")} type="button">Keep current draft</button>
          <button onClick={() => void restore()} type="button"><RotateCcw aria-hidden="true" /> Confirm restore</button>
        </div>
      ) : (
        <button disabled={state === "saving"} onClick={() => setState("confirm")} type="button"><RotateCcw aria-hidden="true" /> Restore as draft</button>
      )}
      {message ? <span className={styles.error} role="alert">{message}</span> : null}
    </div>
  );
}
