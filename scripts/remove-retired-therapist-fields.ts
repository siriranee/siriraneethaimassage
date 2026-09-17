// Usage: node --env-file-if-exists=.env.local --import tsx scripts/remove-retired-therapist-fields.ts
// Apply only after reviewing the dry run: add --apply --expected-plan=<printed-hash>.
import { createHash, randomUUID } from "node:crypto";

import type { ClientSession, Db, Document } from "mongodb";
import { MongoClient } from "mongodb";

import { CMS_CONTENT_SCHEMA_VERSION } from "../src/domain/cms/types";
import { getCmsAuditExpiryDate } from "../src/server/cms/audit-retention";

const migrationTargetSchemaVersion = 9;
const currentSourceSchemaVersions = new Set([8, migrationTargetSchemaVersion]);
const retainedPublicationSchemaVersions = new Set([6, 7, 8, 9]);
const retiredFields = [
  "biography",
  "specialties",
  "languages",
  "sortOrder",
] as const;
const migrationActorId = "system:remove-retired-therapist-fields";
const migrationActorName = "Therapist field retirement migration";

type TeamMemberPlan = {
  readonly id: string;
  readonly fields: readonly string[];
};

type PublicationPlan = {
  readonly id: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly team: readonly TeamMemberPlan[];
  readonly current: boolean;
};

type MigrationPlan = {
  readonly database: string;
  readonly targetSchemaVersion: number;
  readonly content: {
    readonly id: string;
    readonly revision: number;
    readonly schemaVersion: number;
    readonly team: readonly TeamMemberPlan[];
  };
  readonly currentPublicationId: string;
  readonly currentPublicationSchemaVersion: number;
  readonly currentPublicationPointerSchemaVersion: number;
  readonly publications: readonly PublicationPlan[];
  readonly planHash: string;
};

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function teamPlan(value: unknown): readonly TeamMemberPlan[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((member, index) => {
      const record = member && typeof member === "object"
        ? (member as Record<string, unknown>)
        : {};
      return {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id
            : `team-index-${index}`,
        fields: retiredFields.filter((field) =>
          Object.prototype.hasOwnProperty.call(record, field),
        ),
      };
    })
    .filter((member) => member.fields.length > 0)
    .sort((first, second) => first.id.localeCompare(second.id));
}

function hashPlan(plan: Omit<MigrationPlan, "planHash">) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

async function readPlan(
  db: Db,
  session?: ClientSession,
): Promise<MigrationPlan> {
  // MongoDB does not support parallel operations on one transaction session.
  const content = await db
    .collection<Document & { _id: string }>("cmsContent")
    .findOne(
      { _id: "siriranee-content" },
      { session, projection: { revision: 1, schemaVersion: 1, team: 1 } },
    );
  const pointer = await db
    .collection<Document & { _id: string }>("cmsMeta")
    .findOne(
      { _id: "current-publication" },
      {
        session,
        projection: { publicationId: 1, therapistProfileSchemaVersion: 1 },
      },
    );
  const publicationRows = await db
    .collection<Document & { _id: string }>("cmsPublications")
    .find(
      {
        $or: retiredFields.map((field) => ({
          [`snapshot.team.${field}`]: { $exists: true },
        })),
      },
      {
        session,
        projection: {
          "snapshot.revision": 1,
          "snapshot.schemaVersion": 1,
          "snapshot.team": 1,
        },
      },
    )
    .sort({ _id: 1 })
    .toArray();

  if (!content) throw new Error("The current CMS content document was not found.");
  const currentPublicationId =
    typeof pointer?.publicationId === "string" ? pointer.publicationId : "";
  if (!currentPublicationId) {
    throw new Error("The current CMS publication pointer was not found.");
  }
  const currentPublication = await db
    .collection<Document & { _id: string }>("cmsPublications")
    .findOne(
      { _id: currentPublicationId },
      { session, projection: { "snapshot.schemaVersion": 1 } },
    );
  const currentPublicationSnapshot =
    currentPublication?.snapshot &&
    typeof currentPublication.snapshot === "object"
      ? (currentPublication.snapshot as Record<string, unknown>)
      : {};
  const currentPublicationSchemaVersion = integerValue(
    currentPublicationSnapshot.schemaVersion,
  );
  if (!currentSourceSchemaVersions.has(currentPublicationSchemaVersion)) {
    throw new Error(
      "The current CMS publication must use schema version 8 or 9.",
    );
  }
  const currentPublicationPointerSchemaVersion = integerValue(
    pointer?.therapistProfileSchemaVersion,
  );
  const revision = integerValue(content.revision);
  const schemaVersion = integerValue(content.schemaVersion);
  if (revision < 1) {
    throw new Error("The current CMS content metadata is invalid.");
  }
  if (!currentSourceSchemaVersions.has(schemaVersion)) {
    throw new Error("The current CMS content must use schema version 8 or 9.");
  }

  const publications = publicationRows.map((publication) => {
    const snapshot = publication.snapshot && typeof publication.snapshot === "object"
      ? (publication.snapshot as Record<string, unknown>)
      : {};
    const publicationRevision = integerValue(snapshot.revision);
    const publicationSchemaVersion = integerValue(snapshot.schemaVersion);
    if (
      publicationRevision < 1 ||
      !retainedPublicationSchemaVersions.has(publicationSchemaVersion)
    ) {
      throw new Error(`Publication ${publication._id} has invalid metadata.`);
    }
    return {
      id: String(publication._id),
      revision: publicationRevision,
      schemaVersion: publicationSchemaVersion,
      team: teamPlan(snapshot.team),
      current: String(publication._id) === currentPublicationId,
    };
  });

  const planWithoutHash = {
    database: db.databaseName,
    targetSchemaVersion: migrationTargetSchemaVersion,
    content: {
      id: String(content._id),
      revision,
      schemaVersion,
      team: teamPlan(content.team),
    },
    currentPublicationId,
    currentPublicationSchemaVersion,
    currentPublicationPointerSchemaVersion,
    publications,
  };
  return { ...planWithoutHash, planHash: hashPlan(planWithoutHash) };
}

