import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { createCmsClosure } from "@/server/cms/booking-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { listCmsClosures } from "@/server/cms/read-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireCmsApiUser("calendar:view");
  if (response) return response;
  return cmsNoStoreJson({ closures: await listCmsClosures() });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("calendar:write");
  if (response || !user) return response;

  try {
    const closure = await createCmsClosure(await readCmsJsonObject(request), {
      actor: user,
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson({ closure }, { status: 201 });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
