"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import type { CmsVoucherRecord } from "@/domain/cms/types";
import {
  createCmsMediaSubmissionEnvelope,
  createCmsMediaSubmissionId,
  parseCmsMediaServerRollbackSummary,
  rollbackStagedCmsMediaAssets,
  selectCmsMediaRollbackRetryAssets,
  uploadCmsMediaSequentially,
  type CmsMediaServerRollbackSummary,
  type CmsStagedMediaAsset,
} from "@/lib/media/cms-media-client";
import type { PreparedClientImage } from "@/lib/media/client-image";
import { CmsImageUploadField } from "./CmsImageUploadField";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";
import voucherStyles from "./VoucherEditorForm.module.css";

const ambiguousSaveMessage =
  "The save result could not be confirmed. Do not upload the image again yet; refresh the page and check the voucher first.";

type SaveRequestState = "not-started" | "ambiguous" | "definite-failure" | "succeeded";

type VoucherSaveResponse = {
  readonly error?: string;
  readonly voucher?: CmsVoucherRecord;
  readonly mediaCommitState?: "indeterminate";
  readonly mediaRollback?: unknown;
};

function isVoucherRecord(value: unknown): value is CmsVoucherRecord {
  if (!value || typeof value !== "object") return false;
  const voucher = value as Partial<CmsVoucherRecord>;
  return typeof voucher.id === "string" &&
    typeof voucher.title === "string" &&
    typeof voucher.imageUrl === "string" &&
    typeof voucher.imageAlt === "string" &&
    typeof voucher.version === "number";
}

function safeMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The voucher could not be saved. Please try again.";
}

function voucherImageAlt(title: FormDataEntryValue | null) {
  const safeTitle = typeof title === "string" ? title.trim() : "Gift";
  return `${safeTitle || "Gift"} voucher from Siriranee Thai Massage`;
}

