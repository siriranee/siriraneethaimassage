import type { CmsMediaScope } from "@/domain/cms/types";
import type { PreparedClientImage } from "@/lib/media/client-image";

const CMS_MEDIA_UPLOAD_PATH = "/api/cms/media-upload";
const CMS_MEDIA_COMPLETE_PATH = "/api/cms/media-upload/complete";
const CMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const CMS_MEDIA_MAX_EDGE = 4_096;
const CMS_MEDIA_MAX_PIXELS = 16_000_000;
const CMS_MEDIA_SCOPES = new Set<CmsMediaScope>([
  "service-cover",
  "service-gallery",
  "home-hero",
  "site-gallery",
]);
const CMS_MEDIA_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CMS_MEDIA_FORMATS = new Set(["avif", "jpg", "jpeg", "png", "webp"]);

export type CmsMediaClientStage =
  | "authorizing"
  | "uploading"
  | "verifying"
  | "rollback";

export type CmsMediaClientErrorCode =
  | "invalid-input"
  | "invalid-response"
  | "unsafe-endpoint"
  | "request-failed"
  | "provider-failed"
  | "aborted";

export class CmsMediaClientError extends Error {
  readonly code: CmsMediaClientErrorCode;
  readonly stage: CmsMediaClientStage;

  constructor(
    code: CmsMediaClientErrorCode,
    stage: CmsMediaClientStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CmsMediaClientError";
    this.code = code;
    this.stage = stage;
  }
}

export type CmsStagedMediaAsset = Readonly<{
  publicId: string;
  secureUrl: string;
  scope: CmsMediaScope;
  format: "avif" | "jpg" | "jpeg" | "png" | "webp";
  bytes: number;
  width: number;
  height: number;
  stagedToken: string;
  expiresAt: string;
}>;

export type CmsMediaUploadProgress = Readonly<{
  stage: Exclude<CmsMediaClientStage, "rollback">;
  percent: number;
}>;

export type UploadPreparedCmsImageOptions = Readonly<{
  submissionId: string;
  scope: CmsMediaScope;
  image: PreparedClientImage;
  signal?: AbortSignal;
  onProgress?: (progress: CmsMediaUploadProgress) => void;
}>;

export type CmsMediaUploadItem<TKey extends string = string> = Readonly<{
  key: TKey;
  scope: CmsMediaScope;
  image: PreparedClientImage;
}>;

export type CmsMediaUploadItemResult<TKey extends string = string> = Readonly<{
  key: TKey;
  asset: CmsStagedMediaAsset;
}>;

export type CmsMediaSequenceProgress<TKey extends string = string> = Readonly<{
  key: TKey;
  itemIndex: number;
  itemCount: number;
  stage: CmsMediaUploadProgress["stage"];
  itemPercent: number;
  overallPercent: number;
}>;

export type UploadCmsMediaSequentiallyOptions<TKey extends string = string> =
  Readonly<{
    submissionId: string;
    items: readonly CmsMediaUploadItem<TKey>[];
    signal?: AbortSignal;
    onProgress?: (progress: CmsMediaSequenceProgress<TKey>) => void;
    rollbackCompletedOnError?: boolean;
  }>;

export type CmsMediaRollbackItemResult = Readonly<{
  publicId: string;
  removed: boolean;
}>;

export type CmsMediaRollbackResult = Readonly<{
  attempted: number;
  removed: number;
  failed: number;
  items: readonly CmsMediaRollbackItemResult[];
}>;

type JsonObject = Record<string, unknown>;

type SignedUploadAuthorization = Readonly<{
  endpoint: string;
  cloudName: string;
  publicId: string;
  apiKey: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  signature: string;
  uploadToken: string;
  expiresAt: string;
}>;

type CloudinaryUploadResult = Readonly<{
  publicId: string;
  secureUrl: string;
  signature: string;
  version: number;
  resourceType: "image";
  format: "avif" | "jpg" | "jpeg" | "png" | "webp";
  bytes: number;
  width: number;
  height: number;
}>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function clientError(
  code: CmsMediaClientErrorCode,
  stage: CmsMediaClientStage,
  message: string,
  cause?: unknown,
) {
  return new CmsMediaClientError(
    code,
    stage,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof CmsMediaClientError && error.code === "aborted")
  );
}

function throwIfAborted(signal: AbortSignal | undefined, stage: CmsMediaClientStage) {
  if (signal?.aborted) {
    throw clientError("aborted", stage, "The image upload was cancelled.");
  }
}

