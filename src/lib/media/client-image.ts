export const CLIENT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export const SUPPORTED_CLIENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedClientImageType =
  (typeof SUPPORTED_CLIENT_IMAGE_TYPES)[number];

export type ClientImageValidationScope =
  | "selection"
  | "file-header"
  | "animation"
  | "decode"
  | "dimensions"
  | "encoding";

export type ClientImageValidationCode =
  | "empty-file"
  | "unsupported-type"
  | "type-mismatch"
  | "animated-image"
  | "file-too-large"
  | "invalid-image"
  | "dimensions-exceeded"
  | "pixels-exceeded"
  | "processing-unavailable"
  | "encoding-failed"
  | "output-too-large"
  | "aborted";

export type ClientImageValidationIssue = Readonly<{
  code: ClientImageValidationCode;
  scope: ClientImageValidationScope;
  message: string;
}>;

export type ClientImageDimensions = Readonly<{
  width: number;
  height: number;
}>;

export type ClientImageInspection = Readonly<{
  mimeType: SupportedClientImageType;
  dimensions: ClientImageDimensions | null;
  animated: boolean;
}>;

export type ClientImageValidationResult =
  | Readonly<{
      ok: true;
      inspection: ClientImageInspection;
    }>
  | Readonly<{
      ok: false;
      issue: ClientImageValidationIssue;
    }>;

export type ClientImagePreparationPhase =
  | "validating"
  | "decoding"
  | "resizing"
  | "encoding"
  | "ready";

export type ClientImagePreparationProgress = Readonly<{
  phase: ClientImagePreparationPhase;
  percent: number;
}>;

export type ClientImagePreparationOptions = Readonly<{
  maxInputBytes?: number;
  maxInputWidth?: number;
  maxInputHeight?: number;
  maxInputPixels?: number;
  maxOutputBytes?: number;
  outputWidthLimit?: number;
  outputHeightLimit?: number;
  quality?: number;
  outputType?: "image/webp" | "image/jpeg";
  jpegFallback?: boolean;
  keepOriginalWhenSmaller?: boolean;
  jpegBackground?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ClientImagePreparationProgress) => void;
}>;

export type PreparedClientImage = Readonly<{
  id: string;
  file: File;
  original: Readonly<{
    name: string;
    bytes: number;
    mimeType: SupportedClientImageType;
    width: number;
    height: number;
  }>;
  prepared: Readonly<{
    bytes: number;
    mimeType: SupportedClientImageType;
    width: number;
    height: number;
  }>;
  wasResized: boolean;
  wasReencoded: boolean;
}>;

type ResolvedClientImageOptions = Required<
  Omit<ClientImagePreparationOptions, "signal" | "onProgress">
> &
  Pick<ClientImagePreparationOptions, "signal" | "onProgress">;

type DecodedImage = {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  dispose: () => void;
};

const DEFAULT_OPTIONS: Required<
  Omit<ClientImagePreparationOptions, "signal" | "onProgress">
> = {
  maxInputBytes: 20 * 1024 * 1024,
  maxInputWidth: 12_000,
  maxInputHeight: 12_000,
  maxInputPixels: 60_000_000,
  maxOutputBytes: 5 * 1024 * 1024,
  outputWidthLimit: 2_560,
  outputHeightLimit: 2_560,
  quality: 0.82,
  outputType: "image/webp",
  jpegFallback: true,
  keepOriginalWhenSmaller: false,
  jpegBackground: "#ffffff",
};

const SUPPORTED_TYPE_SET = new Set<string>(SUPPORTED_CLIENT_IMAGE_TYPES);

export class ClientImagePreparationError extends Error {
  readonly code: ClientImageValidationCode;
  readonly scope: ClientImageValidationScope;

  constructor(issue: ClientImageValidationIssue, options?: ErrorOptions) {
    super(issue.message, options);
    this.name = "ClientImagePreparationError";
    this.code = issue.code;
    this.scope = issue.scope;
  }

  toIssue(): ClientImageValidationIssue {
    return {
      code: this.code,
      scope: this.scope,
      message: this.message,
    };
  }
}

function preparationError(
  code: ClientImageValidationCode,
  scope: ClientImageValidationScope,
  message: string,
  cause?: unknown,
) {
  return new ClientImagePreparationError(
    { code, scope, message },
    cause === undefined ? undefined : { cause },
  );
}

