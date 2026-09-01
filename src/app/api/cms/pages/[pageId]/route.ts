import { cmsPageIds, type CmsPageId } from "@/domain/cms/types";
import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsPage } from "@/server/cms/content-service";
import { cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { cmsMediaErrorResponse } from "@/server/media/http";
import { removeCmsMediaSubmissionEnvelope } from "@/server/media/submission";

export const dynamic = "force-dynamic";
type RouteContext = { readonly params: Promise<{ readonly pageId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;
  try {
    const requestBody = await readCmsJsonObject(request);
    const { body, submission } = removeCmsMediaSubmissionEnvelope(requestBody);
    const { pageId } = await context.params;
    if (!cmsPageIds.some((id) => id === pageId)) return cmsNoStoreJson({ error: "Website page not found." }, { status: 404 });
    const page = await updateCmsPage(pageId as CmsPageId, body, Number(body.expectedVersion), {
      actor: user,
      requestId: getRequestId(request),
      mediaSubmission: submission,
    });
    return cmsNoStoreJson({ page });
  } catch (error) {
    return cmsMediaErrorResponse(error);
  }
}