function assertSubmissionId(value: string) {
  if (!/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(value)) {
    throw clientError(
      "invalid-input",
      "authorizing",
      "The image submission is invalid. Refresh the form and try again.",
    );
  }
}

function assertScope(value: CmsMediaScope) {
  if (!CMS_MEDIA_SCOPES.has(value)) {
    throw clientError(
      "invalid-input",
      "authorizing",
      "Choose a supported image destination.",
    );
  }
}

function assertPreparedImage(image: PreparedClientImage) {
  const { file, prepared } = image;
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > CMS_MEDIA_MAX_BYTES ||
    file.size !== prepared.bytes ||
    file.type !== prepared.mimeType ||
    !CMS_MEDIA_CONTENT_TYPES.has(file.type) ||
    file.name.length < 1 ||
    file.name.length > 180 ||
    /[\u0000-\u001f\u007f/\\]/.test(file.name) ||
    !Number.isInteger(prepared.width) ||
    !Number.isInteger(prepared.height) ||
    prepared.width < 1 ||
    prepared.height < 1 ||
    prepared.width > CMS_MEDIA_MAX_EDGE ||
    prepared.height > CMS_MEDIA_MAX_EDGE ||
    prepared.width * prepared.height > CMS_MEDIA_MAX_PIXELS
  ) {
    throw clientError(
      "invalid-input",
      "authorizing",
      "Prepare a valid image before uploading.",
    );
  }
}

function safeServerMessage(value: unknown, fallback: string) {
  const source = objectValue(value);
  const message = typeof source?.error === "string" ? source.error.trim() : "";
  return message.length >= 3 && message.length <= 240 && !/[<>\r\n]/.test(message)
    ? message
    : fallback;
}

async function readJson(response: Response, stage: CmsMediaClientStage) {
  let value: unknown = null;
  try {
    const text = await response.text();
    if (text.length > 128_000) {
      throw new Error("Response exceeded the client limit.");
    }
    value = text ? (JSON.parse(text) as unknown) : null;
  } catch (error) {
    if (response.ok) {
      throw clientError(
        "invalid-response",
        stage,
        "The image service returned an invalid response. Try again.",
        error,
      );
    }
  }

  if (!response.ok) {
    const fallback =
      response.status === 401 || response.status === 403
        ? "Your CMS session cannot upload images. Sign in again."
        : "The image request could not be completed. Try again.";
    throw clientError(
      "request-failed",
      stage,
      safeServerMessage(value, fallback),
    );
  }
  return value;
}

async function sameOriginJson(
  path: string,
  method: "POST" | "DELETE",
  body: JsonObject,
  stage: CmsMediaClientStage,
  signal?: AbortSignal,
) {
  throwIfAborted(signal, stage);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw clientError("aborted", stage, "The image upload was cancelled.");
    }
    throw clientError(
      "request-failed",
      stage,
      "The image service could not be reached. Check your connection and try again.",
      error,
    );
  }
  return readJson(response, stage);
}

export function isExactCloudinaryUploadEndpoint(
  endpoint: string,
  cloudName: string,
) {
  if (!/^[a-z0-9_-]{1,64}$/i.test(cloudName)) return false;
  const expected = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  if (endpoint !== expected) return false;
  try {
    const parsed = new URL(endpoint);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "api.cloudinary.com" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

function parseAuthorization(value: unknown): SignedUploadAuthorization {
  const envelope = objectValue(value);
  const source = objectValue(envelope?.upload);
  if (!source) {
    throw clientError(
      "invalid-response",
      "authorizing",
      "The image service returned an invalid upload authorization.",
    );
  }

  const endpoint = typeof source.endpoint === "string" ? source.endpoint : "";
  const cloudName = typeof source.cloudName === "string" ? source.cloudName : "";
  const apiKey = typeof source.apiKey === "string" ? source.apiKey.trim() : "";
  const signature = typeof source.signature === "string" ? source.signature.trim() : "";
  const uploadToken =
    typeof source.uploadToken === "string" ? source.uploadToken.trim() : "";
  const expiresAt = typeof source.expiresAt === "string" ? source.expiresAt : "";
  const expiry = Date.parse(expiresAt);
  const parameterSource = objectValue(source.parameters);
  const parameters: Record<string, string | number | boolean> = {};

  if (
    !isExactCloudinaryUploadEndpoint(endpoint, cloudName) ||
    !/^[a-z0-9_-]{1,128}$/i.test(apiKey) ||
    !/^[a-f0-9]{40,128}$/i.test(signature) ||
    uploadToken.length < 32 ||
    uploadToken.length > 8_192 ||
    !Number.isFinite(expiry) ||
    expiry <= Date.now() ||
    !parameterSource
  ) {
    throw clientError(
      isExactCloudinaryUploadEndpoint(endpoint, cloudName)
        ? "invalid-response"
        : "unsafe-endpoint",
      "authorizing",
      "The image service returned an invalid upload authorization.",
    );
  }

  for (const [key, parameter] of Object.entries(parameterSource)) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/i.test(key) ||
      ["file", "api_key", "signature"].includes(key) ||
      !(
        typeof parameter === "string" ||
        typeof parameter === "boolean" ||
        (typeof parameter === "number" && Number.isFinite(parameter))
      )
    ) {
      throw clientError(
        "invalid-response",
        "authorizing",
        "The image service returned invalid upload parameters.",
      );
    }
    parameters[key] = parameter;
  }

  if (!Object.keys(parameters).length) {
    throw clientError(
      "invalid-response",
      "authorizing",
      "The image service returned invalid upload parameters.",
    );
  }

  const publicId = parameters.public_id;
  if (
    typeof publicId !== "string" ||
    publicId.length < 3 ||
    publicId.length > 255 ||
    !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(publicId)
  ) {
    throw clientError(
      "invalid-response",
      "authorizing",
      "The image service returned invalid upload parameters.",
    );
  }

  return {
    endpoint,
    cloudName,
    publicId,
    apiKey,
    parameters,
    signature,
    uploadToken,
    expiresAt,
  };
}

