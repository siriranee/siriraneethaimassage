import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve(process.cwd(), "scripts/migrate-vouchers.mjs");

async function source() {
  return readFile(scriptPath, "utf8");
}

test("voucher migration uses the approved defaults and safe CLI overrides", async () => {
  const { parseArguments } = await import("../scripts/migrate-vouchers.mjs");
  const defaults = parseArguments([]);

  assert.equal(defaults.apply, false);
  assert.deepEqual(
    defaults.vouchers.map(({ imagePath, title }) => ({ imagePath, title })),
    [
      {
        imagePath:
          "C:\\Coding\\2026\\00-Files\\Siriranee Thai massage\\Design\\Drive\\gift voucher copy.jpg",
        title: "Gift Voucher",
      },
      {
        imagePath:
          "C:\\Coding\\2026\\00-Files\\Siriranee Thai massage\\Design\\Drive\\9 free 1.jpg",
        title: "9 Visits + 1 Free",
      },
    ],
  );

  const overridden = parseArguments([
    "--apply",
    "--image",
    "first.jpg",
    "--title",
    "First voucher",
    "--image",
    "second.jpg",
    "--title",
    "Second voucher",
  ]);
  assert.equal(overridden.apply, true);
  assert.deepEqual(
    overridden.vouchers.map(({ imagePath, title }) => ({ imagePath, title })),
    [
      { imagePath: "first.jpg", title: "First voucher" },
      { imagePath: "second.jpg", title: "Second voucher" },
    ],
  );
  const altOnly = parseArguments([
    "--alt",
    "First approved artwork",
    "--alt",
    "Second approved artwork",
  ]);
  assert.deepEqual(
    altOnly.vouchers.map(({ imagePath, title, altText }) => ({
      imagePath,
      title,
      altText,
    })),
    [
      {
        ...defaults.vouchers[0],
        altText: "First approved artwork",
      },
      {
        ...defaults.vouchers[1],
        altText: "Second approved artwork",
      },
    ],
  );
  assert.throws(
    () => parseArguments(["--image", "one.jpg", "--title", "One"]),
    /exactly two --image values and two --title values/,
  );
});

