"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { CmsImageUploadField } from "@/components/cms/CmsImageUploadField";
import { serviceCategories } from "@/content/services";
import type { CmsServicePrice, CmsServiceRecord } from "@/domain/cms/types";
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
import { ServiceGalleryEditor } from "./ServiceGalleryEditor";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";

type SaveState = "idle" | "uploading" | "saving" | "saved" | "error";
type PreparedImageMap = Record<string, PreparedClientImage | undefined>;
type BusyImageMap = Record<string, boolean | undefined>;

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function updatePreparedImageMap(
  current: PreparedImageMap,
  imageId: string,
  image: PreparedClientImage | null,
) {
  const next = { ...current };
  if (image) next[imageId] = image;
  else delete next[imageId];
  return next;
}

function updateBusyImageMap(
  current: BusyImageMap,
  imageId: string,
  isBusy: boolean,
) {
  const next = { ...current };
  if (isBusy) next[imageId] = true;
  else delete next[imageId];
  return next;
}

function saveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length >= 3 && message.length <= 240 && !/[<>\r\n]/.test(message)) {
      return message;
    }
  }

  return "The treatment could not be saved. Please try again.";
}

export function ServiceEditorForm({
  service,
  isNew = false,
  cloudinaryOwnership,
}: Readonly<{
  service: CmsServiceRecord;
  isNew?: boolean;
  cloudinaryOwnership?: CloudinaryDeliveryOwnership | null;
}>) {
  const router = useRouter();
  const saveLockRef = useRef(false);
  const [version, setVersion] = useState(service.version);
  const [imageUrl, setImageUrl] = useState(service.imageUrl);
  const [priceRows, setPriceRows] = useState<readonly CmsServicePrice[]>(
    service.prices,
  );
  const [galleryImages, setGalleryImages] = useState(service.galleryImages);
  const [preparedCover, setPreparedCover] =
    useState<PreparedClientImage | null>(null);
  const [preparedGalleryImages, setPreparedGalleryImages] =
    useState<PreparedImageMap>({});
  const [coverPreparationBusy, setCoverPreparationBusy] = useState(false);
  const [galleryPreparationBusy, setGalleryPreparationBusy] =
    useState<BusyImageMap>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const preparationBusy =
    coverPreparationBusy || Object.values(galleryPreparationBusy).some(Boolean);
  const saving = saveState === "uploading" || saveState === "saving";
  const locked = saving || preparationBusy;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saveLockRef.current || preparationBusy || !form.reportValidity()) return;

    saveLockRef.current = true;
    const data = new FormData(form);
    const prices = priceRows.map((price) => ({
      id: price.id,
      durationMinutes: Number(data.get(`duration-${price.id}`)),
      priceCents: Math.round(Number(data.get(`price-${price.id}`)) * 100),
      active: data.get(`active-${price.id}`) === "on",
    }));
    const uploadItems: CmsMediaUploadItem[] = [];

    if (preparedCover) {
      uploadItems.push({
        key: "service-cover",
        scope: "service-cover",
        image: preparedCover,
      });
    }
    for (const image of galleryImages) {
      const preparedImage = preparedGalleryImages[image.id];
      if (preparedImage) {
        uploadItems.push({
          key: `service-gallery:${image.id}`,
          scope: "service-gallery",
          image: preparedImage,
        });
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
          `Preparing ${uploadItems.length} image${uploadItems.length === 1 ? "" : "s"} for upload…`,
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
              `${action} image ${itemIndex + 1} of ${itemCount} · ${overallPercent}%`,
            );
          },
        });
        for (const result of uploaded) uploadedByKey.set(result.key, result.asset);
        stagedAssets = uploaded.map(({ asset }) => asset);
      }

      const nextImageUrl =
        uploadedByKey.get("service-cover")?.secureUrl ?? imageUrl;
      const nextGalleryImages = galleryImages.map((image) => ({
        ...image,
        imageUrl:
          uploadedByKey.get(`service-gallery:${image.id}`)?.secureUrl ??
          image.imageUrl,
      }));
      const payload = {
        expectedVersion: version,
        slug: data.get("slug"),
        name: data.get("name"),
        category: data.get("category"),
        shortDescription: data.get("shortDescription"),
        longDescription: data.get("longDescription"),
        imageUrl: nextImageUrl,
        imageAlt: data.get("imageAlt"),
        galleryImages: nextGalleryImages,
        prices,
        idealFor: lines(data.get("idealFor")),
        highlights: lines(data.get("highlights")),
        bookingNotice: data.get("bookingNotice"),
        seoTitle: data.get("seoTitle"),
        seoDescription: data.get("seoDescription"),
        status: data.get("status"),
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

      setSaveState("saving");
      setMessage("Saving treatment draft…");
      const response = await fetch(
        isNew ? "/api/cms/services" : `/api/cms/services/${service.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        service?: CmsServiceRecord;
      };

      if (!response.ok || !result.service) {
        throw new Error(result.error ?? "The treatment could not be saved.");
      }

      setVersion(result.service.version);
      setImageUrl(result.service.imageUrl);
      setGalleryImages(result.service.galleryImages);
      setPreparedCover(null);
      setPreparedGalleryImages({});
      setGalleryPreparationBusy({});
      markSaved();
      setSaveState("saved");
      setMessage(isNew ? "Treatment draft created." : "Treatment draft saved.");
      if (isNew) router.push(`/cms/services/${result.service.id}/edit`);
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
            <h2>Treatment details</h2>
            <p>The slug is intentionally stable so existing links continue to work.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.field}>Name<input defaultValue={service.name} maxLength={100} minLength={2} name="name" required /></label>
            <label className={styles.field}>Category<select defaultValue={service.category} name="category">{serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
            <label className={styles.field}>URL slug{isNew ? <input defaultValue={service.slug} maxLength={100} minLength={2} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /> : <><input name="slug" type="hidden" value={service.slug} /><span className={styles.readOnly}>{service.slug}</span></>}</label>
            <label className={styles.field}>Display order<input defaultValue={service.sortOrder} max={1000} min={0} name="sortOrder" required type="number" /></label>
            <label className={styles.fullField}>Short description<textarea defaultValue={service.shortDescription} maxLength={300} minLength={20} name="shortDescription" required /></label>
            <label className={styles.fullField}>Full description<textarea defaultValue={service.longDescription} maxLength={2000} minLength={40} name="longDescription" required /></label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Durations & prices</h2>
            <p>Prices are entered in euro. Existing bookings keep their original snapshot.</p>
          </header>
          <div className={styles.priceList}>
            {priceRows.map((price) => (
              <div className={styles.priceRow} key={price.id}>
                <label>Duration, minutes<input defaultValue={price.durationMinutes} max={240} min={15} name={`duration-${price.id}`} required step={5} type="number" /></label>
                <label>Price, €<input defaultValue={(price.priceCents / 100).toFixed(2)} max={1000} min={1} name={`price-${price.id}`} required step="0.01" type="number" /></label>
                <label className={styles.checkbox}><input defaultChecked={price.active} name={`active-${price.id}`} type="checkbox" /><span>Available option<small>Inactive prices stay in history but are not offered publicly.</small></span></label>
                <button className={styles.removeButton} disabled={priceRows.length === 1} onClick={() => setPriceRows((rows) => rows.filter((row) => row.id !== price.id))} type="button">Remove option</button>
              </div>
            ))}
            <button
              className={styles.secondaryButton}
              disabled={priceRows.length >= 8}
              onClick={() => setPriceRows((rows) => [...rows, { id: `new-${crypto.randomUUID()}`, durationMinutes: 60, priceCents: 6500, active: true }])}
              type="button"
            >
              Add duration and price
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Image & supporting copy</h2>
            <p>Prepare a replacement locally and write truthful alternative text.</p>
          </header>
          <div className={styles.grid}>
            <div className={styles.fullField}>
              <CmsImageUploadField
                disabled={locked}
                label="Prepare treatment cover image"
                onBusyChange={setCoverPreparationBusy}
                onPreparedImageChange={(nextImage) => {
                  setPreparedCover(nextImage);
                  markDirty();
                }}
                preparedImage={preparedCover}
              />
            </div>
            <label className={styles.fullField}>
              Existing image path or approved URL
              <input
                maxLength={2_048}
                name="imageUrl"
                onChange={(event) => setImageUrl(event.target.value)}
                required={!preparedCover}
                value={imageUrl}
              />
              <small>A prepared file replaces this value only after the complete draft saves.</small>
            </label>
            <label className={styles.fullField}>Image alternative text<input defaultValue={service.imageAlt} maxLength={180} minLength={8} name="imageAlt" required /></label>
            <label className={styles.field}>Ideal for, one per line<textarea defaultValue={service.idealFor.join("\n")} name="idealFor" /></label>
            <label className={styles.field}>Highlights, one per line<textarea defaultValue={service.highlights.join("\n")} name="highlights" /></label>
            <label className={styles.fullField}>Booking note<textarea defaultValue={service.bookingNotice} maxLength={500} name="bookingNotice" /></label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Treatment image gallery</h2>
            <p>Arrange up to ten images, write accessible descriptions and choose the focal area used by the public 16:9 slider.</p>
          </header>
          <ServiceGalleryEditor
            cloudinaryOwnership={cloudinaryOwnership}
            images={galleryImages}
            onChange={(nextImages) => {
              setGalleryImages(nextImages);
              markDirty();
            }}
            onPreparationBusyChange={(imageId, isBusy) =>
              setGalleryPreparationBusy((current) =>
                updateBusyImageMap(current, imageId, isBusy),
              )
            }
            onPreparedImageChange={(imageId, nextImage) => {
              setPreparedGalleryImages((current) =>
                updatePreparedImageMap(current, imageId, nextImage),
              );
              markDirty();
            }}
            preparedImages={preparedGalleryImages}
            serviceSlug={service.slug}
          />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}><h2>Search appearance & status</h2><p>Keep the title clear and locally relevant without repeating keywords unnaturally.</p></header>
          <div className={styles.grid}>
            <label className={styles.field}>Status<select defaultValue={service.status} name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
            <span />
            <SeoEditorFields description={service.seoDescription} title={service.seoTitle} />
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
              role={saveState === "error" ? "alert" : saveState === "uploading" || saveState === "saving" ? "status" : undefined}
            >
              {message}
            </span>
          ) : preparationBusy ? (
            "Preparing an image on this device…"
          ) : (
            `Draft version ${version}${dirty ? " · unsaved changes" : ""}`
          )}
        </span>
        <button disabled={locked} type="submit">
          {saveState === "uploading"
            ? "Uploading…"
            : saveState === "saving"
              ? "Saving…"
              : isNew
                ? "Create treatment draft"
                : "Save treatment"}
        </button>
      </div>
    </form>
  );
}