function integer(value: unknown) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(result) ? result : -1;
}

function parseCloudinaryResult(
  value: unknown,
  cloudName: string,
  expectedPublicId: string,
): CloudinaryUploadResult {
  const source = objectValue(value);
  const publicId = typeof source?.public_id === "string" ? source.public_id.trim() : "";
  const secureUrl =
    typeof source?.secure_url === "string" ? source.secure_url.trim() : "";
  const signature = typeof source?.signature === "string" ? source.signature.trim() : "";
  const resourceType = source?.resource_type;
  const format = typeof source?.format === "string" ? source.format.toLowerCase() : "";
  const version = integer(source?.version);
  const bytes = integer(source?.bytes);
  const width = integer(source?.width);
  const height = integer(source?.height);
  let deliveryUrl: URL | null = null;
  try {
    deliveryUrl = new URL(secureUrl);
  } catch {
    deliveryUrl = null;
  }

  if (
    publicId !== expectedPublicId ||
    publicId.length > 255 ||
    resourceType !== "image" ||
    !CMS_MEDIA_FORMATS.has(format) ||
    !/^[a-f0-9]{40,128}$/i.test(signature) ||
    version < 1 ||
    bytes < 1 ||
    bytes > CMS_MEDIA_MAX_BYTES ||
    width < 1 ||
    height < 1 ||
    width > CMS_MEDIA_MAX_EDGE ||
    height > CMS_MEDIA_MAX_EDGE ||
    width * height > CMS_MEDIA_MAX_PIXELS ||
    !deliveryUrl ||
    deliveryUrl.protocol !== "https:" ||
    deliveryUrl.hostname !== "res.cloudinary.com" ||
    deliveryUrl.username !== "" ||
    deliveryUrl.password !== "" ||
    deliveryUrl.search !== "" ||
    deliveryUrl.hash !== "" ||
    !deliveryUrl.pathname.startsWith(`/${cloudName}/image/upload/`)
  ) {
    throw clientError(
      "invalid-response",
      "uploading",
      "The image provider returned an invalid response. Try again.",
    );
  }

  return {
    publicId,
    secureUrl,
    signature,
    version,
    resourceType: "image",
    format: format as CloudinaryUploadResult["format"],
    bytes,
    width,
    height,
  };
}