function migrationNeeded(plan: MigrationPlan) {
  return (
    plan.content.team.length > 0 ||
    plan.publications.length > 0 ||
    plan.content.schemaVersion !== plan.targetSchemaVersion ||
    plan.currentPublicationSchemaVersion !== plan.targetSchemaVersion ||
    plan.currentPublicationPointerSchemaVersion !== plan.targetSchemaVersion
  );
}

function assertMigrationComplete(plan: MigrationPlan, context: string) {
  if (migrationNeeded(plan)) {
    throw new Error(`${context} therapist field cleanup verification failed.`);
  }
}

function report(
  plan: MigrationPlan,
  mode: "dry-run" | "applied" | "already-clean",
) {
  return {
    mode,
    database: plan.database,
    targetSchemaVersion: plan.targetSchemaVersion,
    planHash: plan.planHash,
    contentRevision: plan.content.revision,
    contentMembersChanged: plan.content.team.length,
    publicationDocumentsChanged: plan.publications.length,
    publicationMembersChanged: plan.publications.reduce(
      (total, publication) => total + publication.team.length,
      0,
    ),
    currentPublicationIncluded: plan.publications.some(
      (publication) => publication.current,
    ),
    migrationNeeded: migrationNeeded(plan),
    fieldsRemoved: retiredFields,
  };
}

