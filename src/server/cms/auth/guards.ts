import "server-only";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  canCmsRole,
  type CmsPermission,
} from "@/domain/cms/permissions";
import { getCurrentCmsUser } from "@/server/cms/auth/session";

export async function requireCmsPageUser(permission?: CmsPermission) {
  const user = await getCurrentCmsUser();

  if (!user) redirect("/cms/login");

  if (permission && !canCmsRole(user.role, permission)) {
    redirect("/cms?notice=permission");
  }

  return user;
}

export async function requireCmsApiUser(permission?: CmsPermission) {
  const user = await getCurrentCmsUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      user: null,
    };
  }

  if (permission && !canCmsRole(user.role, permission)) {
    return {
      response: NextResponse.json(
        { error: "You do not have permission for this action." },
        { status: 403 },
      ),
      user: null,
    };
  }

  return { response: null, user };
}
