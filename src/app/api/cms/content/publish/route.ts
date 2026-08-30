import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { publishCmsContent } from "@/server/cms/content-service";
import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("content:publish");
  if (response || !user) return response;

  try {
    const publication = await publishCmsContent({
      actor: user,
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson({ publication });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
