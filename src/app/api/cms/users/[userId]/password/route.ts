import { requireCmsApiUser } from "@/server/cms/auth/guards";
import {
  getRequestAddress,
  getRequestId,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import {
  clearCmsSessionCookie,
} from "@/server/cms/auth/session";
import { cmsNoStoreJson } from "@/server/cms/http";
import { resetManagedCmsUserPassword } from "@/server/cms/user-service";
import {
  cmsUserErrorResponse,
  readCmsUserJsonObject,
} from "@/server/cms/user-http";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly userId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("users:manage");
  if (response || !user) return response;

  try {
    const body = await readCmsUserJsonObject(request);
    const { userId } = await context.params;
    const result = await resetManagedCmsUserPassword(userId, body, {
      actor: user,
      address: getRequestAddress(request),
      requestId: getRequestId(request),
    });
    const nextResponse = cmsNoStoreJson(result);
    if (result.signedOut) clearCmsSessionCookie(nextResponse);
    return nextResponse;
  } catch (error) {
    return cmsUserErrorResponse(error);
  }
}
