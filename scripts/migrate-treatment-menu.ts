// Dry run:
//   npm run cms:migrate-treatment-menu
// Apply only after reviewing the printed plan:
//   npm run cms:migrate-treatment-menu -- --apply --expected-plan=<sha256>
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { ClientSession, Db, Document, MongoClient } from "mongodb";

import type {
  CmsContentState,
  CmsPublication,
  CmsUser,
} from "../src/domain/cms/types";
import type { CmsMediaSubmissionAsset } from "../src/server/media/submission";
import {
  assertMatchingCurrentPublication,
  assertMigratedTreatmentContent,
  assertTreatmentPlanStillMatches,
  buildMigratedTreatmentContent,
  createTreatmentMenuMigrationPlan,
  FOOT_REFLEXOLOGY_SPA_ID,
  HEAD_SPA_ID,
  sha256,
  treatmentImageSources,
  treatmentMenuPlanHash,
  type TreatmentImageDigest,
  type TreatmentImageKey,
  type TreatmentImageUrls,
} from "./migrate-treatment-menu-lib";

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

type MigrationArguments = {
  readonly apply: boolean;
  readonly expectedPlan: string;
};

type LocalTreatmentImage = TreatmentImageDigest & {
  readonly fileName: string;
  readonly bytesBuffer: Uint8Array;
};

type AuthorizedUpload = {
  readonly submissionId: string;
  readonly scope: "service-cover";
  readonly publicId: string;
  readonly uploadToken: string;
};

type StagedTreatmentImage = CmsMediaSubmissionAsset & {
  readonly key: TreatmentImageKey;
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

function decodeIdentified<T>(document: Document | null): T | null {
  if (!document) return null;
  const { _id, ...fields } = document;
  return { id: String(_id), ...fields } as T;
}

async function readExistingState(db: Db, session?: ClientSession) {
  const options = session ? { session } : {};
  const content = decodeIdentified<CmsContentState>(
    await db.collection<Document & { _id: string }>("cmsContent").findOne(
      { _id: "siriranee-content" },
      options,
    ),
  );
  if (!content) {
    throw new Error(
      "Existing CMS content is required; this migration will not seed an empty database.",
    );
  }
  const pointer = await db.collection<Document & { _id: string }>("cmsMeta").findOne(
    { _id: "current-publication" },
    options,
  );
  if (typeof pointer?.publicationId !== "string") {
    throw new Error(
      "An existing current CMS publication is required before treatment migration.",
    );
  }
  const publication = decodeIdentified<CmsPublication>(
    await db.collection<Document & { _id: string }>("cmsPublications").findOne(
      { _id: pointer.publicationId },
      options,
    ),
  );
  return { content, publication } as const;
}

function assertWebp(bytes: Uint8Array, path: string) {
  const header = Buffer.from(bytes.subarray(0, 12));
  if (
    bytes.byteLength < 16 ||
    header.subarray(0, 4).toString("ascii") !== "RIFF" ||
    header.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error(`${path} is not a valid WebP source image.`);
  }
  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new Error(`${path} exceeds the CMS 5 MB image limit.`);
  }
}

async function loadLocalImages(): Promise<readonly LocalTreatmentImage[]> {
  const results: LocalTreatmentImage[] = [];
  for (const source of treatmentImageSources) {
    const absolutePath = resolve(process.cwd(), source.path);
    const bytesBuffer = new Uint8Array(await readFile(absolutePath));
    assertWebp(bytesBuffer, source.path);
    results.push({
      key: source.key,
      path: source.path,
      fileName: source.fileName,
      bytes: bytesBuffer.byteLength,
      sha256: sha256(bytesBuffer),
      bytesBuffer,
    });
  }
  return results;
}

function selectMigrationActor(users: readonly CmsUser[]) {
  const actor = [...users]
    .filter((user) => user.active && user.role === "administrator")
    .sort((first, second) => {
      if (first.username === "admin" && second.username !== "admin") return -1;
      if (second.username === "admin" && first.username !== "admin") return 1;
      return first.id.localeCompare(second.id);
    })[0];
  if (!actor) throw new Error("An active CMS administrator is required.");
  return actor;
}

