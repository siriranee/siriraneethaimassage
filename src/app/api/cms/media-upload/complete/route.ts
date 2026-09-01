import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { completeCmsMediaUpload } from "@/server/media/cloudinary-service";
import { cmsMediaErrorResponse } from "@/server/media/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("content:write");
  if (response || !user) return response;

  try {
    const asset = await completeCmsMediaUpload(
      await readCmsJsonObject(request, 32_000),
      user,
      getRequestId(request),
    );
    return cmsNoStoreJson({ asset }, { status: 201 });
  } catch (error) {
    return cmsMediaErrorResponse(error);
  }
}
