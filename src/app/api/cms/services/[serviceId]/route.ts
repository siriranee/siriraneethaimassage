import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsService } from "@/server/cms/content-service";
import {
  cmsErrorResponse,
  cmsNoStoreJson,
  readCmsJsonObject,
} from "@/server/cms/http";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly serviceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const body = await readCmsJsonObject(request);
    const expectedVersion = Number(body.expectedVersion);
    const { serviceId } = await context.params;
    const service = await updateCmsService(
      serviceId,
      body,
      expectedVersion,
      { actor: user, requestId: getRequestId(request) },
    );

    return cmsNoStoreJson({ service });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
