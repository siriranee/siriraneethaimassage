import { compareCmsTeamMembersByName } from "@/domain/cms/team";
import type { CmsTeamRecord } from "@/domain/cms/types";
import type {
  PublicPhoneContact,
  PublicTherapistContact,
} from "@/domain/public-site";

/** Keep the entered display number while making a safe international call link. */
export function normalizeTherapistPhone(value: string): PublicPhoneContact | null {
  const display = value.trim();
  if (!display || display.length > 30 || !/^\+?[\d\s().-]+$/.test(display)) {
    return null;
  }

  const digits = display.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const e164 = display.startsWith("+")
    ? `+${digits}`
    : digits.startsWith("00")
      ? `+${digits.slice(2)}`
      : digits.startsWith("0")
        ? `+353${digits.slice(1)}`
        : "";
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return null;

  const internationalDisplay = e164.replace(
    /^\+353(8[35679])(\d{3})(\d{4})$/,
    "+353 $1 $2 $3",
  );
  return { display, internationalDisplay, e164, href: `tel:${e164}` };
}

export function isPublicContactTherapist(
  member: Pick<CmsTeamRecord, "publicProfile" | "operationalActive" | "archived">,
) {
  return member.publicProfile && member.operationalActive && !member.archived;
}

/** Project only the explicitly public name and phone; never return private email. */
export function projectPublicTherapistContacts(
  team: readonly CmsTeamRecord[],
  contacts: readonly { readonly id: string; readonly contactPhone: string }[],
  confirmedBusinessPhone: PublicPhoneContact | null,
): readonly PublicTherapistContact[] {
  const phoneById = new Map(contacts.map((contact) => [contact.id, contact.contactPhone]));

  return [...team]
    .filter(isPublicContactTherapist)
    .sort((first, second) =>
      Number(second.slug === "siriranee") - Number(first.slug === "siriranee") ||
      compareCmsTeamMembersByName(first, second),
    )
    .flatMap((member) => {
      const entered = phoneById.get(member.id) ?? "";
      const phone = normalizeTherapistPhone(entered) ??
        (member.slug === "siriranee" && !entered.trim() ? confirmedBusinessPhone : null);
      return phone ? [{ id: member.id, name: member.name, phone }] : [];
    });
}

/** All public call surfaces share the same therapist list and business fallback. */
export function getContactPhones(site: {
  readonly alternateName: string;
  readonly contact: {
    readonly therapists?: readonly PublicTherapistContact[];
    readonly phone: PublicPhoneContact | null;
  };
}): readonly PublicTherapistContact[] {
  if (site.contact.therapists?.length) return site.contact.therapists;
  return site.contact.phone
    ? [{ id: "business", name: site.alternateName, phone: site.contact.phone }]
    : [];
}

export function buildTherapistWhatsAppUrl(
  contact: PublicTherapistContact,
  businessName: string,
) {
  const message = `Hello ${businessName}, I would like to contact ${contact.name} about booking a massage.`;
  return `https://wa.me/${contact.phone.e164.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
