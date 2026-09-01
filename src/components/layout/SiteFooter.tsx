import { AtSign, Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/ui/BrandMark";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { PublicSiteData } from "@/domain/public-site";

import styles from "./SiteFooter.module.css";

export function SiteFooter({ site }: Readonly<{ site: PublicSiteData }>) {
  const phone = site.contact.phone;
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
            {phone ? (
              <a href={phone.href}>
                <Phone aria-hidden="true" />
                <span>{phone.internationalDisplay}</span>
              </a>
            ) : null}
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
            <span>{site.openingHoursConfirmed ? "Current published schedule" : "Opening hours are being confirmed"}</span>
          </div>
          {site.openingHoursConfirmed ? (
            <dl className={styles.hours}>
              {site.openingHoursGroups.map((entry) => (
                <div key={entry.label}>
                  <dt>{entry.label}</dt>
                  <dd>{entry.hours}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={`container ${styles.bottomInner}`}>
          <span>© {new Date().getFullYear()} {site.name}</span>
          <div className={styles.bottomMeta}>
            <Link href="/privacy">Privacy policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
