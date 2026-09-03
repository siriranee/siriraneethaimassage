"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { CmsImageUploadField } from "@/components/cms/CmsImageUploadField";
import type { CmsGalleryRecord } from "@/domain/cms/types";
import type { PreparedClientImage } from "@/lib/media/client-image";
import {
  createCmsMediaSubmissionEnvelope,
  createCmsMediaSubmissionId,
  rollbackStagedCmsMediaAssets,
  uploadCmsMediaSequentially,
  type CmsStagedMediaAsset,
} from "@/lib/media/cms-media-client";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

function saveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length >= 3 && message.length <= 240 && !/[<>\r\n]/.test(message)) {
      return message;
    }
  }

  return "The gallery record could not be saved. Please try again.";
}

export function GalleryEditorForm({
  item,
  isNew = false,
}: Readonly<{ item: CmsGalleryRecord; isNew?: boolean }>) {
  const router = useRouter();
  const saveLockRef = useRef(false);
  const [version, setVersion] = useState(item.version);
  const [imageUrl, setImageUrl] = useState(item.imageUrl);
  const [preparedImage, setPreparedImage] = useState<PreparedClientImage | null>(null);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const locked = saving || preparationBusy;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saveLockRef.current || preparationBusy || !form.reportValidity()) return;

    saveLockRef.current = true;
    setSaving(true);
    setActivity(preparedImage ? "Preparing image upload…" : "Saving and publishing gallery item…");
    setFeedback(null);
    const data = new FormData(form);
    let submissionId: string | null = null;
    let stagedAssets: readonly CmsStagedMediaAsset[] = [];

    try {
      let nextImageUrl = imageUrl;

      if (preparedImage) {
        submissionId = createCmsMediaSubmissionId();
        const uploaded = await uploadCmsMediaSequentially({
          submissionId,
          items: [
            {
              key: "gallery-image",
              scope: "site-gallery",
              image: preparedImage,
            },
          ],
          onProgress: ({ itemCount, itemIndex, overallPercent, stage }) => {
            const action =
              stage === "authorizing"
                ? "Authorizing"
                : stage === "verifying"
                  ? "Verifying"
                  : "Uploading";
            setActivity(
              `${action} image ${itemIndex + 1} of ${itemCount} · ${overallPercent}%`,
            );
          },
        });
        stagedAssets = uploaded.map(({ asset }) => asset);
        nextImageUrl = uploaded[0]?.asset.secureUrl ?? nextImageUrl;
      }

      setActivity("Saving and publishing gallery item…");
      const payload = {
        expectedVersion: version,
        imageUrl: nextImageUrl,
        altText: data.get("altText"),
        caption: data.get("caption"),
        published: data.get("published") === "on",
        sortOrder: Number(data.get("sortOrder")),
        ...(submissionId && stagedAssets.length
          ? {
              mediaSubmission: createCmsMediaSubmissionEnvelope(
                submissionId,
                stagedAssets,
              ),
            }
          : {}),
      };
      const response = await fetch(
        isNew ? "/api/cms/gallery" : `/api/cms/gallery/${item.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        item?: CmsGalleryRecord;
      };
      if (!response.ok || !result.item) {
        throw new Error(
          result.error ?? "The gallery record could not be saved.",
        );
      }

      setVersion(result.item.version);
      setImageUrl(result.item.imageUrl);
      setPreparedImage(null);
      markSaved();
      setFeedback({
        tone: "success",
        text: isNew ? "Gallery item created and website updated." : "Gallery item saved and website updated.",
      });
      if (isNew) router.push(`/cms/media/${result.item.id}/edit`);
      router.refresh();
    } catch (error) {
      if (submissionId && stagedAssets.length) {
        setActivity("Removing temporary uploads…");
        await rollbackStagedCmsMediaAssets(submissionId, stagedAssets);
      }
      setFeedback({ tone: "error", text: saveErrorMessage(error) });
    } finally {
      saveLockRef.current = false;
      setSaving(false);
      setActivity("");
    }
  }

  return (
    <form
      aria-busy={locked}
      className={`${styles.form} ${locked ? styles.formBusy : ""}`}
      onChange={markDirty}
      onSubmit={save}
    >
      <fieldset className={styles.formFields} disabled={locked}>
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Image information</h2>
            <p>Choose a file to prepare it on this device. It uploads only when this form is saved.</p>
          </header>
          <div className={styles.grid}>
            <div className={styles.fullField}>
              <CmsImageUploadField
                disabled={locked}
                label="Prepare gallery image"
                onBusyChange={setPreparationBusy}
                onPreparedImageChange={(nextImage) => {
                  setPreparedImage(nextImage);
                  markDirty();
                }}
                preparedImage={preparedImage}
              />
            </div>
            <label className={styles.fullField}>
              Existing image path or approved URL
              <input
                maxLength={2_048}
                name="imageUrl"
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="/images/spa/example.webp"
                required={!preparedImage}
                value={imageUrl}
              />
              <small>A prepared file replaces this value after the form saves successfully.</small>
            </label>
            <label className={styles.fullField}>Alternative text<input defaultValue={item.altText} maxLength={180} minLength={8} name="altText" required /><small>Describe what is visible; do not repeat “image of”.</small></label>
            <label className={styles.fullField}>Caption<input defaultValue={item.caption} maxLength={240} minLength={2} name="caption" required /></label>
            <label className={styles.field}>Display order<input defaultValue={item.sortOrder} max={1000} min={0} name="sortOrder" required type="number" /></label>
            <label className={styles.checkbox}><input defaultChecked={item.published} name="published" type="checkbox" /><span>Show on the website<small>This gallery item publishes immediately when the form saves.</small></span></label>
          </div>
        </section>
      </fieldset>
      <div className={styles.saveBar}>
        <span aria-live="polite">
          {activity ? (
            <span className={styles.progressStatus} role="status">{activity}</span>
          ) : feedback ? (
            <span className={feedback.tone === "error" ? styles.error : styles.success} role={feedback.tone === "error" ? "alert" : undefined}>{feedback.text}</span>
          ) : preparationBusy ? (
            "Preparing image on this device…"
          ) : (
            `Current version ${version}${dirty ? " · unsaved changes" : ""}`
          )}
        </span>
        <button disabled={locked} type="submit">
          {saving ? (stagedAssetsLabel(activity) ? "Uploading…" : "Saving and publishing…") : isNew ? "Create gallery item" : "Save website changes"}
        </button>
      </div>
    </form>
  );
}

function stagedAssetsLabel(activity: string) {
  return /authorizing|uploading|verifying/i.test(activity);
}
