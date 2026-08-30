import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { createCmsService } from "@/server/cms/content-service";
import {
  cmsErrorResponse,
  cmsNoStoreJson,
  readCmsJsonObject,
} from "@/server/cms/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const service = await createCmsService(await readCmsJsonObject(request), {
      actor: user,
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson({ service }, { status: 201 });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
