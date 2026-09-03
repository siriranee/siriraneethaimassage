"use client";

import {
  ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { CmsImageUploadField } from "@/components/cms/CmsImageUploadField";
import type { CmsServicePrice, CmsServiceRecord } from "@/domain/cms/types";
import type { PreparedClientImage } from "@/lib/media/client-image";
import {
  isApprovedImageUrlForOwnership,
  type CloudinaryDeliveryOwnership,
} from "@/lib/media/cloudinary-delivery";
import {
  createCmsMediaSubmissionEnvelope,
  createCmsMediaSubmissionId,
  parseCmsMediaServerRollbackSummary,
  rollbackStagedCmsMediaAssets,
  selectCmsMediaRollbackRetryAssets,
  uploadCmsMediaSequentially,
  type CmsMediaServerRollbackSummary,
  type CmsMediaUploadItem,
  type CmsStagedMediaAsset,
} from "@/lib/media/cms-media-client";
import { ServiceGalleryEditor } from "./ServiceGalleryEditor";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./ServiceEditorForm.module.css";

type SaveState = "idle" | "uploading" | "saving" | "saved" | "error";
type PreparedImageMap = Record<string, PreparedClientImage | undefined>;
type BusyImageMap = Record<string, boolean | undefined>;
type FieldErrors = Readonly<Record<string, string>>;
type SaveRequestState =
  | "not-started"
  | "ambiguous"
  | "definite-failure"
  | "succeeded";

type ServiceSaveResponse = Readonly<{
  error?: unknown;
  fields?: unknown;
  service?: CmsServiceRecord;
  mediaCommitState?: unknown;
  mediaRollback?: unknown;
}>;

const MAX_PRICE_OPTIONS = 8;
const MAX_GUIDANCE_ITEMS = 8;
const MAX_GUIDANCE_ITEM_LENGTH = 160;
const AMBIGUOUS_SAVE_MESSAGE =
  "The save response could not be confirmed. For safety, uploaded images were not deleted. Reload the services list and verify this treatment before trying again.";
const CLEANUP_FAILED_MESSAGE =
  " Cleanup could not be confirmed. Stop here and ask an administrator to reconcile media cleanup before selecting replacement images.";
const CLEANUP_PENDING_MESSAGE =
  " Uploaded images were removed, but a final safety sweep is still pending. Stop here and ask an administrator to reconcile media cleanup before selecting replacement images.";
const PROTECTED_MEDIA_MESSAGE =
  " Some uploaded images are already committed or referenced, so they were not deleted. Reload the services list and verify this treatment before trying again.";

class ServiceSaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
    this.name = "ServiceSaveError";
  }
}

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listIssue(value: string, label: string) {
  const items = lines(value);
  if (items.length > MAX_GUIDANCE_ITEMS) {
    return `${label} can contain up to ${MAX_GUIDANCE_ITEMS} lines.`;
  }
  if (items.some((item) => item.length > MAX_GUIDANCE_ITEM_LENGTH)) {
    return `Each ${label.toLowerCase()} line can contain up to ${MAX_GUIDANCE_ITEM_LENGTH} characters.`;
  }
  return "";
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

function safeMessage(value: unknown) {
  const candidate = value instanceof Error ? value.message : value;
  if (
    typeof candidate === "string" &&
    candidate.trim().length >= 3 &&
    candidate.trim().length <= 240 &&
    !/[<>\r\n]/.test(candidate)
  ) {
    return candidate.trim();
  }
  return "The treatment could not be saved. Please try again.";
}

function safeFieldErrors(value: unknown): FieldErrors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, message]) =>
          key.length <= 100 &&
          typeof message === "string" &&
          message.trim().length > 0 &&
          message.length <= 240 &&
          !/[<>\r\n]/.test(message),
      )
      .map(([key, message]) => [key, String(message).trim()]),
  );
}

