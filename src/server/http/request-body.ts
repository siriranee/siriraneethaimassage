import "server-only";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

export class UnsupportedRequestBodyError extends Error {
  constructor() {
    super("Content-Type must be application/json.");
    this.name = "UnsupportedRequestBodyError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Request body must be valid JSON.");
    this.name = "InvalidJsonBodyError";
  }
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new UnsupportedRequestBodyError();
  }

  const contentEncoding =
    request.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
  if (contentEncoding && contentEncoding !== "identity") {
    throw new UnsupportedRequestBodyError();
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) throw new InvalidJsonBodyError();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
