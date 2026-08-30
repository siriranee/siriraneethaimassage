import "server-only";

import {
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const keyLength = 64;
const saltLength = 16;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;
const maxPasswordLength = 256;

const weakPasswords = new Set([
  "password",
  "password123",
  "admin123",
  "administrator",
  "siriranee",
  "letmein",
  "qwerty123",
  "123456789012",
]);

function derive(
  password: string,
  salt: string,
  options = { cost, blockSize, parallelization },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        cost: options.cost,
        blockSize: options.blockSize,
        parallelization: options.parallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

const dummyHash = [
  "scrypt",
  String(cost),
  String(blockSize),
  String(parallelization),
  "siriranee-dummy-salt",
  scryptSync(
    "siriranee-dummy-password",
    "siriranee-dummy-salt",
    keyLength,
    {
      cost,
      blockSize,
      parallelization,
      maxmem: 64 * 1024 * 1024,
    },
  ).toString("base64url"),
].join("$");

export function validateCmsPassword(password: string) {
  const errors: string[] = [];

  if (password.length < 12) errors.push("Use at least 12 characters.");
  if (password.length > maxPasswordLength) errors.push("Password is too long.");
  if (!/[a-z]/.test(password)) errors.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Add an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Add a symbol.");
  if (weakPasswords.has(password.toLowerCase())) {
    errors.push("Choose a less common password.");
  }

  return errors;
}

export async function hashCmsPassword(password: string) {
  const errors = validateCmsPassword(password);
  if (errors.length) throw new Error(errors.join(" "));

  const salt = randomBytes(saltLength).toString("base64url");
  const hash = await derive(password, salt);

  return [
    "scrypt",
    String(cost),
    String(blockSize),
    String(parallelization),
    salt,
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyCmsPassword(
  password: string,
  passwordHash: string,
) {
  const parts = passwordHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const parsedCost = Number(parts[1]);
  const parsedBlockSize = Number(parts[2]);
  const parsedParallelization = Number(parts[3]);
  const salt = parts[4];
  const stored = Buffer.from(parts[5], "base64url");

  if (
    !Number.isInteger(parsedCost) ||
    !Number.isInteger(parsedBlockSize) ||
    !Number.isInteger(parsedParallelization) ||
    parsedCost < 4096 ||
    parsedCost > 131072 ||
    parsedBlockSize < 1 ||
    parsedBlockSize > 32 ||
    parsedParallelization < 1 ||
    parsedParallelization > 4 ||
    stored.length !== keyLength ||
    password.length > maxPasswordLength
  ) {
    return false;
  }

  const candidate = await derive(password, salt, {
    cost: parsedCost,
    blockSize: parsedBlockSize,
    parallelization: parsedParallelization,
  });

  return timingSafeEqual(stored, candidate);
}

export function getDummyCmsPasswordHash() {
  return dummyHash;
}
