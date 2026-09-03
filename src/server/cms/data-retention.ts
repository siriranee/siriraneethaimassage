const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export const CMS_NOTIFICATION_RETENTION_DAYS = 365;
export const CMS_BOOKING_RETENTION_DAYS = 2 * 365;
export const CMS_DAY_LOCK_RETENTION_DAYS = 30;
export const CMS_PUBLICATION_RETENTION_COUNT = 50;

function safeRetentionStart(value: string, now: Date) {
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : now.getTime();
}

function retentionDate(value: string, days: number, now = new Date()) {
  return new Date(
    safeRetentionStart(value, now) + days * millisecondsPerDay,
  );
}

export function getCmsNotificationExpiryDate(
  createdAt: string,
  now = new Date(),
) {
  return retentionDate(createdAt, CMS_NOTIFICATION_RETENTION_DAYS, now);
}

export function getCmsBookingExpiryDate(startsAt: string, now = new Date()) {
  return retentionDate(startsAt, CMS_BOOKING_RETENTION_DAYS, now);
}

export function getCmsDayLockExpiryDate(localDate: string, now = new Date()) {
  return retentionDate(
    `${localDate}T00:00:00.000Z`,
    CMS_DAY_LOCK_RETENTION_DAYS,
    now,
  );
}
