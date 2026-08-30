import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsGalleryItem } from "@/server/cms/content-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const body = await readCmsJsonObject(request);
    const { itemId } = await context.params;
    const item = await updateCmsGalleryItem(
      itemId,
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ item });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
