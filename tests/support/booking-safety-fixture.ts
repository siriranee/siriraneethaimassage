import { Temporal } from "@js-temporal/polyfill";

import type { CmsServiceRecord, CmsTeamRecord } from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories/repository";

export async function prepareBookingSafetyFixture(repository: CmsRepository) {
  const { createMockAdministrator } = await import("@/server/cms/default-content");
  const actor = createMockAdministrator();
  const content = await repository.getContent();
  const now = new Date().toISOString();
  const service: CmsServiceRecord = {
    id: "safety-test-treatment",
    slug: "safety-test-treatment",
    name: "Demo Safety Treatment",
    shortDescription: "A fictional treatment for isolated regression tests.",
    longDescription: "A fictional treatment for isolated booking management regression tests.",
    imageUrl: "/images/spa/traditional-thai-massage.webp",
    imageAlt: "A fictional treatment room",
    hero: { imageUrl: "/images/spa/traditional-thai-massage.webp", altText: "A fictional treatment room" },
    galleryImages: [],
    prices: [{ id: "safety-price", durationMinutes: 60, priceCents: 6000, active: true }],
    idealFor: [],
    highlights: [],
    priceNote: "",
    seoTitle: "Demo Safety Treatment",
    seoDescription: "A fictional treatment for isolated booking tests.",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const therapist: CmsTeamRecord = {
    ...content.team[0],
    id: "safety-test-therapist",
    slug: "safety-test-therapist",
    name: "Demo Safety Therapist",
    fullName: "Demo Safety Therapist",
    publicRole: "Massage therapist",
    shortBio: "A fictional therapist for isolated testing.",
    imageUrl: "",
    imageAlt: "",
    serviceIds: [service.id],
    publicProfile: true,
    operationalActive: true,
    archived: false,
    version: 1,
    updatedAt: now,
  };
  const next = {
    ...content,
    revision: content.revision + 1,
    services: [service],
    team: [therapist],
    site: {
      ...content.site,
      openingHoursConfirmed: true,
      weeklyHours: content.site.weeklyHours.map((day) => ({ ...day, open: true, opens: "08:00", closes: "20:00" })),
    },
    bookingSettings: {
      ...content.bookingSettings,
      rulesConfirmed: true,
      publicBookingEnabled: true,
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 365,
      maxConcurrentBookings: 2,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    },
  };
  await repository.saveContent(next, content.revision);
  await repository.saveTherapistContact({
    id: therapist.id,
    notificationEmail: "demo.therapist@example.invalid",
    contactPhone: "",
    version: 1,
    updatedAt: now,
    updatedBy: actor.id,
  });
  await repository.savePublication({
    id: "safety-test-publication",
    revision: next.revision,
    publishedAt: now,
    publishedBy: actor.id,
    snapshot: next,
  });
  const localDate = Temporal.Now.zonedDateTimeISO("Europe/Dublin").toPlainDate().add({ days: 1 }).toString();
  const input = {
    customerName: "Demo Safety Guest",
    phone: "+353 00 000 0000",
    email: "demo.guest@example.invalid",
    customerNotes: "",
    serviceId: service.id,
    therapistId: therapist.id,
    durationMinutes: 60,
    localDate,
    localTime: "12:00",
    status: "pending",
    source: "administrator",
    internalNotes: "Important operational note",
  };
  return { repository, actor, context: { actor }, therapist, service, localDate, input };
}
