import "server-only";

import { createHmac } from "node:crypto";

import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from "resend";

import type { CmsBooking } from "@/domain/cms/types";
import { renderOwnerBookingRequestedEmail } from "@/server/booking/booking-email";

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

export type OwnerBookingEmailSendResult =
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

export type OwnerBookingEmailSender = (
  booking: CmsBooking,
) => Promise<OwnerBookingEmailSendResult>;

export type OwnerBookingEmailFingerprinter = (
  booking: CmsBooking,
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

type BookingEmailEnvironment = Readonly<Record<string, string | undefined>>;

function getSiteOrigin(environment: BookingEmailEnvironment) {
  const candidate = clean(
    environment.NEXT_PUBLIC_SITE_URL || environment.CMS_ORIGIN,
  );
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
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
    ? "Resend owner alerts are configured"
    : result.invalid.length
      ? "Resend owner alerts have invalid server configuration"
      : result.missing.length === requiredEnvironmentNames.length
        ? "Resend owner alerts are not configured"
        : "Resend owner alerts have incomplete server configuration";

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

function createOwnerBookingEmailRequest(
  booking: CmsBooking,
  configuration: ResendBookingEmailConfiguration,
) {
  const message = renderOwnerBookingRequestedEmail(booking, {
    cmsBookingUrl: bookingUrl(configuration.siteOrigin, booking.id),
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
  const request = createOwnerBookingEmailRequest(booking, configuration);
  const domainKey = createHmac("sha256", fingerprintSecret)
    .update("siriranee/resend-booking-email/fingerprint/v1")
    .digest();
  return createHmac("sha256", domainKey)
    .update(
      JSON.stringify({
        request,
        bookingStatus: booking.status,
        bookingVersion: booking.version,
      }),
    )
    .digest("base64url");
}

function providerErrorCode(name: string, statusCode: number | null) {
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
  if (statusCode !== null && statusCode >= 500) {
    return "resend-provider-unavailable";
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

  const request = createOwnerBookingEmailRequest(booking, configuration);
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
