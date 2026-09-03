import "server-only";

import { appendCmsAudit } from "@/server/cms/audit";
import {
  loginCmsUserCore,
  type CmsLoginInput,
} from "@/server/cms/auth/login-core";
import {
  getDummyCmsPasswordHash,
  verifyCmsPassword,
} from "@/server/cms/auth/password";
import { createCmsSession } from "@/server/cms/auth/session";
import { getCmsMode } from "@/server/cms/config";
import { getCmsRepository } from "@/server/cms/repositories";

export async function loginCmsUser(input: CmsLoginInput) {
  const repository = getCmsRepository();

  return loginCmsUserCore(input, {
    repository,
    dummyPasswordHash: getDummyCmsPasswordHash(),
    verifyPassword: verifyCmsPassword,
    createSession: createCmsSession,
  });
}

export async function loginCmsMockDemo(requestId: string) {
  if (getCmsMode() !== "mock") {
    return {
      code: "unavailable",
      error: "Demo access is not available.",
    } as const;
  }

  const repository = getCmsRepository();
  const user = await repository.findUserById("mock-administrator");

  if (!user) {
    return {
      code: "unavailable",
      error: "Demo administrator is unavailable.",
    } as const;
  }

  await appendCmsAudit(repository, {
    actor: user,
    action: "auth.demo-login",
    entityType: "cms-user",
    entityId: user.id,
    summary: "Opened the local mock CMS workspace.",
    requestId,
  });

  return {
    token: await createCmsSession(user),
    user,
  } as const;
}
