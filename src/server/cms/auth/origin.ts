import "server-only";

import { getCmsMode, getCmsOrigin } from "@/server/cms/config";

function expectedOrigin(request: Request) {
  const configured = getCmsOrigin();
  if (configured) return configured;

  try {
    if (getCmsMode() !== "mock") return null;
  } catch {
    return null;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto ?? (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${protocol}://${host}` : null;
}

export function isSameOriginMutation(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return true;

  const origin = request.headers.get("origin");
  const expected = expectedOrigin(request);

  if (!origin || !expected) return false;

  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export function getRequestAddress(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 200);

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const addresses = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const edgeAddress = addresses.at(-1);
    if (edgeAddress) return edgeAddress.slice(0, 200);
  }

  return "unavailable";

}

export function getRequestId(request?: Request) {
  return (
    request?.headers.get("x-request-id")?.slice(0, 120) ??
    crypto.randomUUID()
  );
}
