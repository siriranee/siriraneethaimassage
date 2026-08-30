import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getAdminAvailability } from "@/server/cms/booking-service";
import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireCmsApiUser("bookings:view");
  if (response) return response;

  try {
    const url = new URL(request.url);
    const slots = await getAdminAvailability({
      serviceId: url.searchParams.get("serviceId") ?? "",
      durationMinutes: Number(url.searchParams.get("durationMinutes")),
      localDate: url.searchParams.get("localDate") ?? "",
    });
    return cmsNoStoreJson({ slots });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
