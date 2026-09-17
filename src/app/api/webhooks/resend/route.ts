import { handleResendDeliveryWebhook } from "@/server/booking/email-delivery-webhook";
import { getCmsMode } from "@/server/cms/config";
import { getCmsRepository } from "@/server/cms/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleResendDeliveryWebhook(request, {
    secret: process.env.RESEND_WEBHOOK_SECRET,
    repository: () => {
      if (getCmsMode() !== "mongodb") throw new Error("Persistent CMS storage is required.");
      return getCmsRepository();
    },
  });
}
