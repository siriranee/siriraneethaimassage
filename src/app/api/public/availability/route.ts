import { NextResponse } from "next/server";

import { getPublicAvailability } from "@/server/booking/public-availability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await getPublicAvailability({
      serviceId: (url.searchParams.get("serviceId") ?? "").slice(0, 120),
      durationMinutes: Number(url.searchParams.get("durationMinutes")),
      localDate: (url.searchParams.get("localDate") ?? "").slice(0, 10),
    });
    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.json(
      {
        status: "disabled",
        message: "Availability is temporarily unavailable. Please try again later.",
        slots: [],
      },
      { status: 503 },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
