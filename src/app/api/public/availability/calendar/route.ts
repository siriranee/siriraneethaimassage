import { NextResponse } from "next/server";

import { getPublicAvailabilityCalendar } from "@/server/booking/public-availability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await getPublicAvailabilityCalendar({
      serviceId: (url.searchParams.get("serviceId") ?? "").slice(0, 120),
      durationMinutes: Number(url.searchParams.get("durationMinutes")),
      month: (url.searchParams.get("month") ?? "").slice(0, 7),
    });
    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.json(
      {
        status: "disabled",
        message: "The booking calendar is temporarily unavailable. Contact the spa directly.",
        month: "",
        minimumDate: "",
        maximumDate: "",
        days: [],
      },
      { status: 503 },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
