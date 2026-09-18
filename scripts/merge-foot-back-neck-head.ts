// Dry run:
//   npm run cms:merge-foot-back-neck-head
// Apply only after reviewing the printed plan:
//   npm run cms:merge-foot-back-neck-head -- --apply --expected-plan=<sha256>
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import type { ClientSession, Db, Document } from "mongodb";

import type {
  BookingStatus,
  CmsPublication,
} from "../src/domain/cms/types";
import type { CmsRepository } from "../src/server/cms/repositories/repository";
import {
  assertMergedTreatmentContent,
  buildMergedTreatmentContent,
  createServiceMergePlan,
  SERVICE_MERGE_VERSION,
  serviceMergePlanHash,
  SOURCE_SERVICE_IDS,
  type ServiceMergeBooking,
  type ServiceMergePlan,
} from "./merge-foot-back-neck-head-lib";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${process.cwd()}/node_modules/next/dist/compiled/server-only/empty.js`,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const migrationActor = {
  id: "system:merge-foot-back-neck-head",
  displayName: "Treatment service merge migration",
} as const;

type MigrationArguments = {
  readonly apply: boolean;
  readonly expectedPlan: string;
};

function parseArguments(args: readonly string[]): MigrationArguments {
  let apply = false;
  let expectedPlan = "";
  for (const argument of args) {
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument.startsWith("--expected-plan=")) {
      if (expectedPlan) throw new Error("Provide --expected-plan only once.");
      expectedPlan = argument.slice("--expected-plan=".length).trim().toLowerCase();
      continue;
    }
    throw new Error(
      "Unknown argument. Use optional --apply --expected-plan=<reviewed-sha256>.",
    );
  }
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlan)) {
    throw new Error(
      "Apply requires the SHA-256 hash from a reviewed dry run via --expected-plan.",
    );
  }
  return { apply, expectedPlan };
}

async function readBookings(
  db: Db,
  session?: ClientSession,
): Promise<readonly ServiceMergeBooking[]> {
  const rows = await db
    .collection<Document & { _id: string }>("cmsBookings")
    .find(
      { serviceId: { $in: [...SOURCE_SERVICE_IDS] } },
      {
        session,
        projection: {
          serviceId: 1,
          serviceName: 1,
          durationMinutes: 1,
          priceCents: 1,
          status: 1,
          version: 1,
          localDate: 1,
          startsAt: 1,
          endsAt: 1,
        },
      },
    )
    .sort({ _id: 1 })
    .toArray();

  return rows.map((row) => ({
    id: String(row._id),
    serviceId: String(row.serviceId ?? ""),
    serviceName: String(row.serviceName ?? ""),
    durationMinutes: Number(row.durationMinutes),
    priceCents: Number(row.priceCents),
    status: String(row.status ?? "") as BookingStatus,
    version: Number(row.version),
    localDate: String(row.localDate ?? ""),
    startsAt: String(row.startsAt ?? ""),
    endsAt: String(row.endsAt ?? ""),
  }));
}

async function readState(
  db: Db,
  repository: CmsRepository,
  session?: ClientSession,
) {
  const content = await repository.getContent();
  const publication = await repository.getPublishedContent();
  if (!publication) {
    throw new Error("A current CMS publication is required before merging treatments.");
  }
  const bookings = await readBookings(db, session);
  return { content, publication, bookings } as const;
}

function report(plan: ServiceMergePlan, planHash: string, mode: string) {
  return {
    mode,
    planHash,
    version: plan.version,
    migrationNeeded: plan.migrationNeeded,
    database: plan.database,
    baseline: plan.baseline,
    actions: plan.actions,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (process.env.CMS_MODE !== "mongodb") {
    throw new Error("This migration requires CMS_MODE=mongodb.");
  }

  const [
    { getMongoClient, getMongoDatabase },
    { MongoCmsRepository },
    { appendCmsAudit },
    { assertCmsContentMediaReferencesApproved },
  ] = await Promise.all([
    import("../src/server/cms/repositories/mongo-client"),
    import("../src/server/cms/repositories/mongo-repository"),
    import("../src/server/cms/audit"),
    import("../src/server/media/submission"),
  ]);

  const client = await getMongoClient();
  const db = await getMongoDatabase();
  try {
    const repository = new MongoCmsRepository();
    const inspected = await readState(db, repository);
    const initialPlan = createServiceMergePlan(
      db.databaseName,
      inspected.content,
      inspected.publication,
      inspected.bookings,
    );
    const initialPlanHash = serviceMergePlanHash(initialPlan);
    if (!options.apply) {
      console.log(JSON.stringify(report(initialPlan, initialPlanHash, "dry-run"), null, 2));
      if (initialPlan.migrationNeeded) {
        console.log(
          `Review the plan, then run npm run cms:merge-foot-back-neck-head -- --apply --expected-plan=${initialPlanHash}`,
        );
      }
      return;
    }

    const session = client.startSession();
    let appliedPlan: ServiceMergePlan | null = null;
    let publicationId = "";
    let nextRevision = 0;
    let wroteChanges = false;
    try {
      await session.withTransaction(async () => {
        const transaction = new MongoCmsRepository(session);
        const current = await readState(db, transaction, session);
        const plan = createServiceMergePlan(
          db.databaseName,
          current.content,
          current.publication,
          current.bookings,
        );
        const planHash = serviceMergePlanHash(plan);
        if (planHash !== options.expectedPlan) {
          throw new Error(
            "The treatment merge plan changed after review; no data was changed.",
          );
        }
        appliedPlan = plan;
        if (!plan.migrationNeeded) return;

        const now = new Date().toISOString();
        const context = { now, actorId: migrationActor.id };
        const nextContent = buildMergedTreatmentContent(current.content, context);
        const nextSnapshot = buildMergedTreatmentContent(
          current.publication.snapshot,
          context,
        );
        if (nextContent.revision !== nextSnapshot.revision) {
          throw new Error("The current content and publication revisions diverged.");
        }
        assertMergedTreatmentContent(
          nextContent,
          plan.actions.affectedTherapistIds,
        );
        assertMergedTreatmentContent(
          nextSnapshot,
          plan.actions.affectedTherapistIds,
        );
        assertCmsContentMediaReferencesApproved(nextContent);
        assertCmsContentMediaReferencesApproved(nextSnapshot);

        await transaction.saveContent(nextContent, current.content.revision);
        const publication: CmsPublication = {
          id: randomUUID(),
          revision: nextContent.revision,
          publishedAt: now,
          publishedBy: migrationActor.id,
          snapshot: nextSnapshot,
        };
        await transaction.savePublication(publication);
        await appendCmsAudit(transaction, {
          actor: migrationActor,
          action: "services.combined",
          entityType: "service-menu",
          entityId: `merge-v${SERVICE_MERGE_VERSION}`,
          summary:
            "Combined Back & Neck Massage, Head Spa, and Foot & Reflexology Spa into one 60-minute Foot Massage Including Back, Neck & Head treatment at €65. Existing bookings were preserved and no email was sent.",
          requestId: `service-merge:${planHash.slice(0, 32)}`,
        });
        publicationId = publication.id;
        nextRevision = nextContent.revision;
        wroteChanges = true;
      });
    } finally {
      await session.endSession();
    }

    const committedPlan = appliedPlan as ServiceMergePlan | null;
    if (!committedPlan) {
      throw new Error("The treatment merge transaction did not complete.");
    }
    const verifiedRepository = new MongoCmsRepository();
    const verified = await readState(db, verifiedRepository);
    const verifiedPlan = createServiceMergePlan(
      db.databaseName,
      verified.content,
      verified.publication,
      verified.bookings,
    );
    assertMergedTreatmentContent(
      verified.content,
      committedPlan.actions.affectedTherapistIds,
    );
    assertMergedTreatmentContent(
      verified.publication.snapshot,
      committedPlan.actions.affectedTherapistIds,
    );
    if (
      verifiedPlan.migrationNeeded ||
      verifiedPlan.actions.activeRemovedServiceBookings !== 0 ||
      verifiedPlan.baseline.bookingGuardHash !==
        committedPlan.baseline.bookingGuardHash ||
      (wroteChanges &&
        (verified.publication.id !== publicationId ||
          verified.content.revision !== nextRevision ||
          verified.publication.revision !== nextRevision))
    ) {
      throw new Error(
        "Post-commit treatment merge verification failed; inspect the committed state before retrying.",
      );
    }

    console.log(
      JSON.stringify(
        report(
          committedPlan,
          options.expectedPlan,
          wroteChanges ? "applied" : "already-clean",
        ),
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Treatment merge failed.";
  const secrets = [process.env.MONGODB_URI, process.env.CLOUDINARY_API_SECRET]
    .filter((value): value is string => Boolean(value && value.length >= 4));
  for (const secret of secrets) message = message.split(secret).join("[redacted]");
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URI]");
  console.error(message);
  process.exitCode = 1;
});

export { parseArguments, readBookings };
