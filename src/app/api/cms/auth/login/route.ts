import { NextResponse } from "next/server";

import {
  loginCmsMockDemo,
  loginCmsUser,
} from "@/server/cms/auth/login-service";
import {
  getRequestAddress,
  getRequestId,
  isSameOriginMutation,
} from "@/server/cms/auth/origin";
import { setCmsSessionCookie } from "@/server/cms/auth/session";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
  UnsupportedRequestBodyError,
} from "@/server/http/request-body";

export const dynamic = "force-dynamic";

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: { demo?: boolean; email?: string; password?: string };

  try {
    body = (await readJsonBody(request, 16_000)) as typeof body;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: error.message }, { status: 413 });
    }
    if (error instanceof UnsupportedRequestBodyError) {
      return json({ error: error.message }, { status: 415 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: "Invalid request." }, { status: 400 });
    }
    return json({ error: "Invalid request." }, { status: 400 });
  }

  const requestId = getRequestId(request);
  const result = body.demo
    ? await loginCmsMockDemo(requestId)
    : await loginCmsUser({
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : "",
        address: getRequestAddress(request),
        requestId,
      });

  if ("error" in result) {
    return json({ error: result.error }, { status: 401 });
  }

  const response = json({
    user: {
      displayName: result.user.displayName,
      email: result.user.email,
      role: result.user.role,
    },
  });
  setCmsSessionCookie(response, result.token);
  return response;
}