function resolveOptions(
  options: ClientImagePreparationOptions = {},
): ResolvedClientImageOptions {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const positiveIntegerKeys = [
    "maxInputBytes",
    "maxInputWidth",
    "maxInputHeight",
    "maxInputPixels",
    "maxOutputBytes",
    "outputWidthLimit",
    "outputHeightLimit",
  ] as const;

  for (const key of positiveIntegerKeys) {
    if (!Number.isSafeInteger(resolved[key]) || resolved[key] <= 0) {
      throw new RangeError(`${key} must be a positive safe integer.`);
    }
  }

  if (!Number.isFinite(resolved.quality) || resolved.quality <= 0 || resolved.quality > 1) {
    throw new RangeError("quality must be greater than 0 and no more than 1.");
  }

  if (!resolved.jpegBackground.trim()) {
    throw new RangeError("jpegBackground must not be empty.");
  }

  return resolved;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw preparationError(
      "aborted",
      "selection",
      "Image preparation was cancelled.",
    );
  }
}

function reportProgress(
  options: ResolvedClientImageOptions,
  phase: ClientImagePreparationPhase,
  percent: number,
) {
  options.onProgress?.({ phase, percent });
}

function bytesEqual(bytes: Uint8Array, offset: number, values: readonly number[]) {
  return values.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function inspectJpeg(bytes: Uint8Array): ClientImageInspection {
  let dimensions: ClientImageDimensions | null = null;
  let offset = 2;

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 1 >= bytes.length) break;

    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) break;

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && length >= 7) {
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      if (width > 0 && height > 0) dimensions = { width, height };
      break;
    }

    offset += length;
  }

  return { mimeType: "image/jpeg", dimensions, animated: false };
}

function inspectPng(bytes: Uint8Array): ClientImageInspection {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") {
    throw preparationError(
      "invalid-image",
      "file-header",
      "The PNG file header is incomplete or invalid.",
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
  let animated = false;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset, false);
    const chunkType = ascii(bytes, offset + 4, 4);
    const nextOffset = offset + 12 + chunkLength;
    if (nextOffset > bytes.length) break;
    if (chunkType === "acTL") animated = true;
    if (chunkType === "IEND") break;
    offset = nextOffset;
  }

  return { mimeType: "image/png", dimensions, animated };
}

function inspectWebp(bytes: Uint8Array): ClientImageInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dimensions: ClientImageDimensions | null = null;
  let animated = false;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + chunkLength > bytes.length) break;

    if (chunkType === "ANIM" || chunkType === "ANMF") animated = true;
    if (chunkType === "VP8X" && chunkLength >= 10) {
      animated ||= Boolean((bytes[dataOffset] ?? 0) & 0x02);
      dimensions = {
        width: uint24LittleEndian(bytes, dataOffset + 4) + 1,
        height: uint24LittleEndian(bytes, dataOffset + 7) + 1,
      };
    } else if (chunkType === "VP8 " && chunkLength >= 10) {
      if (bytesEqual(bytes, dataOffset + 3, [0x9d, 0x01, 0x2a])) {
        dimensions = {
          width:
            (((bytes[dataOffset + 7] ?? 0) << 8) |
              (bytes[dataOffset + 6] ?? 0)) &
            0x3fff,
          height:
            (((bytes[dataOffset + 9] ?? 0) << 8) |
              (bytes[dataOffset + 8] ?? 0)) &
            0x3fff,
        };
      }
    } else if (
      chunkType === "VP8L" &&
      chunkLength >= 5 &&
      bytes[dataOffset] === 0x2f
    ) {
      const b1 = bytes[dataOffset + 1] ?? 0;
      const b2 = bytes[dataOffset + 2] ?? 0;
      const b3 = bytes[dataOffset + 3] ?? 0;
      const b4 = bytes[dataOffset + 4] ?? 0;
      dimensions = {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + ((b4 & 0x0f) << 10) + (b3 << 2) + ((b2 & 0xc0) >> 6),
      };
    }

    offset = dataOffset + chunkLength + (chunkLength % 2);
  }

  return { mimeType: "image/webp", dimensions, animated };
}

export function inspectClientImageBytes(
  input: ArrayBuffer | Uint8Array,
): ClientImageInspection {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytesEqual(bytes, 0, [0xff, 0xd8])) return inspectJpeg(bytes);
  if (bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return inspectPng(bytes);
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return inspectWebp(bytes);
  }

  throw preparationError(
    "unsupported-type",
    "file-header",
    "Choose a JPEG, PNG or still WebP image.",
  );
}

