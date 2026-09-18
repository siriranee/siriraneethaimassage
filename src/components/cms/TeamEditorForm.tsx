"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
} from "react";

import type {
  CmsTeamEditorRecord,
  CmsTherapistDeletionImpact,
} from "@/domain/cms/types";
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
  type CmsStagedMediaAsset,
} from "@/lib/media/cms-media-client";
import { CmsImageUploadField } from "./CmsImageUploadField";
import {
  getTeamSaveErrorMessage,
  TEAM_SAVE_AMBIGUOUS_MESSAGE,
  TeamSaveError,
  type TeamSaveRequestState,
} from "./team-save-feedback";
import { useUnsavedChanges } from "./useUnsavedChanges";

import styles from "./CmsEditorForm.module.css";
import teamStyles from "./TeamEditorForm.module.css";

type ServiceOption = Readonly<{ id: string; name: string }>;
type FieldErrors = Readonly<Record<string, string>>;
type TeamSaveResponse = Readonly<{
  error?: unknown;
  fields?: unknown;
  member?: unknown;
  mediaCommitState?: unknown;
  mediaRollback?: unknown;
}>;

type TeamDeleteResponse = Readonly<{
  error?: unknown;
  deleted?: unknown;
}>;

const teamFieldOrder = [
  "name",
  "publicRole",
  "slug",
  "fullName",
  "shortBio",
  "imageAlt",
  "serviceIds",
  "notificationEmail",
  "contactPhone",
] as const;

const teamFieldLabels: Readonly<Record<string, string>> = {
  name: "Display name",
  publicRole: "Public role",
  slug: "Booking link name",
  fullName: "Full professional name",
  shortBio: "Short introduction",
  imageAlt: "Portrait description",
  serviceIds: "Treatments offered",
  notificationEmail: "Therapist notification email",
  contactPhone: "Private therapist phone",
};

function normaliseTeamFieldName(name: string) {
  return name === "serviceIds" || name.startsWith("serviceIds.")
    ? "serviceIds"
    : name;
}

function safeFieldErrors(value: unknown): FieldErrors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const errors: Record<string, string> = {};
  for (const [name, message] of Object.entries(value)) {
    if (typeof message !== "string" || !message.trim()) continue;
    const field = normaliseTeamFieldName(name);
    if (!errors[field]) errors[field] = message.trim();
  }
  return errors;
}

function fieldControl(
  form: HTMLFormElement,
  field: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  if (field === "serviceIds") {
    return form.querySelector<HTMLInputElement>('input[name="serviceIds"]');
  }
  const control = form.elements.namedItem(field);
  return control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
    ? control
    : null;
}

function operationalAssignmentEnabled(form: HTMLFormElement) {
  const control = form.elements.namedItem("operationalActive");
  return control instanceof HTMLInputElement && control.checked && !control.disabled;
}

function clientFieldError(form: HTMLFormElement, field: string) {
  if (field === "serviceIds") {
    return operationalAssignmentEnabled(form) &&
      !form.querySelector<HTMLInputElement>('input[name="serviceIds"]:checked')
      ? "Select at least one treatment for an active therapist."
      : "";
  }

  const control = fieldControl(form, field);
  if (!control || control.disabled) return "";
  const value = control.value.trim();
  const required = control.required ||
    (field === "notificationEmail" && operationalAssignmentEnabled(form));
  if (required && !value) return `${teamFieldLabels[field] ?? "This field"} is required.`;
  if (!value) return "";
  if (control.minLength > 0 && value.length < control.minLength) {
    return `Use at least ${control.minLength} characters.`;
  }
  if (control.maxLength > 0 && value.length > control.maxLength) {
    return `Use no more than ${control.maxLength} characters.`;
  }
  if (field === "notificationEmail" && control.validity.typeMismatch) {
    return "Enter a valid therapist notification email.";
  }
  if (field === "slug" && control.validity.patternMismatch) {
    return "Use lowercase letters, numbers and single hyphens.";
  }
  if (field === "contactPhone" && control.validity.patternMismatch) {
    return "Enter at least 7 digits using only spaces, brackets, dots or hyphens between them.";
  }
  return control.validity.valid ? "" : control.validationMessage;
}

function collectClientFieldErrors(form: HTMLFormElement): FieldErrors {
  const errors: Record<string, string> = {};
  for (const field of teamFieldOrder) {
    const message = clientFieldError(form, field);
    if (message) errors[field] = message;
  }
  return errors;
}