function isCmsServiceRecord(value: unknown): value is CmsServiceRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const stringFields = [
    "id",
    "slug",
    "name",
    "shortDescription",
    "longDescription",
    "imageUrl",
    "imageAlt",
    "priceNote",
    "seoTitle",
    "seoDescription",
    "createdAt",
    "updatedAt",
  ];
  const hero = candidate.hero as Record<string, unknown> | null;
  const validPrice = (price: unknown) => {
    if (!price || typeof price !== "object" || Array.isArray(price)) return false;
    const item = price as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      Number.isFinite(item.durationMinutes) &&
      Number.isFinite(item.priceCents) &&
      typeof item.active === "boolean"
    );
  };
  const validGalleryImage = (image: unknown) => {
    if (!image || typeof image !== "object" || Array.isArray(image)) return false;
    const item = image as Record<string, unknown>;
    return ["id", "imageUrl", "altText", "caption"].every(
      (field) => typeof item[field] === "string",
    );
  };

  return (
    stringFields.every((field) => typeof candidate[field] === "string") &&
    Number.isInteger(candidate.version) &&
    Boolean(
      hero &&
        typeof hero.imageUrl === "string" &&
        typeof hero.altText === "string",
    ) &&
    Array.isArray(candidate.galleryImages) &&
    candidate.galleryImages.every(validGalleryImage) &&
    Array.isArray(candidate.prices) &&
    candidate.prices.every(validPrice) &&
    Array.isArray(candidate.idealFor) &&
    candidate.idealFor.every((item) => typeof item === "string") &&
    Array.isArray(candidate.highlights) &&
    candidate.highlights.every((item) => typeof item === "string")
  );
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: "Treatment name",
    slug: "URL slug",
    shortDescription: "Short description",
    longDescription: "Full description",
    imageUrl: "Catalogue image",
    imageAlt: "Catalogue image description",
    hero: "Hero image",
    "hero.imageUrl": "Hero image",
    "hero.altText": "Hero image description",
    prices: "Appointment options",
    priceNote: "Price note",
    idealFor: "Ideal for",
    highlights: "What to expect",
    galleryImages: "Treatment gallery",
    seoTitle: "SEO title",
    seoDescription: "SEO description",
  };
  if (labels[field]) return labels[field];
  const priceMatch = /^prices\.(\d+)\.(durationMinutes|priceCents|active)$/.exec(field);
  if (priceMatch) {
    const part = priceMatch[2] === "durationMinutes" ? "duration" : priceMatch[2] === "priceCents" ? "price" : "availability";
    return `Appointment option ${Number(priceMatch[1]) + 1} ${part}`;
  }
  const galleryMatch = /^galleryImages\.(\d+)\./.exec(field);
  if (galleryMatch) return `Gallery image ${Number(galleryMatch[1]) + 1}`;
  return field.replaceAll(".", " ");
}

