import "server-only";

import {
  parseAppointmentPreferenceInput,
  type AppointmentPreference,
  type AppointmentSearchParams,
} from "@/lib/contact-links";
import { getPublishedCmsContent } from "@/server/cms/content-service";

export async function resolvePublishedAppointmentPreference(
  searchParams: AppointmentSearchParams,
): Promise<AppointmentPreference | null> {
  const input = parseAppointmentPreferenceInput(searchParams);

  if (!input) {
    return null;
  }

  const content = await getPublishedCmsContent();
  const service = content.services.find(
    (candidate) =>
      candidate.status === "published" &&
      candidate.slug === input.serviceSlug,
  );
  const price = service?.prices.find(
    (candidate) =>
      candidate.active &&
      candidate.durationMinutes === input.durationMinutes,
  );

  if (!service || !price) {
    return null;
  }

  return {
    ...input,
    serviceSlug: service.slug,
    serviceName: service.name,
    priceEur: price.priceCents / 100,
  };
}
