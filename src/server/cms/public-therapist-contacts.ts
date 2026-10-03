import "server-only";

import type { CmsContentState, CmsTherapistContact } from "@/domain/cms/types";
import type { PublicPhoneContact, PublicTherapistContact } from "@/domain/public-site";
import {
  isPublicContactTherapist,
  normalizeTherapistPhone,
  projectPublicTherapistContacts,
} from "@/lib/therapist-contact";
import { getCmsMode } from "@/server/cms/config";
import { getCmsRepository } from "@/server/cms/repositories";
import type { CmsRepository } from "@/server/cms/repositories/repository";

type PublicContactContent = Pick<CmsContentState, "team" | "site">;
type ReadTherapistContact = (
  id: string,
) => Promise<Pick<CmsTherapistContact, "contactPhone"> | null>;

function confirmedBusinessPhone(content: PublicContactContent): PublicPhoneContact | null {
  const site = content.site;
  if (!site.phoneConfirmed || site.phoneDisplay.trim().length < 5) return null;
  const e164 = site.phoneE164.replace(/[^\d+]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  const normalized = normalizeTherapistPhone(e164);
  if (!normalized) return null;
  return { ...normalized, display: site.phoneDisplay.trim() };
}

/** A broken or missing contact must not make the public website unavailable. */
export async function readPublicTherapistContacts(
  content: PublicContactContent,
  readContact: ReadTherapistContact,
): Promise<readonly PublicTherapistContact[]> {
  const contacts = await Promise.all(
    content.team.filter(isPublicContactTherapist).map(async (member) => {
      try {
        const contact = await readContact(member.id);
        return { id: member.id, contactPhone: contact?.contactPhone ?? "" };
      } catch {
        return { id: member.id, contactPhone: "" };
      }
    }),
  );
  return projectPublicTherapistContacts(content.team, contacts, confirmedBusinessPhone(content));
}

export async function getPublicTherapistContacts(
  content: PublicContactContent,
  repository?: Pick<CmsRepository, "getTherapistContact">,
): Promise<readonly PublicTherapistContact[]> {
  try {
    if (repository) {
      return await readPublicTherapistContacts(content, (id) => repository.getTherapistContact(id));
    }
    if (getCmsMode() !== "disabled") {
      const configuredRepository = getCmsRepository();
      return await readPublicTherapistContacts(content, (id) => configuredRepository.getTherapistContact(id));
    }
  } catch {
    // Retain only the confirmed owner's number when the CMS provider is unavailable.
  }
  return projectPublicTherapistContacts(content.team, [], confirmedBusinessPhone(content));
}
