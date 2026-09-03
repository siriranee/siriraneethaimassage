import { createHash, timingSafeEqual } from "node:crypto";

type CloudinaryUploadResponseSignature = {
  readonly apiSecret: string;
  readonly publicId: string;
  readonly version: number;
  readonly signature: string;
};

export function verifyCloudinaryUploadResponseSignature({
  apiSecret,
  publicId,
  version,
  signature,
}: CloudinaryUploadResponseSignature) {
  const normalizedSignature = signature.toLowerCase();
  const algorithm =
    normalizedSignature.length === 40
      ? "sha1"
      : normalizedSignature.length === 64
        ? "sha256"
        : null;

  if (
    !algorithm ||
    !/^[a-f0-9]+$/.test(normalizedSignature) ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    return false;
  }

  const expectedSignature = createHash(algorithm)
    .update(`public_id=${publicId}&version=${version}${apiSecret}`, "utf8")
    .digest("hex");
  const actualBytes = Buffer.from(normalizedSignature, "utf8");
  const expectedBytes = Buffer.from(expectedSignature, "utf8");

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