function uploadWithProgress(
  authorization: SignedUploadAuthorization,
  file: File,
  signal: AbortSignal | undefined,
  onProgress: ((percent: number) => void) | undefined,
): Promise<unknown> {
  throwIfAborted(signal, "uploading");
  if (typeof XMLHttpRequest !== "function" || typeof FormData !== "function") {
    throw clientError(
      "provider-failed",
      "uploading",
      "This browser cannot upload images with progress reporting.",
    );
  }

  const form = new FormData();
  form.append("file", file, file.name);
  for (const [key, value] of Object.entries(authorization.parameters)) {
    form.append(key, String(value));
  }
  form.append("api_key", authorization.apiKey);
  form.append("signature", authorization.signature);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const fail = (message: string, cause?: unknown) =>
      finish(() =>
        reject(
          clientError("provider-failed", "uploading", message, cause),
        ),
      );
    const abort = () => {
      xhr.abort();
      finish(() =>
        reject(clientError("aborted", "uploading", "The image upload was cancelled.")),
      );
    };

    try {
      xhr.open("POST", authorization.endpoint, true);
      xhr.withCredentials = false;
      xhr.responseType = "text";
      xhr.timeout = 120_000;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress?.(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          fail("The image provider rejected the upload. Try another image.");
          return;
        }
        try {
          const responseText = xhr.responseText;
          if (!responseText || responseText.length > 128_000) {
            throw new Error("Provider response exceeded the client limit.");
          }
          const response = JSON.parse(responseText) as unknown;
          finish(() => resolve(response));
        } catch (error) {
          finish(() =>
            reject(
              clientError(
                "invalid-response",
                "uploading",
                "The image provider returned an invalid response. Try again.",
                error,
              ),
            ),
          );
        }
      };
      xhr.onerror = () => fail("The image provider could not be reached. Check your connection and try again.");
      xhr.ontimeout = () => fail("The image upload timed out. Try again.");
      xhr.onabort = () =>
        finish(() =>
          reject(clientError("aborted", "uploading", "The image upload was cancelled.")),
        );
      signal?.addEventListener("abort", abort, { once: true });
      xhr.send(form);
    } catch (error) {
      fail("The image upload could not start. Try again.", error);
    }
  });
}

function parseStagedAsset(
  value: unknown,
  expected: CloudinaryUploadResult,
  scope: CmsMediaScope,
): CmsStagedMediaAsset {
  const envelope = objectValue(value);
  const source = objectValue(envelope?.asset);
  const publicId = typeof source?.publicId === "string" ? source.publicId : "";
  const secureUrl = typeof source?.secureUrl === "string" ? source.secureUrl : "";
  const resultScope = source?.scope;
  const format = typeof source?.format === "string" ? source.format.toLowerCase() : "";
  const bytes = integer(source?.bytes);
  const width = integer(source?.width);
  const height = integer(source?.height);
  const stagedToken =
    typeof source?.stagedToken === "string" ? source.stagedToken.trim() : "";
  const expiresAt = typeof source?.expiresAt === "string" ? source.expiresAt : "";

  if (
    publicId !== expected.publicId ||
    secureUrl !== expected.secureUrl ||
    resultScope !== scope ||
    format !== expected.format ||
    bytes !== expected.bytes ||
    width !== expected.width ||
    height !== expected.height ||
    stagedToken.length < 32 ||
    stagedToken.length > 8_192 ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw clientError(
      "invalid-response",
      "verifying",
      "The image service could not verify the uploaded image. Try again.",
    );
  }

  return {
    publicId,
    secureUrl,
    scope,
    format: format as CmsStagedMediaAsset["format"],
    bytes,
    width,
    height,
    stagedToken,
    expiresAt,
  };
}

async function cleanupAuthorizedUpload(
  submissionId: string,
  scope: CmsMediaScope,
  publicId: string,
  uploadToken: string,
) {
  try {
    await sameOriginJson(
      CMS_MEDIA_UPLOAD_PATH,
      "DELETE",
      { submissionId, scope, publicId, uploadToken },
      "rollback",
    );
  } catch {
    // Best effort: the server also expires and cleans abandoned authorizations.
  }
}

export function createCmsMediaSubmissionId() {
  const randomPart = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  if (!randomPart) {
    throw clientError(
      "invalid-input",
      "authorizing",
      "This browser cannot create a secure image submission. Refresh and try again.",
    );
  }
  return `media_${randomPart}`;
}

