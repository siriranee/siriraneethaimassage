import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { deleteAdminBooking, updateAdminBooking } from "@/server/cms/booking-service";
import { cmsErrorResponse, cmsNoStoreJson, readCmsJsonObject } from "@/server/cms/http";
import { getCmsBooking } from "@/server/cms/read-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly bookingId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { response } = await requireCmsApiUser("bookings:view");
  if (response) return response;
  const { bookingId } = await context.params;
  const booking = await getCmsBooking(bookingId);
  return booking
    ? cmsNoStoreJson({ booking })
    : cmsNoStoreJson({ error: "Booking not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("bookings:write");
  if (response || !user) return response;

  try {
    const body = await readCmsJsonObject(request);
    const { bookingId } = await context.params;
    const booking = await updateAdminBooking(
      bookingId,
      body,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ booking });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response, user } = await requireCmsApiUser("bookings:delete");
  if (response || !user) return response;

  try {
    const body = await readCmsJsonObject(request);
    const { bookingId } = await context.params;
    const deleted = await deleteAdminBooking(
      bookingId,
      Number(body.expectedVersion),
      { actor: user, requestId: getRequestId(request) },
    );
    return cmsNoStoreJson({ deleted });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
