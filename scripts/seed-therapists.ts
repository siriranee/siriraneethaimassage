import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${process.cwd()}/node_modules/next/dist/compiled/server-only/empty.js`,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const apply = process.argv.includes("--apply");

const desiredTherapists = [
  {
    slug: "siriranee",
    name: "Siriranee",
    fullName: "Siriranee",
    notificationEmail: "psasi558@gmail.com",
    contactPhone: "",
    sortOrder: 0,
    legacySlugs: [],
  },
  {
    slug: "mon-ubon",
    name: "Mon (Ubon)",
    fullName: "Mon (Ubon)",
    notificationEmail: "crookubon@gmail.com",
    contactPhone: "0899894916",
    sortOrder: 1,
    legacySlugs: ["ubon", "therapist-ubon"],
  },
] as const;

async function main() {
  const [
    { createCmsTeamMember, getCmsContent, updateCmsTeamMember },
    { getCmsRepository },
    { getPublicTeam },
  ] = await Promise.all([
    import("@/server/cms/content-service"),
    import("@/server/cms/repositories"),
    import("@/server/cms/public-adapter"),
  ]);
  const repository = getCmsRepository();
  if (repository.mode !== "mongodb") {
    throw new Error("Therapists can be seeded only into the configured MongoDB CMS.");
  }

  const users = await repository.listUsers();
  const actor =
    users.find((user) => user.username === "admin" && user.active) ??
    users.find((user) => user.role === "administrator" && user.active);
  if (!actor) throw new Error("An active CMS administrator is required.");

  const content = await getCmsContent();
  const serviceIds = content.services
    .filter((service) => service.prices.some((price) => price.active))
    .map((service) => service.id);
  if (!serviceIds.length) {
    throw new Error("At least one treatment with an active price is required.");
  }

  const retainedSlugs = new Set<string>(
    desiredTherapists.flatMap(({ slug, legacySlugs }) => [slug, ...legacySlugs]),
  );
  const actions: string[] = [];
  const retiredProfiles = content.team.filter(
    (member) => !retainedSlugs.has(member.slug),
  );
  for (const member of retiredProfiles) {
    if (member.archived) {
      actions.push(`keep ${member.name} archived`);
      continue;
    }
    const assigned = await repository.listFutureActiveTherapistBookings(
      member.id,
      new Date().toISOString(),
    );
    if (assigned.length) {
      throw new Error(
        `Reassign ${assigned.length} future booking(s), beginning with ${assigned[0].reference}, before archiving ${member.name}.`,
      );
    }
    actions.push(`archive ${member.name} (${member.slug})`);
    if (!apply) continue;
    await updateCmsTeamMember(
      member.id,
      {
        name: member.name,
        fullName: member.fullName,
        publicRole: member.publicRole,
        archived: true,
        operationalActive: false,
        publicProfile: false,
        sortOrder: member.sortOrder,
      },
      member.version,
      { actor, requestId: `therapist-seed:archive:${member.slug}` },
    );
  }

  for (const desired of desiredTherapists) {
    const existing = content.team.find(
      (member) =>
        member.slug === desired.slug ||
        desired.legacySlugs.some((legacySlug) => legacySlug === member.slug),
    );
    const contact = existing
      ? await repository.getTherapistContact(existing.id)
      : null;
    const input = {
      slug: desired.slug,
      name: desired.name,
      fullName: desired.fullName,
      publicRole: "Massage therapist",
      shortBio:
        existing?.shortBio ||
        "Massage therapist at Siriranee Thai Massage in Howth.",
      biography: existing?.biography ?? "",
      imageUrl: existing?.imageUrl ?? "",
      imageAlt: existing?.imageAlt ?? "",
      specialties: existing?.specialties ?? [],
      languages: existing?.languages ?? [],
      serviceIds,
      notificationEmail: desired.notificationEmail,
      contactPhone: desired.contactPhone,
      publicProfile: true,
      operationalActive: true,
      archived: false,
      sortOrder: desired.sortOrder,
    };

    const unchanged =
      existing &&
      existing.name === input.name &&
      existing.fullName === input.fullName &&
      existing.publicRole === input.publicRole &&
      existing.shortBio === input.shortBio &&
      existing.biography === input.biography &&
      existing.imageUrl === input.imageUrl &&
      existing.imageAlt === input.imageAlt &&
      JSON.stringify(existing.specialties) === JSON.stringify(input.specialties) &&
      JSON.stringify(existing.languages) === JSON.stringify(input.languages) &&
      JSON.stringify(existing.serviceIds) === JSON.stringify(input.serviceIds) &&
      existing.publicProfile === input.publicProfile &&
      existing.operationalActive === input.operationalActive &&
      !existing.archived &&
      existing.sortOrder === input.sortOrder &&
      contact?.notificationEmail === input.notificationEmail &&
      (contact?.contactPhone ?? "") === input.contactPhone;

    if (unchanged) {
      actions.push(`keep ${desired.name}`);
      continue;
    }
    actions.push(`${existing ? "update" : "create"} ${desired.name}`);
    if (!apply) continue;

    if (existing) {
      await updateCmsTeamMember(
        existing.id,
        {
          ...input,
          expectedContactVersion: contact?.version ?? 0,
        },
        existing.version,
        { actor, requestId: `therapist-seed:${desired.slug}` },
      );
    } else {
      await createCmsTeamMember(input, {
        actor,
        requestId: `therapist-seed:${desired.slug}`,
      });
    }
  }

  if (!apply) {
    console.log(`Dry run: ${actions.join("; ")}.`);
    process.exit(0);
  }

  const verifiedContent = await repository.getContent();
  const desiredSlugs = new Set<string>(
    desiredTherapists.map(({ slug }) => slug),
  );
  const verifiedTeam = verifiedContent.team.filter((member) =>
    desiredSlugs.has(member.slug),
  );
  const retiredTeam = verifiedContent.team.filter(
    (member) => !desiredSlugs.has(member.slug),
  );
  if (
    verifiedTeam.length !== desiredTherapists.length ||
    verifiedTeam.some(
      (member) => member.archived || !member.publicProfile || !member.operationalActive,
    ) ||
    retiredTeam.some(
      (member) => !member.archived || member.publicProfile || member.operationalActive,
    )
  ) {
    throw new Error("Therapist profile verification failed after the write.");
  }

  for (const desired of desiredTherapists) {
    const member = verifiedTeam.find((candidate) => candidate.slug === desired.slug)!;
    const contact = await repository.getTherapistContact(member.id);
    if (
      contact?.notificationEmail !== desired.notificationEmail ||
      contact.contactPhone !== desired.contactPhone
    ) {
      throw new Error(`Private contact verification failed for ${desired.name}.`);
    }
  }

  const publicTeam = await getPublicTeam();
  if (
    publicTeam.length !== desiredTherapists.length ||
    publicTeam.some((member) =>
      ["notificationEmail", "contactPhone"].some((key) => key in member),
    )
  ) {
    throw new Error("Public therapist profile verification failed.");
  }

  console.log(`Applied: ${actions.join("; ")}.`);
  console.log("Verified 2 active public therapist profiles and private encrypted contacts.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Therapist seed failed.");
  process.exit(1);
});
