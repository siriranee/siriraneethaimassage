import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CMS_AUDIT_RETENTION_DAYS,
  getCmsAuditExpiryDate,
} from "@/server/cms/audit-retention";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("CMS audit retention is exactly 365 days", () => {
  const createdAt = "2026-09-03T12:30:00.000Z";
  const expiry = getCmsAuditExpiryDate(
    createdAt,
    new Date("2026-09-04T00:00:00.000Z"),
  );

  assert.equal(CMS_AUDIT_RETENTION_DAYS, 365);
  assert.equal(expiry.toISOString(), "2027-09-03T12:30:00.000Z");
});

test("invalid or future audit timestamps receive a full safe retention window", () => {
  const now = new Date("2026-09-03T12:30:00.000Z");

  assert.equal(
    getCmsAuditExpiryDate("not-a-date", now).toISOString(),
    "2027-09-03T12:30:00.000Z",
  );
  assert.equal(
    getCmsAuditExpiryDate("2099-01-01T00:00:00.000Z", now).toISOString(),
    "2027-09-03T12:30:00.000Z",
  );
});

test("Mongo audit writes, seed provisioning and index migration retain events for one year", async () => {
  const [repository, indexes, seed] = await Promise.all([
    source("src/server/cms/repositories/mongo-repository.ts"),
    source("scripts/cms-indexes.mjs"),
    source("scripts/seed-cms-admin.mjs"),
  ]);

  assert.match(
    repository,
    /expiresAtDate:\s*getCmsAuditExpiryDate\(event\.createdAt\)/,
  );
  assert.match(repository, /delete stored\.expiresAtDate/);
  assert.match(indexes, /const auditRetentionDays = 365/);
  assert.match(seed, /const auditRetentionDays = 365/);
  assert.match(seed, /expiresAtDate:\s*new Date\(/);

  const backfillPosition = indexes.indexOf("const auditBackfill");
  const ttlIndexPosition = indexes.indexOf('name: "cms_audit_expiry_ttl"');
  assert.ok(backfillPosition >= 0);
  assert.ok(ttlIndexPosition > backfillPosition);
  assert.match(indexes, /\$type:\s*"\$expiresAtDate"/);
  assert.match(indexes, /\$convert:[\s\S]*?onError:\s*null[\s\S]*?onNull:\s*null/);
  assert.match(indexes, /\$lte:\s*\["\$\$parsedCreatedAt", "\$\$NOW"\]/);
  assert.match(indexes, /amount:\s*auditRetentionDays/);
  assert.match(
    indexes,
    /\{ expiresAtDate: 1 \}[\s\S]*?name: "cms_audit_expiry_ttl"[\s\S]*?expireAfterSeconds: 0/,
  );
});