function isTeamEditorRecord(value: unknown): value is CmsTeamEditorRecord {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<CmsTeamEditorRecord>;
  return (
    typeof member.id === "string" &&
    typeof member.slug === "string" &&
    typeof member.name === "string" &&
    typeof member.imageUrl === "string" &&
    Array.isArray(member.serviceIds) &&
    typeof member.notificationEmail === "string" &&
    typeof member.contactPhone === "string" &&
    typeof member.version === "number" &&
    typeof member.contactVersion === "number"
  );
}

function isTeamDeletionResult(
  value: unknown,
): value is Readonly<{ memberId: string; bookingCount: number }> {
  if (!value || typeof value !== "object") return false;
  const deleted = value as { memberId?: unknown; bookingCount?: unknown };
  return (
    typeof deleted.memberId === "string" &&
    typeof deleted.bookingCount === "number" &&
    Number.isInteger(deleted.bookingCount) &&
    deleted.bookingCount >= 0
  );
}

export function TeamEditorForm({
  cloudinaryOwnership,
  deletionImpact = { bookingCount: 0, bookingReferences: [] },
  isNew = false,
  member,
  services,
}: Readonly<{
  cloudinaryOwnership?: CloudinaryDeliveryOwnership | null;
  deletionImpact?: CmsTherapistDeletionImpact;
  isNew?: boolean;
  member: CmsTeamEditorRecord;
  services: readonly ServiceOption[];
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const saveLockRef = useRef(false);
  const touchedFieldsRef = useRef(new Set<string>());
  const [version, setVersion] = useState(member.version);
  const [contactVersion, setContactVersion] = useState(member.contactVersion);
  const [imageUrl, setImageUrl] = useState(member.imageUrl);
  const [imageAlt, setImageAlt] = useState(member.imageAlt);
  const [preparedImage, setPreparedImage] = useState<PreparedClientImage | null>(null);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [publicProfile, setPublicProfile] = useState(member.publicProfile);
  const [operationalActive, setOperationalActive] = useState(member.operationalActive);
  const [archived, setArchived] = useState(Boolean(member.archived));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "progress";
    text: string;
  } | null>(null);
  const { dirty, markDirty, markSaved } = useUnsavedChanges();
  const locked = saving || preparationBusy || deleting;
  const savedImageCanPreview = isApprovedImageUrlForOwnership(imageUrl, cloudinaryOwnership);

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  function describedBy(name: string, hintId?: string) {
    return [hintId, fieldError(name) ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  }

  function focusField(name: string) {
    const form = formRef.current;
    if (!form) return;
    const control = fieldControl(form, normaliseTeamFieldName(name));
    if (!control) {
      errorSummaryRef.current?.focus();
      return;
    }
    control.focus();
    control.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function focusErrorSummary() {
    window.requestAnimationFrame(() => {
      errorSummaryRef.current?.focus();
      errorSummaryRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function updateClientFieldError(form: HTMLFormElement, name: string) {
    const field = normaliseTeamFieldName(name);
    if (!teamFieldOrder.includes(field as (typeof teamFieldOrder)[number])) return;
    const message = clientFieldError(form, field);
    setFieldErrors((current) => {
      if (message === (current[field] ?? "")) return current;
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
    setFeedback((current) => current?.tone === "error" ? null : current);
  }

  function validateDependentBookingFields(form: HTMLFormElement) {
    for (const field of ["notificationEmail", "serviceIds"] as const) {
      if (touchedFieldsRef.current.has(field) || fieldErrors[field]) {
        updateClientFieldError(form, field);
      }
    }
  }

  function handleFieldBlur(event: FocusEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const field = normaliseTeamFieldName(target.name);
    if (!field) return;
    touchedFieldsRef.current.add(field);
    updateClientFieldError(event.currentTarget, field);
  }

  function handleFieldChange(event: FormEvent<HTMLFormElement>) {
    markDirty();
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const field = normaliseTeamFieldName(target.name);
    if (field && (touchedFieldsRef.current.has(field) || fieldErrors[field])) {
      updateClientFieldError(event.currentTarget, field);
    }
    if (field === "operationalActive" || field === "archived") {
      window.requestAnimationFrame(() => {
        if (formRef.current) validateDependentBookingFields(formRef.current);
      });
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLockRef.current || preparationBusy) return;
    const form = event.currentTarget;
    const clientErrors = collectClientFieldErrors(form);
    if (Object.keys(clientErrors).length) {
      for (const field of Object.keys(clientErrors)) {
        touchedFieldsRef.current.add(field);
      }
      setFieldErrors(clientErrors);
      setFeedback({
        tone: "error",
        text: "Please correct the highlighted therapist details.",
      });
      focusErrorSummary();
      return;
    }
    const data = new FormData(form);

    saveLockRef.current = true;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    let submissionId: string | null = null;
    let stagedAssets: readonly CmsStagedMediaAsset[] = [];
    let requestState: TeamSaveRequestState = "not-started";
    let serverRollback: CmsMediaServerRollbackSummary | null = null;

    try {
      let nextImageUrl = imageUrl;
      if (preparedImage) {
        submissionId = createCmsMediaSubmissionId();
        setFeedback({ tone: "progress", text: "Uploading therapist portrait…" });
        const uploaded = await uploadCmsMediaSequentially({
          submissionId,
          items: [{ key: "therapist-profile", scope: "therapist-profile", image: preparedImage }],
          rollbackCompletedOnError: false,
          onStaged: ({ asset }) => {
            stagedAssets = [...stagedAssets, asset];
          },
          onProgress: ({ overallPercent, stage }) => {
            const action = stage === "authorizing" ? "Authorizing" : stage === "verifying" ? "Verifying" : "Uploading";
            setFeedback({ tone: "progress", text: `${action} therapist portrait · ${overallPercent}%` });
          },
        });
        const uploadedImage = uploaded[0]?.asset;
        if (!uploadedImage) throw new TeamSaveError("The portrait upload was not confirmed.");
        stagedAssets = [uploadedImage];
        nextImageUrl = uploadedImage.secureUrl;
      }

      const payload = {
        ...(!isNew ? { expectedVersion: version, expectedContactVersion: contactVersion } : {}),
        slug: data.get("slug"),
        name: data.get("name"),
        fullName: data.get("fullName"),
        publicRole: data.get("publicRole"),
        shortBio: data.get("shortBio"),
        imageUrl: nextImageUrl,
        imageAlt: data.get("imageAlt"),
        serviceIds: data.getAll("serviceIds"),
        notificationEmail: data.get("notificationEmail"),
        contactPhone: data.get("contactPhone"),
        publicProfile: data.get("publicProfile") === "on",
        operationalActive: data.get("operationalActive") === "on",
        archived: data.get("archived") === "on",
        ...(submissionId && stagedAssets.length
          ? { mediaSubmission: createCmsMediaSubmissionEnvelope(submissionId, stagedAssets) }
          : {}),
      };

      setFeedback({ tone: "progress", text: "Saving therapist record…" });
      requestState = "ambiguous";
      const response = await fetch(isNew ? "/api/cms/team" : `/api/cms/team/${member.id}`, {
        method: isNew ? "POST" : "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) requestState = "definite-failure";
      const result = (await response.json().catch(() => ({}))) as TeamSaveResponse;
      if (!response.ok) {
        if (result.mediaCommitState === "indeterminate") {
          requestState = "ambiguous";
          throw new TeamSaveError(TEAM_SAVE_AMBIGUOUS_MESSAGE);
        }
        serverRollback = submissionId
          ? parseCmsMediaServerRollbackSummary(result.mediaRollback, submissionId, stagedAssets)
          : null;
        const responseFieldErrors = safeFieldErrors(result.fields);
        setFieldErrors(responseFieldErrors);
        for (const field of Object.keys(responseFieldErrors)) {
          touchedFieldsRef.current.add(field);
        }
        if (Object.keys(responseFieldErrors).length) focusErrorSummary();
        throw new TeamSaveError(result.error);
      }
      if (!isTeamEditorRecord(result.member)) throw new TeamSaveError(TEAM_SAVE_AMBIGUOUS_MESSAGE);
      requestState = "succeeded";

      setVersion(result.member.version);
      setContactVersion(result.member.contactVersion);
      setImageUrl(result.member.imageUrl);
      setImageAlt(result.member.imageAlt);
      setPreparedImage(null);
      setPublicProfile(result.member.publicProfile);
      setOperationalActive(result.member.operationalActive);
      setArchived(Boolean(result.member.archived));
      markSaved();
      setFeedback({
        tone: "success",
        text: isNew ? "Therapist created successfully." : "Therapist details saved.",
      });
      if (isNew) router.push(`/cms/team/${result.member.id}/edit`);
      router.refresh();
    } catch (error) {
      if (requestState === "ambiguous" || requestState === "succeeded") {
        setFeedback({ tone: "error", text: getTeamSaveErrorMessage(error, requestState) });
        return;
      }
      const retryAssets = requestState === "definite-failure"
        ? selectCmsMediaRollbackRetryAssets(stagedAssets, serverRollback)
        : stagedAssets;
      let cleanupWarning = "";
      if (submissionId && retryAssets.length) {
        setFeedback({ tone: "progress", text: "Removing temporary portrait…" });
        try {
          const rollback = await rollbackStagedCmsMediaAssets(submissionId, retryAssets);
          if (rollback.failed || rollback.pendingFinalSweep) {
            cleanupWarning = " Portrait cleanup could not be fully confirmed; ask an administrator to reconcile the upload before retrying.";
          }
        } catch {
          cleanupWarning = " Portrait cleanup could not be confirmed; ask an administrator to reconcile the upload before retrying.";
        }
      }
      setFeedback({ tone: "error", text: `${getTeamSaveErrorMessage(error, requestState)}${cleanupWarning}` });
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }

  async function deleteTherapist() {
    if (
      isNew ||
      saveLockRef.current ||
      preparationBusy ||
      deleting
    ) {
      return;
    }
    const unsavedWarning = dirty
      ? " Your unsaved changes will be discarded."
      : "";
    const bookingCountNote = deletionImpact.bookingCount === 1
      ? " One booking is currently assigned."
      : ` ${deletionImpact.bookingCount} bookings are currently assigned.`;
    if (
      !window.confirm(
        `Permanently delete ${member.name}? Their therapist profile and every booking assigned at deletion time will be deleted with those bookings' notification records.${bookingCountNote} No cancellation emails will be sent. This cannot be undone.${unsavedWarning}`,
      )
    ) {
      return;
    }

    saveLockRef.current = true;
    setDeleting(true);
    setFeedback({
      tone: "progress",
      text: "Deleting therapist and related bookings…",
    });

    try {
      const response = await fetch(`/api/cms/team/${member.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });
      const result = (await response.json().catch(() => ({}))) as TeamDeleteResponse;
      if (!response.ok) {
        throw new TeamSaveError(result.error);
      }
      if (!isTeamDeletionResult(result.deleted)) {
        throw new TeamSaveError(
          "The deletion result could not be confirmed. Refresh the therapist list before trying again.",
        );
      }

      markSaved();
      router.replace("/cms/team");
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof TeamSaveError
          ? error.message
          : "The deletion result could not be confirmed. Refresh the therapist list before trying again.",
      });
      saveLockRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <form
      aria-busy={locked}
      className={styles.form}
      noValidate
      onBlur={handleFieldBlur}
      onChange={handleFieldChange}
      onSubmit={save}
      ref={formRef}
    >
      <fieldset className={styles.formFields} disabled={locked}>
        {Object.keys(fieldErrors).length ? (
          <div
            aria-labelledby="therapist-error-summary-title"
            className={teamStyles.errorSummary}
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
          >
            <strong id="therapist-error-summary-title">
              Please check the highlighted therapist details.
            </strong>
            <ul>
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <button onClick={() => focusField(field)} type="button">
                    <span>{teamFieldLabels[field] ? `${teamFieldLabels[field]}: ` : ""}</span>
                    {message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Customer-facing details</h2>
            <p>These details help customers choose a therapist during online booking.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.field}>Display name
              <input aria-describedby={describedBy("name")} aria-invalid={Boolean(fieldError("name"))} defaultValue={member.name} id="therapist-name" maxLength={80} minLength={2} name="name" required />
              {fieldError("name") ? <small className={teamStyles.fieldError} id="name-error">{fieldError("name")}</small> : null}
            </label>
            <label className={styles.field}>Public role
              <input aria-describedby={describedBy("publicRole")} aria-invalid={Boolean(fieldError("publicRole"))} defaultValue={member.publicRole} id="therapist-public-role" maxLength={120} minLength={2} name="publicRole" required />
              {fieldError("publicRole") ? <small className={teamStyles.fieldError} id="publicRole-error">{fieldError("publicRole")}</small> : null}
            </label>
            <label className={styles.field}>Booking link name
              <input aria-describedby={describedBy("slug", "therapist-slug-hint")} aria-invalid={Boolean(fieldError("slug"))} autoCapitalize="none" defaultValue={member.slug} id="therapist-slug" maxLength={100} minLength={2} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required spellCheck={false} />
              <small id="therapist-slug-hint">Lowercase letters, numbers and single hyphens. Changing this also changes preselected booking links.</small>
              {fieldError("slug") ? <small className={teamStyles.fieldError} id="slug-error">{fieldError("slug")}</small> : null}
            </label>
            <label className={styles.field}>Full professional name
              <input aria-describedby={describedBy("fullName", "therapist-full-name-hint")} aria-invalid={Boolean(fieldError("fullName"))} defaultValue={member.fullName} id="therapist-full-name" maxLength={120} minLength={2} name="fullName" required />
              <small id="therapist-full-name-hint">Kept with the profile record for administrative clarity. Public pages use the display name.</small>
              {fieldError("fullName") ? <small className={teamStyles.fieldError} id="fullName-error">{fieldError("fullName")}</small> : null}
            </label>
            <label className={styles.fullField}>Short introduction
              <textarea aria-describedby={describedBy("shortBio", "therapist-short-bio-hint")} aria-invalid={Boolean(fieldError("shortBio"))} defaultValue={member.shortBio} id="therapist-short-bio" maxLength={300} minLength={20} name="shortBio" required rows={3} />
              <small id="therapist-short-bio-hint">A concise introduction for profile cards and booking choices.</small>
              {fieldError("shortBio") ? <small className={teamStyles.fieldError} id="shortBio-error">{fieldError("shortBio")}</small> : null}
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Profile portrait</h2>
            <p>Choose a clear portrait. It is prepared locally and uploads only when the whole profile saves successfully.</p>
          </header>
          <div className={styles.grid}>
            <div className={`${styles.fullField} ${teamStyles.mediaField}`}>
              <CmsImageUploadField
                description="Choose a portrait in AVIF, JPEG, PNG or WebP format. A portrait or square crop works best."
                disabled={locked}
                inputId={`therapist-${member.id}-portrait`}
                label="Therapist portrait"
                onBusyChange={setPreparationBusy}
                onPreparedImageChange={(image) => {
                  setPreparedImage(image);
                  markDirty();
                  setFeedback(null);
                }}
                preparationOptions={{ outputWidthLimit: 1600, outputHeightLimit: 2000, quality: 0.86 }}
                preparedImage={preparedImage}
              />
              {savedImageCanPreview && !preparedImage ? (
                <figure className={teamStyles.savedPreview}>
                  <div><Image alt={imageAlt} fill sizes="(max-width: 780px) 100vw, 28rem" src={imageUrl} /></div>
                  <figcaption>Current published portrait</figcaption>
                </figure>
              ) : null}
            </div>
            <label className={styles.fullField}>Portrait description
              <input aria-describedby={describedBy("imageAlt", "therapist-image-alt-hint")} aria-invalid={Boolean(fieldError("imageAlt"))} id="therapist-image-alt" maxLength={180} minLength={8} name="imageAlt" onChange={(event) => setImageAlt(event.target.value)} required={Boolean(imageUrl || preparedImage)} value={imageAlt} />
              <small id="therapist-image-alt-hint">Describe the visible portrait for customers who cannot see it.</small>
              {fieldError("imageAlt") ? <small className={teamStyles.fieldError} id="imageAlt-error">{fieldError("imageAlt")}</small> : null}
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Treatments offered</h2>
            <p>Choose which published treatments customers and staff can book with this therapist.</p>
          </header>
          <div className={styles.grid}>
            <fieldset
              aria-describedby={fieldError("serviceIds") ? "serviceIds-error" : undefined}
              aria-invalid={Boolean(fieldError("serviceIds"))}
              className={teamStyles.serviceFieldset}
              id="therapist-service-ids"
            >
              <legend>Treatments offered</legend>
              <p>These choices control which treatments can be booked with this therapist.</p>
              {services.length ? (
                <div className={teamStyles.serviceGrid}>
                  {services.map((service) => (
                    <label className={teamStyles.serviceChoice} key={service.id}>
                      <input defaultChecked={member.serviceIds.includes(service.id)} name="serviceIds" type="checkbox" value={service.id} />
                      <span>{service.name}</span>
                    </label>
                  ))}
                </div>
              ) : <p className={teamStyles.emptyServices}>Add a treatment before assigning therapist eligibility.</p>}
              {fieldError("serviceIds") ? <p className={teamStyles.fieldError} id="serviceIds-error">{fieldError("serviceIds")}</p> : null}
            </fieldset>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Booking &amp; notification settings</h2>
            <p>The notification address is private and is never included in customer-facing booking data or website pages.</p>
          </header>
          <div className={styles.grid}>
            <label className={styles.fullField}>Therapist notification email
              <input aria-describedby={describedBy("notificationEmail", "therapist-email-hint")} aria-invalid={Boolean(fieldError("notificationEmail"))} autoComplete="off" defaultValue={member.notificationEmail} id="therapist-notification-email" maxLength={254} name="notificationEmail" required={operationalActive} type="email" />
              <small id="therapist-email-hint">Private recipient address used for this therapist&apos;s assigned-booking notifications when delivery is enabled.</small>
              {fieldError("notificationEmail") ? <small className={teamStyles.fieldError} id="notificationEmail-error">{fieldError("notificationEmail")}</small> : null}
            </label>
            <label className={styles.fullField}>Private therapist phone
              <input aria-describedby={describedBy("contactPhone", "therapist-phone-hint")} aria-invalid={Boolean(fieldError("contactPhone"))} autoComplete="off" defaultValue={member.contactPhone} id="therapist-contact-phone" inputMode="tel" maxLength={30} name="contactPhone" pattern="(?=(?:[^0-9]*[0-9]){7})\+?[0-9\s().\-]{7,30}" type="tel" />
              <small id="therapist-phone-hint">Optional private CMS contact number. It is never published on the website.</small>
              {fieldError("contactPhone") ? <small className={teamStyles.fieldError} id="contactPhone-error">{fieldError("contactPhone")}</small> : null}
            </label>
            <label className={styles.checkbox}>
              <input checked={operationalActive} disabled={archived} name="operationalActive" onChange={(event) => setOperationalActive(event.target.checked)} type="checkbox" />
              <span>Available for booking<small>Allows customers and staff to assign this therapist to eligible treatments.</small></span>
            </label>
            <label className={styles.checkbox}>
              <input checked={publicProfile} disabled={archived} name="publicProfile" onChange={(event) => setPublicProfile(event.target.checked)} type="checkbox" />
              <span>Show in online booking<small>Allows customers to see and select this therapist on the booking form.</small></span>
            </label>
            <label className={`${styles.checkbox} ${teamStyles.archiveChoice}`}>
              <input checked={archived} name="archived" onChange={(event) => {
                const nextArchived = event.target.checked;
                setArchived(nextArchived);
                if (nextArchived) {
                  setOperationalActive(false);
                  setPublicProfile(false);
                }
              }} type="checkbox" />
              <span>Archive this therapist<small>Keeps the record for history while removing it from public and operational choices.</small></span>
            </label>
          </div>
        </section>
      </fieldset>

      {!isNew && deletionImpact.bookingCount > 0 ? (
        <section className={teamStyles.deletionImpact} id="therapist-deletion-impact" role="status">
          <div>
            <strong>
              {deletionImpact.bookingCount === 1
                ? "1 related booking will also be permanently deleted."
                : `${deletionImpact.bookingCount} related bookings will also be permanently deleted.`}
            </strong>
            <span>
              Their notification records will be removed. No cancellation emails will be sent.
            </span>
          </div>
          <ul aria-label="Bookings that will be deleted">
            {deletionImpact.bookingReferences.map((reference) => (
              <li key={reference}>
                <Link href={`/cms/bookings?search=${encodeURIComponent(reference)}`}>
                  {reference}
                </Link>
              </li>
            ))}
          </ul>
          {deletionImpact.bookingCount > deletionImpact.bookingReferences.length ? (
            <small>
              And {deletionImpact.bookingCount - deletionImpact.bookingReferences.length} more.
            </small>
          ) : null}
        </section>
      ) : null}

      <div className={styles.saveBar}>
        <span aria-live="polite">
          {feedback ? (
            <span className={feedback.tone === "error" ? styles.error : feedback.tone === "success" ? styles.success : styles.progressStatus} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</span>
          ) : `Profile version ${version} · contact version ${contactVersion}${dirty ? " · unsaved changes" : ""}`}
        </span>
        <div className={teamStyles.saveActions}>
          {!isNew ? (
            <button
              aria-describedby={deletionImpact.bookingCount ? "therapist-deletion-impact" : undefined}
              className={teamStyles.removeButton}
              disabled={locked}
              onClick={() => void deleteTherapist()}
              type="button"
            >
              {deleting ? (
                <LoaderCircle aria-hidden="true" className={teamStyles.spinner} />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deleting ? "Deleting…" : "Delete therapist"}
            </button>
          ) : null}
          <button disabled={locked} type="submit">{saving ? "Saving therapist…" : isNew ? "Create therapist" : "Save therapist"}</button>
        </div>
      </div>
    </form>
  );
}
