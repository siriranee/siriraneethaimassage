import { getCmsMode } from "@/server/cms/config";
import { getCmsRepository } from "@/server/cms/repositories";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const mode = getCmsMode();
  if (mode === "disabled") {
    return response({ status: "ok", cms: "disabled", publicBooking: "disabled" });
  }

  try {
    const repository = getCmsRepository();
    const [content, publication] = await Promise.all([
      repository.getContent(),
      repository.getPublishedContent(),
    ]);
    return response({
      status: "ok",
      cms: mode,
      publication: publication ? "available" : "missing",
      publicBooking: content.bookingSettings.publicBookingEnabled ? "configured" : "disabled",
    });
  } catch {
    return response({ status: "unhealthy", cms: mode }, 503);
  }
}
