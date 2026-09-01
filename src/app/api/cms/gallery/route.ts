import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { createCmsGalleryItem } from "@/server/cms/content-service";
import { cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { cmsMediaErrorResponse } from "@/server/media/http";
import { removeCmsMediaSubmissionEnvelope } from "@/server/media/submission";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const { body, submission } = removeCmsMediaSubmissionEnvelope(
      await readCmsJsonObject(request),
    );
    const item = await createCmsGalleryItem(body, {
      actor: user,
      requestId: getRequestId(request),
      mediaSubmission: submission,
    });
    return cmsNoStoreJson({ item }, { status: 201 });
  } catch (error) {
    return cmsMediaErrorResponse(error);
  }
}
