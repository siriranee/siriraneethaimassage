import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsSiteSettings } from "@/server/cms/content-service";
import {
  cmsErrorResponse,
  cmsNoStoreJson,
  readCmsJsonObject,
} from "@/server/cms/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("settings:write");
  if (response || !user) return response;

  try {
    const body = await readCmsJsonObject(request);
    const site = await updateCmsSiteSettings(
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ site });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
