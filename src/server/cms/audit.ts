import "server-only";

import { randomUUID } from "node:crypto";

import type { CmsAuditEvent, CmsUser } from "@/domain/cms/types";
import type { CmsRepository } from "@/server/cms/repositories";

export function createCmsAuditEvent(input: {
  readonly actor: Pick<CmsUser, "id" | "displayName">;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly requestId?: string;
}): CmsAuditEvent {
  return {
    id: randomUUID(),
    actorId: input.actor.id,
    actorName: input.actor.displayName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary.slice(0, 500),
    requestId: input.requestId?.slice(0, 120) ?? randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export async function appendCmsAudit(
  repository: CmsRepository,
  input: Parameters<typeof createCmsAuditEvent>[0],
) {
  const event = createCmsAuditEvent(input);
  await repository.appendAudit(event);
  return event;
}
