import "server-only";

import { createHmac } from "node:crypto";

import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from "resend";

import { googleMapsDirectionsUrl } from "@/content/site";
import type { CmsBooking, CmsSiteSettings } from "@/domain/cms/types";
import {
  createBookingConfirmationUrl,
  createTherapistBookingConfirmationUrl,
} from "@/server/booking/booking-confirmation-token";
import {
  renderCustomerBookingCancelledEmail,
  renderCustomerBookingConfirmedEmail,
  renderCustomerBookingRescheduledEmail,
  renderOwnerBookingRequestedEmail,
  renderTherapistBookingEmail,
  type CustomerBookingEmailBusiness,
  type TherapistBookingEmailEvent,
} from "@/server/booking/booking-email";

const requiredEnvironmentNames = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_BOOKING_TO_EMAIL",
] as const;

type EnvironmentName = (typeof requiredEnvironmentNames)[number];

export type ResendBookingEmailConfiguration = {
  readonly apiKey: string;
  readonly from: string;
  readonly to: string;
  readonly siteOrigin?: string;
};

export type ResendBookingEmailReadiness = {
  readonly ready: boolean;
  readonly missing: readonly EnvironmentName[];
  readonly invalid: readonly EnvironmentName[];
  readonly summary: string;
};

export type BookingEmailSendResult =
  | {
      readonly status: "sent";
      readonly attempted: true;
      readonly providerMessageId: string;
    }
  | {
      readonly status: "failed";
      readonly attempted: boolean;
      readonly errorCode: string;
    };

export type OwnerBookingEmailSendResult = BookingEmailSendResult;

export type OwnerBookingEmailSender = (
  booking: CmsBooking,
) => Promise<OwnerBookingEmailSendResult>;

export type OwnerBookingEmailFingerprinter = (
  booking: CmsBooking,
) => string | null;

export type OwnerBookingEmailFingerprintCompatibility = (
  booking: CmsBooking,
  previousFingerprint: string,
  originalBookingVersion?: number,
) => boolean;

export type CustomerBookingEmailSender = (
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
) => Promise<BookingEmailSendResult>;

export type CustomerBookingEmailFingerprinter = (
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
) => string | null;

export type CustomerBookingRescheduleEmailSender = (
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  bookingVersion: number,
) => Promise<BookingEmailSendResult>;

export type CustomerBookingRescheduleEmailFingerprinter = (
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  bookingVersion: number,
) => string | null;

export type TherapistBookingEmailRecipient = {
  readonly id: string;
  readonly name: string;
  readonly notificationEmail: string;
};

export type TherapistBookingEmailSender = (
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
  bookingVersion: number,
  business: CustomerBookingEmailBusiness,
) => Promise<BookingEmailSendResult>;

export type TherapistBookingEmailFingerprinter = (
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
  bookingVersion: number,
  business: CustomerBookingEmailBusiness,
) => string | null;

type ResendEmailClient = {
  readonly emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse>;
  };
};

type SendDependencies = {
  readonly configuration?: ResendBookingEmailConfiguration;
  readonly client?: ResendEmailClient;
  readonly environment?: BookingEmailEnvironment;
  readonly timeoutMs?: number;
  readonly fingerprintSecret?: string;
  readonly confirmationIssuedAt?: string;
};

class ResendRequestTimeoutError extends Error {
  constructor() {
    super("The Resend request timed out.");
    this.name = "ResendRequestTimeoutError";
  }
}

