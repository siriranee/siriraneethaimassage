export const teamMemberSlugs = ["waen", "ubon", "metta", "poula"] as const;

export type TeamMemberSlug = (typeof teamMemberSlugs)[number];

export type TeamMember = {
  readonly slug: TeamMemberSlug;
  readonly name: string;
  readonly fullName?: string;
  readonly role?: "Owner";
};

export const teamMembers: readonly TeamMember[] = [
  {
    slug: "waen",
    name: "Waen",
    fullName: "Waen Orathai",
    role: "Owner",
  },
  {
    slug: "ubon",
    name: "Ubon",
  },
  {
    slug: "metta",
    name: "Metta",
  },
  {
    slug: "poula",
    name: "Poula",
  },
];
