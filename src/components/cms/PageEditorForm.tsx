"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { HomeHeroSlidesEditor } from "@/components/cms/HomeHeroSlidesEditor";
import type { CmsPageHeroSlide } from "@/domain/cms/page-hero";
import type { CmsPageRecord } from "@/domain/cms/types";
import type { PreparedClientImage } from "@/lib/media/client-image";
import type { CloudinaryDeliveryOwnership } from "@/lib/media/cloudinary-delivery";
import {
  createCmsMediaSubmissionEnvelope,
  createCmsMediaSubmissionId,
  rollbackStagedCmsMediaAssets,
  uploadCmsMediaSequentially,
  type CmsMediaUploadItem,
  type CmsStagedMediaAsset,
} from "@/lib/media/cms-media-client";
import { SeoEditorFields } from "./SeoEditorFields";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./CmsEditorForm.module.css";

type SaveState = "idle" | "uploading" | "saving" | "saved" | "error";
type PreparedImageMap = Record<string, PreparedClientImage | undefined>;
type BusyImageMap = Record<string, boolean | undefined>;

function updatePreparedImageMap(
  current: PreparedImageMap,
  slideId: string,
  image: PreparedClientImage | null,
) {
  const next = { ...current };
  if (image) next[slideId] = image;
  else delete next[slideId];
  return next;
}

function updateBusyImageMap(
  current: BusyImageMap,
  slideId: string,
  isBusy: boolean,
) {
  const next = { ...current };
  if (isBusy) next[slideId] = true;
  else delete next[slideId];
  return next;
}

function keepCurrentSlideEntries<T>(
  current: Readonly<Record<string, T | undefined>>,
  slides: readonly CmsPageHeroSlide[],
) {
  const currentIds = new Set(slides.map((slide) => slide.id));
  return Object.fromEntries(
    Object.entries(current).filter(([slideId]) => currentIds.has(slideId)),
  ) as Record<string, T | undefined>;
}

function saveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message.length >= 3 &&
      message.length <= 240 &&
      !/[<>\r\n]/.test(message)
    ) {
      return message;
    }
  }

  return "The page could not be saved and published. Please try again.";
}

