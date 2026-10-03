import assert from "node:assert/strict";
import test from "node:test";

import {
  createCmsMediaReconciliationPlan,
  runCmsMediaReconciliation,
} from "../scripts/cms-media-reconciliation-lib.mjs";
import { parseArguments } from "../scripts/reconcile-cms-media.mjs";

const folder = "siriranee/cms";
const publicId = `${folder}/assets/0123456789abcdef/submission/item`;
const secureUrl = `https://res.cloudinary.com/test/image/upload/v123/${publicId}.webp`;
const now = new Date("2026-10-03T00:00:00.000Z");

function asset(overrides = {}) {
  return {
    _id: publicId,
    publicId,
    providerAssetId: "provider_asset_123",
    secureUrl,
    cloudinaryVersion: 123,
    format: "webp",
    status: "deleting",
    version: 3,
    providerSignatureExpiresAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    rows: [asset()],
    content: { _id: "siriranee-content", services: [], team: [], vouchers: [] },
    publications: [{ _id: "publication-1", snapshot: { services: [] } }],
    ...overrides,
  };
}

function missing() {
  throw Object.assign(new Error("Not found"), { http_code: 404 });
}

function absentProvider() {
  const calls = [];
  return {
    calls,
    getByPublicId(value) {
      calls.push(["publicId", value]);
      return missing();
    },
    getByAssetId(value) {
      calls.push(["assetId", value]);
      return missing();
    },
  };
}

function context() {
  return { databaseName: "isolated-test", cloudName: "test", folder, now };
}

function fakeDatabase(initial) {
  const data = structuredClone(initial);
  const updates = [];
  const concurrency = { active: 0, maximum: 0 };
  async function tracked(value) {
    concurrency.active += 1;
    concurrency.maximum = Math.max(concurrency.maximum, concurrency.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return structuredClone(value);
    } finally {
      concurrency.active -= 1;
    }
  }
  const database = {
    databaseName: "isolated-test",
    collection(name) {
      if (name === "cmsMediaAssets") {
        return {
          find(filter) {
            return {
              toArray: () => tracked(filter.status === "deleting"
                ? data.rows.filter((row) => row.status === "deleting")
                : data.allMediaRows ?? data.rows),
            };
          },
          async updateOne(filter, update) {
            const row = data.rows.find((item) =>
              item._id === filter._id &&
              item.status === filter.status &&
              item.version === filter.version &&
              item.publicId === filter.publicId &&
              item.providerSignatureExpiresAt === filter.providerSignatureExpiresAt,
            );
            if (!row) return { matchedCount: 0 };
            Object.assign(row, update.$set);
            updates.push(structuredClone(update));
            return { matchedCount: 1 };
          },
        };
      }
      if (name === "cmsContent") {
        return { findOne: () => tracked(data.content) };
      }
      if (name === "cmsPublications") {
        return { find: () => ({ toArray: () => tracked(data.publications) }) };
      }
      throw new Error("Unexpected collection");
    },
  };
  const client = {
    startSession() {
      return {
        async withTransaction(action) { await action(); },
        async endSession() {},
      };
    },
  };
  return { database, client, data, updates, concurrency };
}

test("only an owned deleting record over 24 hours past signature expiry can be eligible", async () => {
  const provider = absentProvider();
  const eligible = await createCmsMediaReconciliationPlan(state(), provider, context());
  assert.equal(eligible.counts.candidateCount, 1);
  assert.equal(eligible.counts.providerUnknownCount, 0);
  assert.equal(provider.calls.length, 2);
  assert.match(eligible.hash, /^[a-f0-9]{64}$/);

  const tooRecent = await createCmsMediaReconciliationPlan(
    state({ rows: [asset({ providerSignatureExpiresAt: "2026-10-02T12:00:00.000Z" })] }),
    provider,
    context(),
  );
  assert.equal(tooRecent.counts.tooRecentCount, 1);
  assert.equal(tooRecent.counts.candidateCount, 0);
  assert.equal(provider.calls.length, 2);

  const foreign = await createCmsMediaReconciliationPlan(
    state({ rows: [asset({ publicId: "elsewhere/assets/image" })] }),
    provider,
    context(),
  );
  assert.equal(foreign.counts.invalidCount, 1);
  assert.equal(foreign.counts.candidateCount, 0);

  const wrongAccount = await createCmsMediaReconciliationPlan(
    state({ rows: [asset({
      secureUrl: secureUrl.replace("res.cloudinary.com/test/", "res.cloudinary.com/other/"),
    })] }),
    provider,
    context(),
  );
  assert.equal(wrongAccount.counts.invalidCount, 1);
  assert.equal(wrongAccount.counts.candidateCount, 0);
});

