import { NextResponse } from "next/server";

import { getCurrentCmsUser } from "@/server/cms/auth/session";
import { getCmsMode } from "@/server/cms/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentCmsUser();

  const response = NextResponse.json({
    mode: getCmsMode(),
    user: user
      ? {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
        }
      : null,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
