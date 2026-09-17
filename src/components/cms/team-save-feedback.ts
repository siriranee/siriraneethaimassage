export type TeamSaveRequestState =
  | "not-started"
  | "ambiguous"
  | "definite-failure"
  | "succeeded";

export const TEAM_SAVE_FAILED_MESSAGE =
  "The therapist record could not be saved. Please try again.";

export const TEAM_SAVE_AMBIGUOUS_MESSAGE =
  "The save result could not be confirmed. Do not upload the portrait again yet; refresh the therapist list and verify this profile first.";

// Only wrap messages deliberately approved for display: local guidance or the
// sanitized error field returned by our CMS API. Do not wrap arbitrary catches.
export class TeamSaveError extends Error {
  constructor(message: unknown) {
    super(
      typeof message === "string" && message.trim()
        ? message.trim()
        : TEAM_SAVE_FAILED_MESSAGE,
    );
    this.name = "TeamSaveError";
  }
}

export function getTeamSaveErrorMessage(
  error: unknown,
  requestState: TeamSaveRequestState,
) {
  if (requestState === "ambiguous" || requestState === "succeeded") {
    return TEAM_SAVE_AMBIGUOUS_MESSAGE;
  }
  return error instanceof TeamSaveError
    ? error.message
    : TEAM_SAVE_FAILED_MESSAGE;
}
