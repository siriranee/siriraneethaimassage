import { siteConfig } from "@/content/site";

export type AcuityBookingOption = {
  readonly appointmentTypeId: string;
  readonly durationMinutes: number;
  readonly priceEur: number;
};

const configuredOwnerId = process.env.NEXT_PUBLIC_ACUITY_OWNER_ID?.trim();
const ownerId =
  configuredOwnerId && /^\d+$/.test(configuredOwnerId)
    ? configuredOwnerId
    : null;

export const acuityConfig = {
  ownerId,
  enabled: ownerId !== null && siteConfig.booking.acuityUrl !== null,
  embedBaseUrl: "https://app.acuityscheduling.com/schedule.php",
  resizeScriptUrl: "https://embed.acuityscheduling.com/js/embed.js",
  providerName: "Acuity Scheduling by Squarespace",
} as const;

/**
 * Add only owner-confirmed Siriranee appointment identifiers.
 * Staff assignment stays with the spa or booking provider rather than the customer.
 * Empty mappings intentionally keep the public site in safe contact-only mode.
 */
export const acuityAppointmentTypes: Readonly<
  Record<string, readonly AcuityBookingOption[]>
> = {};

export function getAcuityBookingOptions(
  serviceSlug: string,
): readonly AcuityBookingOption[] {
  return acuityAppointmentTypes[serviceSlug] ?? [];
}

type SchedulerUrlOptions = {
  readonly appointmentTypeId?: string;
};

function addPreselection(
  url: URL,
  { appointmentTypeId }: SchedulerUrlOptions,
) {
  if (appointmentTypeId) {
    url.searchParams.set("appointmentType", appointmentTypeId);
  }
}

export function buildAcuityEmbedUrl(
  options: SchedulerUrlOptions = {},
): string | null {
  if (!acuityConfig.enabled || !acuityConfig.ownerId) {
    return null;
  }

  const url = new URL(acuityConfig.embedBaseUrl);
  url.searchParams.set("owner", acuityConfig.ownerId);
  addPreselection(url, options);
  return url.toString();
}

export function buildAcuityDirectUrl(
  options: SchedulerUrlOptions = {},
): string | null {
  if (
    !acuityConfig.enabled ||
    !acuityConfig.ownerId ||
    !siteConfig.booking.acuityUrl
  ) {
    return null;
  }

  const url = new URL(siteConfig.booking.acuityUrl);
  if (
    url.hostname === "app.acuityscheduling.com" &&
    !url.searchParams.has("owner")
  ) {
    url.searchParams.set("owner", acuityConfig.ownerId);
  }
  addPreselection(url, options);
  return url.toString();
}
