import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { restoreCmsPublicationToDraft } from "@/server/cms/content-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";

export const dynamic = "force-dynamic";
type RouteContext = { readonly params: Promise<{ readonly publicationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:publish");
  if (response || !user) return response;
  try {
    const body = await readCmsJsonObject(request);
    const { publicationId } = await context.params;
    const content = await restoreCmsPublicationToDraft(
      publicationId,
      Number(body.expectedRevision),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ content });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
