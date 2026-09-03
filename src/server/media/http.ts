import "server-only";

import { CmsConflictError } from "@/server/cms/repositories";
import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";
import {
  CmsMediaConfigurationError,
} from "@/server/media/config";
import {
  CmsMediaProviderError,
  CmsMediaStateError,
} from "@/server/media/cloudinary-service";
import { CmsMediaValidationError } from "@/server/media/policy";

export function cmsMediaErrorResponse(
  error: unknown,
  details: Readonly<Record<string, unknown>> = {},
) {
  if (error instanceof CmsMediaValidationError) {
    return cmsNoStoreJson({ ...details, error: error.message }, { status: 422 });
  }
  if (error instanceof CmsMediaStateError || error instanceof CmsConflictError) {
    return cmsNoStoreJson({ ...details, error: error.message }, { status: 409 });
  }
  if (error instanceof CmsMediaConfigurationError) {
    return cmsNoStoreJson({ ...details, error: error.message }, { status: 503 });
  }
  if (error instanceof CmsMediaProviderError) {
    return cmsNoStoreJson({ ...details, error: error.message }, { status: 502 });
  }

  return cmsErrorResponse(error, details);
}
