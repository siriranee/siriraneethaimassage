import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsVoucher } from "@/server/cms/content-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";

export const dynamic = "force-dynamic";
type RouteContext = { readonly params: Promise<{ readonly voucherId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;
  try {
    const body = await readCmsJsonObject(request);
    const { voucherId } = await context.params;
    const voucher = await updateCmsVoucher(
      voucherId,
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ voucher });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
