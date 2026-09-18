import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { CmsBooking } from "@/domain/cms/types";
import { getCmsPiiEncryptionKey } from "@/server/cms/pii";

const tokenVersion = "v2";
const tokenDomain = "siriranee/booking-confirmation-link/v2";
const maximumTokenLength = 512;
const maximumPayloadBytes = 256;
const linkLifetimeMilliseconds = 48 * 60 * 60 * 1_000;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const capabilityIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type BookingConfirmationTokenInput = Pick<
  CmsBooking,
  | "id"
  | "serviceId"
  | "serviceSlug"
  | "serviceName"
  | "durationMinutes"
  | "priceCents"
  | "currency"
  | "startsAt"
  | "endsAt"
  | "localDate"
  | "localTime"
  | "timezone"
  | "assignedStaffId"
  | "assignedStaffName"
  | "createdAt"
>;

export type BookingConfirmationRole = "owner" | "therapist";

export type BookingConfirmationTokenClaims = {
  readonly bookingId: string;
  readonly appointmentRevision: string;
  readonly expiresAt: number;
} & (
  | {
      readonly confirmationRole: "owner";
    }
  | {
      readonly confirmationRole: "therapist";
      readonly therapistId: string;
    }
);

type BookingConfirmationTokenOptions = {
  readonly secret?: string;
  readonly issuedAt?: string;
};

type BookingConfirmationVerificationOptions = BookingConfirmationTokenOptions & {
  readonly now?: Date;
};

export type BookingConfirmationTokenVerification =
  | {
      readonly ok: true;
      readonly claims: BookingConfirmationTokenClaims;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "expired";
    };

function signingSecret(secret?: string) {
  if (secret !== undefined) {
    if (!secret.length) {
      throw new Error("The booking confirmation token secret cannot be empty.");
    }
    return Buffer.from(secret, "utf8");
  }

  const configured = process.env.CMS_PII_ENCRYPTION_KEY?.trim() ?? "";
  // Validate the configured representation with the same strict 32-byte rule
  // used by CMS encryption, then sign with that representation. Email
  // rendering receives the raw environment value so both paths must use the
  // same bytes rather than one using decoded key bytes and the other text.
  getCmsPiiEncryptionKey();
  return Buffer.from(configured, "utf8");
}

function signingKey(secret?: string) {
  return createHmac("sha256", signingSecret(secret))
    .update(tokenDomain, "utf8")
    .digest();
}

function signature(payload: string, secret?: string) {
  return createHmac("sha256", signingKey(secret))
    .update(`${tokenVersion}.${payload}`, "utf8")
    .digest();
}

function tokenExpiry(
  booking: BookingConfirmationTokenInput,
  issuedAt: string,
) {
  const issuedAtTimestamp = Date.parse(issuedAt);
  const startsAt = Date.parse(booking.startsAt);
  if (!Number.isFinite(issuedAtTimestamp) || !Number.isFinite(startsAt)) {
    throw new Error("The booking confirmation token requires valid timestamps.");
  }

  return Math.floor(
    Math.min(issuedAtTimestamp + linkLifetimeMilliseconds, startsAt) / 1_000,
  );
}

export function getBookingConfirmationAppointmentRevision(
  booking: BookingConfirmationTokenInput,
) {
  const appointment = {
    serviceId: booking.serviceId,
    serviceSlug: booking.serviceSlug,
    serviceName: booking.serviceName,
    durationMinutes: booking.durationMinutes,
    priceCents: booking.priceCents,
    currency: booking.currency,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    localDate: booking.localDate,
    localTime: booking.localTime,
    timezone: booking.timezone,
    assignedStaffId: booking.assignedStaffId,
    assignedStaffName: booking.assignedStaffName,
  };

  return createHash("sha256")
    .update(`${tokenDomain}/appointment\0`, "utf8")
    .update(JSON.stringify(appointment), "utf8")
    .digest("base64url");
}

function validCapabilityId(value: unknown, maximumLength: number) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximumLength &&
    capabilityIdPattern.test(value)
  );
}

function validClaims(value: unknown): value is BookingConfirmationTokenClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  const baseIsValid =
    validCapabilityId(source.bookingId, 128) &&
    typeof source.appointmentRevision === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(source.appointmentRevision) &&
    Number.isSafeInteger(source.expiresAt) &&
    Number(source.expiresAt) >= 1;
  if (!baseIsValid) return false;

  if (source.confirmationRole === "owner") {
    return Object.keys(source).length === 4;
  }

  return (
    source.confirmationRole === "therapist" &&
    Object.keys(source).length === 5 &&
    validCapabilityId(source.therapistId, 80)
  );
}

