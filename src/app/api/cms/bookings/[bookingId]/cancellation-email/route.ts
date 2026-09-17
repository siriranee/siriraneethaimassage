import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { isSameOriginMutation } from "@/server/cms/auth/origin";
import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";
import {
  attemptCustomerBookingCancellationEmail,
  customerBookingCancellationEmailNotificationId,
} from "@/server/cms/notification-service";
import { getCmsBooking } from "@/server/cms/read-service";
import { getCmsRepository } from "@/server/cms/repositories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  readonly params: Promise<{ readonly bookingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response } = await requireCmsApiUser("bookings:write");
  if (response) return response;

  try {
    const { bookingId } = await context.params;
    const booking = await getCmsBooking(bookingId);
    if (!booking) {
      return cmsNoStoreJson({ error: "Booking not found." }, { status: 404 });
    }
    if (booking.status !== "cancelled") {
      return cmsNoStoreJson(
        { error: "Only a cancelled booking can receive a cancellation email." },
        { status: 409 },
      );
    }
    const repository = getCmsRepository();
    const notification = await repository.getNotification(
      customerBookingCancellationEmailNotificationId(booking.id),
    );
    if (
      !notification ||
      notification.audience !== "customer" ||
      notification.channel !== "email" ||
      notification.kind !== "booking-cancelled"
    ) {
      return cmsNoStoreJson(
        { error: "No cancellation email is available to retry." },
        { status: 404 },
      );
    }
    const cancellationEmail = await attemptCustomerBookingCancellationEmail(
      repository,
      booking,
    );
    return cmsNoStoreJson({ cancellationEmail });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
