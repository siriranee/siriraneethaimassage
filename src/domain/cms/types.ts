import type { CmsPageHeroSlide } from "@/domain/cms/page-hero";
import type { CmsServiceGalleryImage } from "@/domain/cms/service-gallery";

export type { CmsServiceGalleryImage } from "@/domain/cms/service-gallery";
export type { CmsPageHeroSlide } from "@/domain/cms/page-hero";

export const cmsRoles = ["administrator", "staff"] as const;
export type CmsRole = (typeof cmsRoles)[number];

export const cmsServiceStatuses = ["draft", "published", "archived"] as const;
export type CmsServiceStatus = (typeof cmsServiceStatuses)[number];

export const cmsMediaScopes = [
  "service-cover",
  "service-gallery",
  "home-hero",
  "site-gallery",
] as const;
export type CmsMediaScope = (typeof cmsMediaScopes)[number];

export type CmsMediaAsset = {
  readonly id: string;
  readonly provider: "cloudinary";
  readonly providerAssetId?: string;
  readonly publicId: string;
  readonly secureUrl: string;
  readonly cloudinaryVersion: number;
  readonly scope: CmsMediaScope;
  readonly submissionId: string;
  readonly ownerUserId: string;
  readonly format: "avif" | "jpg" | "jpeg" | "png" | "webp";
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly status:
    | "authorized"
    | "staged"
    | "committed"
    | "deleting"
    | "deleted";
  readonly providerSignatureExpiresAt: string;
  readonly expiresAt: string;
  readonly committedAt: string;
  readonly deletedAt: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const bookingStatuses = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no-show",
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const bookingSources = [
  "website",
  "phone",
  "whatsapp",
  "walk-in",
  "administrator",
  "provider",
] as const;
export type BookingSource = (typeof bookingSources)[number];

export const bookingChangeReasons = [
  "customer-request",
  "spa-unavailable",
  "scheduling-correction",
  "duplicate-request",
  "no-response",
  "other-operational",
] as const;
export type BookingChangeReason = (typeof bookingChangeReasons)[number];

export type CmsServicePrice = {
  readonly id: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly active: boolean;
};

export type CmsServiceRecord = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly galleryImages: readonly CmsServiceGalleryImage[];
  readonly prices: readonly CmsServicePrice[];
  readonly idealFor: readonly string[];
  readonly highlights: readonly string[];
  readonly bookingNotice: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly status: CmsServiceStatus;
  readonly sortOrder: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CmsWeeklyHours = {
  readonly day:
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  readonly open: boolean;
  readonly opens: string;
  readonly closes: string;
};

export type CmsSiteSettings = {
  readonly name: string;
  readonly alternateName: string;
  readonly streetAddress: string;
  readonly locality: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly phoneDisplay: string;
  readonly phoneE164: string;
  readonly phoneConfirmed: boolean;
  readonly email: string;
  readonly whatsappNumber: string;
  readonly instagramUrl: string;
  readonly booksyUrl: string;
  readonly googleReviewUrl: string;
  readonly serviceAreas: readonly string[];
  readonly arrivalGuidance: string;
  readonly arrivalAssistance: string;
  readonly weeklyHours: readonly CmsWeeklyHours[];
  readonly openingHoursConfirmed: boolean;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsBookingSettings = {
  readonly timezone: "Europe/Dublin";
  readonly currency: "EUR";
  readonly publicBookingEnabled: boolean;
  readonly rulesConfirmed: boolean;
  readonly slotIntervalMinutes: number;
  readonly maxConcurrentBookings: number;
  readonly minimumNoticeMinutes: number;
  readonly bookingHorizonDays: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly holdMinutes: number;
  readonly cancellationCutoffMinutes: number;
  readonly provisionalNotice: string;
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsTeamRecord = {
  readonly id: string;
  readonly name: string;
  readonly fullName: string;
  readonly publicRole: string;
  readonly publicProfile: boolean;
  readonly operationalActive: boolean;
  readonly archived?: boolean;
  readonly sortOrder: number;
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsPromotionRecord = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: "draft" | "published" | "archived";
  readonly startsOn: string;
  readonly endsOn: string;
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsVoucherRecord = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly amountCents: number;
  readonly badge: string;
  readonly terms: string;
  readonly status: "draft" | "published" | "archived";
  readonly sortOrder: number;
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsGalleryRecord = {
  readonly id: string;
  readonly imageUrl: string;
  readonly altText: string;
  readonly caption: string;
  readonly published: boolean;
  readonly sortOrder: number;
  readonly version: number;
  readonly updatedAt: string;
};

export const cmsPageIds = [
  "home",
  "services",
  "book",
  "about",
  "contact",
  "visit",
  "privacy",
  "promotions",
  "gallery",
  "therapists",
] as const;
export type CmsPageId = (typeof cmsPageIds)[number];

export type CmsPageRecord = {
  readonly id: CmsPageId;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly heroSlides?: readonly CmsPageHeroSlide[];
  readonly version: number;
  readonly updatedAt: string;
};

export type CmsContentState = {
  readonly id: "siriranee-content";
  readonly schemaVersion: 1 | 2 | 3 | 4;
  readonly revision: number;
  readonly services: readonly CmsServiceRecord[];
  readonly site: CmsSiteSettings;
  readonly bookingSettings: CmsBookingSettings;
  readonly team: readonly CmsTeamRecord[];
  readonly promotions: readonly CmsPromotionRecord[];
  readonly vouchers?: readonly CmsVoucherRecord[];
  readonly gallery: readonly CmsGalleryRecord[];
  readonly pages?: readonly CmsPageRecord[];
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type CmsPublication = {
  readonly id: string;
  readonly revision: number;
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly snapshot: CmsContentState;
};

export type CmsUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: CmsRole;
  readonly active: boolean;
  readonly authVersion: number;
  readonly failedLoginCount: number;
  readonly lockedUntil: string;
  readonly lastLoginAt: string;
  readonly passwordChangedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CmsSession = {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly authVersion: number;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
};

export type CmsLoginAttempt = {
  readonly key: string;
  readonly count: number;
  readonly lockedUntil: string;
  readonly expiresAt: string;
};

export type CmsAuditEvent = {
  readonly id: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly requestId: string;
  readonly createdAt: string;
};

export type CmsCustomerDetails = {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly notes: string;
};

export type CmsBooking = {
  readonly id: string;
  readonly reference: string;
  readonly customer: CmsCustomerDetails;
  readonly serviceId: string;
  readonly serviceSlug: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly currency: "EUR";
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: "Europe/Dublin";
  readonly status: BookingStatus;
  readonly source: BookingSource;
  readonly capacityExpiresAt: string;
  readonly assignedStaffId: string;
  readonly internalNotes: string;
  readonly lastChangeReason?: BookingChangeReason;
  readonly privacyAcceptedAt: string;
  readonly privacyNoticeVersion: string;
  readonly holdTokenHash: string;
  readonly idempotencyKeyHash: string;
  readonly requestFingerprintHash: string;
  readonly demo: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type CmsBookingOccupancy = {
  readonly id: string;
  readonly localDate: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingStatus;
  readonly expiresAt: string;
};

export type CmsBookingHold = {
  readonly id: string;
  readonly tokenHash: string;
  readonly serviceId: string;
  readonly durationMinutes: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localDate: string;
  readonly status: "active" | "consumed" | "expired" | "released";
  readonly expiresAt: string;
  readonly createdAt: string;
};

export type CmsClosure = {
  readonly id: string;
  readonly localDate: string;
  readonly closedAllDay: boolean;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly reason: string;
  readonly publicLabel: string;
  readonly active: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export const cmsNotificationChannels = ["dashboard", "email", "sms", "whatsapp"] as const;
export type CmsNotificationChannel = (typeof cmsNotificationChannels)[number];

export const cmsNotificationKinds = [
  "booking-requested",
  "booking-confirmed",
  "booking-rescheduled",
  "booking-cancelled",
  "booking-completed",
  "booking-no-show",
] as const;
export type CmsNotificationKind = (typeof cmsNotificationKinds)[number];

export type CmsBookingNotification = {
  readonly id: string;
  readonly bookingId: string;
  readonly bookingReference: string;
  readonly channel: CmsNotificationChannel;
  readonly kind: CmsNotificationKind;
  readonly status: "preview" | "queued" | "sent" | "failed";
  readonly attemptCount: number;
  readonly lastError: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CmsBookingQuery = {
  readonly from?: string;
  readonly to?: string;
  readonly status?: BookingStatus;
  readonly source?: BookingSource;
  readonly serviceId?: string;
  readonly attention?: "expired" | "unassigned";
  readonly search?: string;
};

export type CmsDashboardSummary = {
  readonly todayCount: number;
  readonly pendingCount: number;
  readonly upcomingCount: number;
  readonly unassignedCount: number;
  readonly activeServiceCount: number;
};
