import "server-only";

import { createHash } from "node:crypto";

import {
  createPublicBookingStatusSnapshot,
  parsePublicBookingIdentifier,
} from "@/domain/booking/public-status";
import { CmsValidationError } from "@/server/cms/content-validation";
import { getCmsRepository } from "@/server/cms/repositories";

const lookupWindowMilliseconds = 15 * 60 * 1000;
const maximumLookupsPerWindow = 10;

export class PublicBookingStatusRateLimitError extends Error {
  constructor() {
    super("Too many status checks. Please wait and try again.");
    this.name = "PublicBookingStatusRateLimitError";
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export async function checkPublicBookingStatusRateLimit(address: string) {
  const repository = getCmsRepository();
  const key = hash(`public-booking-status|${address.slice(0, 200)}`);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  await repository.transaction(async (transaction) => {
    const current = await transaction.getLoginAttempt(key);
    const active = current && current.expiresAt > nowIso;
    const count = active ? current.count : 0;

    if (count >= maximumLookupsPerWindow) {
      throw new PublicBookingStatusRateLimitError();
    }

    await transaction.saveLoginAttempt({
      key,
      count: count + 1,
      lockedUntil: "",
      expiresAt: new Date(now + lookupWindowMilliseconds).toISOString(),
    });
  });
}

export async function lookupPublicBookingStatus(value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const identifier = parsePublicBookingIdentifier(source.identifier);

  if (!identifier) {
    throw new CmsValidationError(
      "Enter a valid booking ID or reference.",
      { identifier: "Check the booking ID or reference and try again." },
    );
  }

  const booking = await getCmsRepository().findBookingPublicStatus(identifier);
  return booking ? createPublicBookingStatusSnapshot(booking) : null;
}
