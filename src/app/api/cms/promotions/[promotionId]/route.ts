import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsPromotion } from "@/server/cms/content-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";

export const dynamic = "force-dynamic";
type RouteContext = { readonly params: Promise<{ readonly promotionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;
  try {
    const body = await readCmsJsonObject(request);
    const { promotionId } = await context.params;
    const promotion = await updateCmsPromotion(
      promotionId,
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ promotion });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