function createConfirmationToken(
  booking: BookingConfirmationTokenInput,
  confirmation:
    | { readonly confirmationRole: "owner" }
    | {
        readonly confirmationRole: "therapist";
        readonly therapistId: string;
      },
  issuedAt: string,
  options: BookingConfirmationTokenOptions = {},
) {
  if (
    !booking.id ||
    booking.id.length > 128 ||
    !capabilityIdPattern.test(booking.id) ||
    !booking.serviceId ||
    !booking.startsAt ||
    !booking.endsAt
  ) {
    throw new Error("The booking cannot be represented by a confirmation token.");
  }

  const claims: BookingConfirmationTokenClaims = {
    bookingId: booking.id,
    appointmentRevision: getBookingConfirmationAppointmentRevision(booking),
    expiresAt: tokenExpiry(booking, issuedAt),
    ...confirmation,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const digest = signature(payload, options.secret).toString("base64url");
  const token = `${tokenVersion}.${payload}.${digest}`;

  if (token.length > maximumTokenLength) {
    throw new Error("The booking confirmation token is too long.");
  }
  return token;
}

export function createBookingConfirmationToken(
  booking: BookingConfirmationTokenInput,
  options: BookingConfirmationTokenOptions = {},
) {
  return createConfirmationToken(
    booking,
    { confirmationRole: "owner" },
    booking.createdAt,
    options,
  );
}

export function createTherapistBookingConfirmationToken(
  booking: BookingConfirmationTokenInput,
  therapistId: string,
  options: BookingConfirmationTokenOptions = {},
) {
  const normalizedTherapistId = therapistId.trim();
  if (
    normalizedTherapistId !== booking.assignedStaffId ||
    !validCapabilityId(normalizedTherapistId, 80)
  ) {
    throw new Error(
      "The booking cannot be represented by a therapist confirmation token.",
    );
  }

  return createConfirmationToken(
    booking,
    {
      confirmationRole: "therapist",
      therapistId: normalizedTherapistId,
    },
    options.issuedAt ?? booking.createdAt,
    options,
  );
}

export function createBookingConfirmationUrl(
  origin: string,
  booking: BookingConfirmationTokenInput,
  options: BookingConfirmationTokenOptions = {},
) {
  try {
    const parsedOrigin = new URL(origin);
    if (
      (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") ||
      parsedOrigin.username ||
      parsedOrigin.password
    ) {
      return undefined;
    }

    const url = new URL("/book/confirm", parsedOrigin.origin);
    url.searchParams.set("token", createBookingConfirmationToken(booking, options));
    return url.toString();
  } catch {
    // Email delivery must remain available if confirmation links are not
    // configured. Omitting the CTA fails closed without exposing a weak link.
    return undefined;
  }
}

export function createTherapistBookingConfirmationUrl(
  origin: string,
  booking: BookingConfirmationTokenInput,
  therapistId: string,
  options: BookingConfirmationTokenOptions = {},
) {
  try {
    const parsedOrigin = new URL(origin);
    if (
      (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") ||
      parsedOrigin.username ||
      parsedOrigin.password
    ) {
      return undefined;
    }

    const url = new URL("/book/confirm", parsedOrigin.origin);
    url.searchParams.set(
      "token",
      createTherapistBookingConfirmationToken(
        booking,
        therapistId,
        options,
      ),
    );
    return url.toString();
  } catch {
    return undefined;
  }
}

export function verifyBookingConfirmationToken(
  token: string,
  options: BookingConfirmationVerificationOptions = {},
): BookingConfirmationTokenVerification {
  if (
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > maximumTokenLength
  ) {
    return { ok: false, reason: "invalid" };
  }

  const [version, payload, encodedSignature, extra] = token.split(".");
  if (
    version !== tokenVersion ||
    !payload ||
    !encodedSignature ||
    extra !== undefined ||
    payload.length > Math.ceil(maximumPayloadBytes * 4 / 3) ||
    !base64UrlPattern.test(payload) ||
    !base64UrlPattern.test(encodedSignature)
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const suppliedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signature(payload, options.secret);
    if (
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return { ok: false, reason: "invalid" };
    }

    const payloadBytes = Buffer.from(payload, "base64url");
    if (
      payloadBytes.length > maximumPayloadBytes ||
      payloadBytes.toString("base64url") !== payload
    ) {
      return { ok: false, reason: "invalid" };
    }
    const claims: unknown = JSON.parse(payloadBytes.toString("utf8"));
    if (!validClaims(claims)) return { ok: false, reason: "invalid" };

    const now = options.now ?? new Date();
    if (!Number.isFinite(now.getTime()) || now.getTime() >= claims.expiresAt * 1_000) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
