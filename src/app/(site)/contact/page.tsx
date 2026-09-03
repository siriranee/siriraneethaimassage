import {
  ArrowUpRight,
  AtSign,
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MapEmbed } from "@/components/contact/MapEmbed";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { getPageCopy } from "@/content/page-copy";
import { pageHeroImages } from "@/content/page-heroes";
import {
  buildAppointmentWhatsAppUrl,
  buildPlannerPreferenceHref,
  formatAppointmentDuration,
  formatAppointmentPrice,
  type AppointmentSearchParams,
} from "@/lib/contact-links";
import { createMetadata } from "@/lib/metadata";
import { resolvePublishedAppointmentPreference } from "@/server/booking/contact-preference";
import { getPublicSiteData } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = getPageCopy("contact");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/contact" });
}

type ContactPageProps = {
  readonly searchParams: Promise<AppointmentSearchParams>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const pageCopy = getPageCopy("contact");
  const [query, site] = await Promise.all([
    searchParams,
    getPublicSiteData(),
  ]);
  const appointmentPreference = await resolvePublishedAppointmentPreference(query);
  const appointmentWhatsappUrl = appointmentPreference
    ? buildAppointmentWhatsAppUrl(appointmentPreference, {
        businessName: site.name,
        whatsappNumber: site.contact.whatsapp.number,
      })
    : null;
  const changePreferencesHref = appointmentPreference
    ? buildPlannerPreferenceHref(appointmentPreference)
    : "/book";
  const phone = site.contact.phone;
  const email = site.contact.email;
  const instagram = site.social.instagram;
  const whatsappUrl = site.contact.whatsapp.url;
  const contactCardCount =
    1 + (phone ? 1 : 0) + (email ? 1 : 0) + (whatsappUrl ? 1 : 0);
  const gridClass =
    contactCardCount >= 4
      ? styles.contactGridFour
      : contactCardCount <= 2
        ? styles.contactGridTwo
        : "";

  return (
    <div>
      <PageHero
        {...pageHeroImages.contact}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      <section className={styles.contactSection} aria-labelledby="contact-heading">
        <div className={styles.container}>
          {appointmentPreference ? (
            <article
              aria-labelledby="appointment-request-title"
              className={styles.requestCard}
              id="appointment-request"
            >
              <div className={styles.requestIntro}>
                <span className={styles.requestIcon}>
                  <CalendarDays aria-hidden="true" size={24} strokeWidth={1.65} />
                </span>
                <p className={styles.requestEyebrow}>Appointment preferences</p>
                <h2 id="appointment-request-title">
                  Continue your request with Siriranee
                </h2>
                <p>
                  Your treatment choices are ready to share with Siriranee Thai
                  Massage. Use any currently available contact option below to ask
                  about a suitable date and time.
                </p>
              </div>

              <div className={styles.requestSummary}>
                <dl className={styles.requestDetails}>
                  <div>
                    <dt>Treatment</dt>
                    <dd>{appointmentPreference.serviceName}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>
                      {formatAppointmentDuration(
                        appointmentPreference.durationMinutes,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Listed price</dt>
                    <dd>{formatAppointmentPrice(appointmentPreference.priceEur)}</dd>
                  </div>
                  {appointmentPreference.preferredDate ? (
                    <div>
                      <dt>Preferred date</dt>
                      <dd>{appointmentPreference.preferredDate}</dd>
                    </div>
                  ) : null}
                  {appointmentPreference.preferredTime ? (
                    <div>
                      <dt>Preferred Dublin time</dt>
                      <dd>{appointmentPreference.preferredTime}</dd>
                    </div>
                  ) : null}
                </dl>

                <p className={styles.requestStatus}>
                  <span aria-hidden="true">i</span>
                  These choices have not been submitted and are not an appointment
                  confirmation. The team will confirm availability directly with
                  you.
                </p>

                <div className={styles.requestActions}>
                  {appointmentWhatsappUrl ? (
                    <a
                      className={styles.requestPrimary}
                      href={appointmentWhatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle aria-hidden="true" size={18} />
                      Send via WhatsApp
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : null}
                  {phone ? (
                    <a
                      className={
                        appointmentWhatsappUrl
                          ? styles.requestSecondary
                          : styles.requestPrimary
                      }
                      href={phone.href}
                    >
                      <Phone aria-hidden="true" size={18} />
                      Call the team
                    </a>
                  ) : null}
                  <Link
                    className={styles.requestTertiary}
                    href={changePreferencesHref}
                  >
                    Change preferences
                  </Link>
                </div>
              </div>
            </article>
          ) : null}

          <SectionHeading
            title="Contact Details"
            headingId="contact-heading"
          />

          <div className={`${styles.contactGrid} ${gridClass}`}>
            <article className={`${styles.contactCard} ${styles.addressCard}`}>
              <span className={styles.iconWrap}>
                <MapPin aria-hidden="true" size={24} strokeWidth={1.65} />
              </span>
              <p className={styles.cardLabel}>Visit us</p>
              <h3>{site.name}</h3>
              <address>{site.address.formatted}</address>
              <a href={site.address.directionsUrl} target="_blank" rel="noreferrer">
                Open in Google Maps
                <ArrowUpRight aria-hidden="true" size={16} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </article>

            {phone ? (
              <article className={styles.contactCard}>
                <span className={styles.iconWrap}>
                  <Phone aria-hidden="true" size={23} strokeWidth={1.65} />
                </span>
                <p className={styles.cardLabel}>Call us</p>
                <h3>
                  <a href={phone.href}>{phone.display}</a>
                </h3>
                <p>Call directly if you have a question about your visit.</p>
                <a href={phone.href}>
                  Call Siriranee
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
              </article>
            ) : null}

            {email ? (
              <article className={styles.contactCard}>
                <span className={styles.iconWrap}>
                  <Mail aria-hidden="true" size={23} strokeWidth={1.65} />
                </span>
                <p className={styles.cardLabel}>Email us</p>
                <h3 className={styles.emailHeading}>
                  <a href={email.href}>{email.address}</a>
                </h3>
                <p>Send an email for general questions or a gift enquiry.</p>
                <a href={email.href}>
                  Write an email
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
              </article>
            ) : null}

            {whatsappUrl ? (
              <article className={styles.contactCard}>
                <span className={styles.iconWrap}>
                  <MessageCircle aria-hidden="true" size={23} strokeWidth={1.65} />
                </span>
                <p className={styles.cardLabel}>WhatsApp</p>
                <h3>Message the spa</h3>
                <p>Start a WhatsApp conversation for a general booking question.</p>
                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                  Open WhatsApp
                  <ArrowUpRight aria-hidden="true" size={16} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.visitSection}>
        <div className={`${styles.container} ${styles.visitGrid}`}>
          <div className={styles.hoursPanel}>
            <div className={styles.panelHeading}>
              <span className={styles.iconWrap}>
                <Clock3 aria-hidden="true" size={23} strokeWidth={1.65} />
              </span>
              <div>
                <p className={styles.cardLabel}>{site.openingHoursConfirmed ? "Opening hours" : "Schedule update"}</p>
                <h2>{site.openingHoursConfirmed ? "Visiting information" : "Opening hours are being confirmed"}</h2>
              </div>
            </div>
            {site.openingHoursConfirmed ? (
              <dl className={styles.hoursList}>
                {site.openingHoursGroups.map((entry) => (
                  <div key={entry.label}>
                    <dt>{entry.label}</dt>
                    <dd>{entry.hours}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className={styles.hoursNote}>
              {site.openingHoursConfirmed
                ? "Appointments are subject to current availability."
                : "Exact times will appear here after the owner has reviewed and published them."}
            </p>
          </div>

          <div className={styles.directionsPanel}>
            <MapEmbed
              address={site.address.formatted}
              businessName={site.name}
              directionsUrl={site.address.directionsUrl}
              embedUrl={site.address.mapsEmbedUrl}
            />
          </div>
        </div>
      </section>

      <section className={styles.actionSection}>
        <div className={`${styles.container} ${styles.actionBar}`}>
          <div>
            <p className={styles.cardLabel}>Ready when you are</p>
            <h2>Request your massage appointment</h2>
            <p>
              Choose your treatment preferences, then use the booking page and
              any currently published contact option to continue.
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.bookAction} href="/book">
              <CalendarDays aria-hidden="true" size={19} />
              Book Now
            </Link>
            {instagram ? (
              <a
                className={styles.instagramAction}
                href={instagram.url}
                target="_blank"
                rel="noreferrer"
              >
                <AtSign aria-hidden="true" size={18} />
                Instagram
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            {whatsappUrl ? (
              <a
                className={styles.whatsappAction}
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle aria-hidden="true" size={18} />
                WhatsApp
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