function cloudinaryUploadResult(value: unknown) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source) throw new Error("Cloudinary returned an invalid upload response.");
  return {
    publicId: source.public_id,
    secureUrl: source.secure_url,
    signature: source.signature,
    version: source.version,
    resourceType: source.resource_type,
    format: source.format,
    bytes: source.bytes,
    width: source.width,
    height: source.height,
  };
}

async function uploadProviderImage(
  image: LocalTreatmentImage,
  authorization: {
    readonly endpoint: string;
    readonly apiKey: string;
    readonly parameters: Readonly<Record<string, string | number | boolean>>;
    readonly signature: string;
  },
) {
  const form = new FormData();
  const fileBytes = image.bytesBuffer.buffer.slice(
    image.bytesBuffer.byteOffset,
    image.bytesBuffer.byteOffset + image.bytesBuffer.byteLength,
  ) as ArrayBuffer;
  form.append(
    "file",
    new Blob([fileBytes], { type: "image/webp" }),
    basename(image.fileName),
  );
  for (const [key, value] of Object.entries(authorization.parameters)) {
    form.append(key, String(value));
  }
  form.append("api_key", authorization.apiKey);
  form.append("signature", authorization.signature);

  const response = await fetch(authorization.endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("Cloudinary rejected a generated treatment image upload.");
  }
  if (!body || body.length > 128_000) {
    throw new Error("Cloudinary returned an invalid upload response.");
  }
  try {
    return cloudinaryUploadResult(JSON.parse(body));
  } catch {
    throw new Error("Cloudinary returned an invalid upload response.");
  }
}