test("voucher migration uploads completely before its first Mongo write", async () => {
  const script = await source();
  const acquireLoop = script.indexOf("for (const plan of plans)", script.indexOf("const acquiredAssets"));
  const commitCall = script.indexOf("transactionResult = await commitMongoMigration");

  assert.ok(acquireLoop >= 0 && commitCall > acquireLoop);
  assert.match(script, /overwrite:\s*false/);
  assert.match(
    script,
    /assets\/\$\{MEDIA_SCOPE\}\/\$\{slug\(title\)\}-\$\{sourceSha256\.slice\(0, 20\)\}/,
  );
  assert.match(script, /newlyUploaded\.push\(\{ plan, asset:/);
  assert.match(script, /proveCloudinaryRunOwnership/);
  assert.match(script, /assertExistingAssetIsCommitted/);
  assert.match(script, /databaseReferencesAsset\(db, ownership\)/);
  assert.match(
    script,
    /cloudinary\.api\.delete_resources_by_asset_ids\([\s\S]*?ownership\.providerAssetId/,
  );
  assert.match(script, /findCloudinaryResourceByAssetId/);
  assert.match(script, /reconcileCloudinaryResource/);
  assert.match(script, /Cloudinary upload outcome remained indeterminate/);
  assert.match(script, /resourceAtOriginalPublicId\.asset_id === ownership\.providerAssetId/);
  assert.doesNotMatch(script, /cloudinary\.uploader\.destroy/);
});

test("voucher migration commits content, publication, media and audit in one session", async () => {
  const script = await source();
  const transactionStart = script.indexOf("return await session.withTransaction");
  const transactionEnd = script.indexOf("await session.endSession", transactionStart);
  const transaction = script.slice(transactionStart, transactionEnd);

  assert.ok(transactionStart >= 0 && transactionEnd > transactionStart);
  assert.doesNotMatch(transaction, /Promise\.all/);
  assert.match(transaction, /mediaAssets\.insertOne\(entry\.record, \{ session \}\)/);
  assert.match(transaction, /contentCollection\.replaceOne\([\s\S]*?\{ session \}/);
  assert.match(transaction, /publications\.insertOne\(publication, \{ session \}\)/);
  assert.match(transaction, /metadata\.updateOne\([\s\S]*?\{ upsert: true, session \}/);
  assert.match(transaction, /audit\.insertOne\([\s\S]*?expiresAtDate:/);
  assert.match(transaction, /auditIdForRevision\([\s\S]*?nextRevision/);
  assert.match(transaction, /verificationAuditId\(migrationFingerprint\)/);
  assert.match(script, /status:\s*"committed"/);
  assert.match(script, /records\.length !== 2/);
  assert.match(script, /sortOrder:\s*plan\.index/);
  assert.match(script, /vouchers:\s*replaceVoucherRecords\(desiredVouchers\)/);
  assert.match(script, /const STORED_CONTENT_FIELDS = \[/);
  assert.match(script, /const PUBLICATION_SNAPSHOT_FIELDS = \[/);
  assert.match(script, /hasExactTopLevelFields\(current, STORED_CONTENT_FIELDS\)/);
  assert.match(script, /verifyCommittedMigration/);
});

test("voucher publication upgrades only a validated v6/v7 published snapshot", async () => {
  const {
    assertSupportedPublicationSnapshot,
    createContentDocument,
    createPublicationSnapshot,
  } = await import("../scripts/migrate-vouchers.mjs");
  const publishedSnapshot = {
    id: "siriranee-content",
    schemaVersion: 6,
    revision: 7,
    services: [{ id: "published-service", name: "Published service" }],
    site: { name: "Published site" },
    bookingSettings: { timezone: "Europe/Dublin" },
    team: [{ id: "published-team-member" }],
    promotions: [{ id: "published-promotion" }],
    vouchers: [],
    pages: [{ id: "legacy-page" }],
    gallery: [{ id: "legacy-gallery" }],
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: "existing-publisher",
  };
  const nextContent = {
    id: "siriranee-content",
    schemaVersion: 7,
    revision: 8,
    services: [{ id: "unpublished-service" }],
    site: { name: "Unpublished site" },
    bookingSettings: { timezone: "Unsafe/Editorial" },
    team: [{ id: "unpublished-team-member" }],
    promotions: [{ id: "unpublished-promotion" }],
    vouchers: [],
    pages: [{ id: "unpublished-page" }],
    gallery: [{ id: "unpublished-gallery" }],
    updatedAt: "2026-09-03T00:00:00.000Z",
    updatedBy: "system-voucher-migration",
  };
  const desiredVouchers = [
    { id: "voucher-1", sortOrder: 0 },
    { id: "voucher-2", sortOrder: 1 },
  ];

  assert.doesNotThrow(() => assertSupportedPublicationSnapshot(publishedSnapshot));
  const snapshot = createPublicationSnapshot(
    { snapshot: publishedSnapshot },
    nextContent,
    desiredVouchers,
  );

  assert.equal(snapshot.schemaVersion, 7);
  assert.equal(snapshot.revision, 8);
  assert.deepEqual(snapshot.services, publishedSnapshot.services);
  assert.deepEqual(snapshot.site, publishedSnapshot.site);
  assert.deepEqual(snapshot.bookingSettings, publishedSnapshot.bookingSettings);
  assert.deepEqual(snapshot.team, publishedSnapshot.team);
  assert.deepEqual(snapshot.promotions, publishedSnapshot.promotions);
  assert.deepEqual(snapshot.vouchers, desiredVouchers);
  assert.notEqual(snapshot.services, publishedSnapshot.services);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "bookingSettings",
    "id",
    "promotions",
    "revision",
    "schemaVersion",
    "services",
    "site",
    "team",
    "updatedAt",
    "updatedBy",
    "vouchers",
  ]);

  const storedContent = createContentDocument(
    {
      _id: "siriranee-content",
      ...nextContent,
      retiredField: "remove me",
    },
    desiredVouchers,
    8,
    "2026-09-03T00:00:00.000Z",
  );
  assert.deepEqual(Object.keys(storedContent).sort(), [
    "_id",
    "bookingSettings",
    "promotions",
    "revision",
    "schemaVersion",
    "services",
    "site",
    "team",
    "updatedAt",
    "updatedBy",
    "vouchers",
  ]);
  assert.deepEqual(storedContent.services, nextContent.services);
  assert.notEqual(storedContent.services, nextContent.services);

  for (const unsupportedSchemaVersion of [5, 8, "6"]) {
    assert.throws(
      () =>
        assertSupportedPublicationSnapshot({
          ...publishedSnapshot,
          schemaVersion: unsupportedSchemaVersion,
        }),
      /supported schema version 6 or 7/,
    );
  }
  assert.throws(
    () =>
      assertSupportedPublicationSnapshot({
        ...publishedSnapshot,
        services: ["invalid"],
      }),
    /services field has an unsupported shape/,
  );
});

test("voucher migration requires an existing publication before upload", async () => {
  const script = await source();
  const inspection = script.slice(
    script.indexOf("async function inspectMongoState"),
    script.indexOf("async function assertTransactionSupport"),
  );
  const upload = script.indexOf("const acquiredAssets = []");

  assert.match(
    script,
    /An existing current CMS publication is required before voucher migration/,
  );
  assert.match(inspection, /await readCurrentPublication\(db\)/);
  assert.ok(script.indexOf("const inspected = await inspectMongoState") < upload);
  assert.doesNotMatch(script, /currentPublication\?\.snapshot/);
});

test("voucher verification rejects an old schema-shaped or misordered result", async () => {
  const { recordsContainTargets } = await import(
    "../scripts/migrate-vouchers.mjs"
  );
  const expected = [
    {
      id: "voucher-1",
      title: "Gift Voucher",
      imageUrl: "https://res.cloudinary.com/test/image/upload/v1/one.jpg",
      imageAlt: "Gift Voucher artwork",
      status: "published",
      sortOrder: 0,
    },
    {
      id: "voucher-2",
      title: "9 Visits + 1 Free",
      imageUrl: "https://res.cloudinary.com/test/image/upload/v1/two.jpg",
      imageAlt: "9 Visits + 1 Free artwork",
      status: "published",
      sortOrder: 1,
    },
  ];
  const stored = expected.map((voucher) => ({
    ...voucher,
    version: 1,
    updatedAt: "2026-09-03T00:00:00.000Z",
  }));

  assert.equal(recordsContainTargets(stored, expected), true);
  assert.equal(
    recordsContainTargets(
      stored.map((voucher) => ({ ...voucher, sortOrder: 99 })),
      expected,
    ),
    false,
  );
  assert.equal(
    recordsContainTargets(
      stored.map((voucher) => ({ ...voucher, version: 0 })),
      expected,
    ),
    false,
  );
  assert.equal(
    recordsContainTargets(
      stored.map((voucher) => ({ ...voucher, updatedAt: "not-a-date" })),
      expected,
    ),
    false,
  );
});

test("an existing deterministic asset is reusable only after Mongo commit", async () => {
  const { assertExistingAssetIsCommitted } = await import(
    "../scripts/migrate-vouchers.mjs"
  );
  const asset = {
    publicId: "siriranee/cms/assets/voucher-image/gift-abc",
    providerAssetId: "immutable-provider-id",
    secureUrl:
      "https://res.cloudinary.com/test/image/upload/v1/siriranee/cms/assets/voucher-image/gift-abc.jpg",
  };
  const uncommittedDb = {
    collection() {
      return { findOne: async () => null };
    },
  };
  const committedDb = {
    collection(name) {
      return {
        findOne: async () => (name === "cmsMediaAssets" ? { _id: asset.publicId } : null),
      };
    },
  };

  await assert.rejects(
    assertExistingAssetIsCommitted(uncommittedDb, asset, {
      title: "Gift Voucher",
    }),
    /exists but is not committed in MongoDB/,
  );
  await assert.doesNotReject(
    assertExistingAssetIsCommitted(committedDb, asset, {
      title: "Gift Voucher",
    }),
  );
});

test("voucher audit IDs are idempotent and expiry-aware", async () => {
  const { auditRecordIsValid } = await import("../scripts/migrate-vouchers.mjs");
  const fingerprint = "a".repeat(64);
  const baseId = `voucher-migration-${fingerprint.slice(0, 32)}`;
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAtDate = new Date(now + 365 * 24 * 60 * 60 * 1_000);
  const baseRecord = {
    _id: baseId,
    requestId: baseId,
    action: "voucher.migrated",
    entityType: "voucher-migration",
    entityId: fingerprint,
    createdAt,
    expiresAtDate,
  };

  assert.equal(auditRecordIsValid(baseRecord, fingerprint), true);
  assert.equal(
    auditRecordIsValid(
      {
        ...baseRecord,
        _id: `${baseId}-r8`,
        requestId: `${baseId}-r8`,
      },
      fingerprint,
    ),
    true,
  );
  const expiredCreatedAt = new Date(now - 366 * 24 * 60 * 60 * 1_000);
  assert.equal(
    auditRecordIsValid(
      {
        ...baseRecord,
        createdAt: expiredCreatedAt.toISOString(),
        expiresAtDate: new Date(
          expiredCreatedAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
        ),
      },
      fingerprint,
    ),
    false,
  );
});

test("unknown Mongo commit labels are found through wrapped causes", async () => {
  const { hasMongoErrorLabel } = await import("../scripts/migrate-vouchers.mjs");
  const labelled = {
    hasErrorLabel(label) {
      return label === "UnknownTransactionCommitResult";
    },
  };

  assert.equal(
    hasMongoErrorLabel(
      { cause: { cause: labelled } },
      "UnknownTransactionCommitResult",
    ),
    true,
  );
  assert.equal(
    hasMongoErrorLabel(
      { errorLabels: ["TransientTransactionError"] },
      "UnknownTransactionCommitResult",
    ),
    false,
  );

  const script = await source();
  assert.match(script, /reconcileMongoCommit/);
  assert.match(script, /MONGO_COMMIT_RECONCILIATION_DELAYS_MS/);
  assert.match(script, /Newly uploaded Cloudinary assets were retained/);
});

test("voucher migration redacts credentials and never logs configuration secrets", async () => {
  const script = await source();
  const consoleCalls = [...script.matchAll(/console\.(?:log|error)\(([^;]+)\);/gs)]
    .map((match) => match[1])
    .join("\n");

  assert.doesNotMatch(
    consoleCalls,
    /configuration\.(?:mongoUri|apiKey|apiSecret)/,
  );
  assert.match(script, /\[redacted MongoDB URI\]/);
  assert.match(script, /message\.split\(value\)\.join\("\[redacted\]"\)/);
});
