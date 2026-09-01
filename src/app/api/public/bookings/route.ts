import { NextResponse } from "next/server";

import {
  checkPublicBookingRateLimit,
  createPublicBooking,
  PublicBookingRateLimitError,
} from "@/server/booking/public-booking";
import {
  getRequestAddress,
  getRequestId,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import { CmsValidationError } from "@/server/cms/content-validation";
import { CmsConflictError } from "@/server/cms/repositories";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
  UnsupportedRequestBodyError,
} from "@/server/http/request-body";

export const dynamic = "force-dynamic";

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    await checkPublicBookingRateLimit(getRequestAddress(request));
    const body = await readJsonBody(request, 32_000);
    const booking = await createPublicBooking(body, {
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      requestId: getRequestId(request),
    });

    return json(
      {
        booking: {
          reference: booking.reference,
          serviceName: booking.serviceName,
          durationMinutes: booking.durationMinutes,
          priceCents: booking.priceCents,
          currency: booking.currency,
          localDate: booking.localDate,
          localTime: booking.localTime,
          timezone: booking.timezone,
          status: booking.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: error.message }, { status: 413 });
    }
    if (error instanceof UnsupportedRequestBodyError) {
      return json({ error: error.message }, { status: 415 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PublicBookingRateLimitError) {
      const response = json({ error: error.message }, { status: 429 });
      response.headers.set("Retry-After", "900");
      return response;
    }
    if (error instanceof CmsConflictError) {
      return json({ error: error.message }, { status: 409 });
    }
    if (error instanceof CmsValidationError) {
      return json({ error: error.message, fields: error.fields }, { status: 422 });
    }

    return json(
      {
        error:
          error instanceof Error && /disabled/i.test(error.message)
            ? "Online booking is not available yet. Please try again later."
            : "The booking request could not be completed.",
      },
      { status: 503 },
    );
  }
}
