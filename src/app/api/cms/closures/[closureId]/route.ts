import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsClosure } from "@/server/cms/booking-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";

export const dynamic = "force-dynamic";
type RouteContext = { readonly params: Promise<{ readonly closureId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("calendar:write");
  if (response || !user) return response;
  try {
    const body = await readCmsJsonObject(request);
    const { closureId } = await context.params;
    const closure = await updateCmsClosure(
      closureId,
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ closure });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
