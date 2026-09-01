import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  Info,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MapEmbed } from "@/components/contact/MapEmbed";
import { PageHero } from "@/components/marketing/PageHero";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import {
  buildBreadcrumbJsonLd,
  jsonLdScriptProps,
} from "@/lib/structured-data";
import { getPublicPageCopy, getPublicSiteData } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("visit");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/visit" });
}

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Visit", path: "/visit" },
]);

export default async function VisitPage() {
  const [site, pageCopy] = await Promise.all([getPublicSiteData(), getPublicPageCopy("visit")]);
  const phone = site.contact.phone;

  return (
    <div>
      <script {...jsonLdScriptProps(breadcrumbJsonLd)} />

      <PageHero
        {...pageHeroImages.contact}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      <section className={styles.locationSection} aria-labelledby="location-heading">
        <div className={["container", styles.locationGrid].join(" ")}>
          <article className={styles.addressPanel}>
            <div className={styles.floorBadge}>
              <Building2 aria-hidden="true" />
              <span>{site.arrival.floor}</span>
            </div>
            <p className={styles.eyebrow}>Exact address</p>
            <h2 id="location-heading">Harbour House, Howth</h2>
            <address>{site.address.formatted}</address>
            <p className={styles.guidance}>{site.arrival.guidance}</p>

            <div className={styles.actions} aria-label="Visit actions">
              <a
                className={[styles.action, styles.primaryAction].join(" ")}
                href={site.address.directionsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation aria-hidden="true" />
                <span>Directions</span>
                <ArrowUpRight aria-hidden="true" className={styles.actionArrow} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {phone ? (
                <a className={styles.action} href={phone.href}>
                  <Phone aria-hidden="true" />
                  <span>Call the team</span>
                </a>
              ) : null}
              <Link className={styles.action} href="/book">
                <CalendarDays aria-hidden="true" />
                <span>Book Now</span>
              </Link>
            </div>
          </article>

          <div className={styles.mapPanel}>
            <MapEmbed
              address={site.address.formatted}
              businessName={site.name}
              directionsUrl={site.address.directionsUrl}
              embedUrl={site.address.mapsEmbedUrl}
            />
          </div>
        </div>
      </section>

      <section className={styles.detailsSection} aria-labelledby="arrival-heading">
        <div className={["container", styles.detailsGrid].join(" ")}>
          <article className={styles.hoursCard}>
            <div className={styles.cardHeading}>
              <span className={styles.iconCircle}>
                <Clock3 aria-hidden="true" />
              </span>
              <div>
                <p className={styles.eyebrow}>{site.openingHoursConfirmed ? "Opening hours" : "Schedule update"}</p>
                <h2>{site.openingHoursConfirmed ? "Choose a suitable day" : "Opening hours are being confirmed"}</h2>
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
            <p className={styles.smallNote}>
              {site.openingHoursConfirmed
                ? "Appointments are subject to current availability."
                : "Exact times will appear here after the owner has reviewed and published them."}
            </p>
          </article>

          <div className={styles.arrivalPanel}>
            <p className={styles.eyebrow}>Before you travel</p>
            <h2 id="arrival-heading">A simple arrival guide</h2>
            <p className={styles.intro}>
              {phone
                ? "Keep the address and phone number close to hand, especially for your first appointment at Harbour House."
                : "Keep the confirmed address close to hand for your first appointment at Harbour House."}
            </p>

            <ol className={styles.arrivalList}>
              <li>
                <span className={styles.stepNumber}>01</span>
                <div>
                  <h3>Find Harbour House</h3>
                  <p>{site.address.formatted}</p>
                </div>
              </li>
              <li>
                <span className={styles.stepNumber}>02</span>
                <div>
                  <h3>Continue to Floor 3</h3>
                  <p>{site.arrival.guidance}</p>
                </div>
              </li>
              <li>
                <span className={styles.stepNumber}>03</span>
                <div>
                  <h3>Ask if you need help</h3>
                  <p>{site.arrival.assistance}</p>
                </div>
              </li>
            </ol>

            <aside className={styles.accessNote} aria-label="Arrival information note">
              <Info aria-hidden="true" />
              <p>
                Entrance, lift, accessibility, parking and public transport details
                are intentionally not listed until they are confirmed. Check the
                current contact options before travelling if any of these details
                affect your visit.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.areasSection} aria-labelledby="areas-heading">
        <div className={["container", styles.areasInner].join(" ")}>
          <div className={styles.areasCopy}>
            <p className={styles.eyebrow}>Your local Thai massage</p>
            <h2 id="areas-heading">Serving Howth and nearby Dublin areas</h2>
            <p>
              Siriranee is based in Howth and welcomes clients from neighbouring
              communities across Dublin.
            </p>
          </div>
          <ul className={styles.areaChips} aria-label="Areas served">
            {site.serviceAreas.map((area, index) => (
              <li className={index === 0 ? styles.primaryArea : undefined} key={area}>
                <MapPin aria-hidden="true" />
                {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={["container", styles.ctaCard].join(" ")}>
          <div>
            <p className={styles.ctaEyebrow}>Ready when you are</p>
            <h2>Ready to visit Siriranee?</h2>
            <p>
              Choose a treatment and duration, then continue through the booking
              page using the options currently available.
            </p>
          </div>
          <div className={styles.ctaActions}>
            <Link className={styles.ctaPrimary} href="/book">
              Book Now
              <CalendarDays aria-hidden="true" />
            </Link>
            {phone ? (
              <a className={styles.ctaSecondary} href={phone.href}>
                Call {phone.display}
                <Phone aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
