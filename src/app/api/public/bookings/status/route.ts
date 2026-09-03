import { NextResponse } from "next/server";

import {
  checkPublicBookingStatusRateLimit,
  lookupPublicBookingStatus,
  PublicBookingStatusRateLimitError,
} from "@/server/booking/public-status";
import {
  getRequestAddress,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import { CmsValidationError } from "@/server/cms/content-validation";
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
    await checkPublicBookingStatusRateLimit(getRequestAddress(request));
    const bookingStatus = await lookupPublicBookingStatus(
      await readJsonBody(request, 4_096),
    );

    if (!bookingStatus) {
      return json(
        {
          error:
            "No booking status was found. Check the booking ID or reference and try again.",
        },
        { status: 404 },
      );
    }

    return json({ bookingStatus });
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
    if (error instanceof PublicBookingStatusRateLimitError) {
      const response = json({ error: error.message }, { status: 429 });
      response.headers.set("Retry-After", "900");
      return response;
    }
    if (error instanceof CmsValidationError) {
      return json(
        { error: error.message, fields: error.fields },
        { status: 422 },
      );
    }

    return json(
      { error: "Booking status is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
