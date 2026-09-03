import "server-only";

import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";
import { CmsConflictError } from "@/server/cms/repositories";
import {
  CmsUserConflictError,
  CmsUserNotFoundError,
  CmsUserRateLimitError,
  CmsUserValidationError,
} from "@/server/cms/user-core";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
  UnsupportedRequestBodyError,
} from "@/server/http/request-body";

export async function readCmsUserJsonObject(request: Request) {
  const value = await readJsonBody(request, 16_000);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidJsonBodyError();
  }
  return value as Record<string, unknown>;
}

export function cmsUserErrorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return cmsNoStoreJson({ error: error.message }, { status: 413 });
  }
  if (error instanceof UnsupportedRequestBodyError) {
    return cmsNoStoreJson({ error: error.message }, { status: 415 });
  }
  if (error instanceof InvalidJsonBodyError) {
    return cmsNoStoreJson({ error: "Invalid request." }, { status: 400 });
  }
  if (error instanceof CmsUserRateLimitError) {
    return cmsNoStoreJson(
      { error: error.message },
      {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }
  if (error instanceof CmsUserValidationError) {
    return cmsNoStoreJson(
      { error: error.message, fields: error.fields },
      { status: 422 },
    );
  }
  if (error instanceof CmsUserConflictError) {
    return cmsNoStoreJson(
      { error: error.message, fields: error.fields },
      { status: 409 },
    );
  }
  if (error instanceof CmsConflictError) {
    return cmsNoStoreJson({ error: error.message }, { status: 409 });
  }
  if (error instanceof CmsUserNotFoundError) {
    return cmsNoStoreJson({ error: error.message }, { status: 404 });
  }
  return cmsErrorResponse(error);
}