export function PageEditorForm({
  page,
  cloudinaryOwnership,
}: Readonly<{
  page: CmsPageRecord;
  cloudinaryOwnership?: CloudinaryDeliveryOwnership | null;
}>) {
  const router = useRouter();
  const saveLockRef = useRef(false);
  const [version, setVersion] = useState(page.version);
  const [heroSlides, setHeroSlides] = useState<readonly CmsPageHeroSlide[]>(
    page.heroSlides ?? [],
  );
  const [preparedHeroImages, setPreparedHeroImages] =
    useState<PreparedImageMap>({});
  const [heroPreparationBusy, setHeroPreparationBusy] =
    useState<BusyImageMap>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const preparationBusy = Object.values(heroPreparationBusy).some(Boolean);
  const saving = saveState === "uploading" || saveState === "saving";
  const locked = saving || preparationBusy;

  function updateHeroSlides(nextSlides: readonly CmsPageHeroSlide[]) {
    setHeroSlides(nextSlides);
    setPreparedHeroImages((current) =>
      keepCurrentSlideEntries(current, nextSlides),
    );
    setHeroPreparationBusy((current) =>
      keepCurrentSlideEntries(current, nextSlides),
    );
    markDirty();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saveLockRef.current || preparationBusy || !form.reportValidity()) return;

    saveLockRef.current = true;
    setMessage("");
    const data = new FormData(form);
    const uploadItems: CmsMediaUploadItem[] = [];

    if (page.id === "home") {
      for (const slide of heroSlides) {
        const preparedImage = preparedHeroImages[slide.id];
        if (preparedImage) {
          uploadItems.push({
            key: `home-hero:${slide.id}`,
            scope: "home-hero",
            image: preparedImage,
          });
        }
      }
    }

    let submissionId: string | null = null;
    let stagedAssets: readonly CmsStagedMediaAsset[] = [];

    try {
      const uploadedByKey = new Map<string, CmsStagedMediaAsset>();
      if (uploadItems.length) {
        submissionId = createCmsMediaSubmissionId();
        setSaveState("uploading");
        setMessage(
          `Preparing ${uploadItems.length} hero image${uploadItems.length === 1 ? "" : "s"} for upload…`,
        );
        const uploaded = await uploadCmsMediaSequentially({
          submissionId,
          items: uploadItems,
          onProgress: ({ itemCount, itemIndex, overallPercent, stage }) => {
            const action =
              stage === "authorizing"
                ? "Authorizing"
                : stage === "verifying"
                  ? "Verifying"
                  : "Uploading";
            setMessage(
              `${action} hero image ${itemIndex + 1} of ${itemCount} · ${overallPercent}%`,
            );
          },
        });
        for (const result of uploaded) uploadedByKey.set(result.key, result.asset);
        stagedAssets = uploaded.map(({ asset }) => asset);
      }

      const nextHeroSlides =
        page.id === "home"
          ? heroSlides.map((slide) => ({
              ...slide,
              imageUrl:
                uploadedByKey.get(`home-hero:${slide.id}`)?.secureUrl ??
                slide.imageUrl,
            }))
          : heroSlides;
      const payload = {
        expectedVersion: version,
        eyebrow: data.get("eyebrow"),
        title: data.get("title"),
        description: data.get("description"),
        seoTitle: data.get("seoTitle"),
        seoDescription: data.get("seoDescription"),
        ...(page.id === "home" ? { heroSlides: nextHeroSlides } : {}),
        ...(submissionId && stagedAssets.length
          ? {
              mediaSubmission: createCmsMediaSubmissionEnvelope(
                submissionId,
                stagedAssets,
              ),
            }
          : {}),
      };

      setSaveState("saving");
      setMessage("Saving and publishing page…");
      const response = await fetch(`/api/cms/pages/${page.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        page?: CmsPageRecord;
      };

      if (!response.ok || !result.page) {
        throw new Error(result.error ?? "The page could not be saved and published.");
      }

      setVersion(result.page.version);
      setHeroSlides(result.page.heroSlides ?? []);
      setPreparedHeroImages({});
      setHeroPreparationBusy({});
      markSaved();
      setSaveState("saved");
      setMessage(
        page.id === "home"
          ? "Home hero, page heading and SEO saved and published."
          : "Page heading and SEO saved and published.",
      );
      router.refresh();
    } catch (error) {
      if (submissionId && stagedAssets.length) {
        setMessage("Removing temporary uploads…");
        await rollbackStagedCmsMediaAssets(submissionId, stagedAssets);
      }
      setSaveState("error");
      setMessage(saveErrorMessage(error));
    } finally {
      saveLockRef.current = false;
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
            <h2>Page hero</h2>
            <p>Keep the page promise clear, specific and truthful.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.fullField}>
              Eyebrow
              <input
                defaultValue={page.eyebrow}
                maxLength={100}
                minLength={2}
                name="eyebrow"
                required
              />
            </label>
            <label className={styles.fullField}>
              Page title
              <input
                defaultValue={page.title}
                maxLength={120}
                minLength={4}
                name="title"
                required
              />
            </label>
            <label className={styles.fullField}>
              Introduction
              <textarea
                defaultValue={page.description}
                maxLength={400}
                minLength={20}
                name="description"
                required
              />
            </label>
          </div>
        </section>

        {page.id === "home" ? (
          <section className={styles.section}>
            <header className={styles.sectionHeader}>
              <h2>Home hero images</h2>
              <p>
                Set the order and crop focus for the automatic homepage slideshow.
              </p>
            </header>
            <HomeHeroSlidesEditor
              cloudinaryOwnership={cloudinaryOwnership}
              onChange={updateHeroSlides}
              onPreparationBusyChange={(slideId, isBusy) =>
                setHeroPreparationBusy((current) =>
                  updateBusyImageMap(current, slideId, isBusy),
                )
              }
              onPreparedImageChange={(slideId, nextImage) => {
                setPreparedHeroImages((current) =>
                  updatePreparedImageMap(current, slideId, nextImage),
                );
                markDirty();
              }}
              preparedImages={preparedHeroImages}
              slides={heroSlides}
            />
          </section>
        ) : null}

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Search appearance</h2>
            <p>Length limits protect readable Google and social previews.</p>
          </header>
          <div className={styles.grid}>
            <SeoEditorFields
              description={page.seoDescription}
              title={page.seoTitle}
            />
          </div>
        </section>
      </fieldset>

      <div className={styles.saveBar}>
        <span aria-live="polite">
          {message ? (
            <span
              className={
                saveState === "error"
                  ? styles.error
                  : saveState === "saved"
                    ? styles.success
                    : styles.progressStatus
              }
              role={
                saveState === "error"
                  ? "alert"
                  : saveState === "uploading" || saveState === "saving"
                    ? "status"
                    : undefined
              }
            >
              {message}
            </span>
          ) : preparationBusy ? (
            "Preparing an image on this device…"
          ) : (
            `Published version ${version}${dirty ? " · unsaved changes" : ""}`
          )}
        </span>
        <button disabled={locked} type="submit">
          {saveState === "uploading"
            ? "Uploading…"
            : saveState === "saving"
              ? "Saving…"
              : "Save and publish"}
        </button>
      </div>
    </form>
  );
}
