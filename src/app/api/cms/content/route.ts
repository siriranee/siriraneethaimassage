import { getCmsContent } from "@/server/cms/content-service";
import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { cmsNoStoreJson } from "@/server/cms/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireCmsApiUser("content:view");
  if (response) return response;

  return cmsNoStoreJson({ content: await getCmsContent() });
}
