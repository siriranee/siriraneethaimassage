import { requireCmsApiUser } from "@/server/cms/auth/guards";
import {
  getRequestAddress,
  getRequestId,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import { cmsNoStoreJson } from "@/server/cms/http";
import { createManagedCmsUser } from "@/server/cms/user-service";
import {
  cmsUserErrorResponse,
  readCmsUserJsonObject,
} from "@/server/cms/user-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("users:manage");
  if (response || !user) return response;

  try {
    const body = await readCmsUserJsonObject(request);
    const result = await createManagedCmsUser(body, {
      actor: user,
      address: getRequestAddress(request),
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson(result, { status: 201 });
  } catch (error) {
    return cmsUserErrorResponse(error);
  }
}
