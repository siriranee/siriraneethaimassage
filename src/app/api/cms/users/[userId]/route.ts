import { requireCmsApiUser } from "@/server/cms/auth/guards";
import {
  getRequestAddress,
  getRequestId,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import { cmsNoStoreJson } from "@/server/cms/http";
import { updateManagedCmsUser } from "@/server/cms/user-service";
import {
  cmsUserErrorResponse,
  readCmsUserJsonObject,
} from "@/server/cms/user-http";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("users:manage");
  if (response || !user) return response;

  try {
    const body = await readCmsUserJsonObject(request);
    const { userId } = await context.params;
    const result = await updateManagedCmsUser(userId, body, {
      actor: user,
      address: getRequestAddress(request),
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson(result);
  } catch (error) {
    return cmsUserErrorResponse(error);
  }
}
