type QueryValue = string | readonly string[] | undefined;

export type AppointmentSearchParams = {
  readonly service?: QueryValue;
  readonly duration?: QueryValue;
  readonly date?: QueryValue;
  readonly time?: QueryValue;
};

export type AppointmentPreferenceInput = {
  readonly serviceSlug: string;
  readonly durationMinutes: number;
  readonly preferredDate?: string;
  readonly preferredTime?: string;
};

export type AppointmentPreference = AppointmentPreferenceInput & {
  readonly serviceName: string;
  readonly priceEur: number;
};

const euroFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function firstValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatAppointmentPrice(priceEur: number) {
  return euroFormatter.format(priceEur);
}

export function formatAppointmentDuration(durationMinutes: number) {
  if (durationMinutes === 60) {
    return "1 hour";
  }

  if (durationMinutes > 60 && durationMinutes % 60 !== 0) {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours} hr ${minutes} min`;
  }

  if (durationMinutes > 60) {
    return `${durationMinutes / 60} hours`;
  }

  return `${durationMinutes} min`;
}

export function buildContactPreferenceHref({
  serviceSlug,
  durationMinutes,
  preferredDate,
  preferredTime,
}: AppointmentPreferenceInput) {
  const query = new URLSearchParams({
    service: serviceSlug,
    duration: String(durationMinutes),
  });
  if (preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    query.set("date", preferredDate);
  }
  if (preferredTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) {
    query.set("time", preferredTime);
  }

  return `/contact?${query.toString()}#appointment-request`;
}

export function buildPlannerPreferenceHref({
  serviceSlug,
  durationMinutes,
  preferredDate,
  preferredTime,
}: AppointmentPreferenceInput) {
  const query = new URLSearchParams({
    service: serviceSlug,
    duration: String(durationMinutes),
  });
  if (preferredDate) query.set("date", preferredDate);
  if (preferredTime) query.set("time", preferredTime);

  return `/book?${query.toString()}`;
}

export function parseAppointmentPreferenceInput(
  searchParams: AppointmentSearchParams,
): AppointmentPreferenceInput | null {
  const serviceSlug = firstValue(searchParams.service);
  const durationValue = firstValue(searchParams.duration);
  const dateValue = firstValue(searchParams.date);
  const timeValue = firstValue(searchParams.time);

  if (
    typeof serviceSlug !== "string" ||
    typeof durationValue !== "string" ||
    !/^\d{1,3}$/.test(durationValue)
  ) {
    return null;
  }

  const durationMinutes = Number(durationValue);

  return {
    serviceSlug,
    durationMinutes,
    preferredDate:
      typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
        ? dateValue
        : undefined,
    preferredTime:
      typeof timeValue === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeValue)
        ? timeValue
        : undefined,
  };
}

export function buildAppointmentWhatsAppUrl(
  preference: AppointmentPreference,
  contact: {
    readonly businessName: string;
    readonly whatsappNumber: string | null;
  },
) {
  const whatsappNumber = contact.whatsappNumber;

  if (!whatsappNumber) {
    return null;
  }

  const message = [
    `Hello ${contact.businessName}, I would like to request a massage appointment.`,
    `Treatment: ${preference.serviceName}`,
    `Duration: ${formatAppointmentDuration(preference.durationMinutes)}`,
    `Listed price: ${formatAppointmentPrice(preference.priceEur)}`,
    ...(preference.preferredDate
      ? [`Preferred date: ${preference.preferredDate}`]
      : []),
    ...(preference.preferredTime
      ? [`Preferred time: ${preference.preferredTime} (Europe/Dublin)`]
      : []),
    "Please confirm whether this date and time is available.",
  ].join("\n");

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