function checkPreflightDimensions(
  dimensions: ClientImageDimensions | null,
  options: ResolvedClientImageOptions,
) {
  if (!dimensions) return;
  const { width, height } = dimensions;
  const largestPermittedDimension = Math.max(
    options.maxInputWidth,
    options.maxInputHeight,
  );
  if (width > largestPermittedDimension || height > largestPermittedDimension) {
    throw preparationError(
      "dimensions-exceeded",
      "dimensions",
      `The image is ${width} × ${height}px. Each side must be ${largestPermittedDimension}px or smaller.`,
    );
  }
  if (width * height > options.maxInputPixels) {
    throw preparationError(
      "pixels-exceeded",
      "dimensions",
      `The image contains too many pixels. Choose one below ${formatPixelCount(options.maxInputPixels)}.`,
    );
  }
}

function validateFileMetadata(file: File, options: ResolvedClientImageOptions) {
  if (!file.size) {
    throw preparationError(
      "empty-file",
      "selection",
      "The selected file is empty.",
    );
  }
  if (file.size > options.maxInputBytes) {
    throw preparationError(
      "file-too-large",
      "selection",
      `The original file must be ${formatBytes(options.maxInputBytes)} or smaller.`,
    );
  }
  if (file.type && !SUPPORTED_TYPE_SET.has(file.type)) {
    throw preparationError(
      "unsupported-type",
      "selection",
      "Choose a JPEG, PNG or still WebP image.",
    );
  }
}

async function inspectFile(
  file: File,
  options: ResolvedClientImageOptions,
): Promise<ClientImageInspection> {
  validateFileMetadata(file, options);
  throwIfAborted(options.signal);
  const inspection = inspectClientImageBytes(await file.arrayBuffer());
  throwIfAborted(options.signal);

  if (file.type && file.type !== inspection.mimeType) {
    throw preparationError(
      "type-mismatch",
      "file-header",
      "The file contents do not match its reported image type.",
    );
  }
  if (inspection.animated) {
    throw preparationError(
      "animated-image",
      "animation",
      "Animated images are not supported. Choose a still JPEG, PNG or WebP image.",
    );
  }
  checkPreflightDimensions(inspection.dimensions, options);
  return inspection;
}

export async function validateClientImageFile(
  file: File,
  options: ClientImagePreparationOptions = {},
): Promise<ClientImageValidationResult> {
  try {
    const inspection = await inspectFile(file, resolveOptions(options));
    return { ok: true, inspection };
  } catch (error) {
    return { ok: false, issue: toClientImageValidationIssue(error) };
  }
}

function decodeWithHtmlImage(file: File, signal?: AbortSignal): Promise<DecodedImage> {
  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw preparationError(
      "processing-unavailable",
      "decode",
      "Image preparation is not available in this browser.",
    );
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  return new Promise((resolve, reject) => {
    let settled = false;
    const disposeUrl = () => URL.revokeObjectURL(objectUrl);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      disposeUrl();
      reject(
        error instanceof ClientImagePreparationError
          ? error
          : preparationError(
              "invalid-image",
              "decode",
              "The browser could not decode this image.",
              error,
            ),
      );
    };
    const abort = () =>
      fail(
        preparationError(
          "aborted",
          "selection",
          "Image preparation was cancelled.",
        ),
      );

    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: disposeUrl,
      });
    };
    image.onerror = fail;
    image.src = objectUrl;
  });
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<DecodedImage> {
  throwIfAborted(signal);
  if (typeof createImageBitmap !== "function") {
    return decodeWithHtmlImage(file, signal);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (firstError) {
    throwIfAborted(signal);
    try {
      bitmap = await createImageBitmap(file);
    } catch (fallbackError) {
      throw preparationError(
        "invalid-image",
        "decode",
        "The browser could not decode this image.",
        fallbackError ?? firstError,
      );
    }
  }
  throwIfAborted(signal);

  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close(),
  };
}

function checkDecodedDimensions(
  dimensions: ClientImageDimensions,
  options: ResolvedClientImageOptions,
) {
  const { width, height } = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw preparationError(
      "invalid-image",
      "decode",
      "The decoded image has invalid dimensions.",
    );
  }
  if (width > options.maxInputWidth || height > options.maxInputHeight) {
    throw preparationError(
      "dimensions-exceeded",
      "dimensions",
      `The decoded image is ${width} × ${height}px. The limit is ${options.maxInputWidth} × ${options.maxInputHeight}px.`,
    );
  }
  if (width * height > options.maxInputPixels) {
    throw preparationError(
      "pixels-exceeded",
      "dimensions",
      `The decoded image contains too many pixels. Choose one below ${formatPixelCount(options.maxInputPixels)}.`,
    );
  }
}

