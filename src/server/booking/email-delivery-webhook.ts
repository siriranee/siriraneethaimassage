import "server-only";
import { Resend } from "resend";
import { parseEmailDeliveryEvent } from "@/domain/booking/email-delivery";
import type { CmsRepository } from "@/server/cms/repositories/repository";
import {
  readRawJsonBody, RequestBodyTooLargeError, UnsupportedRequestBodyError,
} from "@/server/http/request-body";

function response(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleResendDeliveryWebhook(
  request: Request,
  dependencies: { secret: string | undefined; repository: () => CmsRepository },
) {
  const secret = dependencies.secret?.trim();
  if (!secret) return response(503, { error: "Email delivery tracking is not configured." });
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return response(401, { error: "Invalid webhook signature." });

  let event;
  try {
    const raw = await readRawJsonBody(request, 64 * 1024);
    // Verification is local, needs no send/read API access, and authenticates
    // the exact bytes before parsing. The SDK also rejects expired signatures.
    const verified = new Resend("re_webhook_verification_only").webhooks.verify({
      payload: raw, headers: { id, timestamp, signature }, webhookSecret: secret,
    });
    event = parseEmailDeliveryEvent(verified, id);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return response(413, { error: "Request is too large." });
    if (error instanceof UnsupportedRequestBodyError) return response(415, { error: "Unsupported request body." });
    return response(400, { error: "Invalid signed webhook payload." });
  }
  if (!event) return response(200, { received: true, ignored: true });
  try {
    await dependencies.repository().recordEmailDeliveryEvent(event);
    return response(200, { received: true });
  } catch {
    // Returning non-2xx asks the provider to retry; never log the raw payload.
    console.error("Could not persist email delivery metadata.");
    return response(503, { error: "Email delivery update could not be saved." });
  }
}
