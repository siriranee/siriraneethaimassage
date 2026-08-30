import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function configuredValue() {
  return process.env.CMS_PII_ENCRYPTION_KEY?.trim() ?? "";
}

export function hasCmsPiiEncryptionKey() {
  try {
    getCmsPiiEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function getCmsPiiEncryptionKey() {
  const configured = configuredValue();
  if (!configured) {
    throw new Error("CMS_PII_ENCRYPTION_KEY is required for encrypted booking data.");
  }

  let key: Buffer;
  if (/^[a-f\d]{64}$/i.test(configured)) {
    key = Buffer.from(configured, "hex");
  } else {
    key = Buffer.from(configured, "base64url");
  }

  if (key.length !== 32) {
    throw new Error("CMS_PII_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

export function encryptCmsPii(plaintext: string) {
  const key = getCmsPiiEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCmsPii(envelope: string) {
  const [version, ivValue, tagValue, ciphertextValue, extra] = envelope.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra !== undefined
  ) {
    throw new Error("Encrypted customer data has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getCmsPiiEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
