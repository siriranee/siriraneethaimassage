export const CMS_AUDIT_RETENTION_DAYS = 365;

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export function getCmsAuditExpiryDate(
  createdAt: string,
  now = new Date(),
) {
  const parsedCreatedAt = new Date(createdAt);
  const nowTime = now.getTime();
  const createdAtTime = parsedCreatedAt.getTime();
  const retentionStart =
    Number.isFinite(createdAtTime) && createdAtTime <= nowTime
      ? createdAtTime
      : nowTime;

  return new Date(
    retentionStart + CMS_AUDIT_RETENTION_DAYS * millisecondsPerDay,
  );
}