function unsetFields(prefix: "team" | "snapshot.team") {
  return Object.fromEntries(
    retiredFields.map((field) => [`${prefix}.$[].${field}`, ""]),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => arg !== "--apply" && !arg.startsWith("--expected-plan="),
    )
  ) {
    throw new Error(
      "Unknown argument. Use optional --apply --expected-plan=<hash>.",
    );
  }
  if (process.env.CMS_MODE !== "mongodb") {
    throw new Error("This migration requires CMS_MODE=mongodb.");
  }
  if (CMS_CONTENT_SCHEMA_VERSION !== migrationTargetSchemaVersion) {
    throw new Error(
      "This migration is pinned to CMS schema version 9 and must be reviewed before reuse.",
    );
  }

  const apply = args.includes("--apply");
  const expectedPlan = args
    .find((arg) => arg.startsWith("--expected-plan="))
    ?.slice("--expected-plan=".length);
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlan ?? "")) {
    throw new Error(
      "Apply requires a reviewed dry-run --expected-plan hash.",
    );
  }

  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB;
  if (!uri || !databaseName) {
    throw new Error("MongoDB configuration is incomplete.");
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    if (!apply) {
      console.log(JSON.stringify(report(await readPlan(db), "dry-run"), null, 2));
      return;
    }

    const session = client.startSession();
    try {
      let appliedPlan: MigrationPlan | undefined;
      let wroteChanges = false;
      await session.withTransaction(async () => {
        const plan = await readPlan(db, session);
        if (plan.planHash !== expectedPlan) {
          throw new Error(
            "The migration plan changed. No data was changed; review a fresh dry run.",
          );
        }
        if (!migrationNeeded(plan)) {
          appliedPlan = plan;
          return;
        }

        const pointerUpdate = await db
          .collection<Document & { _id: string }>("cmsMeta")
          .updateOne(
            {
              _id: "current-publication",
              publicationId: plan.currentPublicationId,
            },
            {
              $set: {
                therapistProfileSchemaVersion: plan.targetSchemaVersion,
              },
            },
            { session },
          );
        if (pointerUpdate.matchedCount !== 1) {
          throw new Error(
            "The current publication pointer changed concurrently. No data was changed.",
          );
        }

        const contentUpdate = await db
          .collection<Document & { _id: string }>("cmsContent")
          .updateOne(
            {
              _id: plan.content.id,
              revision: plan.content.revision,
              schemaVersion: plan.content.schemaVersion,
            },
            {
              $set: { schemaVersion: plan.targetSchemaVersion },
              $unset: unsetFields("team"),
            },
            { session },
          );
        if (contentUpdate.matchedCount !== 1) {
          throw new Error(
            "The CMS content changed concurrently. No data was changed.",
          );
        }

        for (const publication of plan.publications) {
          const publicationUpdate = await db
            .collection<Document & { _id: string }>("cmsPublications")
            .updateOne(
              {
                _id: publication.id,
                "snapshot.revision": publication.revision,
                "snapshot.schemaVersion": publication.schemaVersion,
              },
              {
                ...(publication.current
                  ? {
                      $set: {
                        "snapshot.schemaVersion": plan.targetSchemaVersion,
                      },
                    }
                  : {}),
                $unset: unsetFields("snapshot.team"),
              },
              { session },
            );
          if (publicationUpdate.matchedCount !== 1) {
            throw new Error(
              `Publication ${publication.id} changed concurrently. No data was changed.`,
            );
          }
        }

        const currentPublicationWasUpdated = plan.publications.some(
          (publication) => publication.current,
        );
        if (!currentPublicationWasUpdated) {
          const currentPublicationUpdate = await db
            .collection<Document & { _id: string }>("cmsPublications")
            .updateOne(
              {
                _id: plan.currentPublicationId,
                "snapshot.schemaVersion": plan.currentPublicationSchemaVersion,
              },
              { $set: { "snapshot.schemaVersion": plan.targetSchemaVersion } },
              { session },
            );
          if (currentPublicationUpdate.matchedCount !== 1) {
            throw new Error(
              "The current publication was not found. No data was changed.",
            );
          }
        }

        const remaining = await readPlan(db, session);
        assertMigrationComplete(remaining, "In-transaction");

        const createdAt = new Date().toISOString();
        await db
          .collection<Document & { _id: string }>("cmsAuditEvents")
          .insertOne(
            {
              _id: randomUUID(),
              actorId: migrationActorId,
              actorName: migrationActorName,
              action: "team.fields-retired",
              entityType: "cms-content",
              entityId: plan.content.id,
              summary:
                "Removed retired therapist biography, specialties, languages and display-order fields from current content and retained publication snapshots.",
              requestId: `retire-therapist-fields:${plan.planHash.slice(0, 32)}`,
              createdAt,
              expiresAtDate: getCmsAuditExpiryDate(createdAt),
            },
            { session },
          );
        appliedPlan = plan;
        wroteChanges = true;
      });

      if (!appliedPlan) throw new Error("The migration transaction did not complete.");
      const committed = await readPlan(db);
      assertMigrationComplete(committed, "Post-commit");
      console.log(
        JSON.stringify(
          report(appliedPlan, wroteChanges ? "applied" : "already-clean"),
          null,
          2,
        ),
      );
    } finally {
      await session.endSession();
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error && !/mongodb(?:\+srv)?:\/\//i.test(error.message)
      ? error.message
      : "Therapist field migration failed; no partial transaction was committed.",
  );
  process.exitCode = 1;
});
