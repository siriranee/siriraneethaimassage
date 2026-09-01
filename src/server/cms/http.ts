import "server-only";

import { NextResponse } from "next/server";

import { CmsValidationError } from "@/server/cms/content-validation";
import { CmsConflictError } from "@/server/cms/repositories";
import { CmsMediaValidationError } from "@/server/media/policy";

export async function readCmsJsonObject(
  request: Request,
  maximumBytes = 128_000,
) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) {
    throw new CmsValidationError("Request is too large.");
  }

  const text = await request.text();
  if (text.length > maximumBytes) {
    throw new CmsValidationError("Request is too large.");
  }

  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CmsValidationError("Request must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

export function cmsNoStoreJson(
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function cmsErrorResponse(error: unknown) {
  if (
    error instanceof CmsValidationError ||
    error instanceof CmsMediaValidationError
  ) {
    return cmsNoStoreJson(
      {
        error: error.message,
        ...(error instanceof CmsValidationError ? { fields: error.fields } : {}),
      },
      { status: 422 },
    );
  }

  if (error instanceof CmsConflictError) {
    return cmsNoStoreJson({ error: error.message }, { status: 409 });
  }

  if (error instanceof SyntaxError) {
    return cmsNoStoreJson({ error: "Invalid JSON request." }, { status: 400 });
  }

  const message =
    error instanceof Error ? error.message : "The request could not be completed.";
  const safeMessage =
    /not found|changed by another request|disabled/i.test(message)
      ? message
      : "The request could not be completed.";

  return cmsNoStoreJson({ error: safeMessage }, { status: 400 });
}
