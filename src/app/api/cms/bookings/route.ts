import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { createAdminBooking } from "@/server/cms/booking-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { listCmsBookings } from "@/server/cms/read-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireCmsApiUser("bookings:view");
  if (response) return response;
  return cmsNoStoreJson({ bookings: await listCmsBookings() });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("bookings:write");
  if (response || !user) return response;

  try {
    const booking = await createAdminBooking(await readCmsJsonObject(request), {
      actor: user,
      requestId: getRequestId(request),
    });
    return cmsNoStoreJson({ booking }, { status: 201 });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
