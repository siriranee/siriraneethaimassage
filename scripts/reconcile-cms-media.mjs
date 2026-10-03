// Read-only inventory and review hash:
//   npm run cms:reconcile-media
// Apply only the exact reviewed plan, without deleting provider images or rows:
//   npm run cms:reconcile-media -- --apply --expected-plan=<sha256>
import { pathToFileURL } from "node:url";

import { v2 as cloudinary } from "cloudinary";
import { MongoClient } from "mongodb";

import { runCmsMediaReconciliation } from "./cms-media-reconciliation-lib.mjs";

export function parseArguments(args) {
  const apply = args.includes("--apply");
  const hashArguments = args.filter((arg) => arg.startsWith("--expected-plan="));
  if (
    args.some((arg) => arg !== "--apply" && !arg.startsWith("--expected-plan=")) ||
    args.filter((arg) => arg === "--apply").length > 1 ||
    hashArguments.length > 1 ||
    (hashArguments.length > 0 && !apply)
  ) {
    throw new Error("Usage: npm run cms:reconcile-media -- [--apply --expected-plan=<reviewed-sha256>]");
  }
  return {
    apply,
    expectedPlan: hashArguments[0]?.slice("--expected-plan=".length) ?? "",
  };
}

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export async function main(args = process.argv.slice(2)) {
  const { apply, expectedPlan } = parseArguments(args);
  if (process.env.CMS_MODE?.trim().toLowerCase() !== "mongodb") {
    throw new Error("CMS_MODE=mongodb is required.");
  }
  // This maintenance command needs provider read access, but does not turn on
  // CMS_MEDIA_UPLOAD_READY or need a browser upload token.
  const databaseName = required("MONGODB_DB");
  const cloudName = required("CLOUDINARY_CLOUD_NAME");
  const folder = required("CLOUDINARY_FOLDER");
  const client = new MongoClient(required("MONGODB_URI"), {
    appName: "siriranee-media-reconciliation",
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 2,
  });
  cloudinary.config({
    cloud_name: cloudName,
    api_key: required("CLOUDINARY_API_KEY"),
    api_secret: required("CLOUDINARY_API_SECRET"),
    secure: true,
    signature_algorithm: "sha256",
    signature_version: 2,
  });
  const provider = {
    getByPublicId(publicId) {
      return cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: "upload",
      });
    },
    getByAssetId(assetId) {
      return cloudinary.api.resource_by_asset_id(assetId);
    },
  };

  try {
    await client.connect();
    const result = await runCmsMediaReconciliation(client.db(databaseName), provider, {
      client,
      cloudName,
      folder,
      apply,
      expectedPlan,
    });
    // Never log IDs, URLs, customer data, provider response bodies or secrets.
    console.log(JSON.stringify(result, null, 2));
    if (!apply && result.candidateCount) {
      console.log("Review the aggregate counts and the exact plan hash before applying.");
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Provider errors can contain public IDs. Keep terminal output aggregate-only.
    console.error("Media reconciliation did not complete cleanly. Run a fresh dry-run to verify the current state before retrying.");
    process.exitCode = 1;
  });
}
