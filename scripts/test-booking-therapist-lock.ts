import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import type { CmsRepository } from "@/server/cms/repositories/repository";
import { prepareBookingSafetyFixture } from "../tests/support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function main() {
  if (!process.argv.includes("--isolated")) {
    throw new Error("Pass --isolated to create and remove disposable fictional MongoDB databases. No live booking or email is touched.");
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  const configuredDatabase = process.env.MONGODB_DB;
  process.env.CMS_MODE = "mongodb";
  process.env.CMS_PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.CMS_PUBLIC_BOOKING_READY = "true";
  // Readiness needs a configured sender; delivery always uses the explicit stub below.
  process.env.RESEND_API_KEY = "re_isolated_test_never_send";
  const [{ MongoCmsRepository }, { getMongoClient }, { createAdminBooking }, { createPublicBooking }, { updateCmsTeamMember }] = await Promise.all([
    import("@/server/cms/repositories/mongo-repository"),
    import("@/server/cms/repositories/mongo-client"),
    import("@/server/cms/booking-service"),
    import("@/server/booking/public-booking"),
    import("@/server/cms/content-service"),
  ]);
  const client = await getMongoClient();
  let verified = 0;
  try {
    for (const channel of ["admin", "public"] as const) {
      for (const change of ["deactivate", "eligibility"] as const) {
        for (const first of ["booking", "therapist"] as const) {
          const databaseName = `srn_lock_test_${randomBytes(12).toString("hex")}`;
          assert.match(databaseName, /^srn_lock_test_[0-9a-f]{24}$/);
          assert.notEqual(databaseName, configuredDatabase);
          process.env.MONGODB_DB = databaseName;
          const database = client.db(databaseName);
          assert.equal((await client.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: databaseName } })).databases.length, 0);
          try {
            const repository = new MongoCmsRepository();
            Reflect.set(globalThis, "__siriraneeCmsRepository", repository);
            const fixture = await prepareBookingSafetyFixture(repository);
            const content = await repository.getContent();
            const alternateService = { ...fixture.service, id: "alternate-safety-treatment", slug: "alternate-safety-treatment" };
            const prepared = {
              ...content,
              revision: content.revision + 1,
              services: [...content.services, alternateService],
              team: content.team.map((member) => ({ ...member, serviceIds: [fixture.service.id, alternateService.id] })),
            };
            await repository.saveContent(prepared, content.revision);
            await repository.savePublication({ id: "safety-second-publication", revision: prepared.revision, publishedAt: new Date().toISOString(), publishedBy: fixture.actor.id, snapshot: prepared });
            // Precreate empty collections so the test isolates document-lock races.
            for (const name of ["cmsTherapistLocks", "cmsBookingDayLocks", "cmsBookings", "cmsBookingHolds", "cmsClosures", "cmsBookingNotifications", "cmsAuditEvents"]) {
              if (!(await database.listCollections({ name }).toArray()).length) await database.createCollection(name);
            }

            const firstLocked = gate();
            const secondTrying = gate();
            const releaseFirst = gate();
            let operations = 0;
            const attempts = new Map<number, number>();
            const traced = new Proxy(repository, {
              get(target, property) {
                if (property === "transaction") {
                  return <T>(work: (transaction: CmsRepository) => Promise<T>) => {
                    const operation = ++operations;
                    return target.transaction(async (transaction) => {
                      attempts.set(operation, (attempts.get(operation) ?? 0) + 1);
                      return work(new Proxy(transaction, {
                        get(tx, key) {
                          if (key === "lockTherapist") return async (therapistId: string) => {
                            if (operation === 2) secondTrying.release();
                            await tx.lockTherapist(therapistId);
                            if (operation === 1 && attempts.get(operation) === 1) {
                              firstLocked.release();
                              await releaseFirst.promise;
                            }
                          };
                          const value = Reflect.get(tx, key, tx);
                          return typeof value === "function" ? value.bind(tx) : value;
                        },
                      }));
                    });
                  };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            Reflect.set(globalThis, "__siriraneeCmsRepository", traced);
            const book = () => channel === "admin"
              ? createAdminBooking(fixture.input, fixture.context)
              : createPublicBooking({ ...fixture.input, privacyAccepted: true }, {
                  idempotencyKey: `isolated-lock-${randomUUID()}`,
                  requestId: "isolated-lock-test",
                  sendOwnerBookingEmail: async () => ({ status: "sent", attempted: true, providerMessageId: "isolated-stub-no-email" }),
                });
            const edit = () => updateCmsTeamMember(fixture.therapist.id, {
              ...fixture.therapist,
              ...(change === "deactivate" ? { operationalActive: false } : { serviceIds: [alternateService.id] }),
            }, fixture.therapist.version, fixture.context);
            const runFirst = first === "booking" ? book : edit;
            const runSecond = first === "booking" ? edit : book;
            const settled = (work: () => Promise<unknown>) => work().then(
              () => ({ ok: true as const }),
              (error: unknown) => ({ ok: false as const, error }),
            );
            const firstResult = settled(runFirst);
            const timeout = setTimeout(() => { firstLocked.release(); secondTrying.release(); releaseFirst.release(); }, 15_000);
            try {
              await firstLocked.promise;
              const secondResult = settled(runSecond);
              await secondTrying.promise;
              releaseFirst.release();
              const results = await Promise.all([firstResult, secondResult]);
              assert.equal(results[0].ok, true, `First ${first} operation must commit.`);
              assert.equal(results[1].ok, false, "The conflicting operation must be rejected after rereading state.");
              const finalContent = await repository.getContent();
              const member = finalContent.team.find((item) => item.id === fixture.therapist.id)!;
              const bookings = await repository.listBookings();
              if (first === "booking") {
                assert.equal(bookings.length, 1);
                assert.equal(member.operationalActive, true);
                assert.ok(member.serviceIds.includes(fixture.service.id));
              } else {
                assert.equal(bookings.length, 0);
                assert.ok(!member.operationalActive || !member.serviceIds.includes(fixture.service.id));
              }
              console.log(`PASS ${channel}: ${change}; ${first} commits first; second transaction attempts=${attempts.get(2)}`);
              verified += 1;
            } finally {
              clearTimeout(timeout);
              releaseFirst.release();
            }
          } finally {
            // The only deletion target is the exact randomly generated test DB above.
            assert.match(database.databaseName, /^srn_lock_test_[0-9a-f]{24}$/);
            assert.notEqual(database.databaseName, configuredDatabase);
            await database.dropDatabase();
            assert.equal((await client.db("admin").admin().listDatabases({ nameOnly: true, filter: { name: databaseName } })).databases.length, 0);
          }
        }
      }
    }
    console.log(`Verified ${verified} therapist/booking races. All disposable databases removed; no emails sent.`);
  } finally {
    await client.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Isolated lock verification failed.");
  process.exitCode = 1;
});
