"use client";

import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./PublishContentButton.module.css";

export function PublishContentButton({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "publishing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function publish() {
    setState("publishing");
    setMessage("");

    try {
      const response = await fetch("/api/cms/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as { error?: string; publication?: { revision: number } };

      if (!response.ok || !result.publication) {
        setState("error");
        setMessage(result.error ?? "The website draft could not be published.");
        return;
      }

      setState("success");
      setMessage(`Revision ${result.publication.revision} published.`);
      router.refresh();
    } catch {
      setState("error");
      setMessage("The CMS could not be reached. Please try again.");
    }
  }

  return (
    <div className={styles.wrap}>
      <button disabled={disabled || state === "publishing"} onClick={() => void publish()} type="button">
        <UploadCloud aria-hidden="true" />
        {state === "publishing" ? "Publishing..." : disabled ? "Resolve errors before publishing" : "Publish website"}
      </button>
      {message ? <span className={state === "error" ? styles.error : styles.success} role={state === "error" ? "alert" : "status"}>{message}</span> : null}
    </div>
  );
}
