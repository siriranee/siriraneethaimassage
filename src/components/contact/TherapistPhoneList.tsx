import { MessageCircle, Phone } from "lucide-react";

import type { PublicSiteData } from "@/domain/public-site";
import { buildTherapistWhatsAppUrl, getContactPhones } from "@/lib/therapist-contact";

import styles from "./TherapistPhoneList.module.css";

export function TherapistPhoneList({
  site,
  channel = "phone",
  onContact,
  onBrand = false,
}: Readonly<{
  site: PublicSiteData;
  channel?: "phone" | "whatsapp";
  onContact?: () => void;
  onBrand?: boolean;
}>) {
  const contacts = getContactPhones(site);
  if (!contacts.length) return null;
  const Icon = channel === "whatsapp" ? MessageCircle : Phone;

  return (
    <ul
      aria-label={channel === "whatsapp" ? "Therapist WhatsApp numbers" : "Therapist phone numbers"}
      className={`${styles.list} ${onBrand ? styles.onBrand : ""}`}
      data-therapist-phones={channel}
    >
      {contacts.map((contact) => (
        <li key={contact.id}>
          <a
            aria-label={`${channel === "whatsapp" ? "WhatsApp" : "Call"} ${contact.name}: ${contact.phone.internationalDisplay}`}
            className={styles.link}
            href={channel === "whatsapp" ? buildTherapistWhatsAppUrl(contact, site.alternateName) : contact.phone.href}
            onClick={onContact}
            rel={channel === "whatsapp" ? "noopener noreferrer" : undefined}
            target={channel === "whatsapp" ? "_blank" : undefined}
          >
            <Icon aria-hidden="true" />
            <span className={styles.copy}>
              <span className={styles.name}>{contact.name}</span>
              <span className={styles.number}>{contact.phone.internationalDisplay}</span>
            </span>
            {channel === "whatsapp" ? <span className="sr-only"> (opens in a new tab)</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
