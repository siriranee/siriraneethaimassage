import { requireCmsApiUser } from "@/server/cms/auth/guards";
import { getRequestId, isSameOriginMutation } from "@/server/cms/auth/origin";
import { updateCmsService } from "@/server/cms/content-service";
import {
  cmsNoStoreJson,
  readCmsJsonObject,
} from "@/server/cms/http";
import { isMongoCommitResultIndeterminate } from "@/server/cms/mongo-error-label";
import { cmsMediaErrorResponse } from "@/server/media/http";
import { getCmsMediaCleanupGrantUserId } from "@/server/media/cleanup-grant";
import {
  rollbackCmsMediaSubmission,
  rollbackCmsMediaSubmissionWithCapability,
} from "@/server/media/cloudinary-service";
import {
  removeCmsMediaSubmissionEnvelope,
  type CmsMediaSubmission,
} from "@/server/media/submission";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly serviceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return cmsNoStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const requestId = getRequestId(request);
  let submission: CmsMediaSubmission | null = null;
  let authenticatedUser: Parameters<typeof rollbackCmsMediaSubmission>[1] | null =
    null;
  try {
    const requestBody = await readCmsJsonObject(request);
    const parsed = removeCmsMediaSubmissionEnvelope(requestBody);
    submission = parsed.submission;
    const { response, user } = await requireCmsApiUser("content:write");
    authenticatedUser = user;
    if (response || !user) {
      const capabilityUserId = await getCmsMediaCleanupGrantUserId();
      const mediaRollback = submission?.assets.length && capabilityUserId
        ? await rollbackCmsMediaSubmissionWithCapability(
            submission,
            capabilityUserId,
            requestId,
          )
        : null;
      const status = response?.status ?? 401;
      return cmsNoStoreJson(
        {
          error:
            status === 403
              ? "You do not have permission for this action."
              : "Unauthorized.",
          ...(mediaRollback ? { mediaRollback } : {}),
        },
        { status },
      );
    }
    const expectedVersion = Number(parsed.body.expectedVersion);
    const { serviceId } = await context.params;
    const service = await updateCmsService(
      serviceId,
      parsed.body,
      expectedVersion,
      {
        actor: user,
        requestId,
        mediaSubmission: submission,
      },
    );

    return cmsNoStoreJson({ service });
  } catch (error) {
    const commitIndeterminate = isMongoCommitResultIndeterminate(error);
    const capabilityUserId = !authenticatedUser && submission?.assets.length
      ? await getCmsMediaCleanupGrantUserId()
      : null;
    const mediaRollback = !commitIndeterminate && submission?.assets.length
      ? authenticatedUser
        ? await rollbackCmsMediaSubmission(
            submission,
            authenticatedUser,
            requestId,
          )
        : capabilityUserId
          ? await rollbackCmsMediaSubmissionWithCapability(
              submission,
              capabilityUserId,
              requestId,
            )
          : null
      : null;
    return cmsMediaErrorResponse(
      error,
      {
        ...(commitIndeterminate
          ? { mediaCommitState: "indeterminate" as const }
          : {}),
        ...(mediaRollback ? { mediaRollback } : {}),
      },
    );
  }
}
