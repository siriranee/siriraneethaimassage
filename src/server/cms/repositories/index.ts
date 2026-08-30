import "server-only";

import type { CmsRepository } from "@/server/cms/repositories/repository";
import { getCmsMode } from "@/server/cms/config";
import { MockCmsRepository } from "@/server/cms/repositories/mock-repository";
import { MongoCmsRepository } from "@/server/cms/repositories/mongo-repository";

type RepositoryGlobal = typeof globalThis & {
  __siriraneeCmsRepository?: CmsRepository;
};

export function getCmsRepository(): CmsRepository {
  const mode = getCmsMode();

  if (mode === "disabled") {
    throw new Error("CMS is disabled.");
  }

  const repositoryGlobal = globalThis as RepositoryGlobal;
  const existing = repositoryGlobal.__siriraneeCmsRepository;

  if (existing?.mode === mode) return existing;

  const repository =
    mode === "mongodb" ? new MongoCmsRepository() : new MockCmsRepository();

  repositoryGlobal.__siriraneeCmsRepository = repository;
  return repository;
}

export {
  CmsConflictError,
  type CmsRepository,
} from "@/server/cms/repositories/repository";