export async function uploadPreparedCmsImage({
  submissionId,
  scope,
  image,
  signal,
  onProgress,
}: UploadPreparedCmsImageOptions): Promise<CmsStagedMediaAsset> {
  assertSubmissionId(submissionId);
  assertScope(scope);
  assertPreparedImage(image);
  throwIfAborted(signal, "authorizing");
  onProgress?.({ stage: "authorizing", percent: 0 });

  const authorization = parseAuthorization(
    await sameOriginJson(
      CMS_MEDIA_UPLOAD_PATH,
      "POST",
      {
        submissionId,
        scope,
        fileName: image.file.name,
        contentType: image.file.type,
        bytes: image.file.size,
      },
      "authorizing",
      signal,
    ),
  );
  onProgress?.({ stage: "authorizing", percent: 100 });
  onProgress?.({ stage: "uploading", percent: 0 });

  let providerResponse: unknown;
  try {
    providerResponse = await uploadWithProgress(
      authorization,
      image.file,
      signal,
      (percent) => onProgress?.({ stage: "uploading", percent }),
    );
  } catch (error) {
    if (error instanceof CmsMediaClientError && error.code === "invalid-response") {
      await cleanupAuthorizedUpload(
        submissionId,
        scope,
        authorization.publicId,
        authorization.uploadToken,
      );
    }
    throw error;
  }

  let providerUpload: CloudinaryUploadResult;
  try {
    providerUpload = parseCloudinaryResult(
      providerResponse,
      authorization.cloudName,
      authorization.publicId,
    );
  } catch (error) {
    await cleanupAuthorizedUpload(
      submissionId,
      scope,
      authorization.publicId,
      authorization.uploadToken,
    );
    throw error;
  }
  onProgress?.({ stage: "uploading", percent: 100 });
  onProgress?.({ stage: "verifying", percent: 0 });

  try {
    const completed = await sameOriginJson(
      CMS_MEDIA_COMPLETE_PATH,
      "POST",
      {
        submissionId,
        scope,
        uploadToken: authorization.uploadToken,
        upload: providerUpload,
      },
      "verifying",
      signal,
    );
    const asset = parseStagedAsset(completed, providerUpload, scope);
    onProgress?.({ stage: "verifying", percent: 100 });
    return asset;
  } catch (error) {
    await cleanupAuthorizedUpload(
      submissionId,
      scope,
      authorization.publicId,
      authorization.uploadToken,
    );
    throw error;
  }
}

async function rollbackOne(
  submissionId: string,
  asset: CmsStagedMediaAsset,
): Promise<CmsMediaRollbackItemResult> {
  try {
    await sameOriginJson(
      CMS_MEDIA_UPLOAD_PATH,
      "DELETE",
      {
        submissionId,
        scope: asset.scope,
        publicId: asset.publicId,
        secureUrl: asset.secureUrl,
        stagedToken: asset.stagedToken,
      },
      "rollback",
    );
    return { publicId: asset.publicId, removed: true };
  } catch {
    return { publicId: asset.publicId, removed: false };
  }
}

export async function rollbackStagedCmsMediaAssets(
  submissionId: string,
  assets: readonly CmsStagedMediaAsset[],
): Promise<CmsMediaRollbackResult> {
  assertSubmissionId(submissionId);
  const uniqueAssets = assets.filter(
    (asset, index) =>
      assets.findIndex((candidate) => candidate.publicId === asset.publicId) === index,
  );
  const items: CmsMediaRollbackItemResult[] = [];
  for (const asset of uniqueAssets) {
    items.push(await rollbackOne(submissionId, asset));
  }
  const removed = items.filter((item) => item.removed).length;
  return {
    attempted: items.length,
    removed,
    failed: items.length - removed,
    items,
  };
}

export async function uploadCmsMediaSequentially<TKey extends string = string>({
  submissionId,
  items,
  signal,
  onProgress,
  rollbackCompletedOnError = true,
}: UploadCmsMediaSequentiallyOptions<TKey>): Promise<
  readonly CmsMediaUploadItemResult<TKey>[]
> {
  assertSubmissionId(submissionId);
  const results: CmsMediaUploadItemResult<TKey>[] = [];

  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const asset = await uploadPreparedCmsImage({
        submissionId,
        scope: item.scope,
        image: item.image,
        signal,
        onProgress: ({ stage, percent }) => {
          onProgress?.({
            key: item.key,
            itemIndex: index,
            itemCount: items.length,
            stage,
            itemPercent: percent,
            overallPercent: items.length
              ? Math.round(((index + percent / 100) / items.length) * 100)
              : 100,
          });
        },
      });
      results.push({ key: item.key, asset });
    }
    return results;
  } catch (error) {
    if (rollbackCompletedOnError && results.length) {
      await rollbackStagedCmsMediaAssets(
        submissionId,
        results.map((result) => result.asset),
      );
    }
    throw error;
  }
}

export function createCmsMediaSubmissionEnvelope(
  submissionId: string,
  assets: readonly CmsStagedMediaAsset[],
) {
  assertSubmissionId(submissionId);
  return {
    submissionId,
    assets: assets.map(({ scope, publicId, secureUrl, stagedToken }) => ({
      scope,
      publicId,
      secureUrl,
      stagedToken,
    })),
  } as const;
}