function PreviewImage({
  preparedImage,
  src,
}: Readonly<{
  preparedImage: PreparedClientImage | null;
  src: string;
}>) {
  const objectUrlRef = useRef<string | null>(null);
  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);
  const setPreviewNode = useCallback((node: HTMLImageElement | null) => {
    if (!node) {
      releaseObjectUrl();
      return;
    }
    releaseObjectUrl();
    if (preparedImage) {
      objectUrlRef.current = URL.createObjectURL(preparedImage.file);
      node.src = objectUrlRef.current;
    } else {
      node.src = src;
    }
  }, [preparedImage, releaseObjectUrl, src]);
  useEffect(() => releaseObjectUrl, [releaseObjectUrl]);

  // A local blob preview cannot use the Next.js image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" ref={setPreviewNode} />;
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
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const saveLockRef = useRef(false);
  const [version, setVersion] = useState(service.version);
  const [imageUrl, setImageUrl] = useState(service.imageUrl);
  const [heroImageUrl, setHeroImageUrl] = useState(service.hero.imageUrl);
  const [heroAltText, setHeroAltText] = useState(service.hero.altText);
  const [priceRows, setPriceRows] = useState<readonly CmsServicePrice[]>(service.prices);
  const [idealFor, setIdealFor] = useState(service.idealFor.join("\n"));
  const [highlights, setHighlights] = useState(service.highlights.join("\n"));
  const [galleryImages, setGalleryImages] = useState(service.galleryImages);
  const [seoTitle, setSeoTitle] = useState(service.seoTitle);
  const [seoDescription, setSeoDescription] = useState(service.seoDescription);
  const [preparedCover, setPreparedCover] = useState<PreparedClientImage | null>(null);
  const [preparedHero, setPreparedHero] = useState<PreparedClientImage | null>(null);
  const [preparedGalleryImages, setPreparedGalleryImages] = useState<PreparedImageMap>({});
  const [coverPreparationBusy, setCoverPreparationBusy] = useState(false);
  const [heroPreparationBusy, setHeroPreparationBusy] = useState(false);
  const [galleryPreparationBusy, setGalleryPreparationBusy] = useState<BusyImageMap>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hasConflict, setHasConflict] = useState(false);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const persistedHeroPreview = isApprovedImageUrlForOwnership(heroImageUrl, cloudinaryOwnership) ? heroImageUrl : "";
  const persistedCoverPreview = isApprovedImageUrlForOwnership(imageUrl, cloudinaryOwnership) ? imageUrl : "";
  const hasHeroPreview = Boolean(preparedHero || persistedHeroPreview);
  const hasCataloguePreview = Boolean(preparedCover || persistedCoverPreview);
  const preparationBusy = coverPreparationBusy || heroPreparationBusy || Object.values(galleryPreparationBusy).some(Boolean);
  const saving = saveState === "uploading" || saveState === "saving";
  const locked = saving || preparationBusy;

  function errorFor(...fields: string[]) {
    for (const field of fields) if (fieldErrors[field]) return fieldErrors[field];
    return "";
  }

  function clearFieldErrors(...fields: string[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of fields) {
        for (const key of Object.keys(next)) {
          if (key === field || key.startsWith(`${field}.`)) {
            delete next[key];
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }

  function handleFormChange(event: FormEvent<HTMLFormElement>) {
    markDirty();
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const group = target.name.startsWith("hero.")
      ? "hero"
      : target.name.startsWith("prices.")
        ? "prices"
        : target.name.startsWith("galleryImages.")
          ? "galleryImages"
          : "";
    clearFieldErrors(target.name, ...(group ? [group] : []));
  }

  function focusField(field: string) {
    const form = formRef.current;
    if (!form) return;
    const exact = Array.from(form.elements).find(
      (element) => "name" in element && element.name === field,
    );
    const group =
      field === "hero" || field.startsWith("hero.")
        ? form.querySelector<HTMLElement>("[data-error-group='hero'] input, [data-error-group='hero'] button")
        : field === "prices" || field.startsWith("prices.")
          ? form.querySelector<HTMLElement>("[data-error-group='prices'] input, [data-error-group='prices'] button")
          : field === "galleryImages" || field.startsWith("galleryImages.")
            ? form.querySelector<HTMLElement>("[data-error-group='galleryImages'] input, [data-error-group='galleryImages'] button")
            : null;
    const target = exact instanceof HTMLElement ? exact : group;
    target?.focus();
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showSaveError(error: ServiceSaveError) {
    setSaveState("error");
    setMessage(error.message);
    setFieldErrors(error.fields);
    setHasConflict(error.status === 409);
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  function changePriceRows(nextRows: readonly CmsServicePrice[]) {
    setPriceRows(nextRows);
    markDirty();
    clearFieldErrors("prices");
  }

  function addPrice() {
    if (priceRows.length >= MAX_PRICE_OPTIONS) return;
    const lastDuration = Math.max(30, ...priceRows.map((price) => price.durationMinutes));
    changePriceRows([
      ...priceRows,
      {
        id: `new-${crypto.randomUUID()}`,
        durationMinutes: Math.min(240, lastDuration + 30),
        priceCents: 6500,
        active: true,
      },
    ]);
  }

  function removePrice(index: number) {
    if (priceRows.length === 1) return;
    changePriceRows(priceRows.filter((_, rowIndex) => rowIndex !== index));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saveLockRef.current || preparationBusy) return;
    const data = new FormData(form);
    const durations = priceRows.map((_, index) => Number(data.get(`prices.${index}.durationMinutes`)));
    for (const [index] of priceRows.entries()) {
      const input = form.elements.namedItem(`prices.${index}.durationMinutes`);
      if (input instanceof HTMLInputElement) input.setCustomValidity("");
    }
    durations.forEach((duration, index) => {
      if (durations.indexOf(duration) !== index) {
        const input = form.elements.namedItem(`prices.${index}.durationMinutes`);
        if (input instanceof HTMLInputElement) input.setCustomValidity("Each appointment option needs a unique duration.");
      }
    });
    const idealForInput = form.elements.namedItem("idealFor");
    const highlightsInput = form.elements.namedItem("highlights");
    if (idealForInput instanceof HTMLTextAreaElement) idealForInput.setCustomValidity(listIssue(idealFor, "Ideal for"));
    if (highlightsInput instanceof HTMLTextAreaElement) highlightsInput.setCustomValidity(listIssue(highlights, "What to expect"));
    const mediaErrors: Record<string, string> = {};
    if (!imageUrl && !preparedCover) {
      mediaErrors.imageUrl = "Choose a catalogue image.";
    }
    if (!heroImageUrl && !preparedHero) {
      mediaErrors["hero.imageUrl"] = "Choose a hero image.";
    }
    galleryImages.forEach((image, index) => {
      if (!image.imageUrl && !preparedGalleryImages[image.id]) {
        mediaErrors[`galleryImages.${index}.imageUrl`] =
          `Choose a file for gallery image ${index + 1}.`;
      }
    });
    if (!form.reportValidity() || Object.keys(mediaErrors).length) {
      const invalid = Array.from(form.elements).filter((element) => element instanceof HTMLElement && "validity" in element && !(element as HTMLInputElement).validity.valid) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
      const errors = {
        ...Object.fromEntries(invalid.filter((element) => element.name).map((element) => [element.name, element.validationMessage])),
        ...mediaErrors,
      };
      showSaveError(new ServiceSaveError("Please check the highlighted fields.", 422, errors));
      return;
    }

    saveLockRef.current = true;
    setFieldErrors({});
    setHasConflict(false);
    const prices = priceRows.map((price, index) => ({
      id: price.id,
      durationMinutes: Number(data.get(`prices.${index}.durationMinutes`)),
      priceCents: Math.round(Number(data.get(`prices.${index}.priceCents`)) * 100),
      active: data.get(`prices.${index}.active`) === "on",
    }));
    const uploadItems: CmsMediaUploadItem[] = [];
    if (preparedCover) uploadItems.push({ key: "service-cover", scope: "service-cover", image: preparedCover });
    if (preparedHero) uploadItems.push({ key: "service-hero", scope: "service-cover", image: preparedHero });
    for (const image of galleryImages) {
      const preparedImage = preparedGalleryImages[image.id];
      if (preparedImage) uploadItems.push({ key: `service-gallery:${image.id}`, scope: "service-gallery", image: preparedImage });
    }

    let submissionId: string | null = null;
    let stagedAssets: readonly CmsStagedMediaAsset[] = [];
    let requestState: SaveRequestState = "not-started";
    let serverRollback: CmsMediaServerRollbackSummary | null = null;
    try {
      const uploadedByKey = new Map<string, CmsStagedMediaAsset>();
      if (uploadItems.length) {
        submissionId = createCmsMediaSubmissionId();
        setSaveState("uploading");
        setMessage(`Preparing ${uploadItems.length} image${uploadItems.length === 1 ? "" : "s"} for upload…`);
        const uploaded = await uploadCmsMediaSequentially({
          submissionId,
          items: uploadItems,
          rollbackCompletedOnError: false,
          onStaged: ({ asset }) => {
            stagedAssets = [...stagedAssets, asset];
          },
          onProgress: ({ itemCount, itemIndex, overallPercent, stage }) => {
            const action = stage === "authorizing" ? "Authorizing" : stage === "verifying" ? "Verifying" : "Uploading";
            setMessage(`${action} image ${itemIndex + 1} of ${itemCount} · ${overallPercent}%`);
          },
        });
        for (const result of uploaded) uploadedByKey.set(result.key, result.asset);
        stagedAssets = uploaded.map(({ asset }) => asset);
      }

      const nextImageUrl = uploadedByKey.get("service-cover")?.secureUrl ?? imageUrl;
      const nextHeroImageUrl = uploadedByKey.get("service-hero")?.secureUrl ?? heroImageUrl;
      const nextGalleryImages = galleryImages.map((image) => ({
        ...image,
        imageUrl: uploadedByKey.get(`service-gallery:${image.id}`)?.secureUrl ?? image.imageUrl,
      }));
      const payload = {
        expectedVersion: version,
        slug: data.get("slug"),
        name: data.get("name"),
        shortDescription: data.get("shortDescription"),
        longDescription: data.get("longDescription"),
        imageUrl: nextImageUrl,
        imageAlt: data.get("imageAlt"),
        hero: {
          imageUrl: nextHeroImageUrl,
          altText: data.get("hero.altText"),
        },
        galleryImages: nextGalleryImages,
        prices,
        idealFor: lines(data.get("idealFor")),
        highlights: lines(data.get("highlights")),
        priceNote: data.get("priceNote"),
        seoTitle: data.get("seoTitle"),
        seoDescription: data.get("seoDescription"),
        ...(submissionId && stagedAssets.length ? { mediaSubmission: createCmsMediaSubmissionEnvelope(submissionId, stagedAssets) } : {}),
      };

      setSaveState("saving");
      setMessage("Saving and publishing treatment…");
      requestState = "ambiguous";
      const response = await fetch(isNew ? "/api/cms/services" : `/api/cms/services/${service.id}`, {
        method: isNew ? "POST" : "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) requestState = "definite-failure";
      const result = (await response.json().catch(() => ({}))) as ServiceSaveResponse;
      if (!response.ok) {
        if (result.mediaCommitState === "indeterminate") {
          requestState = "ambiguous";
          throw new ServiceSaveError(AMBIGUOUS_SAVE_MESSAGE, response.status);
        }
        serverRollback = submissionId
          ? parseCmsMediaServerRollbackSummary(
              result.mediaRollback,
              submissionId,
              stagedAssets,
            )
          : null;
        throw new ServiceSaveError(
          safeMessage(result.error),
          response.status,
          safeFieldErrors(result.fields),
        );
      }
      if (!isCmsServiceRecord(result.service)) {
        throw new ServiceSaveError(AMBIGUOUS_SAVE_MESSAGE, 0);
      }
      requestState = "succeeded";

      setVersion(result.service.version);
      setImageUrl(result.service.imageUrl);
      setHeroImageUrl(result.service.hero.imageUrl);
      setHeroAltText(result.service.hero.altText);
      setGalleryImages(result.service.galleryImages);
      setPriceRows(result.service.prices);
      setPreparedCover(null);
      setPreparedHero(null);
      setPreparedGalleryImages({});
      setGalleryPreparationBusy({});
      markSaved();
      setSaveState("saved");
      setMessage(isNew ? "Treatment created and published." : "Treatment saved and published.");
      if (isNew) router.push(`/cms/services/${result.service.id}/edit`);
      router.refresh();
    } catch (error) {
      if (requestState === "ambiguous" || requestState === "succeeded") {
        showSaveError(new ServiceSaveError(AMBIGUOUS_SAVE_MESSAGE, 0));
        return;
      }
      let cleanupFailed = false;
      let cleanupPending = Boolean(
        serverRollback?.items.some((item) => item.pendingFinalSweep),
      );
      const protectedMedia = Boolean(
        serverRollback?.items.some((item) => item.outcome === "protected"),
      );
      const retryAssets = requestState === "definite-failure"
        ? selectCmsMediaRollbackRetryAssets(stagedAssets, serverRollback)
        : stagedAssets;
      if (submissionId && retryAssets.length) {
        setMessage("Removing temporary uploads…");
        try {
          const rollback = await rollbackStagedCmsMediaAssets(
            submissionId,
            retryAssets,
          );
          cleanupFailed = rollback.failed > 0;
          cleanupPending ||= rollback.pendingFinalSweep > 0;
        } catch {
          cleanupFailed = true;
        }
      }
      const saveError = error instanceof ServiceSaveError ? error : new ServiceSaveError(safeMessage(error), 0);
      if (
        protectedMedia &&
        !saveError.message.includes("already committed or referenced")
      ) {
        saveError.message += PROTECTED_MEDIA_MESSAGE;
      }
      if (
        cleanupFailed &&
        !saveError.message.includes("Cleanup could not be confirmed")
      ) {
        saveError.message += CLEANUP_FAILED_MESSAGE;
      } else if (
        cleanupPending &&
        !saveError.message.includes("final safety sweep is still pending")
      ) {
        saveError.message += CLEANUP_PENDING_MESSAGE;
      }
      showSaveError(saveError);
      if (saveError.status === 401) router.push("/cms/login");
    } finally {
      saveLockRef.current = false;
    }
  }

  return (
    <form
      aria-busy={locked}
      className={`${styles.form} ${locked ? styles.formBusy : ""}`}
      onChange={handleFormChange}
      onSubmit={save}
      ref={formRef}
    >
      {saveState === "error" ? (
        <div
          aria-labelledby={`${formId}-error-title`}
          className={styles.errorSummary}
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <h2 id={`${formId}-error-title`}>{hasConflict ? "This treatment changed elsewhere" : "Check this treatment"}</h2>
          <p>{message}</p>
          {Object.keys(fieldErrors).length ? (
            <ul>
              {Object.entries(fieldErrors).map(([field, error]) => (
                <li key={field}>
                  <button onClick={() => focusField(field)} type="button">
                    <strong>{fieldLabel(field)}:</strong> {error}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {hasConflict ? (
            <button className={styles.conflictAction} onClick={() => window.location.reload()} type="button">
              <RefreshCw aria-hidden="true" />
              Reload latest treatment
            </button>
          ) : null}
        </div>
      ) : null}

      <fieldset className={styles.formFields} disabled={locked}>
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>1</span><h2>Basics &amp; URL</h2></div>
            <p>Set the public name, menu summary and permanent page address.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.field}>
              Treatment name
              <input aria-invalid={Boolean(errorFor("name"))} defaultValue={service.name} maxLength={100} minLength={2} name="name" required />
              {errorFor("name") ? <small className={styles.fieldError}>{errorFor("name")}</small> : null}
            </label>
            <label className={styles.field}>
              URL slug
              {isNew ? (
                <input aria-invalid={Boolean(errorFor("slug"))} defaultValue={service.slug} maxLength={100} minLength={2} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="hot-oil-massage" required />
              ) : (
                <><input name="slug" type="hidden" value={service.slug} /><span className={styles.readOnly}>/services/{service.slug}</span></>
              )}
              <small>Lowercase letters, numbers and hyphens only. Existing URLs stay fixed.</small>
              {errorFor("slug") ? <small className={styles.fieldError}>{errorFor("slug")}</small> : null}
            </label>
            <label className={styles.fullField}>
              Short description
              <textarea aria-invalid={Boolean(errorFor("shortDescription"))} defaultValue={service.shortDescription} maxLength={300} minLength={20} name="shortDescription" required rows={3} />
              <small>Used on treatment cards and near the top of the public page.</small>
              {errorFor("shortDescription") ? <small className={styles.fieldError}>{errorFor("shortDescription")}</small> : null}
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>2</span><h2>Hero &amp; catalogue media</h2></div>
            <p>The wide hero leads the treatment page. The catalogue image appears in service listings.</p>
          </header>
          <div className={styles.mediaStack}>
            <div className={styles.mediaBlock} data-error-group="hero">
              <div className={styles.subsectionHeader}>
                <div><h3>Page hero</h3><p>Preview the centred crop at desktop and mobile proportions before saving.</p></div>
                <span>Public page</span>
              </div>
              {errorFor("hero", "hero.imageUrl") ? <p className={styles.groupError}>{errorFor("hero", "hero.imageUrl")}</p> : null}
              <div className={styles.mediaColumns}>
                <div className={styles.mediaFields}>
                  <CmsImageUploadField
                    description="Choose a high-resolution landscape image. It is prepared locally and uploaded only when this treatment is saved."
                    disabled={locked}
                    inputId={`${formId}-hero-upload`}
                    label="Hero image"
                    onBusyChange={setHeroPreparationBusy}
                    onPreparedImageChange={(image) => {
                      setPreparedHero(image);
                      markDirty();
                      clearFieldErrors("hero", "hero.imageUrl");
                    }}
                    preparedImage={preparedHero}
                    required={!heroImageUrl && !preparedHero}
                  />
                  <label className={styles.field}>
                    Hero image description
                    <input aria-invalid={Boolean(errorFor("hero.altText"))} maxLength={180} minLength={8} name="hero.altText" onChange={(event) => setHeroAltText(event.target.value)} required value={heroAltText} />
                    <small>Describe what is visible for screen readers and search engines.</small>
                    {errorFor("hero.altText") ? <small className={styles.fieldError}>{errorFor("hero.altText")}</small> : null}
                  </label>
                </div>
                <div className={styles.heroPreviewGrid}>
                  <figure className={styles.previewFigure}>
                    <div className={`${styles.previewFrame} ${styles.desktopHeroFrame}`}>
                      {hasHeroPreview ? <PreviewImage preparedImage={preparedHero} src={persistedHeroPreview} /> : <div className={styles.previewEmpty}><ImageIcon aria-hidden="true" /><span>Choose a hero image</span></div>}
                    </div>
                    <figcaption>Desktop preview · 3:1 crop</figcaption>
                  </figure>
                  <figure className={styles.previewFigure}>
                    <div className={`${styles.previewFrame} ${styles.mobileHeroFrame}`}>
                      {hasHeroPreview ? <PreviewImage preparedImage={preparedHero} src={persistedHeroPreview} /> : <div className={styles.previewEmpty}><ImageIcon aria-hidden="true" /><span>Mobile crop</span></div>}
                    </div>
                    <figcaption>Mobile preview · 3:4 crop</figcaption>
                  </figure>
                </div>
              </div>
            </div>

            <div className={styles.mediaBlock}>
              <div className={styles.subsectionHeader}>
                <div><h3>Catalogue image</h3><p>Use a clear, welcoming image that remains readable in a compact card.</p></div>
                <span>Listings</span>
              </div>
              {errorFor("imageUrl") ? <p className={styles.groupError}>{errorFor("imageUrl")}</p> : null}
              <div className={styles.mediaColumns}>
                <div className={styles.mediaFields}>
                  <CmsImageUploadField
                    disabled={locked}
                    inputId={`${formId}-cover-upload`}
                    label="Catalogue image"
                    onBusyChange={setCoverPreparationBusy}
                    onPreparedImageChange={(image) => {
                      setPreparedCover(image);
                      markDirty();
                      clearFieldErrors("imageUrl");
                    }}
                    preparedImage={preparedCover}
                    required={!imageUrl && !preparedCover}
                  />
                  <label className={styles.field}>
                    Catalogue image description
                    <input aria-invalid={Boolean(errorFor("imageAlt"))} defaultValue={service.imageAlt} maxLength={180} minLength={8} name="imageAlt" required />
                    {errorFor("imageAlt") ? <small className={styles.fieldError}>{errorFor("imageAlt")}</small> : null}
                  </label>
                </div>
                <figure className={`${styles.previewFigure} ${styles.cataloguePreview}`}>
                  <div className={`${styles.previewFrame} ${styles.catalogueFrame}`}>
                    {hasCataloguePreview ? <PreviewImage preparedImage={preparedCover} src={persistedCoverPreview} /> : <div className={styles.previewEmpty}><ImageIcon aria-hidden="true" /><span>Choose a catalogue image</span></div>}
                  </div>
                  <figcaption>Catalogue card preview · 4:3 crop</figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>3</span><h2>Appointment options</h2></div>
            <p>Set bookable durations and euro prices. Existing bookings keep their saved price.</p>
          </header>
          <div data-error-group="prices">
            <div className={styles.listHeader}>
              <p><strong>{priceRows.length} of {MAX_PRICE_OPTIONS}</strong> options</p>
              <button className={styles.secondaryButton} disabled={priceRows.length >= MAX_PRICE_OPTIONS} onClick={addPrice} type="button">
                <Plus aria-hidden="true" /> Add option
              </button>
            </div>
            {errorFor("prices") ? <p className={styles.groupError}>{errorFor("prices")}</p> : null}
            <div className={styles.priceList}>
              {priceRows.map((price, index) => (
                <fieldset className={styles.priceRow} key={price.id}>
                  <legend>Appointment option {index + 1}</legend>
                  <div className={styles.priceFields}>
                    <label className={styles.field}>
                      Duration, minutes
                      <input aria-invalid={Boolean(errorFor(`prices.${index}.durationMinutes`))} defaultValue={price.durationMinutes} max={240} min={15} name={`prices.${index}.durationMinutes`} required step={5} type="number" />
                      {errorFor(`prices.${index}.durationMinutes`) ? <small className={styles.fieldError}>{errorFor(`prices.${index}.durationMinutes`)}</small> : null}
                    </label>
                    <label className={styles.field}>
                      Price, €
                      <input aria-invalid={Boolean(errorFor(`prices.${index}.priceCents`))} defaultValue={(price.priceCents / 100).toFixed(2)} max={1000} min={1} name={`prices.${index}.priceCents`} required step="0.01" type="number" />
                      {errorFor(`prices.${index}.priceCents`) ? <small className={styles.fieldError}>{errorFor(`prices.${index}.priceCents`)}</small> : null}
                    </label>
                    <label className={styles.checkbox}>
                      <input aria-invalid={Boolean(errorFor(`prices.${index}.active`))} defaultChecked={price.active} name={`prices.${index}.active`} type="checkbox" />
                      <span>Available to book<small>Turn off to keep it in history without showing it publicly.</small></span>
                    </label>
                  </div>
                  <div className={styles.priceActions}>
                    <button aria-label={`Remove appointment option ${index + 1}`} className={styles.removeButton} disabled={priceRows.length === 1} onClick={() => removePrice(index)} type="button"><Trash2 aria-hidden="true" /> Remove</button>
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
          <div className={styles.grid}>
            <label className={styles.fullField}>
              Price note <span className={styles.optional}>Optional</span>
              <input aria-invalid={Boolean(errorFor("priceNote"))} defaultValue={service.priceNote} maxLength={300} name="priceNote" placeholder="For example: All prices include consultation time." />
              <small>Shown beside prices when visitors may need clarification.</small>
              {errorFor("priceNote") ? <small className={styles.fieldError}>{errorFor("priceNote")}</small> : null}
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>4</span><h2>Public description &amp; guidance</h2></div>
            <p>Explain the treatment clearly, then add short scannable visitor guidance.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.fullField}>
              Full description
              <textarea aria-invalid={Boolean(errorFor("longDescription"))} className={styles.largeTextarea} defaultValue={service.longDescription} maxLength={2000} minLength={40} name="longDescription" required rows={8} />
              {errorFor("longDescription") ? <small className={styles.fieldError}>{errorFor("longDescription")}</small> : null}
            </label>
            <label className={styles.field}>
              Ideal for <span className={styles.optional}>One item per line</span>
              <textarea
                aria-invalid={Boolean(errorFor("idealFor"))}
                name="idealFor"
                onChange={(event) => {
                  event.currentTarget.setCustomValidity("");
                  setIdealFor(event.target.value);
                }}
                rows={7}
                value={idealFor}
              />
              <small>{lines(idealFor).length} of {MAX_GUIDANCE_ITEMS} lines · {MAX_GUIDANCE_ITEM_LENGTH} characters per line</small>
              {errorFor("idealFor") ? <small className={styles.fieldError}>{errorFor("idealFor")}</small> : null}
            </label>
            <label className={styles.field}>
              What to expect <span className={styles.optional}>One item per line</span>
              <textarea
                aria-invalid={Boolean(errorFor("highlights"))}
                name="highlights"
                onChange={(event) => {
                  event.currentTarget.setCustomValidity("");
                  setHighlights(event.target.value);
                }}
                rows={7}
                value={highlights}
              />
              <small>{lines(highlights).length} of {MAX_GUIDANCE_ITEMS} lines · {MAX_GUIDANCE_ITEM_LENGTH} characters per line</small>
              {errorFor("highlights") ? <small className={styles.fieldError}>{errorFor("highlights")}</small> : null}
            </label>
          </div>
        </section>

        <section className={styles.section} data-error-group="galleryImages">
          <header className={styles.sectionHeader}>
            <div><span>5</span><h2>Treatment gallery</h2></div>
            <p>Add optional supporting images in their public display order.</p>
          </header>
          {Object.entries(fieldErrors).find(([field]) => field === "galleryImages" || field.startsWith("galleryImages."))?.[1] ? (
            <p className={styles.groupError}>{Object.entries(fieldErrors).find(([field]) => field === "galleryImages" || field.startsWith("galleryImages."))?.[1]}</p>
          ) : null}
          <ServiceGalleryEditor
            cloudinaryOwnership={cloudinaryOwnership}
            images={galleryImages}
            onChange={(images) => {
              setGalleryImages(images);
              markDirty();
              clearFieldErrors("galleryImages");
            }}
            onPreparationBusyChange={(imageId, isBusy) => setGalleryPreparationBusy((current) => updateBusyImageMap(current, imageId, isBusy))}
            onPreparedImageChange={(imageId, image) => {
              setPreparedGalleryImages((current) => updatePreparedImageMap(current, imageId, image));
              markDirty();
              clearFieldErrors("galleryImages");
            }}
            preparedImages={preparedGalleryImages}
          />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>6</span><h2>Search appearance</h2></div>
            <p>Prepare the title and description shown to search engines.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.fullField}>
              SEO title
              <input aria-invalid={Boolean(errorFor("seoTitle"))} maxLength={70} minLength={10} name="seoTitle" onChange={(event) => setSeoTitle(event.target.value)} required value={seoTitle} />
              <small>{seoTitle.length} of 70 characters</small>
              {errorFor("seoTitle") ? <small className={styles.fieldError}>{errorFor("seoTitle")}</small> : null}
            </label>
            <label className={styles.fullField}>
              SEO description
              <textarea aria-invalid={Boolean(errorFor("seoDescription"))} maxLength={170} minLength={40} name="seoDescription" onChange={(event) => setSeoDescription(event.target.value)} required rows={4} value={seoDescription} />
              <small>{seoDescription.length} of 170 characters</small>
              {errorFor("seoDescription") ? <small className={styles.fieldError}>{errorFor("seoDescription")}</small> : null}
            </label>
            <div aria-label="Search result preview" className={styles.seoPreview} role="group">
              <span>siriraneethaimassage.ie/services/{service.slug || "your-treatment"}</span>
              <strong>{seoTitle || service.name || "Treatment title"}</strong>
              <p>{seoDescription || "Your search description preview will appear here."}</p>
            </div>
          </div>
        </section>
      </fieldset>
      <div className={styles.saveBar}>
        <div aria-live="polite">
          {message ? (
            <span className={saveState === "saved" ? styles.success : saveState === "error" ? styles.error : styles.progressStatus}>{message}</span>
          ) : (
            <span>{dirty ? "Unsaved changes" : "Treatment is up to date"}</span>
          )}
        </div>
        <button className={styles.primaryAction} disabled={locked} type="submit">
          <Save aria-hidden="true" />
          {saving ? "Saving…" : isNew ? "Create and publish" : "Save and publish"}
        </button>
      </div>
    </form>
  );
}