test("current content and every publication protect media, including URL variants", async () => {
  const provider = absentProvider();
  const current = await createCmsMediaReconciliationPlan(
    state({ content: { services: [{ imageUrl: secureUrl }] }, publications: [] }),
    provider,
    context(),
  );
  assert.equal(current.counts.referencedCount, 1);

  const publication = await createCmsMediaReconciliationPlan(
    state({ publications: [{ snapshot: { services: [{ hero: { imageUrl: `${secureUrl}?variant=1` } }] } }] }),
    provider,
    context(),
  );
  assert.equal(publication.counts.referencedCount, 1);
  assert.equal(provider.calls.length, 0);

  await assert.rejects(
    createCmsMediaReconciliationPlan(
      state({ publications: [{ snapshot: null }] }),
      provider,
      context(),
    ),
    /malformed/,
  );
  await assert.rejects(
    createCmsMediaReconciliationPlan(
      state({ publications: [{ snapshot: { services: "missing" } }] }),
      provider,
      context(),
    ),
    /malformed/,
  );
  await assert.rejects(
    createCmsMediaReconciliationPlan(
      state({ publications: [{ snapshot: { services: [{ imageUrl: null }] } }] }),
      provider,
      context(),
    ),
    /malformed/,
  );
});

test("Cloudinary 404 must be explicit and checked by both public and immutable IDs", async () => {
  const provider = {
    getByPublicId() { throw new Error("Not found but not a verified 404"); },
    getByAssetId() { throw new Error("This should not be called"); },
  };
  const unknown = await createCmsMediaReconciliationPlan(state(), provider, context());
  assert.equal(unknown.counts.providerUnknownCount, 1);
  assert.equal(unknown.counts.candidateCount, 0);

  const renamed = await createCmsMediaReconciliationPlan(state(), {
    getByPublicId: missing,
    getByAssetId: async () => ({ asset_id: "provider_asset_123" }),
  }, context());
  assert.equal(renamed.counts.providerPresentCount, 1);
  assert.equal(renamed.counts.candidateCount, 0);

  const timedOut = await createCmsMediaReconciliationPlan(state(), {
    getByPublicId: () => new Promise(() => {}),
    getByAssetId: missing,
  }, { ...context(), providerLookupTimeoutMs: 5 });
  assert.equal(timedOut.counts.providerUnknownCount, 1);
});

test("dry-run inventories all statuses and only reports unreferenced committed assets", async () => {
  const committedPublicId = `${folder}/assets/0123456789abcdef/submission/committed`;
  const committed = asset({
    _id: committedPublicId,
    publicId: committedPublicId,
    secureUrl: `https://res.cloudinary.com/test/image/upload/v123/${committedPublicId}.webp`,
    status: "committed",
  });
  const rows = [asset(), committed, { ...committed, _id: "other", status: "authorized" },
    { ...committed, _id: "staged", status: "staged" },
    { ...committed, _id: "deleted", status: "deleted" }];
  const report = await createCmsMediaReconciliationPlan(
    state({ rows: [asset()], allMediaRows: rows }),
    absentProvider(),
    context(),
  );
  assert.equal(report.counts.mediaRecordCount, 5);
  assert.equal(report.counts.authorizedCount, 1);
  assert.equal(report.counts.stagedCount, 1);
  assert.equal(report.counts.committedCount, 1);
  assert.equal(report.counts.deletingCount, 1);
  assert.equal(report.counts.deletedCount, 1);
  assert.equal(report.counts.unreferencedCommittedCount, 1);

  const protectedReport = await createCmsMediaReconciliationPlan(
    state({
      rows: [asset()],
      allMediaRows: rows,
      publications: [{ snapshot: { services: [{ imageUrl: committed.secureUrl }] } }],
    }),
    absentProvider(),
    context(),
  );
  assert.equal(protectedReport.counts.unreferencedCommittedCount, 0);
  assert.notEqual(protectedReport.hash, report.hash);

  const changedInventory = await createCmsMediaReconciliationPlan(
    state({ rows: [asset()], allMediaRows: [...rows, { _id: "new", status: "authorized" }] }),
    absentProvider(),
    context(),
  );
  assert.notEqual(changedInventory.hash, report.hash);
});

