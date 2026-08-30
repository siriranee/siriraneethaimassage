import { AtSign, Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/ui/BrandMark";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { PublicSiteData } from "@/domain/public-site";

import styles from "./SiteFooter.module.css";

export function SiteFooter({ site }: Readonly<{ site: PublicSiteData }>) {
  const email = site.contact.email;
  const instagram = site.social.instagram;
  const whatsappUrl = site.contact.whatsapp.url;

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        <div className={styles.intro}>
          <Link aria-label={`${site.shortName} home`} href="/">
            <BrandMark />
          </Link>
          <p>
            Traditional Thai and comfort-led massage treatments in the heart of
            Howth, Dublin.
          </p>
          <ButtonLink href="/book">Book Now</ButtonLink>
        </div>

        <div>
          <h2 className={styles.heading}>Visit us</h2>
          <address className={styles.contactList}>
            <a href={site.address.directionsUrl} target="_blank" rel="noreferrer">
              <MapPin aria-hidden="true" />
              <span>{site.address.formatted}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a href={site.contact.phone.href}>
              <Phone aria-hidden="true" />
              <span>{site.contact.phone.internationalDisplay}</span>
            </a>
            {email ? (
              <a href={email.href}>
                <Mail aria-hidden="true" />
                <span>{email.address}</span>
              </a>
            ) : null}
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" />
                <span>WhatsApp</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            {instagram ? (
              <a href={instagram.url} target="_blank" rel="noreferrer">
                <AtSign aria-hidden="true" />
                <span>{instagram.handle}</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </address>
        </div>

        <div>
          <h2 className={styles.heading}>Opening hours</h2>
          <div className={styles.hoursIntro}>
            <Clock3 aria-hidden="true" />
            <span>{site.openingHoursConfirmed ? "Current published schedule" : "Draft schedule — please confirm before travelling"}</span>
          </div>
          <dl className={styles.hours}>
            {site.openingHoursGroups.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.label}</dt>
                <dd>{entry.hours}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={`container ${styles.bottomInner}`}>
          <span>© {new Date().getFullYear()} {site.name}</span>
          <div className={styles.bottomMeta}>
            <span>Appointments are confirmed directly with the Siriranee team.</span>
            <Link href="/privacy">Privacy policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
