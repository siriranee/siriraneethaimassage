import { NextResponse } from "next/server";

import { appendCmsAudit } from "@/server/cms/audit";
import { isSameOriginMutation, getRequestId } from "@/server/cms/auth/origin";
import {
  clearCmsSessionCookie,
  deleteCurrentCmsSession,
  getCurrentCmsUser,
} from "@/server/cms/auth/session";
import { getCmsRepository } from "@/server/cms/repositories";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const user = await getCurrentCmsUser();

  if (user) {
    await appendCmsAudit(getCmsRepository(), {
      actor: user,
      action: "auth.logout",
      entityType: "cms-user",
      entityId: user.id,
      summary: "Signed out of the CMS.",
      requestId: getRequestId(request),
    });
  }

  await deleteCurrentCmsSession();

  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  clearCmsSessionCookie(response);
  return response;
}