export function VoucherEditorForm({
  voucher,
  isNew = false,
}: Readonly<{ voucher: CmsVoucherRecord; isNew?: boolean }>) {
  const router = useRouter();
  const saveLockRef = useRef(false);
  const [version, setVersion] = useState(voucher.version);
  const [imageUrl, setImageUrl] = useState(voucher.imageUrl);
  const [preparedImage, setPreparedImage] = useState<PreparedClientImage | null>(null);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "progress";
    text: string;
  } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const locked = saving || preparationBusy;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLockRef.current || preparationBusy) return;
    if (!imageUrl && !preparedImage) {
      setFeedback({ tone: "error", text: "Choose and prepare a voucher image before saving." });
      return;
    }

    saveLockRef.current = true;
    setSaving(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    let submissionId: string | null = null;
    let stagedAssets: readonly CmsStagedMediaAsset[] = [];
    let requestState: SaveRequestState = "not-started";
    let serverRollback: CmsMediaServerRollbackSummary | null = null;

    try {
      let nextImageUrl = imageUrl;
      if (preparedImage) {
        submissionId = createCmsMediaSubmissionId();
        setFeedback({ tone: "progress", text: "Uploading voucher image…" });
        const uploaded = await uploadCmsMediaSequentially({
          submissionId,
          items: [{ key: "voucher-image", scope: "voucher-image", image: preparedImage }],
          rollbackCompletedOnError: false,
          onStaged: ({ asset }) => {
            stagedAssets = [...stagedAssets, asset];
          },
          onProgress: ({ overallPercent, stage }) => {
            const action = stage === "authorizing"
              ? "Authorizing"
              : stage === "verifying"
                ? "Verifying"
                : "Uploading";
            setFeedback({ tone: "progress", text: `${action} voucher image · ${overallPercent}%` });
          },
        });
        const uploadedImage = uploaded[0]?.asset;
        if (!uploadedImage) throw new Error("The image upload was not confirmed.");
        stagedAssets = [uploadedImage];
        nextImageUrl = uploadedImage.secureUrl;
      }

      const payload = {
        expectedVersion: version,
        title: data.get("title"),
        imageUrl: nextImageUrl,
        imageAlt: voucherImageAlt(data.get("title")),
        status: data.get("status"),
        sortOrder: data.get("sortOrder"),
        ...(submissionId && stagedAssets.length
          ? { mediaSubmission: createCmsMediaSubmissionEnvelope(submissionId, stagedAssets) }
          : {}),
      };

      setFeedback({ tone: "progress", text: "Saving and publishing voucher…" });
      requestState = "ambiguous";
      const response = await fetch(
        isNew ? "/api/cms/vouchers" : `/api/cms/vouchers/${voucher.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) requestState = "definite-failure";
      const result = (await response.json().catch(() => ({}))) as VoucherSaveResponse;
      if (!response.ok) {
        if (result.mediaCommitState === "indeterminate") {
          requestState = "ambiguous";
          throw new Error(ambiguousSaveMessage);
        }
        serverRollback = submissionId
          ? parseCmsMediaServerRollbackSummary(result.mediaRollback, submissionId, stagedAssets)
          : null;
        throw new Error(result.error ?? "The voucher could not be saved.");
      }
      if (!isVoucherRecord(result.voucher)) throw new Error(ambiguousSaveMessage);
      requestState = "succeeded";

      setVersion(result.voucher.version);
      setImageUrl(result.voucher.imageUrl);
      setPreparedImage(null);
      markSaved();
      setFeedback({
        tone: "success",
        text: isNew ? "Voucher created and published." : "Voucher saved and published.",
      });
      if (isNew) router.push(`/cms/vouchers/${result.voucher.id}`);
      router.refresh();
    } catch (error) {
      if (requestState === "ambiguous" || requestState === "succeeded") {
        setFeedback({ tone: "error", text: ambiguousSaveMessage });
        return;
      }

      const retryAssets = requestState === "definite-failure"
        ? selectCmsMediaRollbackRetryAssets(stagedAssets, serverRollback)
        : stagedAssets;
      let cleanupWarning = "";
      if (submissionId && retryAssets.length) {
        setFeedback({ tone: "progress", text: "Removing temporary upload…" });
        try {
          const rollback = await rollbackStagedCmsMediaAssets(submissionId, retryAssets);
          if (rollback.failed || rollback.pendingFinalSweep) {
            cleanupWarning = " Image cleanup could not be fully confirmed; ask an administrator to reconcile the upload before retrying.";
          }
        } catch {
          cleanupWarning = " Image cleanup could not be confirmed; ask an administrator to reconcile the upload before retrying.";
        }
      }
      setFeedback({ tone: "error", text: `${safeMessage(error)}${cleanupWarning}` });
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form aria-busy={locked} className={styles.form} onChange={markDirty} onSubmit={save}>
      <fieldset className={styles.formFields} disabled={locked}>
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Voucher</h2>
            <p>Add one title and one image. The complete voucher publishes only after a successful save.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.fullField}>
              Title
              <input defaultValue={voucher.title} maxLength={120} minLength={2} name="title" required />
            </label>

            <div className={`${styles.fullField} ${voucherStyles.mediaField}`}>
              <CmsImageUploadField
                description="Choose the voucher artwork. It is resized and compressed on this device, and uploads only when you save."
                disabled={locked}
                inputId={`voucher-${voucher.id}-image`}
                label="Voucher image"
                onBusyChange={setPreparationBusy}
                onPreparedImageChange={(image) => {
                  setPreparedImage(image);
                  markDirty();
                  setFeedback(null);
                }}
                preparationOptions={{ outputWidthLimit: 1_920, outputHeightLimit: 1_920, quality: 0.86 }}
                preparedImage={preparedImage}
                required={!imageUrl}
              />
              {imageUrl && !preparedImage ? (
                <figure className={voucherStyles.savedPreview}>
                  <div>
                    <Image
                      alt={voucher.imageAlt}
                      fill
                      sizes="(max-width: 780px) 100vw, 44rem"
                      src={imageUrl}
                    />
                  </div>
                  <figcaption>Current published image · displayed inside 16:9</figcaption>
                </figure>
              ) : null}
            </div>

            <label className={styles.field}>
              Status
              <select defaultValue={voucher.status} name="status">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <small>Only published vouchers appear on the website.</small>
            </label>
            <label className={styles.field}>
              Display order
              <input defaultValue={voucher.sortOrder} max={9999} min={0} name="sortOrder" required type="number" />
              <small>Lower numbers appear first.</small>
            </label>
          </div>
        </section>
      </fieldset>
      <div className={styles.saveBar}>
        <span aria-live="polite">
          {feedback ? (
            <span
              className={feedback.tone === "error" ? styles.error : feedback.tone === "success" ? styles.success : styles.progressStatus}
              role={feedback.tone === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </span>
          ) : `Current version ${version}${dirty ? " · unsaved changes" : ""}`}
        </span>
        <button disabled={locked} type="submit">
          {saving ? "Saving and publishing…" : isNew ? "Create and publish voucher" : "Save and publish voucher"}
        </button>
      </div>
    </form>
  );
}