async function assertTransactionSupport(client: MongoClient, db: Db) {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection<Document & { _id: string }>("cmsContent").findOne(
        { _id: "siriranee-content" },
        { session, projection: { _id: 1 } },
      );
    });
  } catch {
    throw new Error(
      "MongoDB transaction support is required before any treatment images can be uploaded.",
    );
  } finally {
    await session.endSession();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (process.env.CMS_MODE !== "mongodb") {
    throw new Error("This migration requires CMS_MODE=mongodb.");
  }
  const localImages = await loadLocalImages();

  const [
    { getMongoClient, getMongoDatabase },
    { MongoCmsRepository },
    { getCmsRepository },
    mediaService,
    { commitCmsMediaForContentMutation },
    { appendCmsAudit },
  ] = await Promise.all([
    import("../src/server/cms/repositories/mongo-client"),
    import("../src/server/cms/repositories/mongo-repository"),
    import("../src/server/cms/repositories"),
    import("../src/server/media/cloudinary-service"),
    import("../src/server/media/submission"),
    import("../src/server/cms/audit"),
  ]);

  const client = await getMongoClient();
  const db = await getMongoDatabase();
  const repository = getCmsRepository();
  const stagedImages: StagedTreatmentImage[] = [];
  const authorizedUploads: AuthorizedUpload[] = [];
  let committed = false;
  let submissionId = "";
  let migrationActor: CmsUser | null = null;

  try {
    const inspected = await readExistingState(db);
    if (!inspected.publication) {
      throw new Error(
        "An existing current CMS publication is required before treatment migration.",
      );
    }
    const imageDigests = localImages.map(
      ({ key, path, bytes, sha256: digest }) => ({
        key,
        path,
        bytes,
        sha256: digest,
      }),
    );
    const plan = createTreatmentMenuMigrationPlan(
      inspected.content,
      inspected.publication,
      imageDigests,
    );
    const planHash = treatmentMenuPlanHash(plan);
    const review = {
      mode: options.apply ? "apply" : "dry-run",
      planHash,
      plan,
      emailsSent: 0,
      bookingsChanged: 0,
    };

    if (!options.apply) {
      console.log(JSON.stringify(review, null, 2));
      console.log(
        `Review the plan, then run npm run cms:migrate-treatment-menu -- --apply --expected-plan=${planHash}`,
      );
      return;
    }
    if (options.expectedPlan !== planHash) {
      throw new Error(
        "The treatment migration plan changed after review; no images or content were changed.",
      );
    }

    await assertTransactionSupport(client, db);
    const actor = selectMigrationActor(await repository.listUsers());
    migrationActor = actor;
    submissionId = `media_${randomUUID().replaceAll("-", "")}`;

    for (const image of localImages) {
      const requestId = `treatment-menu:${planHash.slice(0, 24)}:${image.key}`;
      const authorization = await mediaService.createSignedCmsMediaUpload(
        {
          submissionId,
          scope: "service-cover",
          fileName: image.fileName,
          contentType: "image/webp",
          bytes: image.bytes,
        },
        actor,
        requestId,
      );
      const pending: AuthorizedUpload = {
        submissionId,
        scope: "service-cover",
        publicId: authorization.parameters.public_id,
        uploadToken: authorization.uploadToken,
      };
      authorizedUploads.push(pending);
      const providerUpload = await uploadProviderImage(image, authorization);
      const staged = await mediaService.completeCmsMediaUpload(
        {
          submissionId,
          scope: "service-cover",
          uploadToken: authorization.uploadToken,
          upload: providerUpload,
        },
        actor,
        requestId,
      );
      stagedImages.push({
        key: image.key,
        scope: staged.scope,
        publicId: staged.publicId,
        secureUrl: staged.secureUrl,
        stagedToken: staged.stagedToken,
      });
      authorizedUploads.splice(authorizedUploads.indexOf(pending), 1);
    }

    const imageUrls = Object.fromEntries(
      stagedImages.map((image) => [image.key, image.secureUrl]),
    ) as TreatmentImageUrls;
    const mediaSubmission = {
      submissionId,
      assets: stagedImages.map(
        ({ scope, publicId, secureUrl, stagedToken }) => ({
          scope,
          publicId,
          secureUrl,
          stagedToken,
        }),
      ),
    } as const;
    const transactionSession = client.startSession();
    let publicationId = "";
    let nextRevision = 0;
    try {
      await transactionSession.withTransaction(async () => {
        const transaction = new MongoCmsRepository(transactionSession);
        const storedCurrent = await transaction.getContent();
        const currentPublication = await transaction.getPublishedContent();
        assertTreatmentPlanStillMatches(plan, storedCurrent, currentPublication);

        const currentActor = await transaction.findUserById(actor.id);
        if (
          !currentActor ||
          !currentActor.active ||
          currentActor.role !== "administrator"
        ) {
          throw new Error(
            "The reviewed CMS administrator is no longer active; no content was changed.",
          );
        }
        const now = new Date().toISOString();
        const next = buildMigratedTreatmentContent(storedCurrent, imageUrls, {
          now,
          actorId: actor.id,
        });
        assertMigratedTreatmentContent(next, imageUrls);
        await commitCmsMediaForContentMutation(transaction, {
          current: storedCurrent,
          next,
          submission: mediaSubmission,
          actor,
          requestId: `treatment-menu:${planHash.slice(0, 32)}`,
        });
        await transaction.saveContent(next, storedCurrent.revision);
        const publication: CmsPublication = {
          id: randomUUID(),
          revision: next.revision,
          publishedAt: now,
          publishedBy: actor.id,
          snapshot: structuredClone(next),
        };
        await transaction.savePublication(publication);
        await appendCmsAudit(transaction, {
          actor,
          action: "services.menu-migrated",
          entityType: "service-menu",
          entityId: planHash,
          summary:
            "Renamed the existing back-and-neck treatment, added Head Spa and Foot & Reflexology Spa, published three generated images, and extended both active therapists without changing bookings or sending email.",
          requestId: `treatment-menu:${planHash.slice(0, 32)}`,
        });
        publicationId = publication.id;
        nextRevision = next.revision;
      });
    } finally {
      await transactionSession.endSession();
    }
    committed = true;

    const verified = await readExistingState(db);
    if (
      !verified.publication ||
      verified.publication.id !== publicationId ||
      verified.content.revision !== nextRevision ||
      verified.publication.revision !== nextRevision
    ) {
      throw new Error("The committed treatment publication could not be verified.");
    }
    assertMatchingCurrentPublication(verified.content, verified.publication);
    assertMigratedTreatmentContent(verified.content, imageUrls);
    for (const image of stagedImages) {
      const asset = await repository.getMediaAsset(image.publicId);
      if (
        !asset ||
        asset.status !== "committed" ||
        asset.secureUrl !== image.secureUrl
      ) {
        throw new Error(`Committed media verification failed for ${image.key}.`);
      }
    }

    const [{ getPublicServices, getPublicTeam }] = await Promise.all([
      import("../src/server/cms/public-adapter"),
    ]);
    const [publicServices, publicTeam] = await Promise.all([
      getPublicServices(),
      getPublicTeam(),
    ]);
    const publicHeadSpa = publicServices.find(
      (service) => service.slug === HEAD_SPA_ID,
    );
    const publicFootSpa = publicServices.find(
      (service) => service.slug === FOOT_REFLEXOLOGY_SPA_ID,
    );
    if (
      !publicHeadSpa ||
      publicHeadSpa.name !== "Head Spa" ||
      publicHeadSpa.pricing[0]?.durationMinutes !== 60 ||
      publicHeadSpa.pricing[0]?.priceEur !== 65 ||
      !publicFootSpa ||
      publicFootSpa.name !== "Foot & Reflexology Spa" ||
      publicFootSpa.pricing[0]?.durationMinutes !== 60 ||
      publicFootSpa.pricing[0]?.priceEur !== 65
    ) {
      throw new Error("Public treatment verification failed after publication.");
    }
    const targetPublicTeam = plan.actions.extendActiveTherapists.map(
      (target) => publicTeam.find((member) => member.id === target.id),
    );
    if (
      targetPublicTeam.some(
        (member) =>
          !member ||
          !member.bookable ||
          !member.serviceIds.includes(HEAD_SPA_ID) ||
          !member.serviceIds.includes(FOOT_REFLEXOLOGY_SPA_ID),
      ) ||
      publicTeam.some(
        (member) =>
          "notificationEmail" in member || "contactPhone" in member,
      )
    ) {
      throw new Error("Public therapist verification failed after publication.");
    }

    console.log(
      JSON.stringify(
        {
          mode: "applied",
          planHash,
          revision: nextRevision,
          services: [
            "Back & Neck Massage",
            "Head Spa",
            "Foot & Reflexology Spa",
          ],
          therapistsUpdated: 2,
          imagesCommitted: stagedImages.length,
          bookingsChanged: 0,
          emailsSent: 0,
          verified: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    let cleanupNeedsReview = false;
    if (stagedImages.length) {
      try {
        if (!migrationActor) throw new Error("Missing migration actor.");
        const rollback = await mediaService.rollbackCmsMediaSubmission(
          {
            submissionId,
            assets: stagedImages.map(
              ({ scope, publicId, secureUrl, stagedToken }) => ({
                scope,
                publicId,
                secureUrl,
                stagedToken,
              }),
            ),
          },
          migrationActor,
          "treatment-menu:rollback",
        );
        cleanupNeedsReview ||= !rollback.complete;
      } catch {
        cleanupNeedsReview = true;
      }
    }
    for (const authorized of authorizedUploads) {
      try {
        if (!migrationActor) throw new Error("Missing migration actor.");
        const cleanup = await mediaService.cleanupCmsMediaUpload(
          authorized,
          migrationActor,
          "treatment-menu:authorized-rollback",
        );
        cleanupNeedsReview ||= Boolean(cleanup.pendingFinalSweep);
      } catch {
        cleanupNeedsReview = true;
      }
    }
    if (cleanupNeedsReview && !committed) {
      throw new Error(
        "Treatment migration failed and image cleanup needs administrator review.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Treatment migration failed.";
  const secrets = [
    process.env.MONGODB_URI,
    process.env.CLOUDINARY_API_SECRET,
    process.env.CLOUDINARY_API_KEY,
    process.env.CMS_MEDIA_TOKEN_SECRET,
  ].filter((value): value is string => Boolean(value && value.length >= 4));
  for (const secret of secrets) message = message.split(secret).join("[redacted]");
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URI]");
  console.error(message);
  process.exitCode = 1;
});

export { parseArguments };
