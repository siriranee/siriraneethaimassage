"use client";

import { CheckCircle2, ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  CLIENT_IMAGE_ACCEPT,
  formatBytes,
  prepareClientImage,
  toClientImageValidationIssue,
  type ClientImagePreparationOptions,
  type ClientImageValidationIssue,
  type PreparedClientImage,
} from "@/lib/media/client-image";

import styles from "./CmsImageUploadField.module.css";

export type CmsImageUploadControls = Readonly<{
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}>;

export type CmsImageUploadFieldProps<TUploadResult = unknown> = Readonly<{
  label: string;
  preparedImage: PreparedClientImage | null;
  onPreparedImageChange: (image: PreparedClientImage | null) => void;
  onUpload?: (
    image: PreparedClientImage,
    controls: CmsImageUploadControls,
  ) => Promise<TUploadResult>;
  onUploaded?: (
    result: TUploadResult,
    image: PreparedClientImage,
  ) => void;
  onUploadError?: (error: unknown) => void;
  onValidationChange?: (issue: ClientImageValidationIssue | null) => void;
  onBusyChange?: (isBusy: boolean) => void;
  description?: string;
  inputId?: string;
  required?: boolean;
  disabled?: boolean;
  selectLabel?: string;
  replaceLabel?: string;
  uploadLabel?: string;
  preparationOptions?: Omit<
    ClientImagePreparationOptions,
    "signal" | "onProgress"
  >;
}>;

type Operation = "idle" | "preparing" | "ready" | "uploading" | "uploaded" | "error";
type RetryAction = "prepare" | "upload" | null;

function percentageSaved(originalBytes: number, preparedBytes: number) {
  if (!originalBytes) return 0;
  return Math.round((1 - preparedBytes / originalBytes) * 100);
}

function LocalImagePreview({ image }: { readonly image: PreparedClientImage }) {
  const objectUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    fileRef.current = null;
  }, []);

  const setPreviewNode = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node) {
        releaseObjectUrl();
        return;
      }
      if (fileRef.current !== image.file) releaseObjectUrl();
      if (!objectUrlRef.current) {
        objectUrlRef.current = URL.createObjectURL(image.file);
        fileRef.current = image.file;
      }
      node.src = objectUrlRef.current;
    },
    [image.file, releaseObjectUrl],
  );

  useEffect(() => releaseObjectUrl, [releaseObjectUrl]);

  return (
    // A local blob URL cannot use the Next.js image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={styles.previewImage}
      height={image.prepared.height}
      ref={setPreviewNode}
      width={image.prepared.width}
    />
  );
}

function safeUploadMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The image could not be uploaded. Check your connection and try again.";
}