export function containClientImageDimensions(
  width: number,
  height: number,
  widthLimit: number,
  heightLimit: number,
): ClientImageDimensions {
  if (![width, height, widthLimit, heightLimit].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Image dimensions must be positive finite numbers.");
  }

  const scale = Math.min(1, widthLimit / width, heightLimit / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== mimeType) {
        reject(
          preparationError(
            "encoding-failed",
            "encoding",
            `This browser could not encode ${mimeType === "image/webp" ? "WebP" : "JPEG"}.`,
          ),
        );
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function addJpegBackground(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  colour: string,
) {
  context.save();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = colour;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function outputFileName(name: string, mimeType: "image/webp" | "image/jpeg") {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "image";
  return `${stem}.${mimeType === "image/webp" ? "webp" : "jpg"}`;
}

function createPreparationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `prepared-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function prepareClientImage(
  file: File,
  options: ClientImagePreparationOptions = {},
): Promise<PreparedClientImage> {
  const resolved = resolveOptions(options);
  reportProgress(resolved, "validating", 8);
  const inspection = await inspectFile(file, resolved);
  reportProgress(resolved, "decoding", 28);
  const decoded = await decodeImage(file, resolved.signal);

  try {
    checkDecodedDimensions(
      { width: decoded.width, height: decoded.height },
      resolved,
    );
    throwIfAborted(resolved.signal);
    reportProgress(resolved, "resizing", 52);

    const preparedDimensions = containClientImageDimensions(
      decoded.width,
      decoded.height,
      resolved.outputWidthLimit,
      resolved.outputHeightLimit,
    );
    const wasResized =
      preparedDimensions.width !== decoded.width ||
      preparedDimensions.height !== decoded.height;

    if (typeof document === "undefined") {
      throw preparationError(
        "processing-unavailable",
        "encoding",
        "Image preparation is not available in this browser.",
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = preparedDimensions.width;
    canvas.height = preparedDimensions.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw preparationError(
        "processing-unavailable",
        "encoding",
        "The browser could not start the image compressor.",
      );
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      decoded.source,
      0,
      0,
      preparedDimensions.width,
      preparedDimensions.height,
    );
    throwIfAborted(resolved.signal);
    reportProgress(resolved, "encoding", 76);

    let blob: Blob;
    let encodedType = resolved.outputType;
    try {
      if (encodedType === "image/jpeg") {
        addJpegBackground(context, canvas, resolved.jpegBackground);
      }
      blob = await encodeCanvas(canvas, encodedType, resolved.quality);
    } catch (error) {
      if (encodedType !== "image/webp" || !resolved.jpegFallback) throw error;
      encodedType = "image/jpeg";
      addJpegBackground(context, canvas, resolved.jpegBackground);
      blob = await encodeCanvas(canvas, encodedType, resolved.quality);
    }
    throwIfAborted(resolved.signal);

    const canKeepOriginal =
      resolved.keepOriginalWhenSmaller && !wasResized && file.size <= blob.size;
    const preparedFile = canKeepOriginal
      ? file
      : new File([blob], outputFileName(file.name, encodedType), {
          type: encodedType,
          lastModified: Date.now(),
        });
    const preparedMimeType = (canKeepOriginal
      ? inspection.mimeType
      : encodedType) as SupportedClientImageType;

    if (preparedFile.size > resolved.maxOutputBytes) {
      throw preparationError(
        "output-too-large",
        "encoding",
        `The prepared image is still larger than ${formatBytes(resolved.maxOutputBytes)}. Choose a smaller source image.`,
      );
    }

    reportProgress(resolved, "ready", 100);
    return {
      id: createPreparationId(),
      file: preparedFile,
      original: {
        name: file.name,
        bytes: file.size,
        mimeType: inspection.mimeType,
        width: decoded.width,
        height: decoded.height,
      },
      prepared: {
        bytes: preparedFile.size,
        mimeType: preparedMimeType,
        width: canKeepOriginal ? decoded.width : preparedDimensions.width,
        height: canKeepOriginal ? decoded.height : preparedDimensions.height,
      },
      wasResized,
      wasReencoded: !canKeepOriginal,
    };
  } finally {
    decoded.dispose();
  }
}

export function toClientImageValidationIssue(
  error: unknown,
): ClientImageValidationIssue {
  if (error instanceof ClientImagePreparationError) return error.toIssue();
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "aborted",
      scope: "selection",
      message: "Image preparation was cancelled.",
    };
  }
  return {
    code: "invalid-image",
    scope: "decode",
    message: "The image could not be prepared. Try another JPEG, PNG or WebP file.",
  };
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

function formatPixelCount(pixels: number) {
  return `${(pixels / 1_000_000).toFixed(0)} megapixels`;
}
