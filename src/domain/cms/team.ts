import type { CmsTeamRecord } from "@/domain/cms/types";

type TeamIdentity = Pick<CmsTeamRecord, "id" | "name">;

export function compareCmsTeamMembersByName(
  first: TeamIdentity,
  second: TeamIdentity,
) {
  return (
    first.name.localeCompare(second.name, "en-IE", { sensitivity: "base" }) ||
    first.id.localeCompare(second.id)
  );
}