test("apply needs the exact reviewed hash, rechecks provider and references, and updates metadata only", async () => {
  const fixture = fakeDatabase(state());
  const provider = absentProvider();
  const dryRun = await runCmsMediaReconciliation(fixture.database, provider, {
    client: fixture.client, cloudName: "test", folder, now,
  });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.candidateCount, 1);
  assert.equal(fixture.updates.length, 0);

  await assert.rejects(
    runCmsMediaReconciliation(fixture.database, provider, {
      client: fixture.client, cloudName: "test", folder, now,
      apply: true, expectedPlan: "0".repeat(64),
    }),
    /exact current dry-run plan hash/,
  );
  assert.equal(fixture.updates.length, 0);

  const applied = await runCmsMediaReconciliation(fixture.database, provider, {
    client: fixture.client, cloudName: "test", folder, now,
    apply: true, expectedPlan: dryRun.planHash,
  });
  assert.equal(applied.updatedCount, 1);
  assert.equal(fixture.data.rows[0].status, "deleted");
  assert.equal(fixture.data.rows[0].version, 4);
  assert.equal(fixture.updates.length, 1);
  assert.deepEqual(Object.keys(fixture.updates[0]), ["$set"]);
  assert.equal(provider.calls.length, 8); // dry-run, rejected hash, pre-apply and transaction.
  assert.equal(fixture.concurrency.maximum, 1); // No parallel operations on the session.
});

test("a provider or CMS reference change during apply aborts before any metadata write", async () => {
  const provider = absentProvider();
  const fixture = fakeDatabase(state());
  const dryRun = await runCmsMediaReconciliation(fixture.database, provider, {
    client: fixture.client, cloudName: "test", folder, now,
  });

  let calls = 0;
  const changingProvider = {
    getByPublicId() {
      calls += 1;
      if (calls === 2) return { public_id: publicId };
      return missing();
    },
    getByAssetId: missing,
  };
  await assert.rejects(
    runCmsMediaReconciliation(fixture.database, changingProvider, {
      client: fixture.client, cloudName: "test", folder, now,
      apply: true, expectedPlan: dryRun.planHash,
    }),
    /state changed/,
  );
  assert.equal(fixture.updates.length, 0);

  const originalWithTransaction = fixture.client.startSession;
  fixture.client.startSession = () => {
    const session = originalWithTransaction();
    return {
      ...session,
      async withTransaction(action) {
        fixture.data.publications.push({ _id: "new", snapshot: { services: [{ imageUrl: secureUrl }] } });
        await action();
      },
    };
  };
  await assert.rejects(
    runCmsMediaReconciliation(fixture.database, provider, {
      client: fixture.client, cloudName: "test", folder, now,
      apply: true, expectedPlan: dryRun.planHash,
    }),
    /state changed/,
  );
  assert.equal(fixture.updates.length, 0);
});

test("CLI accepts only a dry run or one reviewed apply hash", () => {
  assert.deepEqual(parseArguments([]), { apply: false, expectedPlan: "" });
  assert.deepEqual(parseArguments(["--apply", "--expected-plan=abc"]), {
    apply: true, expectedPlan: "abc",
  });
  assert.throws(() => parseArguments(["--expected-plan=abc"]), /Usage/);
  assert.throws(() => parseArguments(["--apply", "--apply"]), /Usage/);
  assert.throws(() => parseArguments(["--delete-provider"]), /Usage/);
});
