import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import {
  cleanupCmsMediaUpload,
  cleanupCmsMediaUploadWithCapability,
  createSignedCmsMediaUpload,
  CMS_MEDIA_UPLOAD_MAX_BYTES,
} from "@/server/media/cloudinary-service";
import {
  getCmsMediaCleanupGrantUserId,
  setCmsMediaCleanupGrantCookie,
} from "@/server/media/cleanup-grant";
import { getCloudinaryMediaReadiness } from "@/server/media/config";
import { cmsMediaErrorResponse } from "@/server/media/http";
import {
  CMS_MEDIA_ALLOWED_CONTENT_TYPES,
  CMS_MEDIA_SCOPES,
} from "@/server/media/policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireCmsApiUser("content:write");
  if (response) return response;

  return cmsNoStoreJson({
    media: {
      ...getCloudinaryMediaReadiness(),
      allowedContentTypes: CMS_MEDIA_ALLOWED_CONTENT_TYPES,
      maximumBytes: CMS_MEDIA_UPLOAD_MAX_BYTES,
      scopes: CMS_MEDIA_SCOPES,
    },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const upload = await createSignedCmsMediaUpload(
      await readCmsJsonObject(request, 32_000),
      user,
      getRequestId(request),
    );
    const result = cmsNoStoreJson({ upload });
    setCmsMediaCleanupGrantCookie(result, user.id);
    return result;
  } catch (error) {
    return cmsMediaErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const cleanupRequest = await readCmsJsonObject(request, 32_000);
    const { response, user } = await requireCmsApiUser("content:write");
    const requestId = getRequestId(request);
    if (user) {
      const result = await cleanupCmsMediaUpload(
        cleanupRequest,
        user,
        requestId,
      );
      return cmsNoStoreJson(result);
    }

    const capabilityUserId = await getCmsMediaCleanupGrantUserId();
    if (!capabilityUserId) {
      return response ?? cmsNoStoreJson({ error: "Unauthorized." }, { status: 401 });
    }
    const result = await cleanupCmsMediaUploadWithCapability(
      cleanupRequest,
      capabilityUserId,
      requestId,
    );
    return cmsNoStoreJson(result);
  } catch (error) {
    return cmsMediaErrorResponse(error);
  }
}