function clean(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function isEmailAddress(value: string) {
  return (
    value.length <= 254 &&
    !/[\r\n]/.test(value) &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
  );
}

function isSenderAddress(value: string) {
  if (isEmailAddress(value)) return true;
  const match = value.match(/^([^<>\r\n]{1,100})<([^<>]+)>$/);
  return Boolean(match?.[1]?.trim() && isEmailAddress(match[2].trim()));
}

function cleanPhone(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "";
}

export function createCustomerBookingEmailBusiness(
  site: CmsSiteSettings,
): CustomerBookingEmailBusiness {
  const address = [
    site.streetAddress,
    site.locality,
    site.region,
    site.postalCode,
    site.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  const phoneE164 = site.phoneConfirmed ? cleanPhone(site.phoneE164) : "";
  const phone = phoneE164 ? site.phoneDisplay.trim() || phoneE164 : "";
  const email = isEmailAddress(site.email.trim()) ? site.email.trim() : "";

  return {
    name: site.name.trim() || "Siriranee Thai Massage",
    address,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(site.arrivalGuidance.trim()
      ? { arrivalGuidance: site.arrivalGuidance.trim() }
      : {}),
    directionsUrl: googleMapsDirectionsUrl,
  };
}

type BookingEmailEnvironment = Readonly<Record<string, string | undefined>>;

function getSiteOrigin(environment: BookingEmailEnvironment) {
  const candidate = clean(
    environment.NEXT_PUBLIC_SITE_URL || environment.CMS_ORIGIN,
  );
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function inspectConfiguration(
  environment: BookingEmailEnvironment = process.env,
) {
  const values = {
    RESEND_API_KEY: clean(environment.RESEND_API_KEY),
    RESEND_FROM_EMAIL: clean(environment.RESEND_FROM_EMAIL),
    RESEND_BOOKING_TO_EMAIL: clean(environment.RESEND_BOOKING_TO_EMAIL),
  };
  const missing = requiredEnvironmentNames.filter((name) => !values[name]);
  const invalid: EnvironmentName[] = [];

  if (
    values.RESEND_API_KEY &&
    !/^re_[a-z0-9_-]{8,}$/i.test(values.RESEND_API_KEY)
  ) {
    invalid.push("RESEND_API_KEY");
  }
  if (
    values.RESEND_FROM_EMAIL &&
    !isSenderAddress(values.RESEND_FROM_EMAIL)
  ) {
    invalid.push("RESEND_FROM_EMAIL");
  }
  if (
    values.RESEND_BOOKING_TO_EMAIL &&
    !isEmailAddress(values.RESEND_BOOKING_TO_EMAIL)
  ) {
    invalid.push("RESEND_BOOKING_TO_EMAIL");
  }

  const ready = missing.length === 0 && invalid.length === 0;
  const configuration: ResendBookingEmailConfiguration | undefined = ready
    ? {
        apiKey: values.RESEND_API_KEY,
        from: values.RESEND_FROM_EMAIL,
        to: values.RESEND_BOOKING_TO_EMAIL,
        siteOrigin: getSiteOrigin(environment),
      }
    : undefined;

  return { configuration, invalid, missing, ready };
}

export function getResendBookingEmailReadiness(
  environment: BookingEmailEnvironment = process.env,
): ResendBookingEmailReadiness {
  const result = inspectConfiguration(environment);
  const summary = result.ready
    ? "Resend booking emails are configured"
    : result.invalid.length
      ? "Resend booking emails have invalid server configuration"
      : result.missing.length === requiredEnvironmentNames.length
        ? "Resend booking emails are not configured"
        : "Resend booking emails have incomplete server configuration";

  return {
    ready: result.ready,
    missing: result.missing,
    invalid: result.invalid,
    summary,
  };
}

function bookingUrl(origin: string | undefined, bookingId: string) {
  if (!origin) return undefined;
  return new URL(
    `/cms/bookings/${encodeURIComponent(bookingId)}`,
    origin,
  ).toString();
}

function cmsUrl(origin: string | undefined) {
  if (!origin) return undefined;
  return new URL("/cms", origin).toString();
}

function ownerConfirmationUrl(
  origin: string | undefined,
  booking: CmsBooking,
  secret: string | undefined,
) {
  if (!origin) return undefined;
  try {
    return createBookingConfirmationUrl(origin, booking, { secret });
  } catch {
    // The CMS booking link remains available if the capability secret is not
    // configured. Live public booking already requires the encryption key.
    return undefined;
  }
}

function therapistConfirmationUrl(
  origin: string | undefined,
  booking: CmsBooking,
  therapistId: string,
  secret: string | undefined,
  issuedAt: string | undefined,
) {
  if (!origin) return undefined;
  try {
    return createTherapistBookingConfirmationUrl(
      origin,
      booking,
      therapistId,
      { secret, issuedAt },
    );
  } catch {
    // Pending delivery will fail before contacting Resend so the owner can fix
    // configuration rather than sending a login-only workflow to a therapist.
    return undefined;
  }
}

function resolveConfiguration(
  dependencies: Pick<SendDependencies, "configuration" | "environment">,
) {
  return dependencies.configuration
    ? {
        configuration: dependencies.configuration,
        invalid: [] as EnvironmentName[],
        missing: [] as EnvironmentName[],
        ready: true,
      }
    : inspectConfiguration(dependencies.environment);
}

export function isOwnerBookingEmailRecipient(
  email: string,
  dependencies: Pick<SendDependencies, "configuration" | "environment"> = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const recipient = clean(email).toLowerCase();
  return Boolean(
    configuration &&
    isEmailAddress(recipient) &&
    recipient === clean(configuration.to).toLowerCase(),
  );
}

function createOwnerBookingEmailRequest(
  booking: CmsBooking,
  configuration: ResendBookingEmailConfiguration,
  confirmationSecret?: string,
) {
  const message = renderOwnerBookingRequestedEmail(booking, {
    cmsBookingUrl: bookingUrl(configuration.siteOrigin, booking.id),
    confirmationUrl: ownerConfirmationUrl(
      configuration.siteOrigin,
      booking,
      confirmationSecret,
    ),
  });
  const payload: CreateEmailOptions = {
    from: configuration.from,
    to: [configuration.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(booking.customer.email ? { replyTo: booking.customer.email } : {}),
    tags: [
      { name: "event", value: "booking-requested" },
      { name: "source", value: "website" },
    ],
  };
  const options: CreateEmailRequestOptions = {
    idempotencyKey: `owner-booking-requested/${booking.id}`,
  };
  return { options, payload };
}

function createCustomerBookingConfirmationEmailRequest(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  configuration: ResendBookingEmailConfiguration,
) {
  const customerEmail = clean(booking.customer.email).toLowerCase();
  if (booking.status !== "confirmed" || !isEmailAddress(customerEmail)) {
    return null;
  }
  const publicReplyTo = clean(business.email);
  const message = renderCustomerBookingConfirmedEmail(booking, {
    ...business,
    siteOrigin: configuration.siteOrigin,
  });
  const payload: CreateEmailOptions = {
    from: configuration.from,
    to: [customerEmail],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(isEmailAddress(publicReplyTo) ? { replyTo: publicReplyTo } : {}),
    tags: [
      { name: "event", value: "booking-confirmed" },
      { name: "audience", value: "customer" },
    ],
  };
  const options: CreateEmailRequestOptions = {
    idempotencyKey: `customer-booking-confirmed/${booking.id}`,
  };
  return { options, payload };
}

function createCustomerBookingCancellationEmailRequest(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  configuration: ResendBookingEmailConfiguration,
) {
  const customerEmail = clean(booking.customer.email).toLowerCase();
  if (booking.status !== "cancelled" || !isEmailAddress(customerEmail)) {
    return null;
  }
  const publicReplyTo = clean(business.email);
  const message = renderCustomerBookingCancelledEmail(booking, {
    ...business,
    siteOrigin: configuration.siteOrigin,
  });
  const payload: CreateEmailOptions = {
    from: configuration.from,
    to: [customerEmail],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(isEmailAddress(publicReplyTo) ? { replyTo: publicReplyTo } : {}),
    tags: [
      { name: "event", value: "booking-cancelled" },
      { name: "audience", value: "customer" },
    ],
  };
  const options: CreateEmailRequestOptions = {
    idempotencyKey: `customer-booking-cancelled/${booking.id}`,
  };
  return { options, payload };
}

function createCustomerBookingRescheduleEmailRequest(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  bookingVersion: number,
  configuration: ResendBookingEmailConfiguration,
) {
  const customerEmail = clean(booking.customer.email).toLowerCase();
  if (
    booking.status !== "confirmed" ||
    !isEmailAddress(customerEmail) ||
    !Number.isInteger(bookingVersion) || bookingVersion < 1
  ) return null;

  const publicReplyTo = clean(business.email);
  const message = renderCustomerBookingRescheduledEmail(booking, {
    ...business,
    siteOrigin: configuration.siteOrigin,
  });
  const payload: CreateEmailOptions = {
    from: configuration.from,
    to: [customerEmail],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(isEmailAddress(publicReplyTo) ? { replyTo: publicReplyTo } : {}),
    tags: [
      { name: "event", value: "booking-rescheduled" },
      { name: "audience", value: "customer" },
    ],
  };
  const options: CreateEmailRequestOptions = {
    idempotencyKey: `customer-booking-rescheduled/${booking.id}/${bookingVersion}`,
  };
  return { options, payload };
}

function isTherapistBookingEmailStateValid(
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
) {
  if (event === "requested" || event === "request-updated") {
    return (
      booking.source === "website" &&
      booking.status === "pending" &&
      booking.assignedStaffId === recipient.id
    );
  }

  if (event === "request-withdrawn") {
    // The email renders the immutable original request snapshot while these
    // live fields prove that request is no longer active for this therapist.
    return (
      booking.source === "website" &&
      (booking.status !== "pending" || booking.assignedStaffId !== recipient.id)
    );
  }

  if (event === "removed") {
    // A historical removal remains true if a later booking update or
    // cancellation affects the other therapist. The outbox checks its snapshot.
    return booking.assignedStaffId !== recipient.id;
  }

  if (event === "cancelled") {
    return (
      booking.status === "cancelled" &&
      booking.assignedStaffId === recipient.id
    );
  }

  return (
    booking.status === "confirmed" &&
    booking.assignedStaffId === recipient.id
  );
}

function createTherapistBookingEmailRequest(
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
  bookingVersion: number,
  business: CustomerBookingEmailBusiness,
  configuration: ResendBookingEmailConfiguration,
  confirmationSecret?: string,
  confirmationIssuedAt?: string,
) {
  const therapistId = clean(recipient.id);
  const therapistEmail = clean(recipient.notificationEmail).toLowerCase();
  const therapistName = clean(recipient.name);
  if (
    !therapistId ||
    !therapistName ||
    !isEmailAddress(therapistEmail) ||
    !Number.isInteger(bookingVersion) ||
    bookingVersion < 1 ||
    !isTherapistBookingEmailStateValid(booking, recipient, event)
  ) {
    return null;
  }

  const pendingRequest = event === "requested" || event === "request-updated";
  const confirmationUrl = pendingRequest
    ? therapistConfirmationUrl(
        configuration.siteOrigin,
        booking,
        therapistId,
        confirmationSecret,
        confirmationIssuedAt,
      )
    : undefined;
  // A pending therapist message without its promised capability would direct
  // the recipient into a login-only workflow. Fail before contacting Resend so
  // the durable notification is surfaced to the owner for configuration review.
  if (pendingRequest && !confirmationUrl) return null;

  const publicReplyTo = clean(business.email);
  const message = renderTherapistBookingEmail(booking, {
    event,
    therapistName,
    businessName: business.name,
    cmsUrl: cmsUrl(configuration.siteOrigin),
    confirmationUrl,
  });
  const payload: CreateEmailOptions = {
    from: configuration.from,
    to: [therapistEmail],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(isEmailAddress(publicReplyTo) ? { replyTo: publicReplyTo } : {}),
    tags: [
      { name: "event", value: `booking-${event}` },
      { name: "audience", value: "therapist" },
    ],
  };
  const options: CreateEmailRequestOptions = {
    idempotencyKey:
      `therapist-booking-${event}/${booking.id}/${therapistId}/${bookingVersion}`,
  };
  return { options, payload };
}

export function getOwnerBookingEmailDeliveryFingerprint(
  booking: CmsBooking,
  dependencies: Pick<
    SendDependencies,
    "configuration" | "environment" | "fingerprintSecret"
  > = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return null;
  const request = createOwnerBookingEmailRequest(
    booking,
    configuration,
    fingerprintSecret,
  );
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-booking-email/fingerprint/v2")
    .digest();
  const hash = createHmac("sha256", domainKey)
    .update(JSON.stringify({ request, bookingStatus: booking.status }))
    .digest("base64url");
  // A CMS notes-only save changes version, but not the outgoing message. Keep
  // the rendered request (including its recipient and provider key) as identity.
  return `owner-v2:${hash}`;
}

export function isOwnerBookingEmailDeliveryFingerprintCompatible(
  booking: CmsBooking,
  previousFingerprint: string,
  originalBookingVersion?: number,
  dependencies: Pick<
    SendDependencies,
    "configuration" | "environment" | "fingerprintSecret"
  > = {},
) {
  // Only the historical unprefixed format may migrate. A changed v2 payload
  // must never be rebound to the same provider idempotency key.
  if (!/^[A-Za-z0-9_-]{43}$/.test(previousFingerprint)) return false;
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return false;
  const request = createOwnerBookingEmailRequest(
    booking,
    configuration,
    fingerprintSecret,
  );
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-booking-email/fingerprint/v1")
    .digest();
  // Original website outboxes were bound at version 1. Some older rows were
  // first bound during delivery instead; accept their recorded or exact current
  // version only, and fail closed if the historical version is unknown.
  const versions = new Set([originalBookingVersion, 1, booking.version]);
  return [...versions].some((version) => {
    if (typeof version !== "number" || !Number.isSafeInteger(version) ||
      version < 1 || version > booking.version) return false;
    const legacyHash = createHmac("sha256", domainKey)
      .update(JSON.stringify({ request, bookingStatus: booking.status, bookingVersion: version }))
      .digest("base64url");
    return legacyHash === previousFingerprint;
  });
}

export function getCustomerBookingEmailDeliveryFingerprint(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  dependencies: Pick<
    SendDependencies,
    "configuration" | "environment" | "fingerprintSecret"
  > = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return null;
  const request = createCustomerBookingConfirmationEmailRequest(
    booking,
    business,
    configuration,
  );
  if (!request) return null;
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-customer-booking-email/fingerprint/v1")
    .digest();
  return createHmac("sha256", domainKey)
    .update(JSON.stringify({ request, bookingStatus: booking.status }))
    .digest("base64url");
}

export function getCustomerBookingCancellationEmailDeliveryFingerprint(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  dependencies: Pick<
    SendDependencies,
    "configuration" | "environment" | "fingerprintSecret"
  > = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return null;
  const request = createCustomerBookingCancellationEmailRequest(
    booking,
    business,
    configuration,
  );
  if (!request) return null;
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-customer-booking-cancellation-email/fingerprint/v1")
    .digest();
  return createHmac("sha256", domainKey)
    .update(JSON.stringify({ request, bookingStatus: booking.status }))
    .digest("base64url");
}

export function getTherapistBookingEmailDeliveryFingerprint(
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
  bookingVersion: number,
  business: CustomerBookingEmailBusiness,
  dependencies: Pick<
    SendDependencies,
    | "configuration"
    | "environment"
    | "fingerprintSecret"
    | "confirmationIssuedAt"
  > = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return null;
  const request = createTherapistBookingEmailRequest(
    booking,
    recipient,
    event,
    bookingVersion,
    business,
    configuration,
    fingerprintSecret,
    dependencies.confirmationIssuedAt,
  );
  if (!request) return null;
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-therapist-booking-email/fingerprint/v1")
    .digest();
  return createHmac("sha256", domainKey)
    .update(
      JSON.stringify({
        request,
        event,
        bookingVersion,
        ...(event === "removed" || event === "request-withdrawn"
          ? {}
          : { bookingStatus: booking.status }),
      }),
    )
    .digest("base64url");
}

export function getCustomerBookingRescheduleEmailDeliveryFingerprint(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  bookingVersion: number,
  dependencies: Pick<
    SendDependencies,
    "configuration" | "environment" | "fingerprintSecret"
  > = {},
) {
  const configuration = resolveConfiguration(dependencies).configuration;
  const fingerprintSecret = clean(
    dependencies.fingerprintSecret ??
      (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
  );
  if (!configuration || !fingerprintSecret) return null;
  const request = createCustomerBookingRescheduleEmailRequest(
    booking, business, bookingVersion, configuration,
  );
  if (!request) return null;
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-customer-booking-reschedule-email/fingerprint/v1")
    .digest();
  return createHmac("sha256", domainKey)
    .update(JSON.stringify({ request, bookingStatus: booking.status, bookingVersion }))
    .digest("base64url");
}

function providerErrorCode(name: string, statusCode: number | null | undefined) {
  // The SDK catches fetch / response JSON failures and returns application_error
  // with no HTTP status instead of throwing. Resend may have accepted the email
  // before that response was lost, so this is not proof of an unsent message.
  if (statusCode == null || !Number.isFinite(statusCode)) {
    return "resend-unexpected-error";
  }
  if (statusCode >= 500) {
    return "resend-provider-unavailable";
  }
  if (name === "concurrent_idempotent_requests") {
    return "resend-concurrent-idempotency";
  }
  if (name === "rate_limit_exceeded" || statusCode === 429) {
    return "resend-rate-limited";
  }
  if (
    name === "invalid_api_key" ||
    name === "missing_api_key" ||
    name === "restricted_api_key" ||
    statusCode === 401 ||
    statusCode === 403
  ) {
    return "resend-authentication-failed";
  }
  if (
    name === "validation_error" ||
    name === "invalid_from_address" ||
    name === "invalid_parameter" ||
    name === "missing_required_field"
  ) {
    return "resend-message-rejected";
  }
  return "resend-provider-error";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ResendRequestTimeoutError()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function sendOwnerBookingRequestedEmail(
  booking: CmsBooking,
  dependencies: SendDependencies = {},
): Promise<OwnerBookingEmailSendResult> {
  const inspected = resolveConfiguration(dependencies);
  const configuration = inspected.configuration;

  if (!configuration) {
    return {
      status: "failed",
      attempted: false,
      errorCode: inspected.invalid.length
        ? "resend-configuration-invalid"
        : "resend-configuration-missing",
    };
  }

  return sendResolvedBookingEmail(
    createOwnerBookingEmailRequest(
      booking,
      configuration,
      clean(
        dependencies.fingerprintSecret ??
          (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
      ) || undefined,
    ),
    configuration,
    dependencies,
  );
}

async function sendResolvedBookingEmail(
  request: {
    readonly payload: CreateEmailOptions;
    readonly options: CreateEmailRequestOptions;
  },
  configuration: ResendBookingEmailConfiguration,
  dependencies: SendDependencies,
): Promise<BookingEmailSendResult> {
  const client = dependencies.client ?? new Resend(configuration.apiKey);

  try {
    const response = await withTimeout(
      client.emails.send(request.payload, request.options),
      Math.max(250, dependencies.timeoutMs ?? 8_000),
    );

    if (response.error) {
      return {
        status: "failed",
        attempted: true,
        errorCode: providerErrorCode(
          response.error.name,
          response.error.statusCode,
        ),
      };
    }

    if (typeof response.data?.id !== "string" || !response.data.id.trim()) {
      return {
        status: "failed",
        attempted: true,
        errorCode: "resend-unexpected-error",
      };
    }

    return {
      status: "sent",
      attempted: true,
      providerMessageId: response.data.id,
    };
  } catch (error) {
    return {
      status: "failed",
      attempted: true,
      errorCode:
        error instanceof ResendRequestTimeoutError
          ? "resend-timeout"
          : "resend-network-error",
    };
  }
}

export async function sendCustomerBookingConfirmedEmail(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  dependencies: SendDependencies = {},
): Promise<BookingEmailSendResult> {
  const inspected = resolveConfiguration(dependencies);
  const configuration = inspected.configuration;

  if (!configuration) {
    return {
      status: "failed",
      attempted: false,
      errorCode: inspected.invalid.length
        ? "resend-configuration-invalid"
        : "resend-configuration-missing",
    };
  }

  const request = createCustomerBookingConfirmationEmailRequest(
    booking,
    business,
    configuration,
  );
  if (!request) {
    return {
      status: "failed",
      attempted: false,
      errorCode:
        booking.status === "confirmed"
          ? booking.customer.email
            ? "customer-email-invalid"
            : "customer-email-missing"
          : "booking-not-confirmed",
    };
  }

  return sendResolvedBookingEmail(request, configuration, dependencies);
}

export async function sendCustomerBookingCancelledEmail(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  dependencies: SendDependencies = {},
): Promise<BookingEmailSendResult> {
  const inspected = resolveConfiguration(dependencies);
  const configuration = inspected.configuration;

  if (!configuration) {
    return {
      status: "failed",
      attempted: false,
      errorCode: inspected.invalid.length
        ? "resend-configuration-invalid"
        : "resend-configuration-missing",
    };
  }

  const request = createCustomerBookingCancellationEmailRequest(
    booking,
    business,
    configuration,
  );
  if (!request) {
    return {
      status: "failed",
      attempted: false,
      errorCode:
        booking.status === "cancelled"
          ? booking.customer.email
            ? "customer-email-invalid"
            : "customer-email-missing"
          : "booking-not-cancelled",
    };
  }

  return sendResolvedBookingEmail(request, configuration, dependencies);
}

export async function sendTherapistBookingEmail(
  booking: CmsBooking,
  recipient: TherapistBookingEmailRecipient,
  event: TherapistBookingEmailEvent,
  bookingVersion: number,
  business: CustomerBookingEmailBusiness,
  dependencies: SendDependencies = {},
): Promise<BookingEmailSendResult> {
  const inspected = resolveConfiguration(dependencies);
  const configuration = inspected.configuration;

  if (!configuration) {
    return {
      status: "failed",
      attempted: false,
      errorCode: inspected.invalid.length
        ? "resend-configuration-invalid"
        : "resend-configuration-missing",
    };
  }

  const request = createTherapistBookingEmailRequest(
    booking,
    recipient,
    event,
    bookingVersion,
    business,
    configuration,
    clean(
      dependencies.fingerprintSecret ??
        (dependencies.environment ?? process.env).CMS_PII_ENCRYPTION_KEY,
    ) || undefined,
    dependencies.confirmationIssuedAt,
  );
  if (!request) {
    const notificationEmail = clean(recipient.notificationEmail).toLowerCase();
    return {
      status: "failed",
      attempted: false,
      errorCode: !notificationEmail
        ? "therapist-email-missing"
        : !isEmailAddress(notificationEmail)
          ? "therapist-email-invalid"
          : "therapist-booking-state-invalid",
    };
  }

  return sendResolvedBookingEmail(request, configuration, dependencies);
}

export async function sendCustomerBookingRescheduledEmail(
  booking: CmsBooking,
  business: CustomerBookingEmailBusiness,
  bookingVersion: number,
  dependencies: SendDependencies = {},
): Promise<BookingEmailSendResult> {
  const inspected = resolveConfiguration(dependencies);
  const configuration = inspected.configuration;
  if (!configuration) {
    return {
      status: "failed", attempted: false,
      errorCode: inspected.invalid.length
        ? "resend-configuration-invalid" : "resend-configuration-missing",
    };
  }
  const request = createCustomerBookingRescheduleEmailRequest(
    booking, business, bookingVersion, configuration,
  );
  if (!request) {
    return {
      status: "failed", attempted: false,
      errorCode: booking.status !== "confirmed"
        ? "booking-not-confirmed"
        : !booking.customer.email ? "customer-email-missing" : "customer-email-invalid",
    };
  }
  return sendResolvedBookingEmail(request, configuration, dependencies);
}
