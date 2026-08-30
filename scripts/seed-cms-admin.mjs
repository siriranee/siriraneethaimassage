import {
  randomBytes,
  randomUUID,
  scrypt,
} from "node:crypto";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB?.trim() || "siriranee";
const email = process.env.CMS_SEED_EMAIL?.trim().toLowerCase();
const password = process.env.CMS_SEED_PASSWORD ?? "";
const displayName = process.env.CMS_SEED_DISPLAY_NAME?.trim();
const role = process.env.CMS_SEED_ROLE?.trim() || "administrator";

function validatePassword(value) {
  const errors = [];
  if (value.length < 12) errors.push("at least 12 characters");
  if (value.length > 256) errors.push("at most 256 characters");
  if (!/[a-z]/.test(value)) errors.push("a lowercase letter");
  if (!/[A-Z]/.test(value)) errors.push("an uppercase letter");
  if (!/\d/.test(value)) errors.push("a number");
  if (!/[^A-Za-z0-9]/.test(value)) errors.push("a symbol");
  return errors;
}

function derive(value, salt) {
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      64,
      {
        cost: 16384,
        blockSize: 8,
        parallelization: 1,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

if (!uri || !email || !displayName || !password) {
  console.error(
    "MONGODB_URI, CMS_SEED_EMAIL, CMS_SEED_PASSWORD and CMS_SEED_DISPLAY_NAME are required.",
  );
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("CMS_SEED_EMAIL must be a valid email address.");
  process.exit(1);
}

if (!["administrator", "staff"].includes(role)) {
  console.error("CMS_SEED_ROLE must be administrator or staff.");
  process.exit(1);
}

const passwordErrors = validatePassword(password);
if (passwordErrors.length) {
  console.error(`CMS password policy requires ${passwordErrors.join(", ")}.`);
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const passwordHash = [
  "scrypt",
  "16384",
  "8",
  "1",
  salt,
  (await derive(password, salt)).toString("base64url"),
].join("$");

const client = new MongoClient(uri, {
  appName: "siriranee-cms-seed-admin",
  maxPoolSize: 2,
});

try {
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection("cmsUsers");
  const sessions = db.collection("cmsSessions");
  const audit = db.collection("cmsAuditEvents");
  const existing = await users.findOne({ email });
  const now = new Date().toISOString();
  const id = existing?._id?.toString() || randomUUID();
  const authVersion = Number(existing?.authVersion ?? 0) + 1;

  await users.updateOne(
    { email },
    {
      $set: {
        email,
        displayName,
        passwordHash,
        role,
        active: true,
        authVersion,
        failedLoginCount: 0,
        lockedUntil: "",
        passwordChangedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: id,
        createdAt: now,
        lastLoginAt: "",
      },
    },
    { upsert: true },
  );
  await sessions.deleteMany({ userId: id });
  await audit.insertOne({
    _id: randomUUID(),
    actorId: id,
    actorName: displayName,
    action: existing ? "user.password-reset" : "user.created",
    entityType: "cms-user",
    entityId: id,
    summary: existing
      ? "Administrator credentials were securely reprovisioned."
      : "Initial CMS administrator was securely provisioned.",
    requestId: randomUUID(),
    createdAt: now,
  });

  console.log(
    `CMS administrator provisioning passed for role ${role} in database ${dbName}.`,
  );
} finally {
  await client.close();
}
