import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { isSameOriginMutation } from "@/server/cms/auth/origin";
import { cmsErrorResponse, cmsNoStoreJson } from "@/server/cms/http";
import { retryBookingEmailNotification } from "@/server/cms/notification-service";
import { getCmsRepository } from "@/server/cms/repositories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: {
  params: Promise<{ bookingId: string; notificationId: string }>;
}) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }
  const { response } = await requireCmsApiUser("bookings:write");
  if (response) return response;
  try {
    const { bookingId, notificationId } = await context.params;
    const repository = getCmsRepository();
    const notification = await repository.getNotification(notificationId);
    if (!notification || notification.bookingId !== bookingId || notification.channel !== "email") {
      return cmsNoStoreJson({ error: "Booking email not found." }, { status: 404 });
    }
    const outcome = await retryBookingEmailNotification(repository, notificationId);
    const updated = await repository.getNotification(notificationId);
    // Only return presentation metadata, never claims or private payload hashes.
    return cmsNoStoreJson({ outcome, notification: updated ? {
      id: updated.id, status: updated.status, provider: updated.provider,
      deliveryStatus: updated.deliveryStatus,
      attemptCount: updated.attemptCount, lastError: updated.lastError,
      providerEventAt: updated.providerEventAt,
    } : null });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