export function CmsImageUploadField<TUploadResult = unknown>({
  label,
  preparedImage,
  onPreparedImageChange,
  onUpload,
  onUploaded,
  onUploadError,
  onValidationChange,
  onBusyChange,
  description = "Choose one still JPEG, PNG or WebP image. It is resized and compressed in this browser before any upload.",
  inputId,
  required = false,
  disabled = false,
  selectLabel = "Choose image",
  replaceLabel = "Choose another image",
  uploadLabel = "Upload prepared image",
  preparationOptions,
}: CmsImageUploadFieldProps<TUploadResult>) {
  const generatedId = useId();
  const resolvedInputId = inputId ?? `${generatedId}-image`;
  const descriptionId = `${resolvedInputId}-description`;
  const statusId = `${resolvedInputId}-status`;
  const errorId = `${resolvedInputId}-error`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<File | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const operationIdRef = useRef(0);
  const previousPreparedIdRef = useRef(preparedImage?.id ?? null);
  const onBusyChangeRef = useRef(onBusyChange);
  const [operation, setOperation] = useState<Operation>(
    preparedImage ? "ready" : "idle",
  );
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(
    preparedImage
      ? "Image prepared locally. It has not been uploaded."
      : "No image selected.",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [retryAction, setRetryAction] = useState<RetryAction>(null);
  const isBusy = operation === "preparing" || operation === "uploading";
  const describedBy = [descriptionId, statusId, errorMessage ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  const cancelActiveOperation = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
  }, []);

  useEffect(() => cancelActiveOperation, [cancelActiveOperation]);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(() => {
    onBusyChangeRef.current?.(isBusy);
  }, [isBusy]);

  useEffect(
    () => () => {
      onBusyChangeRef.current?.(false);
    },
    [],
  );

  useEffect(() => {
    const previousId = previousPreparedIdRef.current;
    const currentId = preparedImage?.id ?? null;
    previousPreparedIdRef.current = currentId;
    if (
      !previousId ||
      currentId ||
      operation === "preparing" ||
      operation === "uploading"
    ) {
      return;
    }

    sourceFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    onValidationChange?.(null);
    setOperation("idle");
    setProgress(0);
    setErrorMessage("");
    setRetryAction(null);
    setStatusMessage("No image selected.");
  }, [onValidationChange, operation, preparedImage?.id]);

  const prepareSelectedFile = useCallback(
    async (file: File) => {
      cancelActiveOperation();
      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;
      const controller = new AbortController();
      activeControllerRef.current = controller;
      sourceFileRef.current = file;
      setOperation("preparing");
      setProgress(5);
      setErrorMessage("");
      setRetryAction(null);
      setStatusMessage(`Preparing ${file.name} locally…`);
      onValidationChange?.(null);

      try {
        const nextImage = await prepareClientImage(file, {
          ...preparationOptions,
          signal: controller.signal,
          onProgress: ({ percent }) => {
            if (operationId === operationIdRef.current) setProgress(percent);
          },
        });
        if (operationId !== operationIdRef.current || controller.signal.aborted) return;
        onPreparedImageChange(nextImage);
        setOperation("ready");
        setProgress(100);
        setStatusMessage(
          "Image prepared locally. It will not upload until you use the upload or form action.",
        );
      } catch (error) {
        if (operationId !== operationIdRef.current || controller.signal.aborted) return;
        const issue = toClientImageValidationIssue(error);
        onValidationChange?.(issue);
        setOperation("error");
        setProgress(0);
        setErrorMessage(issue.message);
        setRetryAction("prepare");
        setStatusMessage(
          preparedImage
            ? "The new file was not prepared. The previous prepared image is unchanged."
            : "The image was not prepared.",
        );
      } finally {
        if (operationId === operationIdRef.current) {
          activeControllerRef.current = null;
        }
      }
    },
    [
      cancelActiveOperation,
      onPreparedImageChange,
      onValidationChange,
      preparationOptions,
      preparedImage,
    ],
  );

  const uploadPreparedImage = useCallback(async () => {
    if (!preparedImage || !onUpload || disabled) return;
    cancelActiveOperation();
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setOperation("uploading");
    setProgress(1);
    setErrorMessage("");
    setRetryAction(null);
    setStatusMessage("Uploading the prepared image…");

    try {
      const result = await onUpload(preparedImage, {
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (operationId !== operationIdRef.current) return;
          setProgress(Math.min(100, Math.max(0, Math.round(nextProgress))));
        },
      });
      if (operationId !== operationIdRef.current || controller.signal.aborted) return;
      setOperation("uploaded");
      setProgress(100);
      setStatusMessage("Image upload complete. Save the form to apply it.");
      onUploaded?.(result, preparedImage);
    } catch (error) {
      if (operationId !== operationIdRef.current || controller.signal.aborted) return;
      onUploadError?.(error);
      setOperation("error");
      setProgress(0);
      setErrorMessage(safeUploadMessage(error));
      setRetryAction("upload");
      setStatusMessage("The prepared image remains available for another upload attempt.");
    } finally {
      if (operationId === operationIdRef.current) {
        activeControllerRef.current = null;
      }
    }
  }, [
    cancelActiveOperation,
    disabled,
    onUpload,
    onUploadError,
    onUploaded,
    preparedImage,
  ]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void prepareSelectedFile(file);
  }

  function removePreparedImage() {
    cancelActiveOperation();
    operationIdRef.current += 1;
    sourceFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    onPreparedImageChange(null);
    onValidationChange?.(null);
    setOperation("idle");
    setProgress(0);
    setErrorMessage("");
    setRetryAction(null);
    setStatusMessage("Prepared image removed. Existing saved assets are not deleted.");
  }

  function retry() {
    if (retryAction === "upload") {
      void uploadPreparedImage();
      return;
    }
    if (sourceFileRef.current) void prepareSelectedFile(sourceFileRef.current);
  }

  const savedPercent = preparedImage
    ? percentageSaved(preparedImage.original.bytes, preparedImage.prepared.bytes)
    : 0;

  return (
    <section
      aria-busy={isBusy}
      aria-labelledby={`${resolvedInputId}-label`}
      className={styles.field}
      data-state={operation}
    >
      <div className={styles.heading}>
        <div>
          <label className={styles.label} htmlFor={resolvedInputId} id={`${resolvedInputId}-label`}>
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </label>
          <p className={styles.description} id={descriptionId}>{description}</p>
        </div>
        <span className={styles.localBadge}>Prepared on this device</span>
      </div>

      <div className={styles.picker}>
        <ImagePlus aria-hidden="true" />
        <div className={styles.pickerCopy}>
          <strong>{preparedImage ? replaceLabel : selectLabel}</strong>
          <span>JPEG, PNG or still WebP</span>
        </div>
        <input
          accept={CLIENT_IMAGE_ACCEPT}
          aria-describedby={describedBy}
          aria-invalid={Boolean(errorMessage)}
          aria-required={required}
          className={styles.fileInput}
          disabled={disabled || isBusy}
          id={resolvedInputId}
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {preparedImage ? (
        <div className={styles.preparedCard}>
          <div className={styles.preview}>
            <LocalImagePreview image={preparedImage} />
          </div>
          <div className={styles.preparedDetails}>
            <div className={styles.readyHeading}>
              <CheckCircle2 aria-hidden="true" />
              <strong>Ready for upload</strong>
            </div>
            <dl className={styles.metrics}>
              <div>
                <dt>Original</dt>
                <dd>
                  {preparedImage.original.width} × {preparedImage.original.height}px · {formatBytes(preparedImage.original.bytes)}
                </dd>
              </div>
              <div>
                <dt>Prepared</dt>
                <dd>
                  {preparedImage.prepared.width} × {preparedImage.prepared.height}px · {formatBytes(preparedImage.prepared.bytes)}
                </dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>
                  {savedPercent > 0
                    ? `${savedPercent}% smaller`
                    : savedPercent < 0
                      ? `${Math.abs(savedPercent)}% larger after encoding`
                      : "Same size after preparation"}
                </dd>
              </div>
            </dl>
            <p className={styles.fileName}>{preparedImage.file.name}</p>
          </div>
        </div>
      ) : null}

      {isBusy ? (
        <div className={styles.progressGroup}>
          <div className={styles.progressLabel}>
            <span>{operation === "uploading" ? "Uploading" : "Preparing"}</span>
            <strong>{progress}%</strong>
          </div>
          <progress max={100} value={progress}>
            {progress}%
          </progress>
        </div>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} id={errorId} role="alert">
          <strong>{errorMessage}</strong>
          <span>Error area: {retryAction === "upload" ? "upload" : "image preparation"}</span>
        </p>
      ) : null}

      <div className={styles.actions}>
        {onUpload && preparedImage ? (
          <button
            className={styles.uploadButton}
            disabled={disabled || isBusy}
            onClick={() => void uploadPreparedImage()}
            type="button"
          >
            <Upload aria-hidden="true" />
            {operation === "uploading" ? "Uploading…" : uploadLabel}
          </button>
        ) : null}
        {retryAction ? (
          <button
            className={styles.secondaryButton}
            disabled={disabled || isBusy}
            onClick={retry}
            type="button"
          >
            <RotateCcw aria-hidden="true" />
            Retry
          </button>
        ) : null}
        {preparedImage ? (
          <button
            className={styles.removeButton}
            disabled={disabled || isBusy}
            onClick={removePreparedImage}
            type="button"
          >
            <Trash2 aria-hidden="true" />
            Remove prepared image
          </button>
        ) : null}
      </div>

      <p aria-atomic="true" aria-live="polite" className={styles.status} id={statusId} role="status">
        {statusMessage}
      </p>
    </section>
  );
}
