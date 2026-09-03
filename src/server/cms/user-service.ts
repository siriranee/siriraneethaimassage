import "server-only";

import type { CmsUser } from "@/domain/cms/types";
import { getCmsMode } from "@/server/cms/config";
import { hashCmsPassword, verifyCmsPassword } from "@/server/cms/auth/password";
import { getCmsRepository } from "@/server/cms/repositories";
import {
  createCmsUserCore,
  resetCmsUserPasswordCore,
  revokeCmsUserSessionsCore,
  updateCmsUserCore,
  type CmsUserManagementContext,
} from "@/server/cms/user-core";

function dependencies() {
  return {
    repository: getCmsRepository(),
    hashPassword: hashCmsPassword,
    allowEmptyActorPassword: (actor: CmsUser) =>
      getCmsMode() === "mock" &&
      actor.id === "mock-administrator",
    verifyActorPassword: async (actor: CmsUser, password: string) => {
      if (
        getCmsMode() === "mock" &&
        actor.id === "mock-administrator" &&
        !actor.passwordHash
      ) {
        return true;
      }
      return verifyCmsPassword(password, actor.passwordHash);
    },
  };
}

export function createManagedCmsUser(
  input: unknown,
  context: CmsUserManagementContext,
) {
  return createCmsUserCore(input, context, dependencies());
}

export function updateManagedCmsUser(
  userId: string,
  input: unknown,
  context: CmsUserManagementContext,
) {
  return updateCmsUserCore(userId, input, context, dependencies());
}

export function resetManagedCmsUserPassword(
  userId: string,
  input: unknown,
  context: CmsUserManagementContext,
) {
  return resetCmsUserPasswordCore(userId, input, context, dependencies());
}

export function revokeManagedCmsUserSessions(
  userId: string,
  input: unknown,
  context: CmsUserManagementContext,
) {
  return revokeCmsUserSessionsCore(userId, input, context, dependencies());
}
